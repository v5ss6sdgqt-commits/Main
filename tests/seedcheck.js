/* How the default seed's benchmark compares to the 8% the table promises,
 * at each run length, and where it sits in the distribution of seeds. */
const { chromium } = require('playwright');
const CFG = require('./config');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.addInitScript(() => { try { localStorage.setItem('marketlab-intro-seen','1'); localStorage.setItem('marketlab_gate_bypass','1'); } catch(e){} });
  await p.goto(CFG.APP, { waitUntil: 'networkidle' });

  const out = await p.evaluate(() => {
    function benchRate(seed, years) {
      const mk = Market.generate(seed, years * 12);
      const st = Portfolio.create(mk, {});
      while (!st.finished) Portfolio.advance(st);
      const s = Portfolio.summarise(st);
      // price-only CAGR of the benchmark asset, plus the money-weighted rate
      const px = mk.prices[Market.BENCHMARK_ID];
      const cagr = Math.pow(px[px.length - 1] / px[0], 12 / (px.length - 1)) - 1;
      return { irr: s.benchAnnualised, cagr: cagr };
    }

    const rows = [];
    [5, 10, 20].forEach(function (y) {
      const d = benchRate('classroom-4019', y);
      rows.push({ seed: 'classroom-4019', years: y, irr: d.irr, priceCagr: d.cagr });
    });

    // distribution over 300 random seeds at 20 years
    const dist = [];
    for (let i = 0; i < 300; i++) dist.push(benchRate('s-' + i, 20).irr);
    dist.sort(function (a, b) { return a - b; });
    const q = function (f) { return dist[Math.floor(f * (dist.length - 1))]; };

    // where classroom-4019 20y sits
    const target = rows.find(function (r) { return r.years === 20; }).irr;
    let below = 0;
    dist.forEach(function (v) { if (v < target) below++; });

    // also: every asset's realised 20y CAGR on the default seed vs its stated mu
    const mk = Market.generate('classroom-4019', 240);
    const assets = Market.ASSETS.map(function (a) {
      const px = mk.prices[a.id];
      const priceCagr = Math.pow(px[px.length - 1] / px[0], 12 / (px.length - 1)) - 1;
      return { id: a.id, mu: a.mu, total: priceCagr + (a.dividend || 0), gap: priceCagr + (a.dividend || 0) - a.mu };
    }).sort(function (x, y) { return y.gap - x.gap; });

    return {
      rows: rows,
      dist: { p10: q(0.1), p25: q(0.25), median: q(0.5), p75: q(0.75), p90: q(0.9) },
      percentile: below / dist.length,
      assets: assets
    };
  });

  console.log('default seed benchmark rate by run length:');
  out.rows.forEach((r) => console.log('  ' + r.years + 'y  money-weighted ' + (r.irr * 100).toFixed(1) + '%   price CAGR ' + (r.priceCagr * 100).toFixed(1) + '%'));
  console.log('\n20y benchmark money-weighted rate across 300 seeds:');
  Object.entries(out.dist).forEach(([k, v]) => console.log('  ' + k + ': ' + (v * 100).toFixed(1) + '%'));
  console.log('  classroom-4019 sits at the ' + Math.round(out.percentile * 100) + 'th percentile');
  console.log('\nrealised 20y total return vs stated expected, default seed:');
  out.assets.forEach((a) => console.log('  ' + a.id.padEnd(10) + ' stated ' + (a.mu * 100).toFixed(1).padStart(5) + '%   realised ' + (a.total * 100).toFixed(1).padStart(6) + '%   gap ' + (a.gap * 100).toFixed(1).padStart(6)));
  await b.close();
})();
