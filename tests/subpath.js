const { chromium } = require('playwright');
const CFG = require('./config');
(async () => {
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:1280,height:900}});
  const errs=[]; const missing=[];
  p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE: '+m.text());});
  p.on('response',r=>{ if(r.status()>=400) missing.push(r.status()+' '+r.url()); });
  // Exactly how GitHub Pages would serve it: https://user.github.io/Main/
  await p.goto(CFG.SUBPATH,{waitUntil:'load'});
  await p.waitForTimeout(700);
  console.log('loads at subpath:', JSON.stringify(await p.evaluate(()=>({
    assets: document.querySelectorAll('#market-body tr:not(.cat-row)').length,
    terms: document.querySelectorAll('[data-term]').length,
    economy: document.getElementById('econ-phase').textContent,
    modes: document.querySelectorAll('.mode-tab').length,
  }))));
  const sw = await p.evaluate(async()=>{ const r=await navigator.serviceWorker.ready.catch(()=>null); return r&&r.active?'active':'none'; });
  console.log('service worker:', sw);
  const man = await p.evaluate(async()=>{ const l=document.querySelector('link[rel=manifest]'); const r=await fetch(l.href); const m=await r.json(); const i=await fetch(new URL(m.icons[0].src,l.href)); return {status:r.status, start:m.start_url, icon:i.status}; });
  console.log('manifest:', JSON.stringify(man));
  console.log('failed requests:', missing.length?missing:'none');
  console.log('ERRORS:', errs.length?errs:'none');
  await b.close();
})();
