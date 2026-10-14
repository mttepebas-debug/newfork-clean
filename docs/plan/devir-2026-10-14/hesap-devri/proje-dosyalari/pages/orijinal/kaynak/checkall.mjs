// Opens a page, switches to Orijinal and walks every screen in its list.
import { chromium } from "/home/claude/newfork-clean/e2e/node_modules/@playwright/test/index.mjs";
const [, , pageName, tag] = process.argv;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, timezoneId: "America/Los_Angeles" });
const logs = [];
page.on("console", (m) => { if (m.type() === "error" && !/WebSocket/.test(m.text())) logs.push(m.text().slice(0, 140)); });
page.on("response", (r) => { if (r.status() >= 400) logs.push(`${r.status()} ${r.url().slice(0, 120)}`); });
await page.goto(`http://127.0.0.1:8099/${pageName}`);
await page.getByRole("button", { name: /Orijinal/ }).click();
const count = await page.locator("#nfo-screen option").count();
for (let i = 0; i < count; i += 1) {
  logs.length = 0;
  await page.selectOption("#nfo-screen", String(i));
  await page.waitForTimeout(4500);
  const label = await page.locator(`#nfo-screen option[value="${i}"]`).innerText();
  await page.screenshot({ path: `/srv/orig/shots/chk-${tag}-${i}.png` });
  const frame = page.frames().find((f) => f.url().includes("today/index.html"));
  const text = frame ? (await frame.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 160) : "NO FRAME";
  console.log(`[${i}] ${label}\n    ${text}\n    ${logs.join(" || ") || "no errors"}`);
}
await browser.close();
