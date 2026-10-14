import { chromium } from "/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); const errs=[]; p.on("pageerror",e=>errs.push(e.message));
await p.goto("file:///mnt/project-files/pages/vardiya-degisim-indir/Vardiya-degisim-mockup.html"); await p.waitForTimeout(1200);
const labels = await p.locator("[data-scn]").allTextContents();
for (const [re, sel, shot] of [[/My requests: yol/, ".freeze", "hub"], [/Who's working/, ".freeze", "who"], [/Shift changes tablosu/, "#mgr-phone .app-pad.top", "mgrphone"]]) {
  const idx = labels.findIndex(l => re.test(l)); await p.locator(`[data-scn="${idx}"]`).click(); await p.waitForTimeout(300);
  const r = await p.evaluate((sel)=>{ const t=[...document.querySelectorAll(sel)].find(e=>e.offsetParent); const sc=t.closest(".app-body"); const before=t.getBoundingClientRect().top; sc.scrollTop=300; const after=t.getBoundingClientRect().top; return {before,after,scrolled:sc.scrollTop}; }, sel);
  await p.locator(sel).filter({visible:true}).first().locator("xpath=ancestor::div[contains(@class,'screen')]").screenshot({path:`vd5/frz-${shot}.png`});
  console.log(shot, JSON.stringify(r));
}
console.log(errs); await b.close();
