const { chromium } = require('playwright');
const CFG = require('./config');
const F = CFG.BUNDLE;

async function run(choice, label) {
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:1280,height:1000}});
  const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE: '+m.text());});
  await p.addInitScript(()=>{try{localStorage.setItem('marketlab-intro-seen','1'); localStorage.setItem('marketlab_gate_bypass','1');}catch(e){}});
  await p.goto(F,{waitUntil:'load'}); await p.waitForTimeout(250);

  // Hold across three categories so a targeted sell is a real alternative.
  await p.evaluate(()=>{
    const rows=[...document.querySelectorAll('#market-body tr:not(.cat-row)')];
    const buy=(n,a)=>{const r=rows.find(x=>x.querySelector('.asset-name').textContent.includes(n));
      r.querySelector('input').value=a; r.querySelector('.buy').click();};
    buy('Total World',400); buy('NZ Government Bond',200); buy('Bitcoin',250);
  });
  for(let i=0;i<40;i++){
    if(await p.locator('#decision-modal').isVisible()) break;
    if(await p.locator('#next-year').isDisabled()) break;
    await p.click('#next-year'); await p.waitForTimeout(70);
  }
  if(!(await p.locator('#decision-modal').isVisible())){ console.log('no crash reached'); await b.close(); return; }

  const opts = await p.evaluate(()=>[...document.querySelectorAll('.d-choice')].filter(x=>!x.hidden)
    .map(x=>x.querySelector('strong').textContent+' — '+x.querySelector('small').textContent));
  if (label) { console.log('options offered:'); opts.forEach(o=>console.log('   '+o)); }

  await p.click(`.d-choice[data-choice="${choice}"]`);
  await p.waitForTimeout(200);
  const after = await p.evaluate(()=>({
    notice: document.getElementById('trade-notice').textContent,
    holdings: [...document.querySelectorAll('#market-body tr:not(.cat-row)')]
      .map(r=>({n:r.querySelector('.asset-name').textContent, v:r.querySelector('.c-holding').textContent.trim()}))
      .filter(h=>h.v!=='—'),
  }));
  console.log(`\nchose "${choice}":`);
  console.log('  notice:', after.notice);
  console.log('  still holding:', after.holdings.length ? after.holdings.map(h=>h.n+' '+h.v.split('\n')[0]).join(' | ') : 'nothing');
  console.log('  ERRORS:', errs.length?errs:'none');
  await b.close();
}

(async()=>{ await run('sell-cat', true); await run('sell', false); })();
