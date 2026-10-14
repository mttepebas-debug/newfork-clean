// A screenshot and the console of one atlas page, for checking work.
// Usage: node tools/shot.mjs <page id> <role> [route] [out name] [port] [width]
// Needs the dev server: ./node_modules/.bin/vite --config .temp/atlas/vite.config.ts --port <port>
// Prints "[demo api] no route ..." lines: API calls the demo backend does not answer yet.
import { createRequire } from "node:module";
const require = createRequire("/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/");
const { chromium } = require("playwright");
const [page_, role, path, out, port = "5711", width = "1440"] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
const ctx = await browser.newContext({ viewport: { width: Number(width), height: 900 } });
await ctx.addInitScript(([p, r]) => { try { localStorage.setItem(`newfork.atlas.role.${p}`, r); } catch {} }, [page_, role]);
const page = await ctx.newPage();
const logs = [];
page.on("console", (m) => { if (["warning", "error"].includes(m.type())) logs.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message.slice(0, 300)}`));
await page.goto(`http://127.0.0.1:${port}/?page=${page_}${path ? `&path=${encodeURIComponent(path)}` : ""}`);
await page.waitForTimeout(2500);
(await import("node:fs")).mkdirSync(process.env.ATLAS_SHOTS ?? "/tmp/atlas-shots", { recursive: true });
const file = `${process.env.ATLAS_SHOTS ?? "/tmp/atlas-shots"}/${out ?? `${page_}-${role}`}.png`;
await page.screenshot({ path: file });
const text = (await page.locator("main").first().innerText().catch(() => "")).slice(0, 600);
console.log(file); console.log([...new Set(logs)].join("\n")); console.log("--- main text:\n" + text);
await browser.close();
