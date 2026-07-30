const { chromium } = require('playwright');
const CFG = require('./config');
(async () => {
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:1280,height:900}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto(CFG.BUNDLE,{waitUntil:'load'});
  await p.waitForTimeout(200);
  // Every see-also chip in every term must actually navigate.
  const res = await p.evaluate(async ()=>{
    const bad=[];
    for (const id of Object.keys(Glossary.TERMS)) {
      const t=Glossary.TERMS[id];
      if(!t.see) continue;
      for (const target of t.see) {
        Glossary.open(id, document.body);
        const chip=document.querySelector('.term-chip[data-goto="'+target+'"]');
        if(!chip){bad.push(id+' -> '+target+' (no chip)');continue;}
        chip.click();
        await new Promise(r=>setTimeout(r,20));
        const pop=document.querySelector('.term-pop');
        if(pop.hidden) bad.push(id+' -> '+target+' (panel closed)');
        else if(pop.querySelector('h3').textContent!==Glossary.TERMS[target].title) bad.push(id+' -> '+target+' (wrong title)');
      }
    }
    return bad;
  });
  console.log('broken see-also links:', res.length?res:'none — all navigate correctly');
  console.log('ERRORS:', errs.length?errs:'none');
  await b.close();
})();
