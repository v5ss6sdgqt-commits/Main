const { chromium } = require('playwright');
const CFG = require('./config');
const F = CFG.BUNDLE;
(async () => {
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:1280,height:1100},deviceScaleFactor:2});
  const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE: '+m.text());});
  await p.addInitScript(()=>{try{localStorage.setItem('marketlab-intro-seen','1'); localStorage.setItem('marketlab_gate_bypass','1');}catch(e){}});
  await p.goto(F,{waitUntil:'load'}); await p.waitForTimeout(250);

  console.log('solo: opponent card hidden =', await p.evaluate(()=>document.getElementById('opponent-card').hidden));
  await p.click('#mode-comp'); await p.waitForTimeout(300);
  console.log('comp:', JSON.stringify(await p.evaluate(()=>({
    cardShown: !document.getElementById('opponent-card').hidden,
    name: document.getElementById('opp-name').textContent,
    tagline: document.getElementById('opp-tagline').textContent.slice(0,50),
    notice: document.getElementById('trade-notice').textContent,
    levels: [...document.querySelectorAll('#difficulty-input option')].map(o=>o.textContent),
  })),null,1));

  await p.evaluate(()=>{
    const rows=[...document.querySelectorAll('#market-body tr:not(.cat-row)')];
    const r=rows.find(x=>x.querySelector('.asset-name').textContent.includes('Total World'));
    r.querySelector('input').value=900; r.querySelector('.buy').click();
  });
  for(let i=0;i<40;i++){
    if(await p.locator('#results-card').isVisible()) break;
    if(await p.locator('#decision-modal').isVisible()){await p.click('.d-choice[data-choice="hold"]');await p.waitForTimeout(60);continue;}
    if(await p.locator('#next-year').isDisabled()) break;
    await p.click('#next-year'); await p.waitForTimeout(90);
  }
  console.log('race mid/end:', JSON.stringify(await p.evaluate(()=>({
    oppValue: document.getElementById('opp-value').textContent,
    race: document.getElementById('opp-race').textContent.replace(/\s+/g,' ').trim(),
    moves: [...document.querySelectorAll('#opp-moves li')].slice(0,3).map(x=>x.textContent.replace(/\s+/g,' ').trim()),
  })),null,1));
  console.log('result:', JSON.stringify(await p.evaluate(()=>({
    done:!document.getElementById('results-card').hidden,
    tiles:[...document.querySelectorAll('#results-grid .tile')].map(t=>t.querySelector('.k').textContent+'='+t.querySelector('.v').textContent),
    verdict:document.querySelector('#verdict-list li').textContent.replace(/\s+/g,' ').slice(0,150),
  })),null,1));
  await p.evaluate(()=>window.scrollTo(0,0)); await p.waitForTimeout(200);
  await p.screenshot({path:'/tmp/claude-0/-home-user-Main/39cb3cd4-a90c-5e9d-ba2e-647438e42e07/scratchpad/comp.png',clip:{x:0,y:0,width:1280,height:900}});

  // Back to solo must restore the benchmark line and hide the card.
  await p.click('#mode-solo'); await p.waitForTimeout(250);
  console.log('back to solo:', JSON.stringify(await p.evaluate(()=>({
    cardHidden: document.getElementById('opponent-card').hidden,
    notice: document.getElementById('trade-notice').textContent,
  }))));
  console.log('ERRORS:', errs.length?errs:'none');
  await b.close();
})();
