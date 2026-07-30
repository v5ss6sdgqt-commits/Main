const { chromium } = require('playwright');
const CFG = require('./config');
const F = CFG.BUNDLE;
(async () => {
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:1280,height:1000}});
  const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE: '+m.text());});
  await p.addInitScript(()=>{try{localStorage.setItem('marketlab-intro-seen','1')}catch(e){}});
  await p.goto(F,{waitUntil:'load'}); await p.waitForTimeout(250);

  // Finish a run and grab the code.
  await p.evaluate(()=>{
    const rows=[...document.querySelectorAll('#market-body tr:not(.cat-row)')];
    const r=rows.find(x=>x.querySelector('.asset-name').textContent.includes('Total World'));
    r.querySelector('input').value=900; r.querySelector('.buy').click();
  });
  for(let i=0;i<40;i++){
    if(await p.locator('#results-card').isVisible()) break;
    if(await p.locator('#decision-modal').isVisible()){await p.click('.d-choice[data-choice="hold"]');await p.waitForTimeout(40);continue;}
    if(await p.locator('#next-year').isDisabled()) break;
    await p.click('#next-year'); await p.waitForTimeout(50);
  }
  const code = await p.evaluate(()=>document.getElementById('share-code').textContent);
  console.log('result code:', code);

  // Round-trip it.
  console.log('decoded  :', JSON.stringify(await p.evaluate(c=>{
    const d=Share.decode(c); return {years:d.years, goal:d.goal, value:d.value, trades:d.trades, opp:d.opponent&&d.opponent.name};
  }, code)));
  console.log('tampered :', JSON.stringify(await p.evaluate(c=>{
    const bad=c.slice(0,-2)+'ZZ'; const d=Share.decode(bad); return d && d.invalid ? 'rejected' : 'ACCEPTED (bad)';
  }, code)));

  // Leaderboard with a mixed-seed entry.
  const other = await p.evaluate(()=>{
    // Build a code from a different seed to prove the warning fires.
    const mk=Market.generate('some-other-seed',120);
    const st=Portfolio.create(mk,{goal:null});
    for(let m=0;m<120;m++) Portfolio.advance(st);
    return Share.encode(st,null);
  });
  await p.click('#board-toggle');
  await p.fill('#board-input', 'Aroha  '+code+'\nSam '+code+'\nnonsense line here\nKiri '+other);
  await p.click('#board-rank'); await p.waitForTimeout(200);
  console.log('\nleaderboard:', JSON.stringify(await p.evaluate(()=>({
    warn: (document.querySelector('.board-warn')||{}).textContent,
    rows: [...document.querySelectorAll('#board-out tbody tr')].map(r=>[...r.children].map(c=>c.textContent).join(' | ')),
    rejected: (document.querySelector('.board-warn.soft')||{}).textContent,
  })),null,1));
  console.log('ERRORS:', errs.length?errs:'none');
  await b.close();
})();
