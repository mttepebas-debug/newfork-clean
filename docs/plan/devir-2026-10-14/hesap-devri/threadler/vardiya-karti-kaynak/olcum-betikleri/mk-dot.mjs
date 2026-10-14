import { chromium } from "/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs";
const file = process.argv[2];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.goto(`http://127.0.0.1:5706/${file}#s=3.0&sc=owner&frame=solo`);
await page.waitForSelector(".rk-marks .rk-mk-tile", { timeout: 30000 });
await page.click('button[data-tab="schedule"]');
await page.waitForTimeout(1500);
await page.getByRole("button", { name: "Draft selector: New Schedule" }).click(); await page.getByRole("button", { name: "Edit live schedule" }).click(); await page.waitForTimeout(2000);
const r = await page.evaluate(() => {
  const lum = (c) => { let m = c.match(/[\d.]+/g).map(Number); if (c.startsWith("color(")) m = m.map((v) => v * 255); const [r, g, b] = m.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return +((x + 0.05) / (y + 0.05)).toFixed(2); };
  const out = { card: 0, corner: 0, name: 0, contrasts: [], hit: [] };
  for (const m of document.querySelectorAll("#root .schedule-availability-mark")) {
    const kind = m.classList.contains("schedule-availability-mark-card") ? "card" : m.classList.contains("schedule-availability-mark-corner") ? "corner" : "name";
    out[kind]++;
    const dot = getComputedStyle(m, "::before");
    let bgEl = m.closest(".schedule-shift-badge") ?? m.closest(".schedule-cell") ?? m.closest(".schedule-employee-cell") ?? document.body;
    let bg = getComputedStyle(bgEl).backgroundColor;
    out.contrasts.push(kind + ":" + ratio(dot.backgroundColor, bg) + "@" + bg);
    const b = m.getBoundingClientRect();
    const hitEl = document.elementFromPoint(b.left + b.width / 2 + 8, b.top + b.height / 2);
    out.hit.push([6, 8].map((d) => { const e = document.elementFromPoint(b.left + b.width / 2 + d, b.top + b.height / 2); return e === m || m.contains(e) ? "ok" : (e?.className?.toString().slice(0, 40) ?? "none"); }).join("/"));
    out.size = [b.width, b.height, dot.width, dot.backgroundColor];
  }
  out.contrasts = [...new Set(out.contrasts)];

  return out;
});
console.log(JSON.stringify(r));
const name = page.locator("#root .schedule-availability-mark-name").first();
if (await name.count()) { const row = name.locator("xpath=ancestor::*[contains(@class,'schedule-employee-cell')][1]"); const b = await row.boundingBox(); await page.screenshot({ path: "shots/dot-name.png", clip: { x: b.x, y: b.y, width: 700, height: b.height } }); }
const card = page.locator("#root .schedule-availability-mark-card").first();
if (await card.count()) { const c = card.locator("xpath=ancestor::*[contains(@class,'schedule-shift-badge')][1]"); await c.scrollIntoViewIfNeeded(); const b = await c.boundingBox(); await page.screenshot({ path: "shots/dot-card.png", clip: { x: b.x - 150, y: b.y - 40, width: b.width + 300, height: b.height + 80 } }); }
const corner = page.locator("#root .schedule-availability-mark-corner").first();
if (await corner.count()) { await corner.scrollIntoViewIfNeeded(); const b = await corner.boundingBox(); await page.screenshot({ path: "shots/dot-corner.png", clip: { x: b.x - 200, y: b.y - 40, width: 360, height: 120 } }); }
await browser.close();
