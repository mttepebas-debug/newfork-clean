import { createRequire } from "node:module";
const require = createRequire("/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/");
const { chromium } = require("playwright");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const [w,h] = (process.env.VP||"1440x900").split("x").map(Number);
const page = await browser.newPage({ viewport: { width: w, height: h } });
for (const hsh of process.argv.slice(2)) {
  const app = hsh.startsWith("s=3.0")||hsh.startsWith("s=3.1")||hsh.startsWith("s=3.2") ? process.env.APPS : process.env.APP;
  await page.goto("about:blank"); await page.goto(`file://${app}#${hsh}`); await page.waitForTimeout(3500);
  const r = await page.evaluate(() => {
    const c = document.querySelector(".no-access, .load-error:not(.inset)"); if (!c) return "no card";
    const out=[]; let e=c;
    while (e && e!==document.body) { const cs=getComputedStyle(e); const b=e.getBoundingClientRect(); out.push(`${e.tagName.toLowerCase()}.${[...e.classList].join(".")} pos=${cs.position} disp=${cs.display} y=${Math.round(b.top)} h=${Math.round(b.height)}`); if (e.classList.contains("app-shell")) break; e=e.parentElement; }
    return out.join("\n   ");
  });
  console.log(hsh, "\n   "+r);
}
await browser.close();
