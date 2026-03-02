const CACHE_NAME = 'seatable-booking-v1';
// I-5: Cache useful routes and assets; /index.html is not a valid navigable URL in a SPA
const CACHED_URLS = ['/', '/book', '/favicon.svg', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CACHED_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// I-5: Exclude API calls and cross-origin requests from the cache strategy
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Don't intercept API calls or external requests
  if (url.pathname.startsWith('/api') || url.origin !== self.location.origin) return;

  if (CACHED_URLS.includes(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then(r => r || fetch(event.request))
    );
  }
});

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
