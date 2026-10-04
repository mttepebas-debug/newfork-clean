// Walks every set and variant of the availability artifact, clicks each flow, saves screenshots, counts console errors.
// Usage (repo root, with the built page served on 5630): node apps/web/src/dev/avail/artifact/shots.mjs
// Output: artifacts/nf-arayuz/avail-design/shots/*.png (gitignored).
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../..");
const { chromium } = createRequire(path.join(repo, "e2e/package.json"))("@playwright/test");
const out = path.join(repo, "artifacts/nf-arayuz/avail-design/shots");
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
// The local static server has no favicon; that request is not part of the artifact.
page.on("console", (message) => {
  if (message.type() === "error" && !message.location().url.endsWith("/favicon.ico")) errors.push(`${message.text()} @ ${message.location().url}`);
});
page.on("pageerror", (error) => errors.push(String(error)));
page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
await page.goto(process.env.AVAIL_URL ?? "http://127.0.0.1:5630/avail-artifact.html");
const app = page.frameLocator("#app");
await app.locator(".avail-index").waitFor();
const shots = [];
const shot = async (name) => {
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  shots.push(name);
};
const go = async (set, variant) => {
  await page.evaluate(([s, v]) => document.getElementById("app").contentWindow.postMessage({ availgo: `/app/dev/avail/${s}?variant=${v}` }, "*"), [set, variant]);
  await page.waitForTimeout(700);
};
const device = async (name) => {
  await page.click(`button[data-device="${name}"]`);
  await page.waitForTimeout(400);
};
const cellAdd = async (employee, date) => {
  const cell = app.locator(`.schedule-cell[data-employee-id="${employee}"][data-date="${date}"]`);
  // On a phone the sticky columns cover the cell, so the + gets its click directly.
  await cell.locator(".schedule-cell-add-action").dispatchEvent("click");
  await page.waitForTimeout(300);
};
const garson1 = "55555555-5555-4555-8555-555555555552";
const garson2 = "55555555-5555-4555-8555-555555555553";

for (const d of ["desktop", "phone"]) {
  await device(d);
  for (const v of ["a", "b", "c"]) {
    await go("s1", v);
    await shot(`s1-${v}-on-${d}`);
    if (v === "a") await app.getByRole("button", { name: "Availability on" }).click();
    if (v === "b") await app.getByRole("button", { name: "Hide Availability" }).click();
    if (v === "c") {
      await app.getByRole("button", { name: "Settings", exact: true }).click();
      await shot(`s1-${v}-menu-${d}`);
      await app.locator(".schedule-settings-menu-panel").getByRole("button", { name: "Hide Availability" }).click();
    }
    await page.waitForTimeout(300);
    await shot(`s1-${v}-off-${d}`);
  }
  for (const v of ["a", "b", "c"]) {
    await go("s2", v);
    await cellAdd(garson1, "2026-10-21");
    await shot(`s2-${v}-note-${d}`);
    await app.getByRole("button", { name: "Place shift" }).click();
    await page.waitForTimeout(300);
    await shot(`s2-${v}-placed-${d}`);
    if (v === "a") {
      await cellAdd(garson2, "2026-10-24");
      await shot(`s2-a-warn-${d}`);
      await app.getByRole("button", { name: "Place shift" }).click();
    }
  }
  for (const v of ["a", "b", "c"]) {
    await go("s3", v);
    await shot(`s3-${v}-${d}`);
    if (v === "b") {
      await app.locator(".avail-pf-fold summary").click();
      await shot(`s3-b-open-${d}`);
    }
    if (v === "c") {
      await app.locator(".avail-pf-chips button").first().click();
      await page.waitForTimeout(300);
      await shot(`s3-c-chip-${d}`);
    }
    await app.getByRole("button", { name: "Next", exact: true }).click();
    await page.waitForTimeout(300);
    await shot(`s3-${v}-next-${d}`);
  }
  for (const v of ["a", "b", "c", "d", "e"]) {
    await go("s4", v);
    await shot(`s4-${v}-list-${d}`);
    const card = app.locator(".sx-card").first();
    if (v === "c") {
      await card.locator("input[type=checkbox]").check();
      await shot(`s4-c-ticked-${d}`);
      await card.getByRole("button", { name: "Request to cover" }).click();
    } else {
      await card.getByRole("button", { name: "Request to cover" }).click();
      await page.waitForTimeout(400);
      await shot(`s4-${v}-ask-${d}`);
      if (v === "a" || v === "e") await app.getByRole("button", { name: "Request anyway" }).click();
      if (v === "b") await card.getByRole("button", { name: "Yes, request" }).click();
      if (v === "d") await card.getByRole("button", { name: "Tap again to request anyway" }).click();
    }
    await page.waitForTimeout(400);
    await shot(`s4-${v}-sent-${d}`);
  }
  for (const v of ["a", "b", "c", "d", "e"]) {
    await go("s5", v);
    await shot(`s5-${v}-open-${d}`);
    await app.getByRole("button", { name: "Review KadıköyGarson2" }).click();
    await page.waitForTimeout(300);
    if (v === "c") await app.getByRole("button", { name: /asked anyway/ }).hover();
    await shot(`s5-${v}-review-${d}`);
    await app.getByRole("button", { name: "Approve transfer to KadıköyGarson2" }).click();
    await page.waitForTimeout(400);
    await shot(`s5-${v}-confirm-${d}`);
    await app.getByRole("button", { name: "Approve", exact: true }).click();
    await page.waitForTimeout(400);
    await shot(`s5-${v}-done-${d}`);
  }
}
console.log(JSON.stringify({ shots: shots.length, errors }, null, 1));
await browser.close();
