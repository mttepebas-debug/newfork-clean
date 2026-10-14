import { chromium } from "/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await b.newContext({ viewport: {width:390,height:844}, hasTouch: true, deviceScaleFactor: 1 });
const p = await ctx.newPage(); const errs=[]; p.on("pageerror", e=>errs.push(e.message));
await p.goto("file:///mnt/project-files/pages/vardiya-degisim-indir/Vardiya-degisim-mockup.html"); await p.waitForTimeout(800);
for (const i of [3,4,7,9,10]) {
  await p.locator(`[data-scn="${i}"]`).click(); await p.waitForTimeout(300);
  const ph = p.locator("#col-phone .screen"); await ph.scrollIntoViewIfNeeded();
  await ph.screenshot({ path: `vd/ph-${i}.png` });
}
// swipe test on deck
await p.locator(`[data-scn="7"]`).click(); await p.waitForTimeout(300);
const before = await p.locator("#emp").innerText();
const card = p.locator("#emp [data-card]").first(); await card.scrollIntoViewIfNeeded(); const bb = await card.boundingBox();
await p.mouse.move(bb.x+bb.width/2, bb.y+bb.height/2); await p.mouse.down(); await p.mouse.move(bb.x+bb.width/2+180, bb.y+bb.height/2, {steps:10}); await p.mouse.up();
await p.waitForTimeout(700);
const after = await p.locator("#emp").innerText();
console.log("deck changed:", before!==after, "errors", errs);
await p.locator("#col-phone .screen").screenshot({ path: `vd/ph-swiped.png` });
await b.close();
