import { createRequire } from "node:module";
const require = createRequire("/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/");
const { chromium } = require("playwright");
const ids = process.argv.slice(2);
const state = process.env.STATE || "error";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1700, height: 1100 } });
const errs=[]; page.on("pageerror", e=>errs.push(e.message));
for (const id of ids) {
  await page.goto("about:blank"); await page.goto(`http://127.0.0.1:5799/index.html#${id}`);
  if (state==="normal") { await page.waitForTimeout(500); await page.click("[data-state=normal]"); }
  await page.waitForTimeout(Number(process.env.WAIT||6000));
  const out = [];
  for (const f of page.frames()) {
    if (f === page.mainFrame()) continue;
    const txt = await f.locator("body").innerText().catch(()=> "");
    const hit = txt.split("\n").filter(l => /have access|available on a computer/i.test(l));
    out.push(`${f.name().includes("frame=phone")?"phone":"desk"}: ${hit.join(" | ") || "(YOK) "+txt.slice(0,160).replace(/\n/g," / ")}`);
  }
  await page.screenshot({ path: `${process.env.SHOTS}/${id}-${state}.png` });
  console.log(id, "::", out.join("  ##  "));
}
console.log("pageerrors:", errs.slice(0,5));
await browser.close();
