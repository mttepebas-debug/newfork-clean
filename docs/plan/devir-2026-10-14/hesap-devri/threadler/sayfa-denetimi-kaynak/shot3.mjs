import { chromium } from "/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs";
const out = process.argv[2];
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const styles = ["Now", "A · Newfork", "B · Linear/Notion", "C · Competitors"];
const wins = ["Published menu", "Publish while editing", "New Schedule menu", "Publish window"];
for (const [si, s] of styles.entries()) for (const [wi, w] of wins.entries()) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto("http://localhost:5703/dev/schedule-dialogs"); await p.waitForTimeout(1500);
  await p.getByRole("button", { name: s, exact: true }).click(); await p.waitForTimeout(500);
  const btns = p.locator(".schedule-dialogs-preview button, main button").filter({ hasNotText: /Newfork|Linear|Competitors|^Now$/ });
  // the 4 trigger buttons are in the top bar, in order
  const triggers = p.locator("section, div").filter({ hasText: w }).last();
  await p.locator(`text=${w}`).first().locator("xpath=..").locator("button").first().click();
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${out}/d-${si}-${wi}.png`, clip: { x: 430, y: 100, width: 1000, height: 680 } });
  await p.close();
}
await b.close();
