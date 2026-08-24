const { chromium } = require('playwright');
const CFG = require('./config');
const F = CFG.BUNDLE;
(async () => {
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:1280,height:1100},deviceScaleFactor:2});
  const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE: '+m.text());});
  await p.addInitScript(()=>{try{localStorage.setItem('marketlab-intro-seen','1'); localStorage.setItem('marketlab_gate_bypass','1');}catch(e){}});
  await p.goto(F,{waitUntil:'load'}); await p.waitForTimeout(300);

  console.log('economy at start:', JSON.stringify(await p.evaluate(()=>({
    phase: document.getElementById('econ-phase').textContent,
    gdp: document.getElementById('econ-gdp').textContent,
    steps: [...document.querySelectorAll('.econ-step')].map(s=>s.textContent+(s.classList.contains('is-on')?'*':'')),
  })),null,1));

  // Walk until a recession shows up.
  let found=null;
  for(let i=0;i<120;i++){
    if(await p.locator('#decision-modal').isVisible()){await p.click('.d-choice[data-choice="hold"]');await p.waitForTimeout(40);continue;}
    if(await p.locator('#next-month').isDisabled()) break;
    await p.click('#next-month'); await p.waitForTimeout(18);
    const ph=await p.evaluate(()=>document.getElementById('econ-phase').textContent);
    if(ph==='Recession'){ found=await p.evaluate(()=>({
      phase:document.getElementById('econ-phase').textContent,
      gdp:document.getElementById('econ-gdp').textContent,
      teach:document.getElementById('econ-teach').textContent.slice(0,80),
      month:document.getElementById('clock-text').textContent,
    })); break; }
  }
  console.log('recession reached:', JSON.stringify(found,null,1));
  await p.evaluate(()=>window.scrollTo(0,0)); await p.waitForTimeout(200);
  await p.screenshot({path:'/tmp/claude-0/-home-user-Main/39cb3cd4-a90c-5e9d-ba2e-647438e42e07/scratchpad/econ.png',clip:{x:640,y:80,width:640,height:820}});

  // Glossary entries for the new terms.
  for (const t of ['cycle','gdp']) {
    await p.evaluate(id=>Glossary.open(id, document.body), t);
    await p.waitForTimeout(80);
    const ok=await p.evaluate(()=>({hidden:document.querySelector('.term-pop').hidden,title:document.querySelector('.term-pop h3').textContent}));
    console.log('glossary', t, '->', JSON.stringify(ok));
  }
  console.log('ERRORS:', errs.length?errs:'none');
  await b.close();
})();
