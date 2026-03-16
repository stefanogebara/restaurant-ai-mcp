// Cache version — bump this on every deploy to invalidate old caches.
// Vite build does NOT change this file automatically, so either:
//   1. Bump manually before deploy, or
//   2. Use a build script to inject a hash/timestamp (recommended)
const CACHE_VERSION = 'seatable-v2';

// Only cache truly static, immutable assets (icons, fonts).
// Do NOT pre-cache HTML — it contains hashed asset URLs that change per build.
const PRECACHE_URLS = ['/favicon.svg', '/icon-192.png', '/icon-512.png'];

// --- Install ---
// Pre-cache static assets only. Skip waiting to activate immediately.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// --- Activate ---
// Delete all caches that don't match the current version.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// --- Fetch ---
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Skip non-GET requests entirely
  if (event.request.method !== 'GET') return;

  // 2. Skip API calls — never cache API responses
  if (url.pathname.startsWith('/api')) return;

  // 3. Skip cross-origin requests (CDNs, analytics, etc.)
  if (url.origin !== self.location.origin) return;

  // 4. Navigation requests (HTML pages) — ALWAYS network-first
  //    This ensures users always get the latest index.html with correct asset hashes.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache a clone for offline fallback
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 5. Hashed assets (Vite output like /assets/index-abc123.js) — cache-first
  //    These are content-addressed and immutable: the hash guarantees the content.
  if (url.pathname.startsWith('/assets/') && /\.[a-f0-9]{8,}\.(js|css|woff2?)$/i.test(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // 6. Other same-origin assets (icons, images, fonts) — stale-while-revalidate
  event.respondWith(
    caches.match(event.request).then(cached => {
      const networkFetch = fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
      return cached || networkFetch;
    })
  );
});

// --- Push Notifications ---
// I-1: Wrap JSON parse in try/catch to handle malformed or text-only payloads
// C-2: Read url from data.data?.url to match the nested payload shape sent by push-send.js
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { title: 'Seatable', body: event.data.text() };
    }
  }
  const title = data.title || 'Seatable';
  const options = {
    body: data.body || 'You have a new notification',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.data?.url || '/book' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/book';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(windowClients => {
      const client = windowClients.find(c => c.url.includes(targetUrl));
      if (client) return client.focus();
      return clients.openWindow(targetUrl);
    })
  );
});
