const { chromium } = require('playwright');
const CFG = require('./config');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

  await p.goto(CFG.APP, { waitUntil: 'load' });

  // Wait for the service worker to take control.
  const swState = await p.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 'unsupported';
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    return reg ? (reg.active ? 'active' : 'registered') : 'none';
  });
  console.log('SERVICE WORKER:', swState);

  const manifest = await p.evaluate(async () => {
    const link = document.querySelector('link[rel=manifest]');
    const res = await fetch(link.href);
    const m = await res.json();
    // Verify every icon the manifest promises actually resolves.
    const icons = [];
    for (const i of m.icons) {
      const r = await fetch(new URL(i.src, link.href));
      icons.push(i.src + ':' + r.status);
    }
    return { name: m.name, display: m.display, start: m.start_url, scope: m.scope, icons };
  });
  console.log('MANIFEST:', JSON.stringify(manifest));

  // Cache should now hold the shell.
  const cached = await p.evaluate(async () => {
    const keys = await caches.keys();
    const c = await caches.open(keys[0]);
    const reqs = await c.keys();
    return { cache: keys[0], entries: reqs.length };
  });
  console.log('CACHE:', JSON.stringify(cached));

  // Now go offline and reload — the whole point of installing it.
  await ctx.setOffline(true);
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(600);
  const offline = await p.evaluate(() => ({
    hero: document.getElementById('hero-value') && document.getElementById('hero-value').textContent,
    rows: document.querySelectorAll('#market-body tr').length,
    styled: getComputedStyle(document.body).backgroundColor,
  }));
  console.log('OFFLINE RELOAD:', JSON.stringify(offline));

  await ctx.setOffline(false);
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close();
})();
