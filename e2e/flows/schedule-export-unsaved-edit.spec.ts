import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "../fixtures/test";
import { psql } from "../global-setup";
import { roundLabel, roundWeek, signIn } from "../fixtures/world";

// Mert 2026-10-12: Export never asks for a save. In edit mode Ayse exports the
// grid as it is on screen, unsaved changes included; no Save draft window
// opens, nothing is saved, and her edit stays open.

const run: string = JSON.parse(readFileSync(new URL("../.world.json", import.meta.url), "utf8")).run;
const WEEK = 520;

function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

test("exports an open edit as it is on screen, without saving it", async ({ browser }) => {
  const week = roundWeek(WEEK);
  sql(`
    select tests.publish_week('${run}', ${week}, '[
      {"label": "${roundLabel("export-edit")}", "person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"}
    ]');`);
  const monday = sql(`select tests.week(${week});`);
  const drafts = () => sql(`select count(*) from public.schedule_drafts
    where workspace_id = tests.id('${run}') and week_start = tests.week(${week});`);

  const page = await (await browser.newContext({ acceptDownloads: true })).newPage();
  await signIn(page, "ayse");
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto(`/app/schedule?date=${monday}`);
  await page.getByRole("button", { name: /^Draft selector:/ }).click();
  await page.getByRole("button", { name: "Edit live schedule", exact: true }).click();
  await expect(page).toHaveURL(/mode=edit/);

  // An unsaved change: a note on the shift.
  await page.locator('[data-shift-badge]:not([data-ghost="true"])').first().dblclick();
  const editor = page.getByRole("dialog");
  await editor.getByRole("textbox", { name: "Note", exact: true }).fill("Not saved yet");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor).toHaveCount(0);
  const draftsBefore = drafts();

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const panel = page.getByRole("region", { name: "Export settings" });
  await expect(panel).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Save draft" })).toHaveCount(0);
  await expect(panel.getByText("Editing · not saved")).toBeVisible();

  const download = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Download PDF" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.pdf$/);

  // Nothing was saved; the edit is still open.
  expect(drafts()).toBe(draftsBefore);
  await expect(page).toHaveURL(/mode=edit/);
  await expect(page.getByRole("button", { name: "Discard" })).toBeVisible();
});
