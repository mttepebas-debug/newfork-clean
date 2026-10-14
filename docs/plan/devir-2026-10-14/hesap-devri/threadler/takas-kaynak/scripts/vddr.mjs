import { chromium } from "/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const url = "file:///mnt/project-files/pages/vardiya-degisim-indir/Vardiya-degisim-mockup.html";
const ctx = await b.newContext({ viewport: {width:1440,height:900}, deviceScaleFactor: 1.5 });
const p = await ctx.newPage();
await p.goto(url); await p.waitForTimeout(1200);
for (const i of [12,13,14]) {
  await p.locator(`[data-scn="${i}"]`).click(); await p.waitForTimeout(400);
  await p.locator(".desk").first().screenshot({ path: `vd/cekmece-${i}.png` });
}
// decline step in drawer
await p.locator(`[data-scn="13"]`).click(); await p.waitForTimeout(300);
await p.locator('.desk [data-mgr="decline"]').click(); await p.waitForTimeout(300);
await p.locator(".desk").first().screenshot({ path: `vd/cekmece-13-decline.png` });
await b.close();
