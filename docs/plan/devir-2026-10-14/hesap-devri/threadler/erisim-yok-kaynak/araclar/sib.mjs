import { createRequire } from "node:module";
const require = createRequire("/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/");
const { chromium } = require("playwright");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
for (const h of process.argv.slice(2)) {
await page.goto(`file://${process.env.APP}#${h}`); await page.waitForTimeout(3500);
console.log(h, await page.evaluate(() => { const c=document.querySelector(".load-error"); const p=c.parentElement; const cs=getComputedStyle(p); return `parent pad ${cs.paddingTop}/${cs.paddingBottom} gap ${cs.rowGap}; next=${c.nextElementSibling?c.nextElementSibling.className+" h"+c.nextElementSibling.getBoundingClientRect().height:"none"}`; }));
}
await browser.close();
