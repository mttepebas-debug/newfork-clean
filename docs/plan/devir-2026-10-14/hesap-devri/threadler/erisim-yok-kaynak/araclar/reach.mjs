import { createRequire } from "node:module";
const require = createRequire("/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/");
const { chromium } = require("playwright");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 360, height: 640 } });
for (const app of process.argv.slice(2)) {
  await page.goto("about:blank"); await page.goto(`file://${app}#s=10.1&sc=read-error`); await page.waitForTimeout(3500);
  const r = await page.evaluate(() => { const b=document.querySelector(".load-error .load-error-retry"); b.scrollIntoView({block:"end"}); const nav=document.querySelector(".mm-bar, nav[aria-label*=Main]"); const rb=b.getBoundingClientRect(); return `retry bottom ${Math.round(rb.bottom)} navTop ${nav?Math.round(nav.getBoundingClientRect().top):"?"}`; });
  console.log(app.split("/").slice(-2).join("/"), r);
}
await browser.close();
