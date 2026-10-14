import { createRequire } from "node:module";
const require = createRequire("/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/");
const { chromium } = require("playwright");
const [id, ...vs] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1700, height: 1250 } });
const errs=[]; page.on("pageerror", e=>errs.push(e.message));
await page.goto(`http://127.0.0.1:5799/index.html#${id}`);
await page.waitForTimeout(6000);
for (const v of vs) {
  await page.click(`[data-variant=${v}]`); await page.waitForTimeout(400);
  await page.locator(".frames").screenshot({ path: `${process.env.SHOTS}/v-${id}-${v}.png` });
}
console.log("errs", errs);
await browser.close();
