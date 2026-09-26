import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { psql } from "../global-setup";
import { signIn, type Person } from "../fixtures/world";

// FOUNDATION-B FB-6.1.12, flow 6: a manager scoped to Kadikoy cannot publish
// Besiktas -- its grid never arrives, and the publish button only covers her
// own location -- but she sees Ali's Besiktas shift as an unopenable ghost
// card, tag included (REUSE "Taslak ve lokasyon" B1, M2). An admin, scoped to
// both locations, can publish both.

const run: string = JSON.parse(readFileSync(new URL("../.world.json", import.meta.url), "utf8")).run;

function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

async function openPage(browser: Browser, person: Person, path: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, person);
  // Managers/admins land in the workspace, employees in the Employee Hub
  // (sign-in-lands.spec.ts): just wait past the sign-in screen itself.
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto(path);
  return page;
}

async function startBlankEdit(page: Page) {
  await page.getByRole("button", { name: "Draft selector: New Schedule" }).click();
  await page.getByRole("button", { name: "New Schedule (blank)" }).click();
}

// A blank draft starts truly empty; publishing it over an already-published
// location would wipe that location's live shifts. Editing the live schedule
// instead starts from what's actually published, so a no-op save-and-publish
// changes nothing at Besiktas.
async function startEditingLiveSchedule(page: Page) {
  await page.getByRole("button", { name: "Draft selector: New Schedule" }).click();
  await page.getByRole("button", { name: "Edit live schedule" }).click();
}

test("a location-scoped manager cannot reach the other location, and only the admin can publish both", async ({
  browser,
}) => {
  // Ali works both locations; his Besiktas shift, already published, is what
  // the Kadikoy manager should see only as a ghost.
  sql(`
    select tests.publish_week('${run}', 3, '[
      {"label": "ali-b", "person": "ali", "loc": "B", "job": "cook", "day": 0, "start": "09:00", "end": "17:00", "label_names": ["On call"]}
    ]');`);
  const monday = sql(`select tests.week(3);`);

  const ayse = await openPage(browser, "ayse", `/app/schedule?date=${monday}`);

  // Beşiktaş's grid never comes: only Kadikoy's location header renders.
  // (Day-column headers also carry the location name in their own accessible
  // name -- e.g. "View Mon Sep 4, Kadikoy" -- so this locates the one
  // location-header element per location by its own id, not by role/name.)
  const ayseLocationHeaders = ayse.locator('[id^="schedule-loc-"]');
  await expect(ayseLocationHeaders).toHaveCount(1);
  await expect(ayseLocationHeaders).toContainText("Kadikoy");
  await expect(ayseLocationHeaders).not.toContainText("Besiktas");

  // Ali's Besiktas shift shows as a ghost in Ayse's Kadikoy grid, tag included.
  // 2026-09-26 decision: the ghost card itself carries no location line (only
  // type-job, label, time); the location lives in the corner pin's tooltip
  // bubble (Tooltip.tsx, aria-describedby) -- so it's confirmed here by
  // opening that bubble, not by reading the card's own text.
  const ghost = ayse.getByTestId("ghost-shift-badge");
  await expect(ghost).toBeVisible();
  await expect(ghost).toContainText("Cook");
  await expect(ghost).toContainText("On call");
  await expect(ghost).toContainText("9:00 AM - 5:00 PM");
  await expect(ghost).not.toContainText("Besiktas");
  await ghost.getByRole("button", { name: "Location" }).click();
  await expect(ayse.getByRole("tooltip")).toContainText("Besiktas");

  // A draft is needed before "Publish" is even enabled; an empty one is enough
  // to check which locations the button covers.
  await startBlankEdit(ayse);
  await expect(ayse).toHaveURL(/mode=edit/);
  await ayse.getByRole("button", { name: /^(?:Save draft|Publish)$/ }).click();
  await ayse.getByLabel("Draft name").fill("Ayse week");
  await ayse.getByRole("button", { name: "Save As" }).click();
  await expect(ayse).not.toHaveURL(/mode=edit/);

  // The publish button only ever covers her own location.
  await ayse.getByRole("button", { name: "Publish" }).click();
  const ayseDialog = ayse.getByRole("dialog");
  await expect(ayseDialog).toContainText("Select locations to publish");
  await expect(ayseDialog.getByText("1 of 1 locations selected")).toBeVisible();
  await expect(ayseDialog.getByText("Besiktas")).toHaveCount(0);
  await ayseDialog.getByRole("button", { name: "Cancel" }).click();

  const zeynep = await openPage(browser, "zeynep", `/app/schedule?date=${monday}`);

  // The admin sees both locations' grids (order isn't guaranteed).
  const zeynepLocationHeaders = zeynep.locator('[id^="schedule-loc-"]');
  await expect(zeynepLocationHeaders).toHaveCount(2);
  await expect(zeynepLocationHeaders.filter({ hasText: "Kadikoy" })).toHaveCount(1);
  await expect(zeynepLocationHeaders.filter({ hasText: "Besiktas" })).toHaveCount(1);

  // A draft is needed to actually run a publish; a working copy of the live
  // schedule, saved unchanged, is enough and doesn't touch Ali's shift.
  await startEditingLiveSchedule(zeynep);
  await expect(zeynep).toHaveURL(/mode=edit/);
  await zeynep.getByRole("button", { name: /^(?:Save draft|Publish)$/ }).click();
  await zeynep.getByLabel("Draft name").fill("Zeynep week");
  await zeynep.getByRole("button", { name: "Save As" }).click();
  await expect(zeynep).not.toHaveURL(/mode=edit/);

  // Beşiktaş is already published, so the trigger reads "Published"; saving
  // a draft can leave its own dropdown state applied to this separate menu
  // too, so the panel is sometimes already open by the time we get here.
  // Wait (don't snapshot) for it to settle either way before deciding whether
  // "Published" still needs a click.
  const publishAnotherDraft = zeynep.getByRole("button", { name: "Publish another draft" });
  const menuAlreadyOpen = await publishAnotherDraft
    .waitFor({ state: "visible", timeout: 2_000 })
    .then(() => true)
    .catch(() => false);
  if (!menuAlreadyOpen) {
    await zeynep.getByRole("button", { name: "Published" }).click();
    await publishAnotherDraft.waitFor({ state: "visible" });
  }
  await publishAnotherDraft.click();
  // Scoped to the dialog: the topbar's own "Next week" nav button also
  // matches an unscoped, unexact "Next" query.
  const zeynepDialog = zeynep.getByRole("dialog");
  await expect(zeynepDialog).toContainText("Select locations to publish");
  await expect(zeynepDialog.getByText("2 of 2 locations selected")).toBeVisible();
  await expect(zeynepDialog.getByText("Kadikoy")).toBeVisible();
  await expect(zeynepDialog.getByText("Besiktas")).toBeVisible();

  await zeynepDialog.getByRole("button", { name: "Next", exact: true }).click();
  await expect(zeynep.getByTestId("schedule-publish-preview")).toBeVisible();
  await zeynepDialog.getByRole("button", { name: "Next", exact: true }).click();
  await zeynepDialog.getByRole("button", { name: "Publish 2 locations" }).click();
  await expect(zeynep.getByRole("dialog")).toHaveCount(0);
  await expect(zeynep.getByRole("button", { name: "Published" })).toBeVisible();
});
