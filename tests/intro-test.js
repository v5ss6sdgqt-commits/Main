const CFG = require('./config');
const { chromium, devices } = require('playwright');
const F = CFG.BUNDLE;
(async () => {
  const b=await chromium.launch();
  const ctx=await b.newContext();
  const p=await ctx.newPage({viewport:{width:1280,height:1000}});
  const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE: '+m.text());});
  await p.goto(F,{waitUntil:'load'}); await p.waitForTimeout(400);

  console.log('shows on first visit:', await p.evaluate(()=>!document.querySelector('.intro-backdrop').hidden));
  // Walk all four cards.
  for(let i=0;i<4;i++){
    const card = await p.evaluate(()=>({
      tag: document.getElementById('intro-tag').textContent,
      title: document.getElementById('intro-title').textContent,
      chars: document.getElementById('intro-body').textContent.trim().length,
      next: document.getElementById('intro-next').textContent,
      backDisabled: document.getElementById('intro-back').disabled,
      dots: document.querySelectorAll('.intro-dot.is-on').length,
    }));
    console.log(`  ${i+1}. [${card.tag}] "${card.title}" — ${card.chars} chars, next="${card.next}", back${card.backDisabled?' disabled':''}`);
    if(i<3) { await p.click('#intro-next'); await p.waitForTimeout(120); }
  }
  // The key figures must come from the real config, not be hardcoded.
  await p.evaluate(()=>Intro.open(0)); await p.waitForTimeout(150);
  const money = await p.evaluate(()=>document.getElementById('intro-body').textContent);
  console.log('card 1 mentions $1,000:', /\$1,000/.test(money), '| $50:', /\$50/.test(money), '| $7,000:', /\$7,000/.test(money));
  await p.evaluate(()=>Intro.open(3)); await p.waitForTimeout(150);
  const fees = await p.evaluate(()=>document.getElementById('intro-body').textContent);
  console.log('card 4 fee worked example:', /\$3.*0\.5%.*\$50.*\$3\.25.*6\.5%/s.test(fees) ? 'correct' : fees.slice(0,160));

  // Keyboard trap + escape.
  await p.evaluate(()=>Intro.open(0)); await p.waitForTimeout(120);
  const tabs=[];
  for(let i=0;i<6;i++){ await p.keyboard.press('Tab');
    tabs.push(await p.evaluate(()=>document.activeElement.closest('.intro')?'IN':'OUT')); }
  console.log('tab stays inside:', tabs.every(t=>t==='IN'), tabs.join(','));
  await p.keyboard.press('Escape'); await p.waitForTimeout(120);
  console.log('escape closes:', await p.evaluate(()=>document.querySelector('.intro-backdrop').hidden));

  // Second visit must not nag.
  await p.reload({waitUntil:'load'}); await p.waitForTimeout(400);
  console.log('suppressed on return visit:', await p.evaluate(()=>document.querySelector('.intro-backdrop').hidden));
  await p.click('#help-btn'); await p.waitForTimeout(150);
  console.log('reopens from How it works:', await p.evaluate(()=>!document.querySelector('.intro-backdrop').hidden));
  await p.close();

  const m=await (await b.newContext({...devices['iPhone 13']})).newPage();
  m.on('pageerror',e=>errs.push('MOBILE: '+e.message));
  await m.goto(F,{waitUntil:'load'}); await m.waitForTimeout(400);
  console.log('mobile:', JSON.stringify(await m.evaluate(()=>{
    const el=document.querySelector('.intro'); const r=el.getBoundingClientRect();
    return { shown:!document.querySelector('.intro-backdrop').hidden, fitsWidth:r.width<=window.innerWidth,
             fitsHeight:r.height<=window.innerHeight, buttonsVisible:!!document.getElementById('intro-next').offsetHeight };
  })));
  await m.screenshot({path:'/tmp/claude-0/-home-user-Main/39cb3cd4-a90c-5e9d-ba2e-647438e42e07/scratchpad/intro-mobile.png'});
  console.log('ERRORS:', errs.length?errs:'none');
  await b.close();
})();
