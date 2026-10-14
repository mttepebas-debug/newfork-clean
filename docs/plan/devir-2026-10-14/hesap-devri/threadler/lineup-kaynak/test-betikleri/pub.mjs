import pw from '/opt/node-tools/node_modules/playwright/index.js'; const { chromium } = pw;
const b = await chromium.launch(); const p = await b.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('file://'+process.argv[2]);
for (const v of ['a','b','c','e']) {
  await p.evaluate(v=>{NF.debug.setVariant(v);NF.debug.setView('mgr');NF.debug.moment('publish');},v);
  await p.waitForTimeout(300);
  await p.locator('[data-act="pub-go"]').first().click(); await p.waitForTimeout(200);
  const r = await p.evaluate(()=>({sheet: !!document.querySelector('.sheet'), toggle: !!document.querySelector('[data-act="pub-ack"]'), add: document.querySelectorAll('[data-act="add"]').length, toast: (document.querySelector('.toast')||{}).textContent}));
  console.log(v, JSON.stringify(r));
}
console.log('errors', errs); await b.close();
