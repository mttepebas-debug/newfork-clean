import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Browser, Locator, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { psql } from "../global-setup";
import { roundLabel, roundWeek, signIn, type Person } from "../fixtures/world";

// SEKME-KAYDIR (KARARLAR §1.5, Mert 2026-10-17): on a phone a sideways swipe on a tabbed page's content
// moves to the next or previous tab and stops at the ends; Lineup's day wheel and shift tabs keep their own
// swipe; the browser's edge swipe back is off on these pages. The swipes are a real touch screen's
// (Chrome's touch events through the DevTools protocol), not a mouse drag.

const PHONE = { width: 390, height: 844 };
const run: string = JSON.parse(readFileSync(new URL("../.world.json", import.meta.url), "utf8")).run;
const sql = (query: string): string => execSync(psql, { input: query, encoding: "utf8" }).trim();

async function phone(browser: Browser, person: Person, path: string): Promise<Page> {
  const page = await (await browser.newContext({ viewport: PHONE, hasTouch: true, isMobile: true })).newPage();
  await signIn(page, person);
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto(path);
  // The page has loaded: an outline that the content replaces mid-swipe takes the finger's lift with it.
  await expect(page.locator("h1").filter({ visible: true }).first()).not.toBeEmpty({ timeout: 30_000 });
  await expect(page.locator(".nf-loading")).toHaveCount(0, { timeout: 30_000 });
  return page;
}

/** A finger across `on`'s middle row: `dx` px sideways (negative: to the left), in eight moves over ~200 ms. */
async function swipe(page: Page, on: Locator, dx: number, dy = 0) {
  const box = (await on.boundingBox())!;
  const x = Math.min(Math.max(box.x + box.width / 2, Math.abs(dx) / 2 + 24), PHONE.width - Math.abs(dx) / 2 - 24) - dx / 2;
  await swipeAt(page, x, Math.min(box.y + Math.min(box.height / 2, 60), PHONE.height - 120), dx, dy);
}

/** The same finger from the point (x, y) of the screen. */
async function swipeAt(page: Page, x: number, y: number, dx: number, dy = 0) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let step = 1; step <= 8; step++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + (dx * step) / 8, y: y + (dy * step) / 8 }] });
    await page.waitForTimeout(25);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

const chosen = (page: Page, list: string) => page.getByRole("tablist", { name: list }).locator('[role="tab"][aria-selected="true"]');

test("My Availability: a swipe moves between Availability and Time Off Requests, and stops at the ends", async ({ browser }) => {
  const emre = await phone(browser, "emre", "/app/employee-hub/my-availability");
  const tabs = chosen(emre, "My availability");
  await expect(tabs).toHaveText("Availability");
  const panel = emre.getByRole("tabpanel");
  await swipe(emre, panel, -160);
  await expect(tabs).toHaveText("Time Off Requests");
  await expect(emre).toHaveURL(/section=time-off/);
  // The end: no going round to the first.
  await swipe(emre, emre.getByRole("tabpanel"), -160);
  await expect(tabs).toHaveText("Time Off Requests");
  // A scroll down is a scroll, not a tab change; nor is a swipe in a text box (its caret and selection).
  await swipe(emre, emre.getByRole("tabpanel"), -30, -200);
  await swipe(emre, emre.getByRole("textbox", { name: "Note" }), 160);
  await expect(tabs).toHaveText("Time Off Requests");
  // Across the Start date (no caret there) it goes back.
  await swipe(emre, emre.getByLabel("Start"), 160);
  await expect(tabs).toHaveText("Availability");
});

test("the employee's My shifts and Lineup: a swipe moves between the two pages; the day wheel keeps its own", async ({ browser }) => {
  const emre = await phone(browser, "emre", "/app/employee-hub/schedule");
  const pages = emre.getByRole("navigation", { name: "Schedule pages" });
  // CALISAN-SCHEDULE-LISTE (S-153): Schedule opens on My shifts; on a phone the tabs are My shifts · Lineup.
  await expect(pages.getByRole("link", { name: "My shifts" })).toHaveAttribute("aria-current", "page");
  await swipe(emre, emre.locator(".employee-hub-page"), -160);
  await expect(emre).toHaveURL(/\/app\/employee-hub\/schedule\/lineup/);
  await expect(pages.getByRole("link", { name: "Lineup" })).toHaveAttribute("aria-current", "page");
  // The day wheel turns the day; the page stays Lineup.
  const wheel = emre.getByRole("group", { name: "Day. Swipe or use the arrow keys." });
  await expect(wheel).toBeVisible();
  await swipe(emre, wheel, 160);
  await expect(emre).toHaveURL(/\/app\/employee-hub\/schedule\/lineup/);
  // The page under the wheel goes back to My shifts.
  await swipe(emre, emre.locator(".employee-hub-page h1"), 160);
  await expect(emre).toHaveURL(/\/app\/employee-hub\/schedule(\?|$)/);
});

test("Shift Hub: a swipe steps through Available Shifts, My requests and History", async ({ browser }) => {
  const emre = await phone(browser, "emre", "/app/employee-hub/shift-hub");
  const views = emre.getByRole("navigation", { name: "Shift Hub views" });
  const current = views.locator('[aria-current="page"]');
  await expect(current).toContainText("Available Shifts");
  const body = emre.locator(".sx-workbench");
  await swipe(emre, body, -160);
  await expect(current).toContainText("My requests");
  await swipe(emre, body, -160);
  await expect(current).toContainText("History");
  await swipe(emre, body, -160);
  await expect(current).toContainText("History");
  await swipe(emre, body, 160);
  await expect(current).toContainText("My requests");
  // Low on the screen, under whatever the tab holds (Mert 2026-10-19: an empty My requests ended under its
  // "You're all caught up" box, and a swipe under it did nothing); the phone's bottom bar is lower still.
  await swipeAt(emre, PHONE.width / 2 + 80, PHONE.height - 140, -160);
  await expect(current).toContainText("History");
  await swipeAt(emre, PHONE.width / 2 - 80, PHONE.height - 140, 160);
  await expect(current).toContainText("My requests");
});

test("Account → Documents: a swipe moves to Policies & Agreements and back", async ({ browser }) => {
  const emre = await phone(browser, "emre", "/account/documents");
  const tabs = chosen(emre, "Your documents");
  await expect(tabs).toHaveText("Documents");
  // On the list under the tabs (Account's own menu above them scrolls sideways and keeps its swipe).
  const list = emre.locator('[role="tablist"][aria-label="Your documents"] ~ *').first();
  await swipe(emre, list, -160);
  await expect(tabs).toHaveText("Policies & Agreements");
  await swipe(emre, list, 160);
  await expect(tabs).toHaveText("Documents");
  // And low on the screen, under the short list: the account's page goes on down there.
  await swipeAt(emre, PHONE.width / 2 + 80, PHONE.height - 140, -160);
  await expect(tabs).toHaveText("Policies & Agreements");
});

test("the manager's phone Lineup: a swipe moves through Team, Notes and Read, never the shift", async ({ browser }) => {
  const week = roundWeek(660);
  sql(`select tests.publish_week('${run}', ${week}, '[
    {"label": "${roundLabel("emre-k-swipe")}", "person": "emre", "loc": "K", "job": "cook", "day": 3, "start": "16:00", "end": "22:00"}
  ]');`);
  const day = sql(`select tests.week(${week}) + 3;`);
  const ayse = await phone(browser, "ayse", `/app/schedule/lineup?date=${day}`);
  const segs = chosen(ayse, "Lineup");
  await expect(segs).toContainText("Team");
  // Read opens once the lineup is published (Mert 2026-10-17): a draft's swipe stops at Notes. Each swipe is
  // checked on its own, so a lost first swipe can't hide behind the second.
  await swipe(ayse, ayse.getByRole("tabpanel"), -160);
  await expect(segs).toContainText("Notes");
  await swipe(ayse, ayse.getByRole("tabpanel"), -160);
  await expect(segs).toContainText("Notes");
  await swipe(ayse, ayse.getByRole("tabpanel"), 160);
  await expect(segs).toContainText("Team");
  await ayse.locator(".lineup-phone-dock").getByRole("button", { name: /^Publish, \d+ lineups? waiting$/ }).tap();
  const sheet = ayse.getByRole("dialog", { name: "Publish lineups" });
  await sheet.getByRole("button", { name: /^Publish \d+$/ }).tap();
  // The sheet closes by itself once the lineup is out (no Done); the floating Publish says Published.
  await expect(sheet).toHaveCount(0);
  await expect(ayse.locator(".lineup-phone-dock").getByRole("button", { name: "Published", exact: true })).toBeVisible();
  await expect(ayse.locator(".lineup-card")).toContainText("Live");
  const shifts = ayse.getByRole("group", { name: "Shifts" });
  const shift = await shifts.locator('[aria-pressed="true"]').textContent();
  await swipe(ayse, ayse.getByRole("tabpanel"), -160);
  await expect(segs).toContainText("Notes");
  await swipe(ayse, ayse.getByRole("tabpanel"), -160);
  await expect(segs).toContainText("Read");
  await swipe(ayse, shifts, 160);
  await expect(segs).toContainText("Read");
  await expect(shifts.locator('[aria-pressed="true"]')).toHaveText(shift!);
  await swipe(ayse, ayse.getByRole("tabpanel"), 160);
  await expect(segs).toContainText("Notes");
});

test("the browser's edge swipe back is off on a tabbed page, and back on elsewhere", async ({ browser }) => {
  const emre = await phone(browser, "emre", "/app/employee-hub/my-availability");
  await expect(emre.getByRole("tablist", { name: "My availability" })).toBeVisible();
  // A touch that starts in the edge band is cancelled (that is what stops iOS Safari's swipe back); a tap on
  // a control there is not, nor one in the middle. Chrome's sideways overscroll back is off too.
  const edge = () =>
    emre.evaluate(() => {
      const touch = (x: number, on: Element) => {
        const event = new TouchEvent("touchstart", {
          bubbles: true,
          cancelable: true,
          touches: [new Touch({ identifier: 1, target: on, clientX: x, clientY: 400 })],
        });
        on.dispatchEvent(event);
        return event.defaultPrevented;
      };
      const page = document.querySelector(".employee-weekly-workspace")!;
      return {
        left: touch(4, page),
        right: touch(window.innerWidth - 4, page),
        middle: touch(200, page),
        overscroll: getComputedStyle(document.documentElement).overscrollBehaviorX,
      };
    });
  expect(await edge()).toEqual({ left: true, right: true, middle: false, overscroll: "none" });
  await emre.goto("/app/employee-hub");
  await expect(emre.getByRole("heading", { level: 1 })).toBeVisible();
  const home = await emre.evaluate(() => {
    const event = new TouchEvent("touchstart", {
      bubbles: true,
      cancelable: true,
      touches: [new Touch({ identifier: 1, target: document.body, clientX: 4, clientY: 400 })],
    });
    document.body.dispatchEvent(event);
    return { cancelled: event.defaultPrevented, overscroll: getComputedStyle(document.documentElement).overscrollBehaviorX };
  });
  expect(home).toEqual({ cancelled: false, overscroll: "auto" });
});
