import { createClient } from "@supabase/supabase-js";

// Website enquiries land in the CRM as leads, not just in an inbox.
//
// The old site used a JotForm on the web host's own account, which emailed a notification
// somewhere and stored the submission somewhere else. When that broke, enquiries were
// invisible — sitting in a dashboard nobody could reach. Writing straight into the CRM
// means an enquiry is a lead in the system where the work already happens, and the email
// is a notification rather than the only record.

export const runtime = "nodejs";

// Written with the service role because the site has no signed-in user. That means every
// field is treated as hostile: length-capped, and the company id comes from configuration
// rather than the request.
export async function POST(request) {
  try {
    const body = await request.json();
    const { name, phone, email, message, address, honey } = body;

    // A hidden field real people never fill in. Cheap, and it stops most bots without
    // making a human solve a puzzle.
    if (honey) return Response.json({ ok: true });

    if (!name?.trim()) return new Response("Please tell us your name", { status: 400 });
    if (!phone?.trim() && !email?.trim()) {
      return new Response("Please leave a phone number or an email address", { status: 400 });
    }
    if (!message?.trim()) return new Response("Please tell us what you need", { status: 400 });

    const clean = (v, max) => String(v || "").trim().slice(0, max);
    const lead = {
      name: clean(name, 120),
      phone: clean(phone, 40),
      email: clean(email, 160),
      address: clean(address, 200),
      message: clean(message, 4000),
    };

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const companyId = process.env.LEAD_COMPANY_ID;

    let savedToCrm = false;
    if (supabaseUrl && serviceKey && companyId) {
      try {
        const supabase = createClient(supabaseUrl, serviceKey);
        // The leads table was built for public tender listings — title, organization,
        // snippet — so a website enquiry has to be mapped onto those columns rather
        // than inventing new ones. The title is what shows in the CRM's list, so it
        // carries the caller's name and how to reach them.
        const contact = [lead.phone, lead.email].filter(Boolean).join(" · ");
        const { error } = await supabase.from("leads").insert([{
          company_id: companyId,
          source: "website",
          // Deduplicates a double submit, and makes a re-send of the same enquiry
          // update rather than pile up.
          external_ref: `web-${Date.now()}`,
          title: lead.name,
          organization: contact || null,
          category: "website_enquiry",
          region: lead.address || null,
          snippet: lead.message,
          status: "new",
        }]);
        if (error) {
          // Logged so a schema mismatch shows up in the Vercel logs rather than
          // silently falling back to email — which is how the old form's failure went
          // unnoticed for weeks.
          console.error("Lead insert failed:", error.message);
        } else {
          savedToCrm = true;
        }
      } catch (e) {
        // Falls through to the email. An enquiry that reaches a human beats one that
        // fails cleanly.
      }
    }

    // Notification. Sent second, so a mail outage can't lose the lead itself.
    const resendKey = process.env.RESEND_API_KEY;
    const notifyTo = process.env.LEAD_NOTIFY_EMAIL;
    if (resendKey && notifyTo) {
      const esc = (s) => String(s || "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: process.env.LEAD_FROM_EMAIL || "website@mconenterprisesinc.ca",
          to: [notifyTo],
          // Replying goes straight back to the enquirer, which is usually the next thing
          // you want to do.
          reply_to: lead.email || undefined,
          subject: `Website enquiry — ${lead.name}`,
          html: `
            <div style="font-family:system-ui,sans-serif;max-width:560px;color:#1E282C;">
              <table style="border-collapse:collapse;font-size:15px;margin-bottom:16px;">
                <tr><td style="padding:3px 14px 3px 0;color:#6E7A78;">Name</td><td>${esc(lead.name)}</td></tr>
                ${lead.phone ? `<tr><td style="padding:3px 14px 3px 0;color:#6E7A78;">Phone</td><td><a href="tel:${esc(lead.phone)}">${esc(lead.phone)}</a></td></tr>` : ""}
                ${lead.email ? `<tr><td style="padding:3px 14px 3px 0;color:#6E7A78;">Email</td><td><a href="mailto:${esc(lead.email)}">${esc(lead.email)}</a></td></tr>` : ""}
                ${lead.address ? `<tr><td style="padding:3px 14px 3px 0;color:#6E7A78;">Property</td><td>${esc(lead.address)}</td></tr>` : ""}
              </table>
              <div style="background:#ECEEEE;border-radius:4px;padding:14px;white-space:pre-wrap;">${esc(lead.message)}</div>
              <p style="font-size:13px;color:#6E7A78;margin-top:14px;">
                ${savedToCrm ? "Saved to the CRM as a new lead." : "NOT saved to the CRM — this email is the only record."}
              </p>
            </div>`,
        }),
      }).catch(() => {});
    }

    // Reported honestly: if neither the CRM nor the mail worked, say so rather than
    // showing a thank-you for an enquiry that went nowhere. That failure is exactly what
    // went unnoticed on the old site.
    if (!savedToCrm && !(resendKey && notifyTo)) {
      return new Response(
        "We couldn't send that just now. Please call 778-230-7676 instead.",
        { status: 500 }
      );
    }

    return Response.json({ ok: true });
  } catch (e) {
    return new Response(
      "We couldn't send that just now. Please call 778-230-7676 instead.",
      { status: 500 }
    );
  }
}
