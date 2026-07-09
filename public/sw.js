// NutriVault Service Worker — Offline-first with network-first API strategy
// Bump CACHE_NAME on each deploy so the activate handler purges the previous
// cache (old hashed bundles) instead of letting them accumulate forever.
const CACHE_NAME = 'nutrivault-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/icons/icon.svg',
];

// Install: pre-cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip cross-origin requests except Google Fonts
  if (url.origin !== self.location.origin && !url.hostname.includes('fonts.googleapis.com') && !url.hostname.includes('fonts.gstatic.com')) {
    return;
  }

  // API calls: network-first, no cache fallback (API needs live data)
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Navigation / HTML: NETWORK-FIRST. The old stale-while-revalidate served a
  // stale index.html after a deploy, which referenced hashed bundles that no
  // longer exist → white screen until a second reload. Always try the network
  // for the shell, fall back to cache only when offline.
  const isNavigation = request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html');
  if (isNavigation) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse.ok) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        })
        .catch(async () => (await caches.match(request)) || caches.match('/index.html'))
    );
    return;
  }

  // Hashed assets (immutable): cache-first for speed, fetch + cache on miss.
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) cache.put(request, networkResponse.clone());
        return networkResponse;
      } catch {
        return cached || Response.error();
      }
    })
  );
});
