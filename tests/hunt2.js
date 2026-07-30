/* Fresh bug hunt after the dividends/disclaimer commit.
 * Plays many full runs with random trades, asserting invariants each month. */
const { chromium } = require('playwright');
const CFG = require('./config');
const URL = CFG.APP;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const problems = [];
  p.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push('CONSOLE ' + m.type() + ': ' + m.text());
  });
  p.on('pageerror', (e) => problems.push('PAGEERROR: ' + e.message));

  await p.addInitScript(() => {
    try { localStorage.setItem('marketlab-intro-seen', '1'); } catch (e) {}
  });
  await p.goto(URL, { waitUntil: 'networkidle' });

  const out = await p.evaluate(async () => {
    const bugs = [];
    const note = (s) => { if (bugs.length < 60) bugs.push(s); };

    // Reach into the app the way a user would is too slow for 400 runs, so drive
    // the model layer directly. UI-level checks happen separately.
    const rng = (function (s) {
      let x = s >>> 0;
      return function () { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
    })(12345);

    const stats = { runs: 0, months: 0, trades: 0, negCash: 0, maxVal: 0, minVal: Infinity };

    for (let r = 0; r < 400; r++) {
      const years = [5, 10, 20][Math.floor(rng() * 3)];
      const market = Market.generate('fuzz-' + r, years * 12);
      const st = Portfolio.create(market, {});
      stats.runs++;

      while (!st.finished) {
        // random action
        const roll = rng();
        if (roll < 0.25) {
          const a = Market.ASSETS[Math.floor(rng() * Market.ASSETS.length)];
          Portfolio.buy(st, a.id, rng() * st.cash * 1.4);
          stats.trades++;
        } else if (roll < 0.33) {
          const a = Market.ASSETS[Math.floor(rng() * Market.ASSETS.length)];
          Portfolio.sell(st, a.id, rng() * 500);
          stats.trades++;
        } else if (roll < 0.35) {
          Portfolio.sellAll(st);
        } else if (roll < 0.37) {
          Portfolio.investAllCash(st);
        } else if (roll < 0.39) {
          const c = Market.CATEGORIES[Math.floor(rng() * Market.CATEGORIES.length)];
          Portfolio.sellCategory(st, c.id);
        }

        Portfolio.advance(st);
        stats.months++;

        if (st.cash < -0.005) { stats.negCash++; note('run ' + r + ' m' + st.month + ' negative cash ' + st.cash); }
        const tv = Portfolio.totalValue(st);
        if (!isFinite(tv)) note('run ' + r + ' m' + st.month + ' non-finite total ' + tv);
        if (tv > stats.maxVal) stats.maxVal = tv;
        if (tv < stats.minVal) stats.minVal = tv;
        Market.ASSETS.forEach(function (a) {
          if (st.shares[a.id] < 0) note('run ' + r + ' negative shares ' + a.id + ' ' + st.shares[a.id]);
          const px = Portfolio.priceOf(st, a.id);
          if (!isFinite(px) || px <= 0) note('run ' + r + ' m' + st.month + ' bad price ' + a.id + ' ' + px);
        });
      }

      const s = Portfolio.summarise(st);
      Object.keys(s).forEach(function (k) {
        if (typeof s[k] === 'number' && !isFinite(s[k])) note('run ' + r + ' summarise.' + k + ' = ' + s[k]);
      });
      if (s.dividends < 0) note('run ' + r + ' negative dividends');
      if (s.fees < 0) note('run ' + r + ' negative fees');
      const sa = Portfolio.sellAnalysis(st);
      sa.rows.forEach(function (row) {
        if (!isFinite(row.cost)) note('run ' + r + ' sellAnalysis non-finite cost');
      });
      const code = Share.encode ? Share.encode(st, s) : null;
      if (code && Share.decode && !Share.decode(code)) note('run ' + r + ' share code failed to round-trip: ' + code);
    }

    return { bugs: bugs, stats: stats };
  });

  console.log('stats', out.stats);
  console.log('model bugs:', out.bugs.length ? out.bugs : 'none');
  console.log('console problems:', problems.length ? problems : 'none');
  await b.close();
})();
