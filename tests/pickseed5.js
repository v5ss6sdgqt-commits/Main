/* Second pass: also require the run to be winnable and the decisions spread out. */
const { chromium } = require('playwright');
const CFG = require('./config');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.addInitScript(() => { try { localStorage.setItem('marketlab-intro-seen','1'); } catch(e){} });
  await p.goto(CFG.APP, { waitUntil: 'networkidle' });

  const out = await p.evaluate(() => {
    const SPEC = ['btc', 'eth', 'tsla', 'nvda', 'xro', 'atm', 'air'];

    function score(seed, years) {
      const months = years * 12;
      const mk = Market.generate(seed, months);
      const st = Portfolio.create(mk, {});
      while (!st.finished) Portfolio.advance(st);
      const s = Portfolio.summarise(st);

      const cagr = {};
      Market.ASSETS.forEach(function (a) {
        cagr[a.id] = Math.pow(mk.prices[a.id][months] / mk.prices[a.id][0], 12 / months) - 1 + (a.dividend || 0);
      });
      let best = 'world';
      Market.ASSETS.forEach(function (a) { if (cagr[a.id] > cagr[best]) best = a.id; });
      let specWins = 0;
      SPEC.forEach(function (id) { if (cagr[id] > cagr.world) specWins++; });

      const crashMonths = [];
      mk.events.forEach(function (e, m) { if (e && e.crash) crashMonths.push(m); });

      let peak = 0, dd = 0;
      mk.prices.world.forEach(function (v) { if (v > peak) peak = v; const d = v / peak - 1; if (d < dd) dd = d; });

      const car = Goals.targetFor('car', Portfolio.DEFAULTS, months);
      let rec = 0;
      mk.cycle.forEach(function (c) { if (c === 'recession') rec++; });

      return {
        seed: seed, world: cagr.world, best: best, bestRet: cagr[best], btc: cagr.btc,
        specWins: specWins, crashes: crashMonths, bench: s.benchmark, benchRate: s.benchAnnualised,
        car: car, carHit: s.benchmark >= car, dd: dd, rec: rec, months: months
      };
    }

    function search(years, want) {
      const hits = [];
      for (let i = 0; i < 4000; i++) {
        const s = score('classroom-' + (1000 + i), years);
        if (s.world < want.wlo || s.world > want.whi) continue;
        if (s.specWins > want.maxSpec) continue;
        if (SPEC.indexOf(s.best) >= 0) continue;
        if (s.btc > s.world) continue;
        if (!s.carHit) continue;                 // the default goal must be winnable by buy-and-hold
        if (s.bench > want.benchMax * s.car) continue;   // but not trivially - keep it a stretch
        if (s.crashes.length < want.minCrash || s.crashes.length > want.maxCrash) continue;
        if (s.dd > want.maxDd) continue;
        if (s.rec < want.minRec) continue;
        // decisions spread across the run
        const half = s.months / 2;
        const early = s.crashes.filter(function (m) { return m < half; }).length;
        const late = s.crashes.length - early;
        if (want.spread && (early < 1 || late < 1)) continue;
        hits.push(s);
      }
      return hits;
    }

    return {
      five: search(5, { wlo: 0.07, whi: 0.14, maxSpec: 2, minCrash: 1, maxCrash: 3, maxDd: -0.14, minRec: 3, benchMax: 1.9, spread: false }).slice(0, 14),
      twenty: search(20, { wlo: 0.075, whi: 0.09, maxSpec: 0, minCrash: 4, maxCrash: 6, maxDd: -0.32, minRec: 16, benchMax: 1.4, spread: true }).slice(0, 14)
    };
  });

  const show = (s) => '  ' + s.seed + '  world ' + (s.world * 100).toFixed(1) + '%  best=' + s.best + ' ' +
    (s.bestRet * 100).toFixed(1) + '%  btc ' + (s.btc * 100).toFixed(1) + '%  spec ' + s.specWins + '/7  ' +
    'bench $' + Math.round(s.bench).toLocaleString() + ' vs car $' + s.car.toLocaleString() +
    '  crashes ' + JSON.stringify(s.crashes) + '  recess ' + s.rec + '  fall ' + (s.dd * 100).toFixed(0) + '%';

  console.log('5-year candidates:'); out.five.forEach((s) => console.log(show(s)));
  console.log('\n20-year candidates:'); out.twenty.forEach((s) => console.log(show(s)));
  await b.close();
})();
