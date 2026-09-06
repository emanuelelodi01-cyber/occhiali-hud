// RayNeo GTA HUD - PWA Update-Aware Service Worker
const SW_VERSION = '2026.09.06-v11';
const CACHE_NAME = `rayneo-hud-cache-${SW_VERSION}`;

self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] New build discovered and installed:', SW_VERSION);
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activating new version:', SW_VERSION);
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  // Never intercept or cache real-time hud-interop.js, hud.css, or api requests
  if (
    event.request.url.includes('hud-interop.js') ||
    event.request.url.includes('hud.css') ||
    event.request.url.includes('/api/')
  ) {
    return;
  }
  // 1. Navigation requests (HTML): Network-First (always fresh from Dokploy, offline fallback)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 2. Static hashed assets (wasm, css, js, icons): Cache-First
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          (event.request.url.includes('/assets/') || event.request.url.endsWith('.wasm'))
        ) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      });
    })
  );
});


