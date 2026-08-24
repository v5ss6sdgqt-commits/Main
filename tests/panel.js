const CFG = require('./config');
const { chromium, devices } = require('playwright');
const F = CFG.BUNDLE;
const sel = n => `.spark-btn[data-asset="${n}"]`;

(async () => {
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:1280,height:1000}});
  const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE: '+m.text());});
  await p.addInitScript(()=>{try{localStorage.setItem('marketlab-intro-seen','1'); localStorage.setItem('marketlab_gate_bypass','1');}catch(e){}});
  await p.goto(F,{waitUntil:'load'}); await p.waitForTimeout(300);
  // Advance so there is a real price history to draw.
  for(let i=0;i<3;i++){ await p.click('#next-year'); await p.waitForTimeout(80);
    if(await p.locator('#decision-modal').isVisible()){await p.click('.d-choice[data-choice="hold"]');await p.waitForTimeout(60);} }

  await p.evaluate(()=>document.querySelector('.market-table').scrollIntoView({block:'center'}));
  await p.waitForTimeout(200);

  // --- hover opens it ---
  await p.hover(sel('air'));
  await p.waitForTimeout(420);
  console.log('after hover:', JSON.stringify(await p.evaluate(()=>{
    const el=document.querySelector('.asset-pop');
    return { open: !el.hidden, name: el.querySelector('.ap-name').textContent,
      what: el.querySelector('.ap-what').textContent.slice(0,40),
      blurb: el.querySelector('.ap-blurb').textContent.slice(0,46),
      stats: [...el.querySelectorAll('.ap-stat')].map(s=>s.querySelector('.ap-k').textContent+'='+s.querySelector('.ap-v').textContent),
      chartDrawn: (()=>{const c=el.querySelector('canvas');const x=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
        for(let i=3;i<x.length;i+=4){if(x[i]!==0)return true;} return false;})(),
    };
  }),null,1));

  // --- mouse away closes ---
  await p.mouse.move(10,10); await p.waitForTimeout(250);
  console.log('closes on mouse-out:', await p.evaluate(()=>document.querySelector('.asset-pop').hidden));

  // --- click pins ---
  await p.click(sel('btc')); await p.waitForTimeout(150);
  await p.mouse.move(10,10); await p.waitForTimeout(300);
  console.log('pinned survives mouse-out:', await p.evaluate(()=>({
    open: !document.querySelector('.asset-pop').hidden,
    name: document.querySelector('.ap-name').textContent })));
  await p.keyboard.press('Escape'); await p.waitForTimeout(120);
  console.log('Escape closes:', await p.evaluate(()=>document.querySelector('.asset-pop').hidden));

  // --- keyboard ---
  await p.evaluate(n=>document.querySelector(n).focus(), sel('fph'));
  await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  console.log('keyboard opens:', await p.evaluate(()=>({open:!document.querySelector('.asset-pop').hidden, name:document.querySelector('.ap-name').textContent})));
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  console.log('focus returned to trigger:', await p.evaluate(()=>document.activeElement.getAttribute('data-asset')));

  // --- stays inside the viewport at the extremes ---
  for (const id of ['nzbond','eth']) {
    await p.click(sel(id)); await p.waitForTimeout(200);
    const fit = await p.evaluate(()=>{
      const r=document.querySelector('.asset-pop').getBoundingClientRect();
      return { left:Math.round(r.left), right:Math.round(r.right), top:Math.round(r.top), bottom:Math.round(r.bottom),
               vw:window.innerWidth, vh:window.innerHeight,
               inside: r.left>=0 && r.right<=window.innerWidth+1 && r.top>=0 && r.bottom<=window.innerHeight+1 };
    });
    console.log(id, 'stays in viewport:', fit.inside, JSON.stringify(fit));
  }

  // --- live update + theme redraw while open ---
  await p.click(sel('eth')); await p.waitForTimeout(200);
  const before = await p.evaluate(()=>document.querySelector('.ap-stat .ap-v').textContent);
  await p.click('#next-year'); await p.waitForTimeout(250);
  if(await p.locator('#decision-modal').isVisible()){await p.click('.d-choice[data-choice="hold"]');await p.waitForTimeout(100);}
  const after = await p.evaluate(()=>document.querySelector('.ap-stat .ap-v').textContent);
  console.log('price updates with the run:', before, '->', after, before!==after ? 'OK' : '(unchanged)');
  await p.click('#theme-btn'); await p.waitForTimeout(200);
  console.log('survives theme toggle:', await p.evaluate(()=>!document.querySelector('.asset-pop').hidden));

  await p.close();

  // --- mobile ---
  const ctx=await b.newContext({...devices['iPhone 13']});
  const m=await ctx.newPage();
  m.on('pageerror',e=>errs.push('MOBILE: '+e.message));
  await m.addInitScript(()=>{try{localStorage.setItem('marketlab-intro-seen','1'); localStorage.setItem('marketlab_gate_bypass','1');}catch(e){}});
  await m.goto(F,{waitUntil:'load'}); await m.waitForTimeout(300);
  const vis = await m.evaluate(()=>{const el=document.querySelector('.spark-btn'); return getComputedStyle(el.parentElement).display; });
  console.log('mobile history cell display:', vis);
  await m.tap(sel('mft')); await m.waitForTimeout(300);
  console.log('mobile sheet:', JSON.stringify(await m.evaluate(()=>{
    const el=document.querySelector('.asset-pop'); const r=el.getBoundingClientRect();
    return { open:!el.hidden, name:el.querySelector('.ap-name').textContent, position:getComputedStyle(el).position,
             bottomPinned: Math.round(r.bottom)===Math.round(window.innerHeight) };
  })));
  console.log('no horizontal scroll:', await m.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
  console.log('ERRORS:', errs.length?errs:'none');
  await b.close();
})();
