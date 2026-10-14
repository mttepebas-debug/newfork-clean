import { createRequire } from "node:module";
const require = createRequire("/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/");
const { chromium } = require("playwright");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
for (const h of process.argv.slice(2)) {
  await page.goto("about:blank"); await page.goto(`file://${process.env.APP}#${h}`); await page.waitForTimeout(4000);
  const t = (await page.locator("body").innerText()).split("\n").filter(l=>/access|load|Ask an admin/i.test(l)).slice(0,3);
  console.log(h, "=>", t.join(" | "));
}
await browser.close();
