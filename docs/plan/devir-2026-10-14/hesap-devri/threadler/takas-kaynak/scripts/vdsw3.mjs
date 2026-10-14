import { chromium } from "/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const url = "file:///mnt/project-files/pages/vardiya-degisim-indir/Vardiya-degisim-mockup.html";
const out = process.argv[2] || "vd3";
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
const p = await ctx.newPage();
const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
await p.goto(url); await p.waitForTimeout(1200);
const labels = await p.locator("[data-scn]").allTextContents();
const idx = labels.findIndex(l => /Swap kararı/.test(l));
await p.locator(`[data-scn="${idx}"]`).click(); await p.waitForTimeout(400);
for (const c of ["clean", "travel", "hours", "days", "rest", "all"]) {
  await p.locator(`[data-sc="${c}"]`).click(); await p.waitForTimeout(350);
  await p.locator(".desk").screenshot({ path: `${out}/swap-${c}.png` });
  const sc = await p.evaluate(() => { const b = document.querySelector(".w.drawer .w-body"); return b ? [b.scrollHeight, b.clientHeight] : null; });
  console.log(c, "body scroll/client", sc);
}
// table row
await p.locator(`[data-sc="travel"]`).click(); await p.waitForTimeout(300);
await p.locator('[data-mgr="close"]').first().click(); await p.waitForTimeout(300);
await p.locator(".desk").screenshot({ path: `${out}/table.png` });
console.log("errors", errs);
await b.close();
