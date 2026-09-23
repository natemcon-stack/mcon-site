"use client";

// Queues writes made with no signal, and sends them when it comes back.
//
// Held in IndexedDB rather than memory or localStorage: it survives the tab closing,
// the phone locking, and the browser being killed to free memory — all of which happen
// routinely on a job site. localStorage would also cap out on photos.
//
// The rule this is built around: nothing is ever silently dropped, and the crew can
// always see what hasn't sent yet. A clock-in that vanished because the phone died in a
// basement is worse than one that never happened, because nobody knows to redo it.
//
// Deliberately NOT queued: anything to do with money. Estimates and invoices are drafted
// offline as local drafts the person chooses to submit — a payment or an invoice
// replayed from a queue days later, against figures that may have changed, is a mess
// nobody wants to unpick.

const DB_NAME = "mcon-offline";
const DB_VERSION = 1;
const QUEUE = "queue";
const DRAFTS = "drafts";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(QUEUE)) {
        const store = db.createObjectStore(QUEUE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
      if (!db.objectStoreNames.contains(DRAFTS)) {
        db.createObjectStore(DRAFTS, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function tx(storeName, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const result = fn(store);
    transaction.oncomplete = () => resolve(result?.result ?? result);
    transaction.onerror = () => reject(transaction.error);
  });
}

// --- the queue -------------------------------------------------------------

// kind: what to do when signal returns — "clock_in", "clock_out", "job_photo", "note".
// payload: everything needed to perform it, since the original page state is long gone.
export async function enqueue(kind, payload) {
  const item = {
    id: crypto.randomUUID(),
    kind,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
  };
  await tx(QUEUE, "readwrite", (store) => store.add(item));
  notifyChanged();
  return item;
}

export async function listQueue() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(QUEUE, "readonly").objectStore(QUEUE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function removeFromQueue(id) {
  await tx(QUEUE, "readwrite", (store) => store.delete(id));
  notifyChanged();
}

async function markFailed(item, message) {
  const updated = { ...item, attempts: item.attempts + 1, lastError: message };
  await tx(QUEUE, "readwrite", (store) => store.put(updated));
  notifyChanged();
}

// Lets the badge update without every component polling.
function notifyChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("offline-queue-changed"));
  }
}

// --- drafts ----------------------------------------------------------------

// A quote built with no signal. Kept as a draft the person submits deliberately rather
// than something that syncs itself — pricing written on a roof at 7am often gets
// revised before it should go anywhere near a client.
export async function saveDraft(draft) {
  const record = {
    ...draft,
    id: draft.id || crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
  };
  await tx(DRAFTS, "readwrite", (store) => store.put(record));
  notifyChanged();
  return record;
}

export async function listDrafts() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(DRAFTS, "readonly").objectStore(DRAFTS).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function getDraft(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(DRAFTS, "readonly").objectStore(DRAFTS).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteDraft(id) {
  await tx(DRAFTS, "readwrite", (store) => store.delete(id));
  notifyChanged();
}

// --- sending ---------------------------------------------------------------

// Handlers are registered by the app rather than defined here, so this file knows
// nothing about Supabase and can't drift out of step with how a write is actually done.
const handlers = {};

export function registerHandler(kind, fn) {
  handlers[kind] = fn;
}

// Sends everything queued, oldest first. Order matters: a clock-out replayed before its
// clock-in produces a shift that makes no sense.
export async function flushQueue() {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { sent: 0, failed: 0, skipped: "offline" };
  }

  const items = (await listQueue()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let sent = 0;
  let failed = 0;

  for (const item of items) {
    const handler = handlers[item.kind];
    if (!handler) {
      // Nothing registered to send this. Left in the queue rather than discarded —
      // it's usually a page that hasn't loaded yet, not a dead item.
      continue;
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      await handler(item.payload);
      // eslint-disable-next-line no-await-in-loop
      await removeFromQueue(item.id);
      sent++;
    } catch (e) {
      // eslint-disable-next-line no-await-in-loop
      await markFailed(item, e?.message || "Failed to send");
      failed++;
    }
  }

  return { sent, failed };
}

// Flush whenever the connection returns, and once on load in case it returned while the
// app was closed.
export function startAutoFlush() {
  if (typeof window === "undefined") return () => {};
  const run = () => { flushQueue().catch(() => {}); };
  window.addEventListener("online", run);
  // A short delay so handlers registered during mount are in place first.
  const timer = setTimeout(run, 2000);
  // Job sites drift in and out of signal rather than switching cleanly, so the online
  // event alone misses plenty.
  const interval = setInterval(run, 60000);
  return () => {
    window.removeEventListener("online", run);
    clearTimeout(timer);
    clearInterval(interval);
  };
}
