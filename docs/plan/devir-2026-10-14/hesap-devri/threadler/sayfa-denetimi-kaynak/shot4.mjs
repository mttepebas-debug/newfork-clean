import { chromium } from "/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs";
const out = process.argv[2];
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
async function page() { const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); await p.goto("http://localhost:5701/"); await p.waitForSelector(".schedule-shift-badge"); await p.waitForTimeout(800); return p; }
let p = await page();
await p.getByRole("button", { name: /^Published/ }).first().click(); await p.waitForTimeout(700);
await p.screenshot({ path: `${out}/m-0.png`, clip: { x: 430, y: 0, width: 1000, height: 680 } });
console.log(await p.locator("[role=menu], .schedule-dropdown, [role=dialog]").allInnerTexts());
await p.close();
p = await page();
await p.getByRole("button", { name: /New Schedule/ }).first().click(); await p.waitForTimeout(700);
await p.screenshot({ path: `${out}/m-2.png`, clip: { x: 430, y: 0, width: 1000, height: 680 } });
console.log(await p.locator("[role=menu]").allInnerTexts());
await p.close();
await b.close();
