import { createRequire } from "node:module";
const require = createRequire("/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/");
const { chromium } = require("playwright");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const [w,h] = (process.env.VP||"1440x900").split("x").map(Number);
const page = await browser.newPage({ viewport: { width: w, height: h } });
for (const arg of process.argv.slice(2)) {
  const [hsh, name] = arg.split("@");
  const app = /^s=3\.[012]&/.test(hsh) ? process.env.APPS : process.env.APP;
  await page.goto("about:blank"); await page.goto(`file://${app}#${hsh}`); await page.waitForTimeout(3500);
  await page.screenshot({ path: `${process.env.OUT}/${name}.png` });
}
await browser.close();
