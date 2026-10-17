// Never delete this file. To turn the worker off, publish a sw.js that calls
// `self.registration.unregister()`. A missing sw.js is answered with index.html
// (vercel.json's catch-all rewrite), the browser rejects that update, and every
// installed copy keeps running the old worker.
//
// Newfork service worker: phone alerts (web push, BILDIRIM-15). It shows every
// alert it gets and opens its screen inside the app. Registered by
// src/lib/service-worker.ts in production builds, and by the phone alerts'
// Turn on elsewhere.
//
// No cache and no fetch listener on purpose: every request goes to the network
// as if this file were not here, so a new Vercel deploy is never hidden behind
// an old copy of the app.

self.addEventListener("install", () => {
  // A new version takes over without waiting for every tab to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// A path inside this app only, as the notices' own links are (person_notifications_url_check).
function inApp(value) {
  try {
    const url = new URL(value, self.location.origin);
    if (url.origin !== self.location.origin) return "/app";
    const path = url.pathname + url.search + url.hash;
    return /^\/(?:[^/\\\u0000-\u001f\u007f][^\u0000-\u001f\u007f]*)?$/.test(path) ? path : "/app";
  } catch {
    return "/app";
  }
}

function readAlert(data) {
  try {
    const message = data ? data.json() : null;
    // Declarative Web Push (Safari 18.4+ shows it without this worker), as the server sends it.
    const alert = message && typeof message === "object" ? message.notification : null;
    if (alert && typeof alert.title === "string" && alert.title.length > 0) {
      return {
        title: alert.title,
        body: typeof alert.body === "string" ? alert.body : undefined,
        tag: typeof alert.tag === "string" ? alert.tag : undefined,
        url: inApp(typeof alert.navigate === "string" ? alert.navigate : "/app"),
      };
    }
  } catch {
    // Unreadable: still shown, below.
  }
  return null;
}

self.addEventListener("push", (event) => {
  // Every push shows something: a browser revokes a subscription that receives alerts it never shows.
  const alert = readAlert(event.data) ?? { title: "New notification", body: undefined, tag: undefined, url: "/app" };
  const options = { icon: "/icon-192.png", badge: "/icon-192.png", lang: "en-US", data: { url: alert.url } };
  if (alert.body !== undefined) options.body = alert.body;
  if (alert.tag !== undefined) {
    // The same notice twice replaces itself quietly.
    options.tag = alert.tag;
    options.renotify = false;
  }
  event.waitUntil(self.registration.showNotification(alert.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = inApp(event.notification.data && event.notification.data.url ? event.notification.data.url : "/app");
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((client) => {
        try {
          return new URL(client.url).origin === self.location.origin;
        } catch {
          return false;
        }
      });
      if (open) {
        await open.focus();
        // The app moves to the screen itself, without a reload.
        open.postMessage({ type: "newfork:open", url });
        return;
      }
      await self.clients.openWindow(self.location.origin + url);
    })(),
  );
});
