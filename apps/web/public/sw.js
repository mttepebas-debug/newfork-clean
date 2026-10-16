// Newfork service worker. It exists so phone alerts (web push) have somewhere
// to arrive; registered by src/lib/service-worker.ts in production builds only.
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

// Phone alerts, next step (after web-push and the VAPID key are approved):
// - a "push" listener that shows the notification from the payload;
// - a "notificationclick" listener that focuses or opens the screen it links to.
