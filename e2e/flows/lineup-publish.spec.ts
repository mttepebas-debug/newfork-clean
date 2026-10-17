import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { psql } from "../global-setup";
import { roundLabel, roundWeek, signIn, type Person } from "../fixtures/world";

// LINEUP-PUBLISH-WEB (KARARLAR "Lineup yayını öne alındı", 2026-10-17): Ayse publishes Kadikoy's lineup for a
// day from the Lineup page's Publish window; Emre opens Schedule → Lineup, sees it and acknowledges; Ayse's
// lineup then says Read 1/N. Taken back, Emre's page says it isn't published yet.

const run: string = JSON.parse(readFileSync(new URL("../.world.json", import.meta.url), "utf8")).run;

function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

async function openPage(browser: Browser, person: Person, path: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, person);
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto(path);
  return page;
}

test("a manager publishes a lineup, the employee acknowledges it, and it is taken back", async ({ browser }) => {
  // A week no other flow publishes.
  const week = roundWeek(640);
  sql(`select tests.publish_week('${run}', ${week}, '[
    {"label": "${roundLabel("emre-k-lineup")}", "person": "emre", "loc": "K", "job": "cook", "day": 2, "start": "16:00", "end": "22:00"},
    {"label": "${roundLabel("ali-k-lineup")}", "person": "ali", "loc": "K", "job": "cook", "day": 2, "start": "17:00", "end": "23:00"}
  ]');`);
  const day = sql(`select tests.week(${week}) + 2;`);

  const ayse = await openPage(browser, "ayse", `/app/schedule/lineup?date=${day}`);
  const kadikoy = ayse.getByRole("article", { name: "Kadikoy" });
  await expect(kadikoy).toContainText("Emre Person");
  await ayse.getByRole("button", { name: /^Publish, \d+ lineups? waiting$/ }).click();
  const window = ayse.getByRole("dialog", { name: "Publish lineups" });
  const box = window.getByRole("region", { name: "Kadikoy" }).getByRole("checkbox").first();
  await expect(box).toHaveAttribute("aria-checked", "true");
  await window.getByRole("button", { name: /^Publish \d+$/ }).click();
  await expect(window.getByText(/^Published \d+ lineups? · \d+ (person|people) notified$/)).toBeVisible();
  await window.getByRole("button", { name: "Done", exact: true }).click();
  await expect(kadikoy.getByText(/^Read 0\/\d+$/)).toBeVisible();

  const emre = await openPage(browser, "emre", `/app/employee-hub/schedule/lineup?date=${day}`);
  await expect(emre.getByRole("link", { name: "Lineup", exact: true }).first()).toBeVisible();
  const ticket = emre.locator(".employee-lineup-ticket");
  await expect(ticket).toContainText("4:00 PM – 10:00 PM");
  await expect(ticket).toContainText("Kadikoy");
  await expect(emre.getByRole("list", { name: "Cook" })).toContainText("Ali Person");
  await emre.getByRole("button", { name: "Acknowledge", exact: true }).click();
  await expect(emre.getByText("Acknowledged.", { exact: true })).toBeVisible();
  await expect(emre.getByRole("button", { name: "Acknowledge", exact: true })).toHaveCount(0);

  await ayse.reload();
  await expect(ayse.getByRole("article", { name: "Kadikoy" }).getByText(/^Read 1\/\d+$/)).toBeVisible();

  // Take it back: two clicks on the red Unpublish.
  await ayse.getByRole("button", { name: /^Publish/ }).click();
  const again = ayse.getByRole("dialog", { name: "Publish lineups" });
  const row = again.getByRole("region", { name: "Kadikoy" }).getByRole("listitem").first();
  await row.hover();
  await row.getByRole("button", { name: /^Unpublish / }).click();
  await row.getByRole("button", { name: /^Unpublish .*\? Click again to confirm\.$/ }).click();
  await expect(again.getByText(/^Unpublished\. Staff can't see .+ until you publish it again\.$/)).toBeVisible();

  await emre.reload();
  await expect(emre.getByText(/lineup isn't published yet$/)).toBeVisible();
  await expect(emre.getByText("You'll get a notification when it is.", { exact: true })).toBeVisible();
});

// LINEUP-PUBLISH-PHONE (KARARLAR Lineup, Mert 2026-10-17: E · Çark tarih): on a phone Ayse turns the day wheel
// to the day, reads the team (nothing to edit), publishes from the dock over the bottom bar through the
// sheet, and the Read tab counts. The top stays while the list scrolls; folded, the wheel sits 4 px under
// the header's line.
test("a manager publishes a lineup from a phone", async ({ browser }) => {
  const week = roundWeek(641);
  sql(`select tests.publish_week('${run}', ${week}, '[
    {"label": "${roundLabel("emre-k-lineup-phone")}", "person": "emre", "loc": "K", "job": "cook", "day": 3, "start": "16:00", "end": "22:00"},
    {"label": "${roundLabel("ali-k-lineup-phone")}", "person": "ali", "loc": "K", "job": "cook", "day": 3, "start": "17:00", "end": "23:00"}
  ]');`);
  const day = sql(`select tests.week(${week}) + 3;`);
  const before = sql(`select tests.week(${week}) + 2;`);

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const ayse = await context.newPage();
  await signIn(ayse, "ayse");
  await expect(ayse).not.toHaveURL(/\/sign-in/);
  await ayse.goto(`/app/schedule/lineup?date=${before}`);

  // The wheel: › turns it a day, and the page loads that day.
  const wheel = ayse.getByRole("group", { name: "Day. Swipe or use the arrow keys." });
  await expect(wheel.locator('[aria-pressed="true"]')).toHaveCount(1);
  await ayse.getByRole("button", { name: "Next day" }).tap();
  await expect(ayse).toHaveURL(new RegExp(`date=${day}`));
  await ayse.getByRole("combobox", { name: "Location" }).selectOption({ label: "Kadikoy" });

  // Read-only: the rows open nothing.
  const team = ayse.getByRole("list", { name: "Cook" });
  await expect(team).toContainText("Emre Person");
  await expect(team.getByRole("button")).toHaveCount(0);
  await expect(ayse.getByText("Draft · staff can't see it", { exact: true })).toBeVisible();

  // The top stays put while the page scrolls under it, and the date row folds away.
  await ayse.evaluate(() => {
    const tall = document.createElement("div");
    tall.style.height = "1600px";
    document.querySelector(".lineup-phone-pane")!.append(tall);
    document.querySelector(".app-main")!.scrollTop = 2000;
  });
  await expect(ayse.locator("#lineup-title")).toBeInViewport();
  await expect
    .poll(() =>
      ayse.evaluate(() => {
        const line = document.querySelector(".lineup-phone-top .catalog-page-header")!.getBoundingClientRect().bottom;
        return Math.round(document.querySelector(".lineup-wheel")!.getBoundingClientRect().top - line);
      }),
    )
    .toBe(4);
  await ayse.evaluate(() => {
    document.querySelector(".app-main")!.scrollTop = 0;
  });

  // Publish sits over the bottom bar and opens the window as a sheet.
  await ayse.locator(".lineup-phone-dock").getByRole("button", { name: /^Publish, \d+ lineups? waiting$/ }).tap();
  const sheet = ayse.getByRole("dialog", { name: "Publish lineups" });
  await expect(sheet).toHaveClass(/is-sheet/);
  await sheet.getByRole("button", { name: /^Publish \d+$/ }).tap();
  await expect(sheet.getByText(/^Published \d+ lineups? · \d+ (person|people) notified$/)).toBeVisible();
  await sheet.getByRole("button", { name: "Done", exact: true }).tap();
  await expect(sheet).toHaveCount(0);

  await expect(ayse.getByText(/^Published \d{1,2}:\d{2} [AP]M$/)).toBeVisible();
  await ayse.getByRole("tab", { name: /^Read \d+\/\d+$/ }).tap();
  await expect(ayse.getByRole("tabpanel")).toContainText(/of \d+ read/);
  await context.close();
});
