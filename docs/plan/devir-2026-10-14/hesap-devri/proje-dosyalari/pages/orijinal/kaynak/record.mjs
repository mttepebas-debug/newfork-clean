// Records what today's app (main) asks the real API and database for while a
// person walks through screens. Output: one entry per persona with every
// response, keyed the way replay.ts looks them up.
// Usage: node record.mjs <plan.mjs> <out.json>
import { chromium } from "/home/claude/newfork-clean/e2e/node_modules/@playwright/test/index.mjs";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";

const planFile = process.argv[2];
const outFile = process.argv[3];
const { personas } = await import(planFile);
const only = process.argv[4]?.split(",");
const WEB = "http://127.0.0.1:5555";
const API = "http://localhost:5556";
const DB = "http://127.0.0.1:55321";
const PASSWORD = "[GIZLI-CIKARILDI]";

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
function keyOf(method, channel, url, body, accept) {
  const query = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
  const search = query.length ? "?" + query.map(([k, v]) => `${k}=${v}`).join("&") : "";
  let key = `${method} ${channel}${url.pathname}${search}`;
  if (/vnd\.pgrst\.object/.test(accept)) key += " [one]";
  if (method !== "GET" && method !== "HEAD" && body) key += ` #${hash(body)}`;
  return key;
}

const out = existsSync(outFile) ? JSON.parse(readFileSync(outFile, "utf8")) : {};
mkdirSync("/srv/orig/shots", { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

for (const persona of personas) {
  if (only && !only.includes(persona.key)) continue;
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "America/Los_Angeles", locale: "en-US" });
  const page = await context.newPage();
  const responses = {};
  let recording = false;
  page.on("response", async (response) => {
    if (!recording) return;
    const request = response.request();
    const href = request.url();
    const channel = href.startsWith(API) ? "api" : href.startsWith(DB) && !href.includes("/realtime/") ? "db" : null;
    if (!channel || request.method() === "OPTIONS") return;
    const url = new URL(href);
    const key = keyOf(request.method(), channel, url, request.postData() ?? "", request.headers()["accept"] ?? "");
    let body = "";
    try { body = await response.text(); } catch { return; }
    const h = {};
    const range = response.headers()["content-range"];
    if (range) h["Content-Range"] = range;
    // First answer wins: later ones come after something changed.
    if (!responses[key]) responses[key] = Object.keys(h).length ? { s: response.status(), b: body, h } : { s: response.status(), b: body };
  });
  page.on("pageerror", (error) => console.log(`[${persona.key}] pageerror`, String(error).slice(0, 200)));

  let session = null;
  if (persona.email) {
    await page.goto(`${WEB}/sign-in`);
    await page.getByLabel(/email/i).fill(persona.email);
    await page.getByLabel(/password/i).first().fill(PASSWORD);
    await page.getByRole("button", { name: /^sign in$/i }).click();
    try {
      await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 20000 });
    } catch {
      await page.screenshot({ path: `/srv/orig/shots/${persona.key}-LOGIN-FAILED.png` });
      console.log(`[${persona.key}] sign-in did not leave /sign-in`);
      await context.close();
      continue;
    }
    await page.waitForLoadState("networkidle");
    session = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => /^sb-.+-auth-token$/.test(k));
      return key ? JSON.parse(localStorage.getItem(key)) : null;
    });
  }
  const now = new Date().toISOString();
  recording = true;
  for (const step of persona.steps) {
    const width = step.width ?? 1440;
    await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
    if (step.route) {
      await page.goto(`${WEB}${step.route}`);
    }
    try {
      await page.waitForLoadState("networkidle", { timeout: 15000 });
    } catch {}
    await page.waitForTimeout(600);
    for (const action of step.actions ?? []) {
      try {
        await action(page);
        try { await page.waitForLoadState("networkidle", { timeout: 8000 }); } catch {}
        await page.waitForTimeout(500);
      } catch (error) {
        console.log(`[${persona.key}] ${step.name}: action failed: ${String(error.message ?? error).split("\n")[0]}`);
      }
    }
    if (step.name) await page.screenshot({ path: `/srv/orig/shots/${persona.key}-${step.name}.png` });
  }
  recording = false;
  out[persona.key] = { label: persona.label, now, session, start: persona.start, r: responses };
  console.log(`[${persona.key}] ${Object.keys(responses).length} responses`);
  writeFileSync(outFile, JSON.stringify(out));
  await context.close();
}
await browser.close();
writeFileSync(outFile, JSON.stringify(out));
console.log("wrote", outFile, (JSON.stringify(out).length / 1e6).toFixed(2), "MB");
