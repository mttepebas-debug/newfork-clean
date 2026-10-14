import { chromium } from "/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`http://127.0.0.1:5706/${process.argv[2]}#s=3.0&sc=owner&frame=solo`);
await page.waitForSelector(".rk-marks .rk-mk-tile", { timeout: 30000 });
await page.click('button[data-tab="schedule"]');
await page.waitForTimeout(1500);
await page.getByRole("button", { name: "Draft selector: New Schedule" }).click(); await page.getByRole("button", { name: "Edit live schedule" }).click(); await page.waitForTimeout(2000);
const m = page.locator("#root .schedule-availability-mark-name").first();
const b = await m.boundingBox();
// press 3px outside the dot's box: still inside its 18px place to press
await page.mouse.click(b.x + b.width + 3, b.y + b.height / 2);
await page.waitForTimeout(300);
console.log("window:", await page.locator(".schedule-availability-mark-window").first().textContent().catch(() => null), "label:", await m.getAttribute("aria-label"));
await page.keyboard.press("Escape");
await m.focus(); await page.keyboard.press("Enter"); await page.waitForTimeout(200);
console.log("keyboard:", await page.locator(".schedule-availability-mark-window").count(), "outline:", await m.evaluate((e) => getComputedStyle(e).outlineStyle + " " + getComputedStyle(e).outlineWidth));
await browser.close();
