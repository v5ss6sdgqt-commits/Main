const { chromium } = require('playwright');
const CFG = require('./config');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 1000 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

  await p.addInitScript(()=>{try{localStorage.setItem('marketlab-intro-seen','1'); localStorage.setItem('marketlab_gate_bypass','1');}catch(e){}});
  await p.goto(CFG.BUNDLE, { waitUntil: 'load' });
  await p.waitForTimeout(500);

  // Structure
  const structure = await p.evaluate(() => ({
    catRows: document.querySelectorAll('#market-body .cat-row').length,
    assetRows: document.querySelectorAll('#market-body tr:not(.cat-row)').length,
    termLinks: document.querySelectorAll('[data-term]').length,
    firstAsset: document.querySelector('#market-body tr:not(.cat-row) .asset-name').textContent,
    btcPrice: [...document.querySelectorAll('#market-body tr:not(.cat-row)')].map(r => r.querySelector('.c-price').textContent).pop(),
  }));
  console.log('STRUCTURE:', JSON.stringify(structure));

  // Every glossary term must render without throwing.
  const termCheck = await p.evaluate(() => {
    const out = { ok: [], failed: [] };
    Object.keys(Glossary.TERMS).forEach(id => {
      try {
        const el = document.querySelector('[data-term="' + id + '"]') || document.body;
        Glossary.open(id, el);
        const t = document.querySelector('.term-pop .term-body').textContent.trim();
        if (t.length < 40) out.failed.push(id + ' (too short)');
        else out.ok.push(id);
      } catch (e) { out.failed.push(id + ': ' + e.message); }
    });
    Glossary.close();
    return out;
  });
  console.log('TERMS OK:', termCheck.ok.length, '/', termCheck.ok.length + termCheck.failed.length);
  if (termCheck.failed.length) console.log('TERMS FAILED:', termCheck.failed);

  // Real click on the fees tile.
  await p.click('[data-term="fees"]');
  await p.waitForTimeout(200);
  const pop = await p.evaluate(() => {
    const el = document.querySelector('.term-pop');
    return { visible: !el.hidden, title: el.querySelector('h3').textContent, snippet: el.querySelector('.term-body').textContent.slice(0, 90) };
  });
  console.log('POPOVER:', JSON.stringify(pop));
  await p.keyboard.press('Escape');

  // Auto-play
  await p.click('#play-btn');
  await p.waitForTimeout(2200);
  const mid = await p.evaluate(() => ({
    month: document.getElementById('clock-text').textContent,
    playing: document.getElementById('play-btn').classList.contains('is-playing'),
    label: document.getElementById('play-label').textContent,
  }));
  console.log('AUTOPLAY:', JSON.stringify(mid));
  await p.click('#play-btn');
  const paused = await p.evaluate(() => document.getElementById('play-btn').classList.contains('is-playing'));
  console.log('PAUSED OK:', !paused);

  // Trade, then finish the run fast.
  await p.evaluate(() => {
    const rows = [...document.querySelectorAll('#market-body tr:not(.cat-row)')];
    const world = rows.find(r => r.querySelector('.asset-name').textContent.includes('Total World'));
    world.querySelector('input').value = 400;
    world.querySelector('.buy').click();
  });
  for (let i = 0; i < 15; i++) {
    if (await p.locator('#next-year').isDisabled()) break;
    await p.click('#next-year'); await p.waitForTimeout(60);
    // The crash modal blocks the page by design; hold and carry on.
    if (await p.locator('#decision-modal').isVisible()) {
      await p.click('.d-choice[data-choice="hold"]'); await p.waitForTimeout(60);
    }
  }
  const done = await p.evaluate(() => ({
    finished: !document.getElementById('results-card').hidden,
    tiles: [...document.querySelectorAll('#results-grid .tile')].map(t => t.querySelector('.k').textContent + '=' + t.querySelector('.v').textContent),
  }));
  console.log('RESULTS:', JSON.stringify(done, null, 1));
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close();
})();
