import { chromium } from "/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs";
const [out, width = "1440"] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage({ viewport: { width: Number(width), height: 900 } });
await page.goto(`http://127.0.0.1:5706/app.html#s=3.0&sc=owner&frame=solo`);
await page.waitForSelector(".rk-marks .rk-mk-tile", { timeout: 30000 });
await page.click('button[data-tab="schedule"]'); await page.waitForTimeout(1500);
await page.getByRole("button", { name: "Draft selector: New Schedule" }).click();
await page.getByRole("button", { name: "Edit live schedule" }).click(); await page.waitForTimeout(2500);
const geo = () => page.evaluate(() => {
  const g = document.querySelector('[data-testid="schedule-grid"]');
  const out = [];
  for (const b of document.querySelectorAll('.schedule-shift-badge[data-shift-badge="true"]')) {
    const nw = b.querySelector(".schedule-shift-new-mark"); if (!nw) continue;
    const m = nw.getBoundingClientRect();
    for (const line of b.querySelector(".schedule-shift-badge-content").children) {
      const range = document.createRange(); range.selectNodeContents(line);
      const r = range.getBoundingClientRect();
      if (r.width && r.right > m.left - 3 && r.left < m.right + 3 && r.bottom > m.top - 3 && r.top < m.bottom + 3)
        out.push({ card: b.getAttribute("aria-label")?.slice(0, 50), line: line.textContent, cardH: Math.round(b.getBoundingClientRect().height) });
    }
  }
  return { band: g?.getAttribute("data-card-band"), out };
});
console.log("before", JSON.stringify(await geo()));
// A live card with a label: open it.
const carlos = await page.getByRole("rowheader").filter({ hasText: "Carlos Rivera" }).first().evaluate((h) => h.closest("[data-employee-id]")?.dataset.employeeId ?? h.parentElement?.querySelector("[data-employee-id]")?.dataset.employeeId);
const dates = await page.evaluate(() => [...new Set([...document.querySelectorAll(".schedule-cell[data-date]")].map((c) => c.dataset.date))].sort());
console.log("carlos", carlos, dates.slice(0, 3));
const live = page.locator('.schedule-shift-badge[data-shift-badge="true"]').filter({ has: page.locator(".schedule-shift-live-mark") }).filter({ hasText: "Opener" }).and(page.locator(':not([aria-label*="note"])')).first();
console.log("live opener cards", await page.locator('.schedule-shift-badge[data-shift-badge="true"]').filter({ has: page.locator(".schedule-shift-live-mark") }).filter({ hasText: "Opener" }).count());
const label = await live.getAttribute("aria-label"); console.log("opening", label?.slice(0, 60));
await live.dblclick(); await page.waitForTimeout(1500);
console.log("dialogs", await page.locator("[role=dialog]").evaluateAll((ds) => ds.map((d) => d.getAttribute("aria-label"))));
const dlg = page.locator("[role=dialog]").filter({ hasNotText: "Original" }).last();
const note = dlg.locator("textarea").first();
console.log("textareas", await dlg.locator("textarea").count(), "buttons", await dlg.locator("button").evaluateAll((bs) => bs.map((b) => b.textContent.trim()).filter(Boolean).slice(0, 20)));
if (!(await note.count())) { const add = dlg.getByRole("button", { name: /note/i }).first(); if (await add.count()) { await add.click(); await page.waitForTimeout(400); } }
await dlg.locator("textarea").first().fill("Bring the keys");
const save = dlg.getByRole("button", { name: /^(Save|Update shift|Save shift)/ }).first();
console.log("save", await save.textContent());
await save.click(); await page.waitForTimeout(2500);
await page.mouse.move(2, 2); await page.waitForTimeout(500);
console.log("after", JSON.stringify(await geo()));
const card = page.locator('.schedule-shift-badge[data-shift-badge="true"]').filter({ has: page.locator(".schedule-shift-new-mark") }).filter({ hasText: "Opener" }).filter({ has: page.locator(".schedule-shift-note-corner, [class*=note]") }).first();
if (out && await card.count()) { const bb = await card.boundingBox(); await page.screenshot({ path: `${out}/noteflow-${width}.png`, clip: { x: bb.x - 150, y: bb.y - 20, width: bb.width + 300, height: bb.height + 40 } }); }
await browser.close();
