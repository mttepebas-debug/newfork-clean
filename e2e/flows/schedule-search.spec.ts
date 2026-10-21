import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "../fixtures/test";
import { psql } from "../global-setup";
import { roundLabel, roundWeek, signIn } from "../fixtures/world";

// KARARLAR S-228 (2)-(3): the manager Schedule's search sits first on the top
// bar's second row, narrows the grid, lives in the address as ?q= and says
// when no one is left, with the way back.

const run: string = JSON.parse(readFileSync(new URL("../.world.json", import.meta.url), "utf8")).run;

function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

test("the Schedule search narrows the grid, keeps ?q= across weeks and says when no one matches", async ({ page }) => {
  sql(`
    select tests.publish_week('${run}', ${roundWeek(5)}, '[
      {"label": "${roundLabel("search-ali")}", "person": "ali", "loc": "K", "job": "cook", "day": 0, "start": "09:00", "end": "15:00"},
      {"label": "${roundLabel("search-emre")}", "person": "emre", "loc": "K", "job": "cook", "day": 1, "start": "10:00", "end": "16:00"}
    ]');`);
  const monday = sql(`select tests.week(${roundWeek(5)});`);
  const besiktas = sql(`select tests.id('${run}:B');`);

  await signIn(page, "zeynep");
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto(`/app/schedule?date=${monday}`);
  const grid = page.locator("[data-schedule-grid-frame]");
  await expect(grid).toContainText("Emre Person");
  await expect(grid).toContainText("Ali Person");

  const searchRow = page.locator("[data-schedule-top-bar-filter-row]");
  const field = searchRow.getByRole("searchbox", { name: "Search the schedule" });
  await page.keyboard.press("/");
  await expect(field).toBeFocused();

  await field.fill("emre");
  await expect(page).toHaveURL(/[?&]q=emre/);
  await expect(grid).toContainText("Emre Person");
  await expect(grid).not.toContainText("Ali Person");

  // The next week keeps the search.
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  await expect(page).toHaveURL(/[?&]q=emre/);
  await page.getByRole("button", { name: "Previous week", exact: true }).click();

  // A job name keeps everyone with such a shift, the card framed.
  await field.fill("cook");
  await expect(grid).toContainText("Ali Person");
  await expect(grid).toContainText("Emre Person");
  await expect(grid.locator('[data-shift-badge][data-search-mark="match"]').first()).toBeVisible();

  // Behind a filter: the box offers the filters back.
  await page.goto(`/app/schedule?date=${monday}&locations=${besiktas}&q=emre`);
  const empty = page.getByRole("status").filter({ hasText: "No one matches “emre”." });
  await expect(empty).toBeVisible();
  await empty.getByRole("button", { name: "Show all filters", exact: true }).click();
  await expect(page).not.toHaveURL(/locations=/);
  await expect(grid).toContainText("Emre Person");

  await field.fill("nobody-here");
  await expect(page.getByText("No one matches “nobody-here”.")).toBeVisible();
  await page.getByRole("button", { name: "Clear search", exact: true }).first().click();
  await expect(page).not.toHaveURL(/[?&]q=/);
  await expect(field).toHaveValue("");
  await expect(grid).toContainText("Ali Person");
});
