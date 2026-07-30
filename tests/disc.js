const { chromium } = require('playwright');
const CFG = require('./config');
(async () => {
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:1280,height:1000},deviceScaleFactor:2});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.addInitScript(()=>{try{localStorage.setItem('marketlab-intro-seen','1')}catch(e){}});
  await p.goto(CFG.BUNDLE,{waitUntil:'load'});
  await p.waitForTimeout(300);
  const d = await p.evaluate(()=>{
    const el=document.querySelector('.disclaimer');
    return { present:!!el, heading:el.querySelector('strong').textContent,
             words:el.textContent.trim().split(/\s+/).length,
             mentions:{ notAdvice:/not financial advice/i.test(el.textContent),
                        simulated:/simulated/i.test(el.textContent),
                        tax:/tax/i.test(el.textContent),
                        dividends:/dividend/i.test(el.textContent),
                        currency:/currency/i.test(el.textContent),
                        adviser:/licensed financial adviser/i.test(el.textContent) } };
  });
  console.log('footer disclaimer:', JSON.stringify(d,null,1));
  await p.click('[data-term="disclaimer"]'); await p.waitForTimeout(250);
  console.log('term opens:', await p.evaluate(()=>({
    title: document.querySelector('.term-pop h3').textContent,
    rows: [...document.querySelectorAll('.term-pop .term-sum-row')].map(r=>r.textContent),
  })));
  await p.evaluate(()=>document.querySelector('footer').scrollIntoView({block:'end'}));
  await p.waitForTimeout(300);
  await p.screenshot({path:'/tmp/claude-0/-home-user-Main/39cb3cd4-a90c-5e9d-ba2e-647438e42e07/scratchpad/disclaimer.png',
    clip: await p.evaluate(()=>{const r=document.querySelector('footer').getBoundingClientRect();
      return {x:Math.max(0,r.left-8),y:Math.max(0,r.top-8),width:Math.min(1100,r.width+16),height:Math.min(500,r.height+16)};})});
  console.log('ERRORS:', errs.length?errs:'none');
  await b.close();
})();
