const CACHE_NAME = 'replika-shell-v5';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './favicon.svg',
  './app.js',
  './parser.js',
  './learning-engine.js',
  './storage.js',
  './activity-tracker.js',
  './ui-interactions.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
    return response;
  } catch {
    return (await caches.match(request)) ?? caches.match('./index.html');
  }
}

async function staleWhileRevalidate(request, event) {
  const network = fetch(request).then(async response => {
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  }).catch(() => null);
  event.waitUntil(network);
  const cached = await caches.match(request);
  if (cached) return cached;
  return (await network) ?? Response.error();
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(event.request.mode === 'navigate'
    ? networkFirst(event.request)
    : staleWhileRevalidate(event.request, event));
});
