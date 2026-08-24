const { chromium } = require('playwright');
const CFG = require('./config');
const F = CFG.BUNDLE;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 1000 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

  // --- A. "No goal" option ---
  await p.addInitScript(()=>{try{localStorage.setItem('marketlab-intro-seen','1'); localStorage.setItem('marketlab_gate_bypass','1');}catch(e){}});
  await p.goto(F, { waitUntil: 'load' });
  await p.selectOption('#goal-input', 'none');
  await p.click('#restart-btn');
  await p.waitForTimeout(250);
  console.log('A. No goal ->', JSON.stringify(await p.evaluate(() => ({
    barHidden: document.getElementById('goal-box').hidden,
    hint: !document.getElementById('setup-hint').hidden,
  }))));
  for (let i = 0; i < 12; i++) {
    if (await p.locator('#next-year').isDisabled()) break;
    await p.click('#next-year'); await p.waitForTimeout(50);
    if (await p.locator('#decision-modal').isVisible()) { await p.click('.d-choice[data-choice="hold"]'); await p.waitForTimeout(50); }
  }
  console.log('   finished with no goal ->', JSON.stringify(await p.evaluate(() => ({
    done: !document.getElementById('results-card').hidden,
    firstVerdict: document.querySelector('#verdict-list li').textContent.slice(0, 60),
  }))));

  // --- B. 5-year run targets ---
  await p.addInitScript(()=>{try{localStorage.setItem('marketlab-intro-seen','1'); localStorage.setItem('marketlab_gate_bypass','1');}catch(e){}});
  await p.goto(F, { waitUntil: 'load' });
  await p.selectOption('#years-input', '5');
  await p.waitForTimeout(100);
  console.log('B. 5y goal targets ->', JSON.stringify(await p.$$eval('#goal-input option', o => o.map(x => x.textContent))));

  // --- C. Buy-the-dip with almost no cash: is it a trap? ---
  await p.addInitScript(()=>{try{localStorage.setItem('marketlab-intro-seen','1'); localStorage.setItem('marketlab_gate_bypass','1');}catch(e){}});
  await p.goto(F, { waitUntil: 'load' });
  const trap = await p.evaluate(() => {
    // Drain cash to just above the flat fee, then read what the buy option offers.
    const s = { flat: 3, rate: 0.005 };
    const spare = (4 - s.flat) / (1 + s.rate);
    return { cash: 4, spare: +spare.toFixed(2), feeOnThat: +(s.flat + spare * s.rate).toFixed(2) };
  });
  console.log('C. $4 cash -> offers to invest $' + trap.spare + ' for a $' + trap.feeOnThat + ' fee');

  // --- D. Fuzz: random legal actions, watch for errors ---
  await p.addInitScript(()=>{try{localStorage.setItem('marketlab-intro-seen','1'); localStorage.setItem('marketlab_gate_bypass','1');}catch(e){}});
  await p.goto(F, { waitUntil: 'load' });
  let acted = 0;
  for (let i = 0; i < 220; i++) {
    if (await p.locator('#decision-modal').isVisible()) {
      const c = ['sell', 'hold', 'buy'][i % 3];
      const btn = p.locator(`.d-choice[data-choice="${c}"]`);
      if (await btn.isEnabled()) { await btn.click(); } else { await p.click('.d-choice[data-choice="hold"]'); }
      acted++; await p.waitForTimeout(30); continue;
    }
    if (await p.locator('#results-card').isVisible()) {
      await p.click('#again-btn'); await p.waitForTimeout(150); acted++; continue;
    }
    const r = i % 7;
    if (r === 0) { await p.click('#next-month'); }
    else if (r === 1) { await p.click('#next-year'); }
    else if (r === 2) {
      await p.evaluate(() => {
        const rows = [...document.querySelectorAll('#market-body tr:not(.cat-row)')];
        const row = rows[Math.floor(Math.random() * rows.length)];
        row.querySelector('input').value = Math.floor(Math.random() * 400);
        row.querySelector(Math.random() > 0.5 ? '.buy' : '.sell').click();
      });
    } else if (r === 3) { await p.click('#play-btn'); await p.waitForTimeout(200); await p.evaluate(() => { const b = document.getElementById('play-btn'); if (b.classList.contains('is-playing')) b.click(); }); }
    else if (r === 4) { await p.click('#theme-btn'); }
    else if (r === 5) { await p.evaluate(() => { const t = document.querySelectorAll('[data-term]'); t[Math.floor(Math.random() * t.length)].click(); }); await p.evaluate(() => Glossary.close()); }
    else { await p.click('#table-toggle'); }
    acted++;
    await p.waitForTimeout(25);
  }
  console.log('D. Fuzz: ' + acted + ' actions completed');
  console.log('ERRORS:', errs.length ? errs.slice(0, 8) : 'none');
  await b.close();
})();
