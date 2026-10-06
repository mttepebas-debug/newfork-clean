import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { psql } from "../global-setup";
import { roundLabel, roundWeek, signIn, type Person } from "../fixtures/world";

// EKRAN-01 D-Y5: Ayse and Zeynep edit the same published week at once (the
// design allows it). Zeynep writes a note on Ali's shift and does not save;
// her unsaved change stays on her own screen and never lands on Ayse's grid.

const run: string = JSON.parse(readFileSync(new URL("../.world.json", import.meta.url), "utf8")).run;
const NOTE = "Zeynep has not saved this";

function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

async function editLiveWeek(browser: Browser, person: Person, monday: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, person);
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto(`/app/schedule?date=${monday}`);
  await page.getByRole("button", { name: /^Draft selector:/ }).click();
  await page.getByRole("button", { name: "Edit live schedule", exact: true }).click();
  await expect(page).toHaveURL(/mode=edit/);
  return page;
}

// Ali's own card, not a faded copy from another location.
const alisCard = (page: Page) => page.locator('[data-shift-badge]:not([data-ghost="true"])');
const notedCard = (page: Page) => page.locator('[data-shift-badge][data-has-note="true"]');

test("one manager's unsaved change stays off another manager's grid", async ({ browser }) => {
  sql(`
    select tests.publish_week('${run}', ${roundWeek(5)}, '[
      {"label": "${roundLabel("ali-own")}", "person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"}
    ]');`);
  const monday = sql(`select tests.week(${roundWeek(5)});`);

  const ayse = await editLiveWeek(browser, "ayse", monday);
  const zeynep = await editLiveWeek(browser, "zeynep", monday);

  // In edit mode a double click opens the card.
  await alisCard(zeynep).first().dblclick();
  const editor = zeynep.getByRole("dialog");
  await editor.getByRole("textbox", { name: "Note", exact: true }).fill(NOTE);
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(notedCard(zeynep)).toHaveCount(1);

  // Long enough for the live update and the pending-change reread to land.
  await ayse.waitForTimeout(3_000);
  await expect(alisCard(ayse)).toHaveCount(1);
  await expect(notedCard(ayse)).toHaveCount(0);
});
