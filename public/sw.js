// Kill-switch service worker.
// Serves at the same path as the previous vite-plugin-pwa app-shell SW.
// On activate: deletes only this app's own caches, claims clients,
// forces them to re-navigate (fetching fresh HTML/JS), then unregisters itself.
// Cache Storage is origin-scoped — do not blanket-delete or you'll wipe
// Firebase Messaging / OneSignal caches from other integrations.

function isOwnAppCache(name) {
  return (
    /^workbox-precache-v\d+/.test(name) ||
    name.startsWith("workbox-runtime") ||
    name === "html-navigations" ||
    name === "static-assets" ||
    name === "image-assets"
  );
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const names = await caches.keys();
        await Promise.allSettled(
          names.filter(isOwnAppCache).map((n) => caches.delete(n)),
        );
        await self.clients.claim();
        const windows = await self.clients.matchAll({ type: "window" });
        await Promise.allSettled(
          windows.map((c) => c.navigate(c.url).catch(() => {})),
        );
      } finally {
        await self.registration.unregister();
      }
    })(),
  );
});

// Passthrough — never intercept while we're cleaning up.
self.addEventListener("fetch", () => {});
