// Screenshots of the replay build (today's main) for pages that can't hold an iframe.
// Usage: node shoot.mjs <list.json> <outdir>
import { chromium } from "/home/claude/newfork-clean/e2e/node_modules/@playwright/test/index.mjs";
import { readFileSync, mkdirSync } from "node:fs";
const list = JSON.parse(readFileSync(process.argv[2], "utf8"));
const outDir = process.argv[3];
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const s of list) {
  const w = s.width ?? 1440;
  const page = await browser.newPage({ viewport: { width: w, height: w < 600 ? 844 : 900 }, locale: "en-US" });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
  await page.goto(`http://127.0.0.1:8099/today/index.html#as=${s.as}&route=${encodeURIComponent(s.route)}`);
  await page.waitForTimeout(2500);
  if (s.click) { await page.getByRole("button", { name: new RegExp(s.click, "i") }).first().click({ timeout: 4000 }).catch((e) => errors.push("click: " + e.message.split("\n")[0])); await page.waitForTimeout(800); }
  await page.screenshot({ path: `${outDir}/${s.file}.png` });
  console.log(s.file, errors.length ? errors.join(" | ") : "ok");
  await page.close();
}
await browser.close();
