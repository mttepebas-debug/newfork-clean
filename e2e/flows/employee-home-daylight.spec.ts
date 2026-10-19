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
const DESKTOP = { width: 1440, height: 900 };
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
  // The workspace name runs up to the bell with the row's one gap, so a long name is cut no earlier than before.
  const room = await page.evaluate(() => {
    const name = document.querySelector(".mm-top-workspace")!.getBoundingClientRect();
    const tools = document.querySelector(".mm-top-tools")!.getBoundingClientRect();
    const text = document.querySelector<HTMLElement>(".mm-top-name")!;
    return { gap: Math.round(tools.left - name.right), fits: text.scrollWidth <= text.clientWidth };
  });
  expect(room.fits || room.gap <= 12).toBe(true);
});

// S-172 (Mert 2026-10-18, 2026-10-19): the page box starts 32 px right of the
// open 240 px menu (x=272) and
// holds still when it folds. Home draws no ground of its own, and its sky runs
// past the box to the scrolling area's edges, so there is no seam on either
// side, menu open or folded, and nothing scrolls sideways.
test("desktop: Home's sky and ground meet the menu and the right edge with no seam (emre)", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: DESKTOP })).newPage();
  await signIn(page, "emre");
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto("/app/employee-hub");
  await expect(page.locator(".dl-home")).toBeVisible();
  const measure = () =>
    page.evaluate(() => {
      const main = document.querySelector<HTMLElement>(".app-main")!;
      const area = main.getBoundingClientRect();
      const sky = document.querySelector(".dl-sky")!.getBoundingClientRect();
      const box = document.querySelector(".employee-hub-page")!;
      return {
        skyLeft: Math.round(sky.left - area.left),
        skyRight: Math.round(area.left + main.clientWidth - sky.right),
        boxLeft: Math.round(box.getBoundingClientRect().left),
        boxGround: getComputedStyle(box).backgroundColor,
        shellGround: getComputedStyle(document.querySelector(".app-shell")!).backgroundColor,
        mainGround: getComputedStyle(main).backgroundColor,
        sideways: main.scrollWidth > main.clientWidth,
      };
    });
  const open = await measure();
  expect(open).toMatchObject({ skyLeft: 0, skyRight: 0, boxLeft: 272, boxGround: "rgba(0, 0, 0, 0)", sideways: false });
  await page.getByRole("button", { name: "Collapse menu" }).click();
  await expect.poll(async () => (await measure()).boxLeft).toBe(272);
  const folded = await measure();
  expect(folded).toMatchObject({ skyLeft: 0, skyRight: 0, sideways: false });
  // The band the folded menu leaves is the same ground as the page under Home.
  expect(folded.shellGround).toBe(folded.mainGround);
  await page.getByRole("button", { name: "Expand menu" }).click();
});
