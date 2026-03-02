const CACHE_NAME = 'seatable-booking-v1';
const CACHED_URLS = ['/', '/index.html'];

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

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (CACHED_URLS.includes(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then(r => r || fetch(event.request))
    );
  }
});

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Seatable';
  const options = {
    body: data.body || 'You have a new notification',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/book' },
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
