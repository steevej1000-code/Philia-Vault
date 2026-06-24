const CACHE_NAME = 'philia-vault-v2';
const ASSETS = ['/', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('/api/')) {
    e.respondWith(fetch(e.request).catch(() => new Response(JSON.stringify({error:'offline'}), {headers:{'Content-Type':'application/json'}})));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      const clone = res.clone();
      caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
      return res;
    })).catch(() => new Response('<html><body style="background:#000;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;margin:0"><div style="text-align:center"><h2 style="color:#C8FF00;font-size:24px">PHILIA VAULT</h2><p>Connexion requise</p></div></body></html>', {headers:{'Content-Type':'text/html'}}))
  );
});

// Réception des push notifications
self.addEventListener('push', event => {
    let data = {};
    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data = { title: 'Philia Vault', body: event.data.text() };
        }
    }
    const title = data.title || 'Philia Vault';
    const options = {
        body: data.body || '',
        icon: data.icon || '/icons/icon-192x192.png',
        badge: data.badge || '/icons/badge-72x72.png',
        data: { url: data.url || '/app' },
        vibrate: [200, 100, 200],
        requireInteraction: false
    };
    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// Clic sur la notification → ouvrir l'app
self.addEventListener('notificationclick', event => {
    event.notification.close();
    const url = event.notification.data.url || '/app';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            for (const client of windowClients) {
                if (client.url.includes(self.location.origin)) {
                    client.focus();
                    if ('navigate' in client) {
                        client.navigate(url);
                    }
                    return;
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(url);
            }
        })
    );
});
