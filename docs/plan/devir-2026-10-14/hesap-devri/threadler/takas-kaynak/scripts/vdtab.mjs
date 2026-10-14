import { chromium } from "/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await b.newContext({ viewport: {width:1440,height:900}, deviceScaleFactor: 1.5 });
const p = await ctx.newPage();
await p.goto("file:///mnt/project-files/pages/vardiya-degisim-indir/Vardiya-degisim-mockup.html"); await p.waitForTimeout(1000);
await p.locator('[data-scn="11"]').click(); await p.waitForTimeout(300);
await p.locator(".desk").first().screenshot({ path: `vd/tablo.png` });
await b.close();
