import { chromium } from "/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const url = "file:///mnt/project-files/pages/vardiya-degisim-indir/Vardiya-degisim-mockup.html";
const out = process.argv[2] || "vd4";
for (const [nm, vp] of [["m390", { width: 390, height: 844 }], ["d1440", { width: 1440, height: 900 }]]) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 2, hasTouch: nm === "m390" });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto(url); await p.waitForTimeout(1200);
  const labels = await p.locator("[data-scn]").allTextContents();
  const idx = labels.findIndex(l => /Swap kararı/.test(l));
  await p.locator(`[data-scn="${idx}"]`).click(); await p.waitForTimeout(400);
  for (const c of ["travel", "all"]) {
    await p.locator(`[data-sc="${c}"]`).click(); await p.waitForTimeout(350);
    const sh = p.locator(".w.sheet").last();
    await sh.scrollIntoViewIfNeeded();
    await sh.screenshot({ path: `${out}/${nm}-sheet-${c}.png` });
    const m = await p.evaluate(() => [...document.querySelectorAll(".w.sheet table.trade thead th")].map(t => Math.round(t.getBoundingClientRect().width)));
    console.log(nm, c, "col widths", m);
  }
  const ov = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log(nm, "overflow", ov, "errors", errs);
  await ctx.close();
}
await b.close();
