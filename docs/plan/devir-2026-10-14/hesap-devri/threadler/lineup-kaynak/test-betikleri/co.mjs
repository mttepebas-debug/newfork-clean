import pw from '/opt/node-tools/node_modules/playwright/index.js'; const { chromium } = pw;
const b = await chromium.launch(); const p = await b.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('file://'+process.argv[2]);
for (const v of ['a','b','c','e']) {
  await p.evaluate(v=>{NF.debug.setVariant(v);NF.debug.setView('mgr');NF.debug.moment('person');},v);
  await p.waitForTimeout(300);
  const btn = p.locator('[data-act="calloff"]').first();
  await p.evaluate(()=>{window.__s=document.querySelector('.sheet');});
  await btn.click(); await p.waitForTimeout(100);
  const r = await p.evaluate(()=>({same: document.querySelector('.sheet')===window.__s, t: document.querySelector('[data-act="calloff"]').textContent}));
  await p.locator('[data-act="calloff"]').first().click(); await p.waitForTimeout(150);
  const closed = await p.evaluate(()=>!document.querySelector('.sheet'));
  console.log(v, JSON.stringify(r), 'closedAfter2nd', closed);
}
console.log('errors', errs); await b.close();
