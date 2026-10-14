import { chromium } from "/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs";
const [base, outdir, ...vars] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const v of vars) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on("pageerror", e => console.log(v, "PAGEERR", String(e).slice(0,200)));
  await p.goto(v === "bugun" ? base : `${base}?devGhost=${v}`);
  await p.waitForSelector(".schedule-shift-badge", { timeout: 20000 });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${outdir}/${v}.png`, clip: { x: 288, y: 312, width: 1137, height: 400 } });
  await p.close();
}
await b.close();
