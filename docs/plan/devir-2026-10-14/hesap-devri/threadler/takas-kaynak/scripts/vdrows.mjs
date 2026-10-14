import { chromium } from "/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
await p.goto("file:///mnt/project-files/pages/vardiya-degisim-indir/Vardiya-degisim-mockup.html"); await p.waitForTimeout(1200);
const labels = await p.locator("[data-scn]").allTextContents();
const idx = labels.findIndex(l => /Shift changes tablosu/.test(l));
const go = async () => { await p.locator(`[data-scn="${idx}"]`).click(); await p.waitForTimeout(300); };
const desk = p.locator("#mgr-desk"), phone = p.locator("#mgr-phone");
// each row opens on desktop and phone
for (const id of ["r5","r1","r2","r3","r4"]) {
  await go(); await desk.locator(`[data-row="${id}"]`).click(); await p.waitForTimeout(250);
  if (!(await desk.locator(".mscrim").count())) errs.push("desk no drawer " + id);
  await go(); await phone.locator(`[data-row="${id}"]`).click(); await p.waitForTimeout(250);
  if (!(await phone.locator(".scrim").count())) errs.push("phone no sheet " + id);
}
// approve r1 with Ana, decline r2, approve r3 (desktop)
await go();
await desk.locator('[data-row="r1"]').click(); await p.waitForTimeout(200);
await desk.locator('[data-cand="ana"]').click(); await desk.locator('[data-mgr="approve"]').click(); await p.waitForTimeout(150);
await desk.locator('[data-mgr="close"]').first().click(); await p.waitForTimeout(150);
await desk.locator('[data-row="r2"]').click(); await p.waitForTimeout(200);
await desk.locator('[data-mgr="decline"]').click(); await desk.locator('[data-mgr="confirm"]').click(); await desk.locator('[data-mgr="confirm"]').click(); await p.waitForTimeout(150);
await desk.locator('[data-mgr="close"]').first().click(); await p.waitForTimeout(150);
await desk.locator('[data-row="r3"]').click(); await p.waitForTimeout(200);
await desk.locator('[data-mgr="approve"]').click(); await p.waitForTimeout(150);
await desk.locator('[data-mgr="close"]').first().click(); await p.waitForTimeout(300);
await desk.screenshot({ path: "vd5/after-desk.png" });
await p.locator(".flabel", { hasText: "Müdür telefonu" }).locator("xpath=..").screenshot({ path: "vd5/after-phone.png" });
console.log(await desk.locator("tbody tr").allInnerTexts());
console.log(errs);
await b.close();
