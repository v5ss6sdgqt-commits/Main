const { chromium } = require('playwright');
const CFG = require('./config');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('request', r => { const u = r.url(); if (!u.startsWith('file://') && !u.startsWith('data:')) errs.push('EXTERNAL REQUEST: ' + u); });

  await p.addInitScript(()=>{try{localStorage.setItem('marketlab-intro-seen','1');}catch(e){}});
  await p.goto(CFG.BUNDLE, { waitUntil: 'load' });
  await p.waitForTimeout(400);
  await p.evaluate(() => {
    const r = document.querySelectorAll('#market-body tr');
    r[1].querySelector('input').value = 5000; r[1].querySelector('.buy').click();
  });
  for (let i = 0; i < 12; i++) {
    if (await p.locator('#next-year').isDisabled()) break;
    await p.click('#next-year'); await p.waitForTimeout(60);
  }
  const out = await p.evaluate(() => ({
    finished: !document.getElementById('results-card').hidden,
    hero: document.getElementById('hero-value').textContent,
    growth: [...document.querySelectorAll('#results-grid .tile')].map(t => t.querySelector('.k').textContent + '=' + t.querySelector('.v').textContent).slice(0, 5),
  }));
  console.log('BUNDLE:', JSON.stringify(out));
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close();
})();
