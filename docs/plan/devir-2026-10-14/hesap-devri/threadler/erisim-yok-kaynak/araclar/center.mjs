import { createRequire } from "node:module";
const require = createRequire("/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/");
const { chromium } = require("playwright");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const vp of (process.env.VPS||"1440x900").split(",")) {
const [w,h] = vp.split("x").map(Number);
const page = await browser.newPage({ viewport: { width: w, height: h } });
for (const hsh of process.argv.slice(2)) {
  const app = /^s=3\.[012]&/.test(hsh) ? process.env.APPS : process.env.APP;
  await page.goto("about:blank"); await page.goto(`file://${app}#${hsh}`); await page.waitForTimeout(3500);
  const r = await page.evaluate(() => {
    const c = document.querySelector(".no-access, .load-error:not(.inset)"); if (!c) return "no card";
    const area = c.closest(".settings-content") || c.closest(".account-content-scroll") || c.closest(".app-main");
    const a=area.getBoundingClientRect(), b=c.getBoundingClientRect();
    const sib = c.previousElementSibling ? c.previousElementSibling.getBoundingClientRect().bottom : a.top;
    const top = Math.max(a.top, sib);
    return `card ${Math.round(b.left)},${Math.round(b.top)} ${Math.round(b.width)}x${Math.round(b.height)} | free-area top ${Math.round(top)} bottom ${Math.round(a.bottom)} | gapTop ${Math.round(b.top-top)} gapBottom ${Math.round(a.bottom-b.bottom)} | gapL ${Math.round(b.left-a.left)} gapR ${Math.round(a.right-b.right)}`;
  });
  console.log(vp, hsh, "=>", r);
  if (process.env.OUT) await page.screenshot({ path: `${process.env.OUT}/${vp}-${hsh.replace(/[^a-z0-9.]+/gi,"_")}.png` });
}
await page.close();
}
await browser.close();
