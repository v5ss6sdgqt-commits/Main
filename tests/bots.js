const path = require('path');
const CFG = require('./config');
const fs=require('fs'),vm=require('vm');
function load(){const ctx={Math,console};ctx.window=ctx;vm.createContext(ctx);
['rng','market','portfolio','goals','opponents'].forEach(n=>vm.runInContext(fs.readFileSync(path.join(CFG.root, 'js', n + '.js'),'utf8'),ctx));return ctx;}
const C=load();
const M=120, RUNS=300;

// Run each bot across many independent markets and see how the ladder orders.
const totals={}, wins={}, trades={};
C.Opponents.LEVELS.forEach(l=>{totals[l.id]=[];trades[l.id]=[];});
const bench=[];

for(let i=0;i<RUNS;i++){
  const mk=C.Market.generate('bot-'+i,M);
  C.Opponents.LEVELS.forEach(l=>{
    const opp=C.Opponents.create(l.id,mk);
    for(let m=0;m<M;m++) C.Opponents.advance(opp);
    totals[l.id].push(C.Portfolio.totalValue(opp.state));
    trades[l.id].push(opp.state.tradeCount);
  });
  // The benchmark from any of them (identical construction).
  const o=C.Opponents.create('easy',mk);
  for(let m=0;m<M;m++) C.Portfolio.advance(o.state);
  bench.push(C.Portfolio.benchValue(o.state));
}
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const med=a=>{const s=a.slice().sort((x,y)=>x-y);return s[Math.floor(s.length/2)];};

console.log('level     median    mean   median trades');
C.Opponents.LEVELS.forEach(l=>{
  console.log(l.id.padEnd(8),
    ('$'+Math.round(med(totals[l.id])).toLocaleString()).padStart(9),
    ('$'+Math.round(mean(totals[l.id])).toLocaleString()).padStart(8),
    String(med(trades[l.id])).padStart(9));
});
console.log('benchmark'.padEnd(8), ('$'+Math.round(med(bench)).toLocaleString()).padStart(9));

// Head to head: does hard beat easy, and how often?
let he=0, hm=0, me=0;
for(let i=0;i<RUNS;i++){
  if(totals.hard[i]>totals.easy[i]) he++;
  if(totals.hard[i]>totals.medium[i]) hm++;
  if(totals.medium[i]>totals.easy[i]) me++;
}
console.log('\nhard beats easy  :', (he/RUNS*100).toFixed(0)+'% of markets');
console.log('hard beats medium:', (hm/RUNS*100).toFixed(0)+'%');
console.log('medium beats easy:', (me/RUNS*100).toFixed(0)+'%');
