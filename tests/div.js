const { chromium } = require('playwright');
const CFG = require('./config');
(async () => {
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:1280,height:1000},deviceScaleFactor:2});
  const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE: '+m.text());});
  await p.addInitScript(()=>{try{localStorage.setItem('marketlab-intro-seen','1'); localStorage.setItem('marketlab_gate_bypass','1');}catch(e){}});
  await p.goto(CFG.BUNDLE,{waitUntil:'load'});
  await p.waitForTimeout(250);

  // Buy a payer and a non-payer.
  await p.evaluate(()=>{
    const rows=[...document.querySelectorAll('#market-body tr:not(.cat-row)')];
    const buy=(n,a)=>{const r=rows.find(x=>x.querySelector('.asset-name').textContent.includes(n));
      r.querySelector('input').value=a; r.querySelector('.buy').click();};
    buy('Meridian',400); buy('Xero',300);
  });
  await p.evaluate(()=>document.querySelector('.market-table').scrollIntoView({block:'center'}));
  await p.waitForTimeout(200);

  for (const id of ['mel','xro','nvda','btc']) {
    await p.click('.spark-btn[data-asset="'+id+'"]'); await p.waitForTimeout(220);
    console.log(await p.evaluate(()=>{
      const el=document.querySelector('.asset-pop');
      return (el.querySelector('.ap-name').textContent+':').padEnd(28) + el.querySelector('.ap-div').textContent.replace('Dividend','').trim();
    }));
  }
  await p.keyboard.press('Escape');

  // Cash must actually arrive at the end of a financial year.
  const before = await p.evaluate(()=>document.getElementById('tile-cash').textContent);
  for(let i=0;i<12;i++){ await p.click('#next-month'); await p.waitForTimeout(30); }
  const after = await p.evaluate(()=>({cash:document.getElementById('tile-cash').textContent,
    feed:[...document.querySelectorAll('#feed li')].map(l=>l.textContent).filter(t=>/dividend/i.test(t))[0]}));
  console.log('\ncash before year 1:', before, '-> after:', after.cash);
  console.log('feed entry:', after.feed || '(none)');

  await p.evaluate(()=>Glossary.open('dividends', document.body)); await p.waitForTimeout(200);
  console.log('\nglossary:', await p.evaluate(()=>document.querySelector('.term-pop h3').textContent),
    '| rows:', await p.evaluate(()=>[...document.querySelectorAll('.term-pop .term-sum-row')].map(r=>r.textContent).join(' / ')));
  console.log('ERRORS:', errs.length?errs:'none');
  await b.close();
})();
