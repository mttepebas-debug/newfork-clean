import { chromium } from "/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); const errs=[]; p.on("pageerror",e=>errs.push(e.message));
await p.goto("file:///mnt/project-files/pages/vardiya-degisim-indir/Vardiya-degisim-mockup.html"); await p.waitForTimeout(1200);
const labels = await p.locator("[data-scn]").allTextContents();
const idx = labels.findIndex(l => /My requests: yol/.test(l)); await p.locator(`[data-scn="${idx}"]`).click(); await p.waitForTimeout(300);
const r = await p.evaluate(()=>{ const t=document.querySelector(".hub-top"); if(!t) return "no hub-top"; const sc=t.closest(".app-body"); const before=t.getBoundingClientRect().top; sc.scrollTop=400; const after=t.getBoundingClientRect().top; return {before,after,max:sc.scrollHeight-sc.clientHeight}; });
await p.locator(".hub-top").first().locator("xpath=ancestor::div[contains(@class,'screen')]").screenshot({path:"vd5/hub-scrolled.png"});
console.log(labels[idx], r, errs); await b.close();
