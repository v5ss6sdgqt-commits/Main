/* Service worker: makes the installed app work with no network at all.
 *
 * Two caching strategies, because they answer different questions:
 *
 *   Page loads use network-first. A student who opens the app online should get
 *   the current version, not whatever was cached the first time they installed
 *   it. Falling back to the cache keeps it working on a train.
 *
 *   Everything else uses stale-while-revalidate: serve from cache immediately so
 *   the app opens instantly, and quietly refresh the copy in the background for
 *   next time.
 *
 * Bump CACHE when the shell changes; the old cache is deleted on activate. */

const CACHE = 'market-lab-v1';

const SHELL = [
  './',
  'index.html',
  'css/styles.css',
  'js/rng.js',
  'js/market.js',
  'js/portfolio.js',
  'js/charts.js',
  'js/ui.js',
  'js/app.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE)
      // One missing file should not fail the whole install, so each entry is
      // fetched on its own and failures are skipped rather than thrown.
      .then(cache =>
        Promise.all(
          SHELL.map(url =>
            cache.add(new Request(url, { cache: 'reload' })).catch(() => null)
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then(hit => hit || caches.match('index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(hit => {
      const network = fetch(request)
        .then(response => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => hit);
      return hit || network;
    })
  );
});
