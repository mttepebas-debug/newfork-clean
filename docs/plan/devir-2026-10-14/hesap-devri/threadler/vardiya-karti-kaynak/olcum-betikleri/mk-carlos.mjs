import { chromium } from "/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`http://127.0.0.1:5706/app.html#s=3.0&sc=owner&frame=solo`);
await page.waitForSelector(".rk-marks .rk-mk-tile", { timeout: 30000 });
await page.click('button[data-tab="schedule"]'); await page.waitForTimeout(1500);
await page.getByRole("button", { name: "Draft selector: New Schedule" }).click();
await page.getByRole("button", { name: "Edit live schedule" }).click(); await page.waitForTimeout(2500);
await page.mouse.move(2, 2);
const info = await page.evaluate(() => {
  const grid = document.querySelector(".schedule-grid, [data-testid=schedule-grid]");
  const g = document.querySelector('[data-testid="schedule-grid"]');
  const cards = [...document.querySelectorAll('.schedule-shift-badge[data-shift-badge="true"]')].filter((b) => b.querySelector(".schedule-shift-new-mark") && b.textContent.includes("Opener"));
  return { band: g?.getAttribute("data-card-band"), exact: g?.className, cards: cards.slice(0, 3).map((b) => {
    const r = (e) => { const q = e.getBoundingClientRect(); return [q.left, q.top, q.right, q.bottom].map((v) => Math.round(v * 10) / 10); };
    const lines = [...b.querySelector(".schedule-shift-badge-content").children].map((l) => { const range = document.createRange(); range.selectNodeContents(l); const q = range.getBoundingClientRect(); return [l.textContent, Math.round(q.left), Math.round(q.right), Math.round(q.bottom)]; });
    return { label: b.getAttribute("aria-label")?.slice(0, 60), card: r(b), nw: r(b.querySelector(".schedule-shift-new-mark")), side: b.style.getPropertyValue("--shift-card-side"), lines };
  }) };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
