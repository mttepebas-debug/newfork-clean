import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
const repo = "/home/claude/newfork-clean/";
const pw = readdirSync(join(repo, "node_modules/.pnpm")).find((n) => n.startsWith("playwright@"));
const { chromium } = createRequire(join(repo, "node_modules/.pnpm", pw, "node_modules/playwright/"))("playwright");
const out = process.env.OUT;
const server = createServer((req, res) => { const p = join(out, decodeURIComponent(req.url.split(/[?#]/)[0])); if (!existsSync(p)) { res.writeHead(404); return res.end(); } res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(readFileSync(p)); }).listen(5741, "127.0.0.1");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const [w,h,frame] = process.env.SIZE === "phone" ? [390,844,"phone"] : [1440,900,"desktop"];
const page = await browser.newPage({ viewport: { width: w, height: h } });
await page.goto(`http://127.0.0.1:5741/${process.env.FILE||"app.html"}#s=${process.env.S||"10.2"}&sc=${process.env.SC||"owner"}&role=owner&frame=${frame}&n=1`);
await page.waitForTimeout(5000);
console.log(await page.evaluate(readFileSync(process.env.EVAL, "utf8")));
if (process.env.SHOT) { await page.evaluate(process.env.SCROLL || "0"); await page.waitForTimeout(400); await page.screenshot({ path: process.env.SHOT }); }
await browser.close(); server.close();
