"use client";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { getSignedUrls } from "@/lib/signedUrl";
import { makeThumbnail } from "@/lib/thumbnail";

// Photos and PDFs attached to an estimate or invoice, shown to the client on the pay
// page rather than sent as email attachments — the email stays light and a file can be
// added or swapped after it's gone out.
//
// Two sources: files uploaded here (into the documents bucket) and photos already on the
// job (referenced in place in job-photos, never copied). Neither bucket is publicly
// readable; the public document route signs short-lived URLs with the service role.

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

// lineKey scopes the panel to a single line item. Undefined means the document as a
// whole, which is what the pay page shows under "Attachments"; a line's photos render
// beside that line instead.
export default function DocumentAttachments({ kind, docId, jobId, lineKey, compact, onCountChange }) {
  const [rows, setRows] = useState([]);
  const [previews, setPreviews] = useState({});
  const [busy, setBusy] = useState(false);
  const [pickingPhotos, setPickingPhotos] = useState(false);
  const [jobPhotos, setJobPhotos] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState({});

  const load = useCallback(async () => {
    let query = supabase
      .from("document_attachments")
      .select("*")
      .eq("parent_type", kind)
      .eq("parent_id", docId);
    query = lineKey ? query.eq("line_key", lineKey) : query.is("line_key", null);
    const { data } = await query.order("sort_order");
    const list = data || [];
    setRows(list);
    if (onCountChange) onCountChange(list.length);

    // Thumbnails for the image attachments so this reads as a gallery rather than a
    // list of filenames.
    const images = list.filter((r) => (r.mime_type || "").startsWith("image/"));
    const byBucket = {};
    images.forEach((r) => {
      byBucket[r.bucket] = byBucket[r.bucket] || [];
      byBucket[r.bucket].push(r.storage_path);
    });
    const map = {};
    for (const [bucket, paths] of Object.entries(byBucket)) {
      const signed = await getSignedUrls(bucket, paths);
      images.filter((r) => r.bucket === bucket).forEach((r) => {
        if (signed[r.storage_path]) map[r.id] = signed[r.storage_path];
      });
    }
    setPreviews(map);
  }, [kind, docId, lineKey, onCountChange]);

  useEffect(() => { load(); }, [load]);

  async function uploadFiles(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setBusy(true);

    const { data: { user } } = await supabase.auth.getUser();

    for (const file of files) {
      if (file.size > MAX_UPLOAD_BYTES) {
        alert(`${file.name} is larger than 25 MB — attach a smaller version.`);
        continue;
      }
      try {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `attachments/${kind}/${docId}/${Date.now()}-${safeName}`;

        // Images get shrunk before upload for the same reason job photos do: a client
        // opening this on mobile data shouldn't be pulling 5 MB per photo. PDFs are
        // stored as-is.
        let body = file;
        if (file.type.startsWith("image/")) {
          const { blob } = await makeThumbnail(file);
          if (blob) body = blob;
        }

        const { error: upError } = await supabase.storage
          .from("documents").upload(path, body, { contentType: file.type || "application/octet-stream" });
        if (upError) throw upError;

        const { error: rowError } = await supabase.from("document_attachments").insert([{
          parent_type: kind,
          parent_id: docId,
          bucket: "documents",
          line_key: lineKey || null,
          storage_path: path,
          filename: file.name,
          mime_type: file.type || null,
          sort_order: rows.length,
          created_by: user?.id,
        }]);
        if (rowError) throw rowError;
      } catch (err) {
        alert(`Couldn't attach ${file.name}: ${err.message || err}`);
      }
    }

    e.target.value = "";
    setBusy(false);
    load();
  }

  async function openPhotoPicker() {
    setPickingPhotos(true);
    const { data } = await supabase
      .from("job_photos")
      .select("id, storage_path, thumb_path, caption, taken_at, created_at")
      .eq("job_id", jobId)
      .order("taken_at", { ascending: false, nullsFirst: false })
      .limit(60);
    const list = data || [];
    setJobPhotos(list);

    const paths = list.map((p) => p.thumb_path || p.storage_path).filter(Boolean);
    const signed = await getSignedUrls("job-photos", paths);
    const map = {};
    list.forEach((p) => {
      const key = p.thumb_path || p.storage_path;
      if (signed[key]) map[p.id] = signed[key];
    });
    setPhotoPreviews(map);
  }

  async function attachJobPhoto(photo) {
    const { data: { user } } = await supabase.auth.getUser();
    // Reference the original file rather than copying it — the same photo can appear on
    // the job and on any number of documents without duplicating storage, and deleting
    // the attachment later must not remove the job's copy.
    const { error } = await supabase.from("document_attachments").insert([{
      parent_type: kind,
      parent_id: docId,
      bucket: "job-photos",
      line_key: lineKey || null,
      storage_path: photo.thumb_path || photo.storage_path,
      filename: photo.caption || "Job photo",
      mime_type: "image/jpeg",
      caption: photo.caption || null,
      job_photo_id: photo.id,
      sort_order: rows.length,
      created_by: user?.id,
    }]);
    if (error) alert(`Couldn't attach that photo: ${error.message}`);
    load();
  }

  async function removeAttachment(row) {
    if (!confirm("Remove this attachment from the document?")) return;
    // Only delete the underlying file when this document owns it. A referenced job photo
    // stays on the job.
    if (!row.job_photo_id && row.bucket === "documents") {
      await supabase.storage.from("documents").remove([row.storage_path]);
    }
    await supabase.from("document_attachments").delete().eq("id", row.id);
    load();
  }

  async function setCaption(row) {
    const caption = prompt("Caption shown to the client (leave blank for none):", row.caption || "");
    if (caption === null) return;
    await supabase.from("document_attachments").update({ caption: caption.trim() || null }).eq("id", row.id);
    load();
  }

  const alreadyAttached = new Set(rows.map((r) => r.job_photo_id).filter(Boolean));

  return (
    <div className={`border border-border rounded-lg mt-2 bg-paper/50 ${compact ? "p-2" : "p-3"}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-xs font-display uppercase tracking-wide text-ink/50">
          {lineKey ? "Photos for this line" : "Attachments"} {rows.length > 0 && `(${rows.length})`}
        </div>
        <div className="flex gap-1.5">
          <label className="text-xs border border-border rounded px-2 py-1 cursor-pointer hover:text-steel">
            {busy ? "Uploading..." : "Add files"}
            <input type="file" multiple accept="image/*,application/pdf" onChange={uploadFiles}
              disabled={busy} className="hidden" />
          </label>
          <button onClick={() => (pickingPhotos ? setPickingPhotos(false) : openPhotoPicker())}
            className="text-xs border border-border rounded px-2 py-1 hover:text-steel">
            {pickingPhotos ? "Close" : "From job photos"}
          </button>
        </div>
      </div>

      {rows.length === 0 && !pickingPhotos && (
        <p className="text-xs text-ink/40">
          {lineKey
            ? "No photos on this line yet. These show beside the line item on the client's copy."
            : "Nothing attached. Anything added here appears on the client's link — not in the email."}
        </p>
      )}

      {rows.length > 0 && (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-2 text-sm">
              {previews[r.id] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previews[r.id]} alt="" className="w-10 h-10 object-cover rounded border border-border shrink-0" />
              ) : (
                <span className="w-10 h-10 rounded border border-border bg-surface flex items-center justify-center text-[10px] text-ink/40 shrink-0">
                  PDF
                </span>
              )}
              <span className="flex-1 min-w-0">
                <span className="block truncate">{r.filename || "Attachment"}</span>
                {r.caption && <span className="block text-xs text-ink/40 truncate">{r.caption}</span>}
              </span>
              <button onClick={() => setCaption(r)} className="text-xs text-ink/40 hover:text-steel shrink-0">
                Caption
              </button>
              <button onClick={() => removeAttachment(r)} className="text-ink/30 hover:text-accent-dark text-xs shrink-0">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {pickingPhotos && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="text-xs text-ink/50 mb-2">Tap a photo to attach it. Photos stay on the job as well.</div>
          {jobPhotos.length === 0 ? (
            <div className="text-xs text-ink/40">No photos on this job yet.</div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-64 overflow-y-auto">
              {jobPhotos.map((p) => (
                <button key={p.id} onClick={() => attachJobPhoto(p)} disabled={alreadyAttached.has(p.id)}
                  className={`relative rounded overflow-hidden border ${
                    alreadyAttached.has(p.id) ? "border-success opacity-50" : "border-border hover:border-steel"
                  }`}>
                  {photoPreviews[p.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoPreviews[p.id]} alt="" className="w-full h-16 object-cover" />
                  ) : (
                    <div className="w-full h-16 bg-paper animate-pulse" />
                  )}
                  {alreadyAttached.has(p.id) && (
                    <span className="absolute inset-0 flex items-center justify-center text-success text-lg">✓</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
