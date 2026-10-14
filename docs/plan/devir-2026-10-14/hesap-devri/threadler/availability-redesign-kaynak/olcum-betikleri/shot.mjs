// usage: node shot.mjs <dir> <outdir> <port> <spec.json>
// spec: [{name, hash, w, h, steps:[{click:sel}|{hover:sel}|{drag:[from,to]}|{mouse:[[x,y],[x,y]...]}|{type:[sel,text]}|{press:key}|{wait:ms}|{eval:js}], full}]
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";
const repo = "/home/claude/newfork-clean";
const pw = readdirSync(join(repo, "node_modules/.pnpm")).find((n) => n.startsWith("playwright@"));
const require = createRequire(join(repo, "node_modules/.pnpm", pw, "node_modules/playwright/"));
const { chromium } = require("playwright");
const [dir, out, port, specFile] = process.argv.slice(2);
const specs = JSON.parse(readFileSync(specFile, "utf8"));
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".png": "image/png" };
const srv = createServer((req, res) => {
  const p = join(dir, decodeURIComponent(req.url.split(/[?#]/)[0]).replace(/\/$/, "/index.html"));
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": types[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
}).listen(Number(port), "127.0.0.1");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
let errs = 0;
for (const s of specs) {
  const ctx = await browser.newContext({ viewport: { width: s.w || 1440, height: s.h || 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { errs++; console.log("ERR", s.name, e.message); });
  page.on("console", (m) => { if (m.type() === "error" && !/fonts.g|favicon|404/.test(m.text())) { errs++; console.log("CONSOLE", s.name, m.text()); } });
  await page.goto(`http://127.0.0.1:${port}/#${s.hash || ""}`);
  await page.waitForTimeout(400);
  for (const st of s.steps || []) {
    try {
      if (st.click) await page.click(st.click, { timeout: 3000 });
      else if (st.hover) await page.hover(st.hover, { timeout: 3000 });
      else if (st.drag) await page.dragAndDrop(st.drag[0], st.drag[1], { timeout: 3000 });
      else if (st.mouse) { const [p0, ...ps] = st.mouse; await page.mouse.move(p0[0], p0[1]); await page.mouse.down(); for (const p of ps) await page.mouse.move(p[0], p[1], { steps: 6 }); await page.mouse.up(); }
      else if (st.boxdrag) { const b = await page.locator(st.boxdrag[0]).first().boundingBox(); const [fx, fy, tx, ty] = st.boxdrag.slice(1); await page.mouse.move(b.x + b.width * fx, b.y + b.height * fy); await page.mouse.down(); await page.mouse.move(b.x + b.width * tx, b.y + b.height * ty, { steps: 8 }); await page.mouse.up(); }
      else if (st.type) { await page.fill(st.type[0], st.type[1]); }
      else if (st.press) await page.keyboard.press(st.press);
      else if (st.wait) await page.waitForTimeout(st.wait);
      else if (st.eval) await page.evaluate(st.eval);
    } catch (e) { errs++; console.log("STEP", s.name, JSON.stringify(st), e.message.split("\n")[0]); }
    await page.waitForTimeout(st.after || 150);
  }
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${out}/${s.name}.png`, fullPage: !!s.full });
  await ctx.close();
}
await browser.close(); srv.close();
console.log("done, problems:", errs);
process.exit(0);
