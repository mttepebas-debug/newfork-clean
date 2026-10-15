import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const [,, file, out, w, h, ...clicks] = process.argv;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: +w, height: +h } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto('file://' + file);
await p.waitForTimeout(3000);
for (const c of clicks) { await p.click(c).catch(e => errs.push('click ' + c + ': ' + e.message.split('\n')[0])); await p.waitForTimeout(2500); }
await p.screenshot({ path: out, fullPage: true });
if (errs.length) console.log(errs.slice(0,8).join('\n'));
await b.close();
