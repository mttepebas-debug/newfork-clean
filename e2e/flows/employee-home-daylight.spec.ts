import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { round, signIn } from "../fixtures/world";
import { psql } from "../global-setup";

// The employee's Daylight Home on a phone (Mert 2026-10-18, S-163): once the
// greeting scrolls away, the next shift sits in the shell's top bar in the
// workspace's place, and a tap on it opens that shift. Back at the top, the
// workspace returns. The bar's slot takes no room on any other page, so a
// manager's long workspace name keeps its width.

const PHONE = { width: 390, height: 844 };
const world: { readonly run: string; readonly password: string } = JSON.parse(
  readFileSync(new URL("../.world.json", import.meta.url), "utf8"),
);
const sql = (query: string) => execSync(psql, { input: query, encoding: "utf8" }).trim();

async function phone(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext({ viewport: PHONE, hasTouch: true, isMobile: true })).newPage();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(world.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
  return page;
}

const scrollMain = (page: Page, to: "bottom" | 0) =>
  page.evaluate((target) => {
    const main = document.querySelector<HTMLElement>(".app-main")!;
    main.scrollTo(0, target === "bottom" ? main.scrollHeight : 0);
  }, to);

test("phone: the next shift folds into the top bar as Home scrolls, and opens from there", async ({ browser }) => {
  // A fresh employee with one shift next week, so no other spec's shifts reach this Home.
  const label = `daylight${Math.random().toString(36).slice(2, 7)}`;
  const email = sql(`
    select tests.person('${world.run}', '${label}', 'employee', array['B'], array['cook']);
    select tests.password('${world.run}:${label}', '${world.password}');`)
    .split(/\r?\n/)
    .at(-1)!;
  const week = -99 + round();
  sql(`select tests.publish_week('${world.run}', ${week}, '[
    {"label": "${label}-mon", "person": "${label}", "loc": "B", "job": "cook", "day": 0, "start": "18:00", "end": "22:00"}
  ]');`);
  const shift = sql(`select tests.id('${world.run}:shift:${label}-mon');`);

  const page = await phone(browser, email);
  await page.goto("/app/employee-hub");
  const bar = page.locator(".mm-top");
  const pill = bar.locator(".dl-pill");
  const workspace = bar.locator(".mm-top-workspace");
  await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
  // At the top: the workspace, no pill.
  await expect(workspace).toHaveCSS("opacity", "1");
  await expect(pill).toHaveCSS("opacity", "0");

  await scrollMain(page, "bottom");
  await expect(pill).toHaveCSS("opacity", "1");
  await expect(pill).toContainText("6:00 PM");
  await expect(workspace).toHaveCSS("opacity", "0");

  await pill.tap();
  await expect(page).toHaveURL(new RegExp(`\\?shift=${shift}`));
  await expect(page.getByRole("dialog", { name: "Your shift", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close shift details" }).tap();

  await scrollMain(page, 0);
  await expect(workspace).toHaveCSS("opacity", "1");
  await expect(pill).toHaveCSS("opacity", "0");
});

test("phone: the bar's slot takes no room on a manager's page (zeynep)", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: PHONE, hasTouch: true, isMobile: true })).newPage();
  await signIn(page, "zeynep");
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto("/app/workspace");
  const slot = page.locator(".mm-top .mm-top-mid");
  await expect(page.locator(".mm-top")).toBeVisible();
  await expect(slot).toHaveCSS("position", "absolute");
  // Out of the row, the slot leaves the workspace name its full width.
  await expect(slot).toBeEmpty();
});
