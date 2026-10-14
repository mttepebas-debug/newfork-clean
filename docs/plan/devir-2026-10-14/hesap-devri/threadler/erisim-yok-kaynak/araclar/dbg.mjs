import { createRequire } from "node:module";
const require = createRequire("/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/");
const { chromium } = require("playwright");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1600, height: 1150 } });
await page.goto("file:///"+process.env.F);
await page.click(`.item[data-id=job]`); await page.click(`#segV button[data-k=A]`);
console.log(await page.evaluate(()=>[...document.querySelectorAll('.scaler')].map(s=>[s.style.width,s.parentElement.clientWidth,s.firstElementChild.style.transform, s.firstElementChild.scrollWidth])));
await browser.close();
