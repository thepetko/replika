const RELEASE = '26';
const CACHE_NAME = `replika-shell-v${RELEASE}`;
const versioned = path => `${path}?v=${RELEASE}`;
const APP_SHELL = [
  './',
  './index.html',
  versioned('./styles.css'),
  './favicon.svg',
  './replika-logo.png',
  './replika-mark.png',
  versioned('./app.js'),
  versioned('./parser.js'),
  versioned('./learning-engine.js'),
  versioned('./scene-parser.js'),
  versioned('./script-importer.js'),
  versioned('./docx-reader.js'),
  versioned('./scene-learning-engine.js'),
  versioned('./storage.js'),
  versioned('./activity-tracker.js'),
  versioned('./ui-interactions.js'),
  versioned('./game-plan.js'),
  versioned('./script-game.js')
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
    const response = await fetch(request, { cache: 'no-store' });
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
  const mustBeCurrent = event.request.mode === 'navigate'
    || event.request.destination === 'script'
    || event.request.destination === 'style';
  event.respondWith(mustBeCurrent
    ? networkFirst(event.request)
    : staleWhileRevalidate(event.request, event));
});
