/* Does the service worker serve stale scripts to a page that has been updated?
 *
 * Simulates "a student used this last week, then we shipped an update". The old
 * index.html asked for "js/app.js"; the new one asks for "js/app.js?v=11". So
 * put OLD code in the cache under each URL in turn and see which one the live
 * page actually executes.
 *
 *   under "js/app.js"       -> what a real pre-update cache holds. Must MISS.
 *   under "js/app.js?v=11"  -> proves the cache is genuinely consulted first,
 *                              i.e. the hazard was real and only the changed
 *                              URL is what saves us. Must HIT.
 */
const { chromium } = require('playwright');
const CFG = require('./config');
const URL_ = CFG.APP;

async function probe(cacheKey, expectStale) {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.addInitScript(() => { try { localStorage.setItem('marketlab-intro-seen', '1'); } catch (e) {} });

  await p.goto(URL_, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(700);
  const controlled = await p.evaluate(() => !!navigator.serviceWorker.controller);

  const where = await p.evaluate(async (key) => {
    const names = await caches.keys();
    if (!names.length) return 'NO CACHE';
    const c = await caches.open(names[0]);
    await c.put(
      new Request(new URL(key, location.href).href),
      new Response('window.__STALE__ = true;', {
        status: 200,
        headers: { 'Content-Type': 'application/javascript' }
      })
    );
    return names[0];
  }, cacheKey);

  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(700);

  const r = await p.evaluate(() => ({
    stale: !!window.__STALE__,
    working: !!(window.Market && document.getElementById('market-body').children.length > 0)
  }));

  const ok = r.stale === expectStale;
  console.log('  cache "' + where + '" poisoned at "' + cacheKey + '"');
  console.log('    page ran the stale copy: ' + r.stale + '   (expected ' + expectStale + ') ' + (ok ? 'OK' : 'UNEXPECTED'));
  console.log('    app still functional: ' + r.working);
  await b.close();
  return ok;
}

(async () => {
  console.log('service worker controlling the page is required for this test to mean anything.\n');
  console.log('A. old cache entry, as a returning student would have (must be ignored):');
  const a = await probe('js/app.js', false);
  console.log('\nB. same-version cache entry (must be used — shows the cache really is first):');
  const b2 = await probe('js/app.js?v=11', true);
  console.log('\nverdict: ' + (a && b2
    ? 'the ?v= change is what prevents a returning student running old code'
    : 'inconclusive — read the numbers above'));
})();
