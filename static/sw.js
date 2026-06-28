// ──────────────────────────────────────────────────
// Philia Vault — Service Worker (Push Notifications)
// ──────────────────────────────────────────────────

const CACHE_NAME = 'philia-vault-cache-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/_expo/static/js/app/entry.js',
];

// ─── Install event: cache static assets ────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// ─── Activate event: clean old caches ──────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// ─── Push event: display notification ──────────────
self.addEventListener('push', (event) => {
  let data = { title: 'Philia Vault', body: '', url: '/' };

  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data.body = event.data.text();
    }
  }

  const notificationTitle = data.title || 'Philia Vault';
  const notificationOptions = {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192x192.png',
    badge: data.badge || '/icons/badge-72x72.png',
    tag: 'philia-vault-notification',
    renotify: true,
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/',
      date: Date.now(),
    },
  };

  event.waitUntil(
    self.registration.showNotification(notificationTitle, notificationOptions)
  );
});

// ─── Notification click event: open correct URL ─────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  const promiseChain = clients
    .matchAll({
      type: 'window',
      includeUncontrolled: true,
    })
    .then((windowClients) => {
      // Si une fenêtre de l'app existe déjà, la focaliser et naviguer
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes('philiavault') || client.url.includes('localhost')) {
          client.focus();
          client.navigate(urlToOpen);
          return;
        }
      }
      // Sinon, ouvrir une nouvelle fenêtre
      return clients.openWindow(urlToOpen);
    });

  event.waitUntil(promiseChain);
});

// ─── Fetch event: serve from cache, fallback to network ──
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request).then((response) => {
          // Cache successful responses for static assets
          if (response.ok && event.request.url.includes(self.location.origin)) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
      );
    })
  );
});
