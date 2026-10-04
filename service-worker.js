const CACHE_NAME = 'apv22-pwa-v25';
const STATIC_ASSETS = [
  './index.html', './apv21.html', './apv22.html',
  './manifest.webmanifest',
  './language-en-v25.js',
  './accessibility-v25.js',
  './accessibility-v25.css',
  './icon-192.png',
  './icon-512.png',
  './vscn-logo.jpg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS.map(url => new Request(url, {cache: 'reload'}))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith('apv22-pwa-') && k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const req = event.request;
  if(new URL(req.url).origin !== self.location.origin) return;
  const navigationKey = new URL(new URL(req.url).pathname.replace(/\/$/, '/index.html'), self.location.origin).href;
  const isNavigation = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isNavigation) {
    event.respondWith(
      fetch(req)
        .then(response => {
          if(!response.ok) return response;
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(navigationKey, copy));
          return response;
        })
        .catch(() => caches.match(navigationKey))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached =>
      cached || fetch(req).then(response => {
        if(!response.ok) return response;
          const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        return response;
      })
    )
  );
});
