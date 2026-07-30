/* Same run, but only ever clicking buttons that are actually visible. */
const { chromium } = require('playwright');
const CFG = require('./config');
const URL = CFG.APP;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const problems = [];
  p.on('console', (m) => { if (m.type() === 'error') problems.push('CONSOLE: ' + m.text()); });
  p.on('pageerror', (e) => problems.push('PAGEERROR: ' + e.message));
  await p.addInitScript(() => { try { localStorage.setItem('marketlab-intro-seen', '1'); } catch (e) {} });
  await p.goto(URL, { waitUntil: 'networkidle' });

  const probe = await p.evaluate(() => {
    const out = [];
    const row = [...document.querySelectorAll('#market-body tr')].find((r) => r.querySelector('.mini.buy'));
    const input = row.querySelector('input');
    const buy = row.querySelector('.mini.buy');
    const sell = row.querySelector('.mini.sell');
    const notice = document.getElementById('trade-notice');
    ['-50', '0', '', '999999999', '0.0001', '  25 '].forEach(function (v) {
      input.value = v; buy.click();
      out.push('BUY "' + v + '" -> "' + notice.textContent + '" cash=' + document.getElementById('tile-cash').textContent);
    });
    input.value = '-10'; sell.click();
    out.push('SELL "-10" -> "' + notice.textContent + '"');
    input.value = '1000000'; sell.click();
    out.push('SELL huge -> "' + notice.textContent + '" cash=' + document.getElementById('tile-cash').textContent);
    return out;
  });

  await p.selectOption('#years-input', '20');
  await p.click('#restart-btn');
  await p.waitForTimeout(600);
  await p.evaluate(() => {
    const want = ['btc', 'nvda', 'world', 'nzbond'];
    [...document.querySelectorAll('#market-body tr')].forEach((r) => {
      const sb = r.querySelector('.spark-btn');
      if (!sb || want.indexOf(sb.getAttribute('data-asset')) < 0) return;
      r.querySelector('input').value = '200';
      r.querySelector('.mini.buy').click();
    });
  });

  const modals = [];
  let n = 0;
  for (let i = 0; i < 300; i++) {
    const st = await p.evaluate(() => ({
      finished: document.getElementById('next-month').disabled,
      modal: !document.getElementById('decision-modal').hidden
    }));
    if (st.finished) break;
    if (st.modal) {
      const info = await p.evaluate(() => {
        const m = document.getElementById('decision-modal');
        const vis = [...m.querySelectorAll('.d-choice')].filter((b) => b.offsetParent !== null || getComputedStyle(b).display !== 'none');
        return {
          when: document.getElementById('d-when').textContent,
          head: document.getElementById('d-headline').textContent,
          money: document.getElementById('d-money').innerText.replace(/\n/g, ' '),
          btns: vis.map((b) => ({ t: b.innerText.replace(/\s+/g, ' ').trim(), d: b.disabled, c: b.className }))
        };
      });
      modals.push(info);
      n++;
      const pickIdx = n % info.btns.filter((x) => !x.d).length;
      await p.evaluate((k) => {
        const m = document.getElementById('decision-modal');
        const vis = [...m.querySelectorAll('.d-choice')].filter((b) => getComputedStyle(b).display !== 'none' && !b.disabled);
        vis[k % vis.length].click();
      }, pickIdx);
      await p.waitForTimeout(120);
      continue;
    }
    if (i % 25 === 0) {
      await p.evaluate(() => {
        const rows = [...document.querySelectorAll('#market-body tr')].filter((r) => r.querySelector('.mini.buy'));
        const r = rows[Math.floor(Math.random() * rows.length)];
        r.querySelector('input').value = '150';
        r.querySelector('.mini.buy').click();
      });
    }
    await p.click('#next-month');
  }
  await p.waitForTimeout(500);

  const junk = await p.evaluate(() => {
    const bad = [];
    const t = document.body.innerText;
    ['NaN', 'undefined', 'Infinity', '[object', '$-0.00'].forEach(function (nd) {
      const i = t.indexOf(nd);
      if (i >= 0) bad.push(nd + ' near: ' + t.slice(Math.max(0, i - 70), i + 40).replace(/\n/g, ' | '));
    });
    return bad;
  });
  const results = await p.evaluate(() => document.getElementById('results-card').innerText);

  console.log('=== trade probe ==='); probe.forEach((x) => console.log('  ' + x));
  console.log('=== modals (' + modals.length + ') ===');
  modals.forEach((m) => {
    console.log('  ' + m.when + ' | ' + m.head);
    console.log('     ' + m.money);
    m.btns.forEach((bb) => console.log('     * ' + (bb.d ? '[OFF] ' : '') + bb.t));
  });
  console.log('=== junk ==='); console.log(junk.length ? junk : 'none');
  console.log('=== results ==='); console.log(results);
  console.log('=== problems ==='); console.log(problems.length ? problems : 'none');
  await b.close();
})();
