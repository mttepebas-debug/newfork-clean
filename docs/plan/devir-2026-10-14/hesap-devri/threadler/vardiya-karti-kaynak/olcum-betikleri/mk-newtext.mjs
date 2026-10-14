import { chromium } from "/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs";
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
for (const width of [1280, 1440, 1600, 1920]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto(`http://127.0.0.1:5706/app.html#s=3.0&sc=owner&frame=solo`);
  await page.waitForSelector(".rk-marks .rk-mk-tile", { timeout: 30000 });
  await page.click('button[data-tab="schedule"]'); await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Draft selector: New Schedule" }).click();
  await page.getByRole("button", { name: "Edit live schedule" }).click(); await page.waitForTimeout(2500);
  await page.mouse.move(2, 2);
  const res = await page.evaluate(() => {
    const hits = []; let n = 0;
    for (const b of document.querySelectorAll('.schedule-shift-badge[data-shift-badge="true"]')) {
      const nw = b.querySelector(".schedule-shift-new-mark"); if (!nw) continue; n++;
      const m = nw.getBoundingClientRect();
      const content = b.querySelector(".schedule-shift-badge-content");
      for (const line of content.children) {
        const range = document.createRange(); range.selectNodeContents(line);
        for (const r of range.getClientRects()) {
          if (r.width && r.right > m.left - 4 && r.left < m.right + 4 && r.bottom > m.top && r.top < m.bottom)
            hits.push({ card: b.getAttribute("aria-label")?.slice(0, 50), line: line.textContent, gap: Math.round((m.left - r.right) * 10) / 10, cardW: Math.round(b.getBoundingClientRect().width), lineW: Math.round(line.getBoundingClientRect().width), textW: Math.round(r.width), side: getComputedStyle(b).getPropertyValue("--shift-card-side") });
        }
      }
    }
    return { n, hits };
  });
  console.log(width, "NEW cards", res.n, "too close", res.hits.length, JSON.stringify(res.hits.slice(0, 4)));
  if (res.hits.length && out) {
    const loc = page.locator('.schedule-shift-badge[data-shift-badge="true"]', { hasText: "Opener" }).filter({ has: page.locator(".schedule-shift-new-mark") }).first();
    if (await loc.count()) { const bb = await loc.boundingBox(); await page.screenshot({ path: `${out}/new-${width}.png`, clip: { x: bb.x - 20, y: bb.y - 10, width: bb.width + 40, height: bb.height + 20 } }); }
  }
  await page.close();
}
await browser.close();
