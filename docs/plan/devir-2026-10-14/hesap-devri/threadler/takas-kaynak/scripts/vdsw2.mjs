import { chromium } from "/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const url = "file:///mnt/project-files/pages/vardiya-degisim-indir/Vardiya-degisim-mockup.html";
const errs=[];
const ctx = await b.newContext({ viewport: {width:1440,height:900}, deviceScaleFactor: 1.5 });
const p = await ctx.newPage(); p.on("pageerror", e=>errs.push(e.message));
await p.goto(url); await p.waitForTimeout(1000);
await p.locator('[data-scn="14"]').click(); await p.waitForTimeout(300);
for (const c of ["clean","timeoff","hours"]) {
  await p.locator(`[data-sc="${c}"]`).click(); await p.waitForTimeout(300);
  await p.locator(".desk").first().screenshot({ path: `vd/sw-${c}.png` });
}
// scroll drawer body to bottom for approvals
await p.locator('[data-sc="three"]').click(); await p.waitForTimeout(300);
await p.evaluate(()=>{ const b=document.querySelector(".desk .w.drawer .w-body"); b.scrollTop=b.scrollHeight; });
await p.locator(".desk").first().screenshot({ path: `vd/sw-three-bottom.png` });
await p.locator('[data-scn="12"]').click(); await p.waitForTimeout(300);
await p.locator('.desk [data-cand="ana"]').click(); await p.waitForTimeout(300);
await p.locator(".desk").first().screenshot({ path: `vd/pk-ana.png` });
await ctx.close();
const m = await b.newContext({ viewport: {width:390,height:844}, deviceScaleFactor: 2, hasTouch: true });
const q = await m.newPage(); q.on("pageerror", e=>errs.push(e.message));
await q.goto(url); await q.waitForTimeout(1000);
await q.locator('[data-scn="14"]').click(); await q.waitForTimeout(400);
await q.locator("#mgr-phone").screenshot({ path: `vd/sw-phone.png` });
console.log("errors", errs);
await b.close();
