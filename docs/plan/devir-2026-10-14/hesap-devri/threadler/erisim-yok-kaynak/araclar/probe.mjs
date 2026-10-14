import { createRequire } from "node:module";
const require = createRequire("/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/");
const { chromium } = require("playwright");
const ids = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1700, height: 1100 } });
for (const id of ids) {
  await page.goto("about:blank"); await page.goto(`http://127.0.0.1:5799/index.html#${id}`);
  await page.waitForTimeout(6000);
  for (const f of page.frames()) {
    if (f === page.mainFrame() || !f.name().includes("frame=desktop")) continue;
    const info = await f.evaluate(() => {
      const card = document.querySelector(".no-access");
      if (!card) return "NO CARD";
      const r = card.getBoundingClientRect();
      const main = document.querySelector("main") || document.body;
      // visible text in main outside card and outside nav/aside
      const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
      const out = []; let n;
      while ((n = walker.nextNode())) {
        const t = n.textContent.trim(); if (!t) continue;
        const el = n.parentElement; if (card.contains(el)) continue;
        if (el.closest("nav,aside,.app-sidebar,[class*=sidebar],[class*=bottom-nav]")) continue;
        const b = el.getBoundingClientRect(); if (!b.width || !b.height) continue;
        const cs = getComputedStyle(el); if (cs.visibility === "hidden") continue;
        out.push(t.slice(0, 40));
      }
      // container chain
      const chain = []; let p = card.parentElement; while (p && p !== main && chain.length < 4) { chain.push(p.tagName.toLowerCase() + (p.className ? "." + String(p.className).split(" ").slice(0,2).join(".") : "")); p = p.parentElement; }
      return `top=${Math.round(r.top)} left=${Math.round(r.left)} w=${Math.round(r.width)} h=${Math.round(r.height)} | parent=${chain.join(" < ")} | outside: ${out.slice(0, 14).join(" / ")}`;
    });
    console.log(id, "::", info);
  }
}
await browser.close();
