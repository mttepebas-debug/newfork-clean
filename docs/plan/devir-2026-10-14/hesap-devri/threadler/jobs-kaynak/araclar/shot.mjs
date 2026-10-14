import { createRequire } from "node:module";
const require = createRequire("/home/claude/newfork-clean/package.json");
const { chromium } = require("@playwright/test");
const out = "/mnt/project-files/pages/gorsel-kararlar/gelen/liste-secim-envanteri";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const [name, w] of [["masaustu", 1280], ["telefon", 390]]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 });
  await p.goto("file:///mnt/project-files/pages/liste-secim-envanteri.html");
  await p.waitForTimeout(300);
  const sw = await p.evaluate(() => document.documentElement.scrollWidth);
  console.log(name, "scrollWidth", sw);
  if (name === "masaustu") {
    for (const id of ["hover","selected","checks","tabs","nav","motion","palette"]) {
      await p.locator("#" + id).screenshot({ path: `${out}/${id}.png` });
    }
    await p.locator("header").screenshot({ path: `${out}/ozet.png` });
    await p.locator(".bence").screenshot({ path: `${out}/bence.png` });
  } else await p.screenshot({ path: `${out}/telefon-ust.png` });
}
await b.close();
