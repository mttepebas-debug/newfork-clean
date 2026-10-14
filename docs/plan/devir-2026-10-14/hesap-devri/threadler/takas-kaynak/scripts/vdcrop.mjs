import { chromium } from "/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: {width:1440,height:900}, deviceScaleFactor: 1 });
const errs=[]; p.on("pageerror", e=>errs.push(e.message));
await p.goto("file:///mnt/project-files/pages/vardiya-degisim-indir/Vardiya-degisim-mockup.html"); await p.waitForTimeout(1200);
for (const i of [0,1,2,3,4,5,7,8,9]) { await p.locator(`[data-scn="${i}"]`).click(); await p.waitForTimeout(450); await p.locator("#emp").screenshot({ path: `vd/e-${String(i).padStart(2,"0")}.png` }); }
for (const i of [12,13,14,15]) { await p.locator(`[data-scn="${i}"]`).click(); await p.waitForTimeout(450); await p.locator("#mgr-desk").screenshot({ path: `vd/k-${i}.png` }); await p.locator("#mgr-phone").screenshot({ path: `vd/mp-${i}.png` }); }
await p.locator(`[data-scn="12"]`).click(); await p.locator('[data-bx="drawer"]').click(); await p.waitForTimeout(400); await p.locator("#mgr-desk").screenshot({ path: `vd/k-12-drawer.png` });
await p.locator('#mgr-desk [data-mgr="decline"]').click(); await p.waitForTimeout(300); await p.locator("#mgr-desk").screenshot({ path: `vd/k-12-decline.png` });
console.log("errors", errs); await b.close();
