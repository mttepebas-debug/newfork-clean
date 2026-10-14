import { chromium } from "/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await b.newContext({ viewport: {width:1440,height:900} });
const p = await ctx.newPage(); const errs=[]; p.on("pageerror", e=>errs.push(e.message)); p.on("console", m=>{ if(m.type()==="error") errs.push(m.text()); });
await p.goto("file:///mnt/project-files/pages/vardiya-degisim-indir/Vardiya-degisim-mockup.html"); await p.waitForTimeout(1200);
await p.locator('[data-scn="14"]').click(); await p.waitForTimeout(300);
for (const c of ["clean","travel","rest","three","timeoff","hours"]) {
  await p.locator(`[data-sc="${c}"]`).click(); await p.waitForTimeout(200);
  await p.locator("#mgr-desk .sw").screenshot({ path: `vd/sw-d-${c}.png` });
  await p.locator("#mgr-phone .sw").screenshot({ path: `vd/sw-p-${c}.png` });
}
await p.locator('[data-sc="travel"]').click();
await p.locator('#mgr-desk [data-sw="decline"]').click(); await p.locator('#mgr-desk [data-sw="confirm"]').click(); await p.locator('#mgr-desk [data-sw="confirm"]').click();
await p.waitForTimeout(200); await p.locator("#mgr-desk .sw").screenshot({ path: `vd/sw-d-declined.png` });
await p.screenshot({ path: "vd/sw-full.png" });
console.log("errors", errs);
await b.close();
