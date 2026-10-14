import { chromium } from "/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const url = "file:///mnt/project-files/pages/vardiya-degisim-indir/Vardiya-degisim-mockup.html";
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
const p = await ctx.newPage();
const errs = []; p.on("pageerror", e => errs.push(e.message));
await p.goto(url); await p.waitForTimeout(1200);
const labels = await p.locator("[data-scn]").allTextContents();
const idx = labels.findIndex(l => /Swap kararı/.test(l));
await p.locator(`[data-scn="${idx}"]`).click(); await p.waitForTimeout(400);
for (const c of ["travel", "all"]) {
  await p.locator(`[data-sc="${c}"]`).click(); await p.waitForTimeout(350);
  const ph = p.locator(".w.sheet").last();
  await ph.screenshot({ path: `vd3/phone-${c}.png` });
}
// decline step and approved state on desktop
await p.locator(`[data-sc="travel"]`).click(); await p.waitForTimeout(300);
await p.locator('.desk [data-mgr="decline"]').click(); await p.waitForTimeout(300);
await p.locator(".desk").screenshot({ path: `vd3/swap-decline.png` });
await p.locator(`[data-sc="travel"]`).click(); await p.waitForTimeout(300);
await p.locator('.desk [data-mgr="approve"]').click(); await p.waitForTimeout(300);
await p.locator(".desk").screenshot({ path: `vd3/swap-approved.png` });
console.log("errors", errs);
await b.close();
