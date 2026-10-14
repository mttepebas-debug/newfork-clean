import { chromium } from "/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs";
const [url, out] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); p.on("console", m => { if (m.type()==="error") console.log("ERR", m.text().slice(0,300)); }); p.on("pageerror", e => console.log("PAGEERR", String(e).slice(0,300)));
await p.goto(url); await p.waitForTimeout(9000);
await p.screenshot({ path: out });
console.log(await p.locator("body").innerText().then(t=>t.slice(0,600)));
await b.close();
