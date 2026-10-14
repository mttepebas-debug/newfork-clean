import { chromium } from "/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: {width:1440,height:900} });
await p.goto("file:///mnt/project-files/pages/vardiya-degisim-indir/Vardiya-degisim-mockup.html"); await p.waitForTimeout(800);
await p.locator(`[data-scn="12"]`).click(); await p.locator('[data-bx="drawer"]').click(); await p.waitForTimeout(400);
await p.locator('#mgr-desk [data-mgr="decline"]').click(); await p.waitForTimeout(600);
console.log(await p.evaluate(()=>["#mgr-desk .mscrim","#mgr-desk .w","#mgr-desk .w-body","#mgr-desk .w-foot"].map(s=>{const e=document.querySelector(s);const r=e.getBoundingClientRect();const cs=getComputedStyle(e);return s+" "+Math.round(r.left)+","+Math.round(r.top)+" "+Math.round(r.width)+"x"+Math.round(r.height)+" disp="+cs.display+" flex="+cs.flex+" h="+cs.height;})));
await b.close();
