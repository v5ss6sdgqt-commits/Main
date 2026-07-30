const path = require('path');
const CFG = require('./config');
const fs=require('fs'),vm=require('vm');
const ctx={Math,console};ctx.window=ctx;vm.createContext(ctx);
['rng','market','portfolio','goals','opponents'].forEach(n=>vm.runInContext(fs.readFileSync(path.join(CFG.root, 'js', n + '.js'),'utf8'),ctx));
const C=ctx, M=120, RUNS=1500;
const L=['easy','medium','hard'];
const v={}; L.forEach(l=>v[l]=[]);
const bench=[];

for(let i=0;i<RUNS;i++){
  const mk=C.Market.generate('lad-'+i,M);
  L.forEach(l=>{
    const o=C.Opponents.create(l,mk);
    for(let m=0;m<M;m++) C.Opponents.advance(o);
    v[l].push(C.Portfolio.totalValue(o.state));
  });
  const p=C.Portfolio.create(mk);
  for(let m=0;m<M;m++) C.Portfolio.advance(p);
  bench.push(C.Portfolio.benchValue(p));
}
const q=(a,p)=>{const s=a.slice().sort((x,y)=>x-y);return s[Math.floor(s.length*p)];};
console.log('n =', RUNS, 'markets\n');
console.log('level      p25      median      p75');
L.forEach(l=>console.log(l.padEnd(9),
  ('$'+Math.round(q(v[l],0.25)).toLocaleString()).padStart(8),
  ('$'+Math.round(q(v[l],0.5)).toLocaleString()).padStart(10),
  ('$'+Math.round(q(v[l],0.75)).toLocaleString()).padStart(9)));
console.log('benchmark'.padEnd(9), ' '.repeat(8), ('$'+Math.round(q(bench,0.5)).toLocaleString()).padStart(10));

function beats(a,b){let n=0;for(let i=0;i<RUNS;i++) if(v[a][i]>v[b][i]) n++;return (n/RUNS*100).toFixed(0)+'%';}
console.log('\nhard   beats medium:', beats('hard','medium'));
console.log('hard   beats easy  :', beats('hard','easy'));
console.log('medium beats easy  :', beats('medium','easy'));
