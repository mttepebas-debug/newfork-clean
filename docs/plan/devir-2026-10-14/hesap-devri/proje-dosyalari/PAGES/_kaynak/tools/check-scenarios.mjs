// Opens every scenario of the asked screens in a built PAGES folder and reports
// what each frame shows (the address, the heading, any "step not found" notice,
// page errors). Usage, from apps/web:
//   PAGES_OUT=<built folder> PORT=5738 SHOTS=<png folder, optional> node .temp/pages/tools/check-scenarios.mjs <no ...> [--only id,id]
// It serves the folder itself on PORT and stops when done.
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const repo = here("../../../../../");
const pw = readdirSync(join(repo, "node_modules/.pnpm")).find((name) => name.startsWith("playwright@"));
const require = createRequire(join(repo, "node_modules/.pnpm", pw, "node_modules/playwright/"));
const { chromium } = require("playwright");
const { screens } = JSON.parse(readFileSync(here("../screens.json"), "utf8"));
const out = process.env.PAGES_OUT;
if (!out) throw new Error("PAGES_OUT is required");
const port = Number(process.env.PORT ?? 5738);
const args = process.argv.slice(2);
const onlyAt = args.indexOf("--only");
const only = onlyAt >= 0 ? new Set(args[onlyAt + 1].split(",")) : null;
const want = (onlyAt >= 0 ? args.slice(0, onlyAt) : args);
const file = (screen) => {
  const [major, minor] = screen.no.split(".");
  const slug = screen.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${major.padStart(2, "0")}.${minor.padStart(2, "0")}-${slug}.html`;
};
const server = createServer((req, res) => {
  const path = join(out, decodeURIComponent(req.url.split(/[?#]/)[0]));
  if (!existsSync(path)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": path.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream" });
  res.end(readFileSync(path));
}).listen(port, "127.0.0.1");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1700, height: 1300 } });
const errs = [];
page.on("pageerror", (e) => errs.push(e.message.slice(0, 150)));
let failed = 0;
for (const s of screens.filter((x) => !want.length || want.includes(x.no))) {
  for (const one of s.scenarios) {
    if (only && !only.has(one.id)) continue;
    errs.length = 0;
    await page.goto(`http://127.0.0.1:${port}/${file(s)}?run=${Date.now()}#${one.id}`);
    await page.waitForTimeout(one.steps ? 2500 + 900 * one.steps.length : 3000);
    const res = [];
    // Only the desktop and phone frames: a frame inside them (Export's preview) comes and goes.
    for (const f of page.mainFrame().childFrames()) {
      const r = await f.evaluate(() => {
        const n = document.getElementById("atlas-notice");
        const dlg = [...document.querySelectorAll("[role=dialog], [role=alertdialog], dialog[open], aside[aria-modal]")].pop();
        return { path: window.__pagesPath, notice: n && n.dataset.open === "true" ? n.textContent : "", h: (dlg?.querySelector("h2,h1")?.textContent || document.querySelector("main h1, h1")?.textContent || "").trim().slice(0, 50) };
      }).catch((e) => ({ err: String(e).slice(0, 80) }));
      res.push(r);
    }
    const bad = res.some((r) => r.notice || r.err) || errs.length;
    if (bad) failed += 1;
    console.log(`${bad ? "!!" : "ok"} ${s.no} ${one.id}: ${res.map((r) => `${r.path} «${r.h}»${r.notice ? " NOTICE:" + r.notice : ""}${r.err ? " ERR:" + r.err : ""}`).join(" | ")}${errs.length ? " PAGEERR:" + errs[0] : ""}`);
    if (process.env.SHOTS && (bad || process.env.SHOTS_ALL)) await page.screenshot({ path: `${process.env.SHOTS}/sc-${s.no}-${one.id}.png` });
    else if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/sc-${s.no}-${one.id}.png` });
  }
}
await browser.close();
server.close();
console.log(failed ? `${failed} scenario(s) need a look` : "all scenarios opened");
process.exit(failed ? 1 : 0);
