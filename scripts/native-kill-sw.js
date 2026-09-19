/*
 * Native Android app Service Worker kill switch.
 *
 * Older builds (<= 1.3.0) registered the PWA workbox SW inside the Capacitor
 * native shell. That SW intercepted navigations and served stale cached HTML,
 * so even after a full APK reinstall the new code could fail to start.
 *
 * After reinstalling, the browser detects the same /sw.js URL changed, installs
 * this script, activates it immediately (skipWaiting), clears every cache,
 * unregisters itself, and reloads open clients. The old SW is then gone and the
 * bundled fresh assets load normally (native-sw-cleanup also runs as a backup).
 *
 * This file only replaces the Android bundled assets after `cap sync`.
 * The browser PWA keeps using the workbox-generated sw.js in dist/.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await self.caches.keys();
        await Promise.all(keys.map((key) => self.caches.delete(key)));
      } catch (_) {
        /* ignore cache clear failures */
      }
      try {
        await self.registration.unregister();
      } catch (_) {
        /* ignore unregister failures */
      }
      const clients = await self.clients.matchAll({ type: "window" });
      clients.forEach((client) => {
        try {
          client.navigate(client.url);
        } catch (_) {
          /* ignore per-client reload failures */
        }
      });
    })(),
  );
});

// No fetch handler: never intercept requests; let the browser use network/bundled assets.
