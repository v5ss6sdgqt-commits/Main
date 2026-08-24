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
 * Those two strategies together used to be able to break the one promise the
 * whole classroom exercise rests on. A student returning after an update got the
 * new index.html from the network, but every script came back from the old cache
 * — stale-while-revalidate serves the cached copy now and only refreshes it for
 * next time. New page, old js. And because js/market.js, js/goals.js and
 * js/app.js *are* the market, two students could type the same seed, see
 * completely different prices and different goal targets, and have nothing on
 * screen to tell them why. Same-seed determinism is the feature that makes a
 * class comparable; silently losing it is worse than an error message.
 *
 * The fix is the ordinary one: every asset URL in index.html carries `?v=N`. A
 * new page asks for URLs the old cache has never seen, so they miss and go to
 * the network. There is no version in which old js can answer a new page's
 * request.
 *
 * On release, bump all three together — CACHE below, VERSION below, and the
 * `?v=` on every tag in index.html. They must agree. */

const VERSION = '19';
const CACHE = 'market-lab-v' + VERSION;

const v = url => url + '?v=' + VERSION;

const SHELL = [
  './',
  'index.html',
  v('css/styles.css'),
  v('js/rng.js'),
  v('js/market.js'),
  v('js/live-prices.js'),
  v('js/portfolio.js'),
  v('js/charts.js'),
  v('js/goals.js'),
  v('js/opponents.js'),
  v('js/share.js'),
  v('js/asset-panel.js'),
  v('js/intro.js'),
  v('js/ui.js'),
  v('js/glossary.js'),
  v('js/account.js'),
  v('js/leaderboard.js'),
  v('js/app.js'),
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
