import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { psql } from "../global-setup";
import { roundLabel, roundWeek, signIn } from "../fixtures/world";

// EKRAN-01, Mert's grid picks (KARARLAR 1.5 Schedule):
// - the card marks (2026-10-12, replacing 2026-10-09 item 3): while editing, a
//   live shift says LIVE top right; a shift not published yet says "New".
// - 2026-10-09 item 4 B: while a shift is dragged, people who cannot take it at its own
//   location leave the grid until the drop.

const run: string = JSON.parse(readFileSync(new URL("../.world.json", import.meta.url), "utf8")).run;
// A week no other spec uses (0-9 and 500-501 are taken, 600 too).
const WEEK = 502;

function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

const cell = (page: Page, employeeId: string, date: string) =>
  page.locator(`.schedule-cell[data-employee-id="${employeeId}"][data-date="${date}"]`);
const card = (page: Page, employeeId: string, date: string) =>
  cell(page, employeeId, date).locator('[data-shift-badge]:not([data-ghost="true"])');
const personRow = (page: Page, name: string) => page.getByRole("rowheader").filter({ hasText: name });

test("while editing, a live shift says LIVE and a new one says New; a dragged shift hides who cannot take it", async ({
  browser,
}) => {
  const week = roundWeek(WEEK);
  // Emre (Kadikoy, cook) has a published Tuesday shift at Kadikoy.
  sql(`
    select tests.publish_week('${run}', ${week}, '[
      {"label": "${roundLabel("emre-drag")}", "person": "emre", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"}
    ]');`);
  const [monday, tuesday, wednesday, emreId] = sql(
    `select tests.week(${week}) || ' ' || tests.week(${week}) + 1 || ' ' || tests.week(${week}) + 2 || ' ' || tests.id('${run}:emre');`,
  ).split(" ") as [string, string, string, string];

  // Zeynep, the admin, sees both locations and edits the live week.
  const zeynep = await (await browser.newContext()).newPage();
  await signIn(zeynep, "zeynep");
  await expect(zeynep).not.toHaveURL(/\/sign-in/);
  await zeynep.goto(`/app/schedule?date=${monday}`);
  await zeynep.getByRole("button", { name: /^Draft selector:/ }).click();
  await zeynep.getByRole("button", { name: "Edit live schedule", exact: true }).click();
  await expect(zeynep).toHaveURL(/mode=edit/);

  // The live shift says LIVE, and no New.
  const live = card(zeynep, emreId, tuesday);
  await expect(live).toHaveCount(1);
  await expect(live).toHaveAttribute("data-publication-state", "locked");
  await expect(live.locator(".schedule-shift-live-mark")).toHaveText("Live");
  await expect(live.locator(".schedule-shift-new-mark")).toHaveCount(0);

  // A shift added now, not published yet, says "New".
  const add = zeynep.getByRole("button", { name: `Add shift for Emre Person at Kadikoy on ${wednesday}`, exact: true });
  await add.hover({ force: true });
  await add.click();
  const editor = zeynep.getByRole("dialog", { name: "Add shift", exact: true });
  await editor.getByLabel("Start time").fill("10:00 AM");
  await editor.getByLabel("End time").fill("2:00 PM");
  await editor.getByRole("button", { name: "Add shift", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(card(zeynep, emreId, wednesday).locator(".schedule-shift-new-mark")).toHaveText("New");

  // Item 4 B: Mehmet works only at Besiktas, so while Emre's Kadikoy cook
  // shift is in the air his row leaves the grid; Ali, a Kadikoy cook, stays.
  await expect(personRow(zeynep, "Mehmet Person")).not.toHaveCount(0);
  await expect(personRow(zeynep, "Ali Person")).not.toHaveCount(0);
  const box = (await live.boundingBox())!;
  await zeynep.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await zeynep.mouse.down();
  await zeynep.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2 + 20, { steps: 5 });
  await expect(personRow(zeynep, "Mehmet Person")).toHaveCount(0);
  await expect(personRow(zeynep, "Ali Person")).not.toHaveCount(0);

  // Let go outside the grid: nothing moves, and everybody is back.
  await zeynep.mouse.move(2, 2, { steps: 5 });
  await zeynep.mouse.up();
  await expect(personRow(zeynep, "Mehmet Person")).not.toHaveCount(0);
  await expect(card(zeynep, emreId, tuesday)).toHaveCount(1);
});
