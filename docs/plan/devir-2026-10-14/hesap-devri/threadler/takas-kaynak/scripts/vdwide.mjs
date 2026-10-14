import { chromium } from "/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: {width:390,height:844} });
await p.goto("file:///mnt/project-files/pages/vardiya-degisim-indir/Vardiya-degisim-mockup.html"); await p.waitForTimeout(800);
console.log(await p.evaluate(()=>{const o=[];for(const e of document.querySelectorAll("body *")){const r=e.getBoundingClientRect();if(r.right>391&&!e.closest(".desk-fit .desk *")&&o.length<12)o.push(e.tagName+"."+e.className+" "+Math.round(r.left)+"-"+Math.round(r.right));}return o;}));
console.log(await p.evaluate(()=>getComputedStyle(document.querySelector(".wrap")).padding));
await b.close();
