import { chromium } from "/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const url = "file:///mnt/project-files/pages/vardiya-degisim-indir/Vardiya-degisim-mockup.html";
for (const [name, vp, touch] of [["d", {width:1440,height:900}, false], ["m", {width:390,height:844}, true]]) {
  const ctx = await b.newContext({ viewport: vp, hasTouch: touch });
  const p = await ctx.newPage();
  const errs=[]; p.on("pageerror", e=>errs.push(e.message)); p.on("console", m=>{ if(m.type()==="error") errs.push(m.text()); });
  await p.goto(url); await p.waitForTimeout(1500);
  const n = await p.locator("[data-scn]").count();
  for (let i=0;i<n;i++){
    await p.locator(`[data-scn="${i}"]`).click();
    await p.waitForTimeout(250);
    const ov = await p.evaluate(()=>document.documentElement.scrollWidth - window.innerWidth);
    if (ov>0) errs.push(`scn ${i} horizontal overflow ${ov}`);
    await p.screenshot({ path: `vd/${name}-${String(i).padStart(2,"0")}.png`, fullPage: true });
  }
  console.log(name, "scenarios", n, "errors", errs);
  await ctx.close();
}
await b.close();
