const path = require('path');
const CFG = require('./config');
const fs = require('fs');
const vm = require('vm');
const ctx = { Math: Math, console: console };
ctx.window = ctx; // so window.Rng becomes a bare global, as it is in a browser

vm.createContext(ctx);
['rng', 'market'].forEach(n => {
  vm.runInContext(fs.readFileSync(path.join(CFG.root, 'js', n + '.js'), 'utf8'), ctx);
});
// The IIFEs attach to the `window` they are passed; expose them.
const Market = ctx.Market;

const YEARS = 10, RUNS = 4000, M = YEARS * 12;
const results = {};
Market.ASSETS.forEach(a => (results[a.id] = []));

for (let i = 0; i < RUNS; i++) {
  const mk = Market.generate('cal-' + i, M);
  Market.ASSETS.forEach(a => {
    const p = mk.prices[a.id];
    results[a.id].push(Math.pow(p[M] / p[0], 1 / YEARS) - 1);
  });
}

function median(xs) { const s = xs.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }
function pctl(xs, q) { const s = xs.slice().sort((x, y) => x - y); return s[Math.floor(s.length * q)]; }

console.log('asset            target   median    gap     se    p10     p90');
let worst = 0;
Market.ASSETS.forEach(a => {
  const r = results[a.id];
  const med = median(r), gap = med - (a.mu - (a.dividend || 0));
  if (Math.abs(gap) > Math.abs(worst)) worst = gap;
  console.log(
    a.id.padEnd(14),
    ((a.mu - (a.dividend||0)) * 100).toFixed(1).padStart(6),
    (med * 100).toFixed(1).padStart(7),
    (gap * 100).toFixed(1).padStart(7),
    (1.2533 * (a.sigma / Math.sqrt(YEARS)) / Math.sqrt(RUNS) * 100).toFixed(2).padStart(6),
    (pctl(r, 0.1) * 100).toFixed(1).padStart(7),
    (pctl(r, 0.9) * 100).toFixed(1).padStart(7)
  );
});
console.log('\nworst gap:', (worst * 100).toFixed(2), 'points');
