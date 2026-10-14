import { chromium } from "/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: {width:1440,height:900} });
await p.goto("file:///mnt/project-files/pages/vardiya-degisim-indir/Vardiya-degisim-mockup.html"); await p.waitForTimeout(800);
await p.locator('[data-scn="6"]').click(); await p.waitForTimeout(300); await p.locator("#emp").screenshot({ path: "vd/n-jake.png" });
await p.locator('[data-p="maria"]').click(); await p.locator('#emp [data-go="notifs"]').first().click(); await p.waitForTimeout(300); await p.locator("#emp").screenshot({ path: "vd/n-maria.png" });
await b.close();
