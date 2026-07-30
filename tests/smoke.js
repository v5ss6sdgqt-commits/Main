const { chromium } = require('playwright');
const CFG = require('./config');
const path = require('path');

const URL = CFG.APP;
const OUT = '/tmp/claude-0/-home-user-Main/39cb3cd4-a90c-5e9d-ba2e-647438e42e07/scratchpad';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });

  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.addInitScript(()=>{try{localStorage.setItem('marketlab-intro-seen','1');}catch(e){}});
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.evaluate(()=>{ if(window.Intro&&Intro.close) Intro.close(); const b=document.querySelector('.intro-backdrop'); if(b) b.remove(); });

  const initial = await page.evaluate(() => ({
    hero: document.getElementById('hero-value').textContent,
    cash: document.getElementById('tile-cash').textContent,
    rows: document.querySelectorAll('#market-body tr').length,
    clock: document.getElementById('clock-text').textContent,
  }));
  console.log('INITIAL:', JSON.stringify(initial));

  // Buy $4000 of the index fund and $1500 of Bitcorn.
  await page.evaluate(() => {
    const rows = document.querySelectorAll('#market-body tr');
    const set = (i, v) => { rows[i].querySelector('input').value = v; rows[i].querySelector('.buy').click(); };
    set(1, 4000);
    set(4, 1500);
  });
  await page.waitForTimeout(200);

  const afterTrade = await page.evaluate(() => ({
    hero: document.getElementById('hero-value').textContent,
    cash: document.getElementById('tile-cash').textContent,
    fees: document.getElementById('tile-fees').textContent,
    alloc: [...document.querySelectorAll('#alloc-legend .item')].map(e => e.textContent.trim()),
  }));
  console.log('AFTER TRADE:', JSON.stringify(afterTrade, null, 1));

  // Advance three years.
  for (let i = 0; i < 3; i++) { await page.click('#next-year'); await page.waitForTimeout(120); }
  const mid = await page.evaluate(() => ({
    hero: document.getElementById('hero-value').textContent,
    clock: document.getElementById('clock-text').textContent,
    real: document.getElementById('tile-real').textContent,
    feed: document.querySelectorAll('#feed li').length,
  }));
  console.log('AFTER 3 YEARS:', JSON.stringify(mid));

  await page.screenshot({ path: OUT + '/light.png', fullPage: true });

  // Hover the chart to exercise the tooltip + crosshair path.
  const box = await page.locator('#main-chart').boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.waitForTimeout(250);
  const tip = await page.evaluate(() => {
    const t = document.getElementById('chart-tooltip');
    return { on: t.classList.contains('on'), text: t.textContent.slice(0, 90) };
  });
  console.log('TOOLTIP:', JSON.stringify(tip));
  await page.screenshot({ path: OUT + '/tooltip.png', clip: { x: box.x - 20, y: box.y - 40, width: box.width + 40, height: box.height + 80 } });

  // Run to the end.
  for (let i = 0; i < 12; i++) {
    if (await page.locator('#next-year').isDisabled()) break;
    await page.click('#next-year');
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(500);
  const end = await page.evaluate(() => ({
    finished: !document.getElementById('results-card').hidden,
    sub: document.getElementById('results-sub').textContent,
    tiles: [...document.querySelectorAll('#results-grid .tile')].map(t => t.querySelector('.k').textContent + ' = ' + t.querySelector('.v').textContent),
    verdict: [...document.querySelectorAll('#verdict-list li')].map(l => l.textContent.slice(0, 120)),
    nextDisabled: document.getElementById('next-month').disabled,
  }));
  console.log('END:', JSON.stringify(end, null, 1));

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  await page.screenshot({ path: OUT + '/results.png', fullPage: true });

  // Dark mode.
  await page.click('#theme-btn');
  await page.waitForTimeout(400);
  await page.evaluate(()=>{ if(window.Intro&&Intro.close) Intro.close(); const b=document.querySelector('.intro-backdrop'); if(b) b.remove(); });
  await page.screenshot({ path: OUT + '/dark.png', fullPage: true });

  // Mobile: the page body must never scroll horizontally.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await phone.addInitScript(()=>{try{localStorage.setItem('marketlab-intro-seen','1');}catch(e){}});
  await phone.goto(URL, { waitUntil: 'load' });
  await phone.waitForTimeout(400);
  await phone.click('#next-year');
  await phone.waitForTimeout(300);
  const overflow = await phone.evaluate(() => ({
    bodyScrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    overflows: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  }));
  console.log('MOBILE:', JSON.stringify(overflow));
  await phone.screenshot({ path: OUT + '/mobile.png', fullPage: true });
  await phone.close();

  // Determinism: same seed must reproduce the same market.
  const det = await page.evaluate(() => {
    const a = Market.generate('classroom-01', 24).prices.index;
    const b = Market.generate('classroom-01', 24).prices.index;
    const c = Market.generate('classroom-02', 24).prices.index;
    return { same: JSON.stringify(a) === JSON.stringify(b), differs: JSON.stringify(a) !== JSON.stringify(c) };
  });
  console.log('DETERMINISM:', JSON.stringify(det));

  // Calibration: does the median path actually compound at the stated rate?
  const calib = await page.evaluate(() => {
    const horizons = [10, 30];
    const res = {};
    horizons.forEach(years => {
      const months = years * 12;
      const out = {};
      Market.ASSETS.forEach(a => { out[a.id] = []; });
      for (let s = 0; s < 400; s++) {
        const m = Market.generate('calib-' + years + '-' + s, months);
        Market.ASSETS.forEach(a => {
          const p = m.prices[a.id];
          out[a.id].push(Math.pow(p[months] / p[0], 1 / years) - 1);
        });
      }
      res[years + 'y'] = {};
      Market.ASSETS.forEach(a => {
        const arr = out[a.id].slice().sort((x, y) => x - y);
        const f = v => (v * 100).toFixed(1) + '%';
        res[years + 'y'][a.id] = 'price target ' + f(a.mu - (a.dividend || 0)) +
          ' | median ' + f(arr[Math.floor(arr.length / 2)]) +
          ' | p10 ' + f(arr[Math.floor(arr.length * 0.1)]) +
          ' | p90 ' + f(arr[Math.floor(arr.length * 0.9)]);
      });
    });
    return res;
  });
  console.log('CALIBRATION (400 runs each):', JSON.stringify(calib, null, 1));

  // The reported growth-per-year must satisfy the IRR definition: discounting
  // the actual cash flows at that rate has to give a net present value of zero.
  const irrCheck = await page.evaluate(() => {
    const market = Market.generate('irr-test', 120);
    const st = Portfolio.create(market);
    Portfolio.buy(st, 'world', 5000);
    for (let i = 0; i < 120; i++) Portfolio.advance(st);
    const s = Portfolio.summarise(st);

    const monthly = Math.pow(1 + s.annualised, 1 / 12) - 1;
    const flows = new Array(121).fill(-st.cfg.monthlyContribution);
    flows[0] = -st.cfg.startingCash;
    flows[120] += s.nominal;
    let npv = 0;
    for (let t = 0; t < flows.length; t++) npv += flows[t] / Math.pow(1 + monthly, t);

    return {
      finalValue: Math.round(s.nominal),
      contributed: Math.round(s.contributed),
      annualised: (s.annualised * 100).toFixed(2) + '%',
      benchAnnualised: (s.benchAnnualised * 100).toFixed(2) + '%',
      npvAtReportedRate: npv.toFixed(4),
      npvNearZero: Math.abs(npv) < 0.01,
    };
  });
  console.log('IRR CHECK:', JSON.stringify(irrCheck, null, 1));

  console.log('ERRORS:', errors.length ? errors : 'none');
  await browser.close();
})();
