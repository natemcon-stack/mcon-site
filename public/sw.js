// Service worker: push notifications, and keeping the app usable without signal.
//
// Crews work in basements, in Lund, and on sites with no bars. Those are exactly the
// moments the app is needed — clocking in, photographing work, checking a work order —
// and until now it simply failed there.
//
// Two caches, deliberately separate:
//   SHELL  the app itself. Cached on install so the app opens with no signal at all.
//   DATA   recent API/Supabase responses, served stale when offline so yesterday's
//          schedule is visible rather than an error page.
//
// Anything that WRITES is never handled here — writes queue in IndexedDB on the page
// side, where the app can show what's pending. A silent background retry that loses a
// clock-in is worse than no offline support.

const VERSION = "v3";
const SHELL = `shell-${VERSION}`;
const DATA = `data-${VERSION}`;

// The routes a crew opens on site. Cached ahead of time so they work cold.
const SHELL_URLS = ["/", "/today", "/jobs", "/offline"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) =>
      // Individually, so one 404 doesn't abandon the whole install.
      Promise.allSettled(SHELL_URLS.map((url) => cache.add(url)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;           // writes are the page's problem
  const url = new URL(request.url);
  if (url.origin !== self.location.origin && !url.hostname.includes("supabase")) return;

  // Data: try the network, fall back to the last good copy. Stale data a crew can read
  // beats a blank screen; the page shows an offline banner so nobody mistakes it for live.
  if (url.pathname.startsWith("/api/") || url.hostname.includes("supabase")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(DATA).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) =>
          cached || new Response(JSON.stringify({ offline: true }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          })
        ))
    );
    return;
  }

  // Pages and assets: serve from cache first so the app opens instantly and works with
  // no signal, refreshing in the background for next time.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached || caches.match("/offline"));
      return cached || network;
    })
  );
});

// --- push notifications ----------------------------------------------------

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "New notification";

  // Actions turn a reminder into something you can act on from the lock screen. A crew
  // member who has to open the app, find the job and press clock in usually doesn't.
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: data,
    actions: data.actions || [],
    requireInteraction: data.requireInteraction || false,
    tag: data.tag,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};

  // The action is passed through to the app rather than performed here — the worker has
  // no location permission and no session, and a clock-in that silently failed in the
  // background would be worse than one that didn't happen.
  const target = event.action
    ? `${data.url || "/today"}?action=${encodeURIComponent(event.action)}${data.jobId ? `&job=${data.jobId}` : ""}`
    : (data.url || "/today");

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      // Reuse an open tab where there is one, so the crew doesn't end up with six.
      for (const client of list) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return clients.openWindow(target);
    })
  );
});
