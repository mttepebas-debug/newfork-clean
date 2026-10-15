import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const out = process.argv[2];
const b = await chromium.launch();
const o = {};
async function grab(no, sc, role, frame, map) {
  const w = frame === 'phone' ? 390 : 1440;
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  await p.goto(`file:///mnt/project-files/PAGES/app.html#s=${no}&sc=${sc}&role=${role}&frame=${frame}&n=1`);
  await p.waitForTimeout(3500);
  for (const [k, s] of Object.entries(map)) o[k] = await p.evaluate((s) => { const e = document.querySelector(s); return e ? e.outerHTML : null; }, s);
  if (!o.css) o.css = await p.evaluate(() => [...document.styleSheets].map(s => { try { return [...s.cssRules].map(r => r.cssText).join('\n'); } catch (e) { return ''; } }).join('\n'));
  await p.close();
}
await grab('2.0','owner','owner','desktop',{ sidebar: '.app-sidebar', wsMain: '.app-main' });
await grab('7.0','employee','employee','phone',{ homeMain: '.app-main', phoneNav: '.eh-mobile-nav' });
await grab('7.0','employee','employee','desktop',{ empSidebar: '.app-sidebar', homeMainDesk: '.app-main' });
await grab('11.3','employee','employee','desktop',{ acctSidebar: '.account-sidebar' });
await grab('10.3','owner','owner','desktop',{ settingsRail: '.settings-rail' });
await grab('10.0','owner','owner','desktop',{ generalMain: '.app-main' });
fs.writeFileSync(`${out}/frag.json`, JSON.stringify(o));
for (const [k,v] of Object.entries(o)) console.log(k, v && v.length);
await b.close();
