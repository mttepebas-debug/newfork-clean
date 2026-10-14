import { createRequire } from "node:module";
const require = createRequire("/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/");
const { chromium } = require("playwright");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1700, height: 1250 } });
const errs=[]; page.on("pageerror", e=>errs.push(e.message));
for (const id of process.argv.slice(2)) {
  await page.goto("about:blank"); await page.goto(`http://127.0.0.1:5799/index.html#${id}`); await page.waitForTimeout(5000);
  const quote = await page.locator("#quote-text").innerText();
  const f = page.frameLocator("#desk iframe");
  const card = await f.locator("h2, .load-error, [role=status]").allInnerTexts().catch(()=>[]);
  console.log(id, "|", quote, "|", card.filter(t=>/access|available/i.test(t)).slice(0,2).join(" / "));
  if (id === process.argv[2]) await page.screenshot({ path: process.env.SHOT });
}
console.log("errs", errs);
await browser.close();
