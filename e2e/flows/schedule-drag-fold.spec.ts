import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { psql } from "../global-setup";
import { roundLabel, roundWeek, signIn } from "../fixtures/world";

// atama-surukle B (Mert, 2026-10-20): while a shift is dragged, a person's row
// folds away only when no day of the week can take it; somebody off on the
// shift's own day stays for another day. A cell with only a warning takes the
// drop; the drop shows at once and goes back with the reason when the server
// refuses it; Undo takes a drop back.

const run: string = JSON.parse(readFileSync(new URL("../.world.json", import.meta.url), "utf8")).run;

function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

// Kadikoy's section of the grid: Besiktas has a row for the same people.
let kadikoyId = "";
const cell = (page: Page, employeeId: string, date: string) =>
  page.locator(`.schedule-cell[data-display-location-id="${kadikoyId}"][data-employee-id="${employeeId}"][data-date="${date}"]`);
const card = (page: Page, employeeId: string, date: string) =>
  cell(page, employeeId, date).locator('[data-shift-badge]:not([data-ghost="true"])');
const personRow = (page: Page, name: string) => page.getByRole("rowheader").filter({ hasText: name });

async function pickUp(page: Page, employeeId: string, date: string) {
  await card(page, employeeId, date).scrollIntoViewIfNeeded();
  const box = (await card(page, employeeId, date).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 15, box.y + box.height / 2 + 5, { steps: 3 });
  await expect(page.locator(".schedule-shift-drag-preview")).toBeVisible();
}

async function over(page: Page, employeeId: string, date: string) {
  const box = (await cell(page, employeeId, date).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 8, { steps: 4 });
}

test("a dragged shift folds away only the people with no day for it, warns, lands at once, goes back when refused, and undoes", async ({ browser }) => {
  const week = roundWeek(780);
  const [monday, emreId, aliId, ayseId, denizId, kadikoy, owner, workspace] = sql(`
    select tests.week(${week}) || ' ' || tests.id('${run}:emre') || ' ' || tests.id('${run}:ali') || ' ' || tests.id('${run}:ayse')
      || ' ' || tests.id('${run}:deniz') || ' ' || tests.id('${run}:K') || ' ' || tests.user('${run}:owner') || ' ' || tests.id('${run}');`,
  ).split(" ") as [string, string, string, string, string, string, string, string];
  kadikoyId = kadikoy;
  const day = (n: number) => sql(`select ('${monday}'::date + ${n})::text;`);
  const [tuesday, wednesday, thursday] = [day(1), day(2), day(3)];
  // Emre's Monday cook shift at Kadikoy. Deniz is off the whole week, Ali on
  // Monday only; Ali marked Wednesday unavailable (a warning, never a block).
  sql(`
    select tests.publish_week('${run}', ${week}, '[
      {"label": "${roundLabel("emre-fold")}", "person": "emre", "loc": "K", "job": "cook", "day": 0, "start": "09:00", "end": "15:00"}
    ]');
    select tests.approved_leave('${workspace}', '${denizId}', '${owner}', '${kadikoy}', '${monday}'::date + d) from generate_series(0, 6) d;
    select tests.approved_leave('${workspace}', '${aliId}', '${owner}', '${kadikoy}', '${monday}');
    select tests.availability('${run}', 'ali', 3, '08:00', '16:00');`);

  // Zeynep, the admin, edits the live week of both locations.
  const page = await (await browser.newContext()).newPage();
  await signIn(page, "zeynep");
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto(`/app/schedule?date=${monday}`);
  await page.getByRole("button", { name: /^Draft selector:/ }).click();
  await page.getByRole("button", { name: "Edit live schedule", exact: true }).click();
  await expect(page).toHaveURL(/mode=edit/);
  await expect(card(page, emreId, monday)).toHaveCount(1);
  for (const name of ["Ali Person", "Deniz Person", "Mehmet Person", "Ayse Person"]) await expect(personRow(page, name).first()).toBeVisible();

  // Picked up: Deniz (off all week) and Mehmet (Besiktas only) fold away;
  // Ali, off on Monday alone, stays for the other days.
  await pickUp(page, emreId, monday);
  await expect(personRow(page, "Deniz Person")).toHaveCount(0);
  await expect(personRow(page, "Mehmet Person")).toHaveCount(0);
  await expect(personRow(page, "Ali Person").first()).toBeVisible();
  await expect(personRow(page, "Ayse Person").first()).toBeVisible();

  // Ali's Monday refuses, his Wednesday warns, his Tuesday takes it.
  await over(page, aliId, monday);
  await expect(cell(page, aliId, monday)).toHaveAttribute("data-drop-status", "blocked");
  await over(page, aliId, wednesday);
  await expect(cell(page, aliId, wednesday)).toHaveAttribute("data-drop-status", "warning");
  await over(page, aliId, tuesday);
  await expect(cell(page, aliId, tuesday)).toHaveAttribute("data-drop-status", "allowed");

  // Let go on another person's other day: it shows there at once and the rows come back.
  await page.mouse.up();
  await expect(card(page, aliId, tuesday)).toHaveCount(1);
  await expect(card(page, emreId, monday)).toHaveCount(0);
  await expect(personRow(page, "Deniz Person").first()).toBeVisible();
  await expect(page.locator("[data-drag-hidden]")).toHaveCount(0);

  // Undo takes it back to Emre's Monday.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(card(page, emreId, monday)).toHaveCount(1);
  await expect(card(page, aliId, tuesday)).toHaveCount(0);

  // A warning cell takes the drop.
  await pickUp(page, emreId, monday);
  await over(page, aliId, wednesday);
  await page.mouse.up();
  await expect(card(page, aliId, wednesday)).toHaveCount(1);

  // Refused by the server: Ayse's Thursday is approved off after the page
  // loaded, so the grid still takes it; the card goes back, with the reason.
  sql(`select tests.approved_leave('${workspace}', '${ayseId}', '${owner}', '${kadikoy}', '${thursday}');`);
  await pickUp(page, aliId, wednesday);
  await over(page, ayseId, thursday);
  await page.mouse.up();
  await expect(page.getByText(/time off/i).first()).toBeVisible();
  await expect(card(page, aliId, wednesday)).toHaveCount(1);
  await expect(card(page, ayseId, thursday)).toHaveCount(0);
});
