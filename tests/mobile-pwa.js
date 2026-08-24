const CFG = require('./config');
const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch();
  // Mobile: the glossary must become a bottom sheet and the table a card list.
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  const p = await ctx.newPage();
  await p.addInitScript(()=>{try{localStorage.setItem('marketlab-intro-seen','1'); localStorage.setItem('marketlab_gate_bypass','1');}catch(e){}});
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(CFG.APP, { waitUntil: 'load' });
  await p.waitForTimeout(400);
  await p.click('[data-term="fees"]');
  await p.waitForTimeout(300);
  const sheet = await p.evaluate(() => {
    const el = document.querySelector('.term-pop');
    const r = el.getBoundingClientRect();
    return { position: getComputedStyle(el).position, left: Math.round(r.left), width: Math.round(r.width), bottomAtViewport: Math.round(r.bottom) === Math.round(window.innerHeight) };
  });
  console.log('MOBILE SHEET:', JSON.stringify(sheet));
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  console.log('NO HORIZONTAL SCROLL:', overflow);
  await p.screenshot({ path: '/tmp/claude-0/-home-user-Main/39cb3cd4-a90c-5e9d-ba2e-647438e42e07/scratchpad/mobile.png' });
  await ctx.close();

  // Offline still works with the new shell.
  const ctx2 = await b.newContext();
  const p2 = await ctx2.newPage();
  await p2.addInitScript(()=>{try{localStorage.setItem('marketlab-intro-seen','1'); localStorage.setItem('marketlab_gate_bypass','1');}catch(e){}});
  p2.on('pageerror', e => errs.push(e.message));
  await p2.goto(CFG.APP, { waitUntil: 'load' });
  await p2.evaluate(() => navigator.serviceWorker.ready);
  await p2.waitForTimeout(800);
  const cached = await p2.evaluate(async () => {
    const keys = await caches.keys();
    const c = await caches.open(keys[0]);
    return { cache: keys[0], entries: (await c.keys()).length };
  });
  console.log('CACHE:', JSON.stringify(cached));
  await ctx2.setOffline(true);
  await p2.reload({ waitUntil: 'load' });
  await p2.waitForTimeout(600);
  const off = await p2.evaluate(() => ({
    rows: document.querySelectorAll('#market-body tr:not(.cat-row)').length,
    terms: document.querySelectorAll('[data-term]').length,
  }));
  console.log('OFFLINE:', JSON.stringify(off));
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close();
})();
