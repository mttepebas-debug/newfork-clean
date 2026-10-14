import { chromium } from "/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []; p.on("pageerror", e => errs.push(e.message));
await p.goto("http://127.0.0.1:8765/test.html#announcements"); await p.waitForTimeout(1500);
const codes = await p.$$eval("#items .item b", els => els.map(e => e.textContent));
const tabs = await p.$$eval("[data-tab]", els => els.map(e => e.textContent.trim()).join(" | "));
await p.click('[data-tab="out"]'); await p.waitForTimeout(400);
const out = await p.$eval("#out", e => [e.querySelectorAll("li").length, e.textContent.includes("eski D1")]);
console.log(codes.join(","), "\n", tabs, "\n", out, errs); await b.close();
