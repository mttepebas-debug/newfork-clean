import { chromium } from "/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const url = "file:///mnt/project-files/pages/vardiya-degisim-indir/Vardiya-degisim-mockup.html";
const ctx = await b.newContext({ viewport: {width:1440,height:900}, deviceScaleFactor: 1.5 });
const p = await ctx.newPage();
const errs=[]; p.on("pageerror", e=>errs.push(e.message));
await p.goto(url); await p.waitForTimeout(1200);
const labels = await p.locator("[data-scn]").allInnerTexts();
console.log(labels.map((l,i)=>i+": "+l.replace(/\s+/g," ")).join("\n"));
const targets = labels.map((l,i)=>[l,i]).filter(([l])=>/Release kararı|Cover kararı|Swap kararı/.test(l));
for (const [l,i] of targets) {
  for (const bx of ["window","drawer"]) {
    await p.locator(`[data-scn="${i}"]`).click(); await p.waitForTimeout(200);
    await p.locator(`[data-bx="${bx}"]`).click(); await p.waitForTimeout(400);
    // find the desktop frame element
    const sel = await p.evaluate(()=>{ const c=[...document.querySelectorAll(".desk, .dframe, .frame")]; return c.map(e=>e.className).join("|"); });
    const box = await p.locator(".desk").first().boundingBox().catch(()=>null);
    console.log(i, bx, sel, JSON.stringify(box));
    await p.locator(".desk").first().screenshot({ path: `vd/kap-${i}-${bx}.png` });
  }
}
console.log("errors", errs);
await b.close();
