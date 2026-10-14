import { chromium } from "/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs";
const [file, out, prefix] = [process.argv[2], process.argv[3], process.argv[4]];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
async function shot(width, height, edit) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on("pageerror", (e) => errors.push(`${width} ${edit}: ${e.message}`));
  await page.goto(`http://127.0.0.1:5706/${file}#s=3.0&sc=owner&frame=solo`);
  await page.waitForSelector(".rk-marks .rk-mk-tile", { timeout: 30000 });
  await page.click('button[data-tab="schedule"]');
  await page.waitForTimeout(1500);
  if (edit) { await page.getByRole("button", { name: "Draft selector: New Schedule" }).click(); await page.getByRole("button", { name: "Edit live schedule" }).click(); await page.waitForTimeout(2000); }
  await page.mouse.move(2, 2);
  await page.screenshot({ path: `${out}/${prefix}-${width}-${edit ? "edit" : "read"}.png` });
  await page.close();
}
await shot(1440, 900, false);
await shot(1440, 900, true);
await shot(1920, 1080, false);
await shot(1920, 1080, true);
console.log("errors", errors.length, errors.slice(0, 3));
await browser.close();
