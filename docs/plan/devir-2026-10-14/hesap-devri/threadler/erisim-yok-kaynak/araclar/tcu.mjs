import { createRequire } from "node:module";
const require = createRequire("/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/");
const { chromium } = require("playwright");
const [ids, vs] = [process.argv[2].split(","), process.argv[3].split(",")];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1600, height: 1150 } });
const errs=[]; page.on("pageerror", e=>errs.push(e.message)); page.on("console", m=>{if(m.type()==="error")errs.push(m.text())});
await page.goto("file:///"+process.env.F);
for (const id of ids) for (const v of vs) {
  await page.click(`.item[data-id=${id}]`); await page.click(`#segV button[data-k=${v}]`); await page.waitForTimeout(150);
  await page.locator(".frames").screenshot({ path: `${process.env.SHOTS}/${id}-${v}.png` });
}
console.log("errs", errs);
await browser.close();
