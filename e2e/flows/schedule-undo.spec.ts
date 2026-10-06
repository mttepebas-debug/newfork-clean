import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { psql } from "../global-setup";
import { round, signIn } from "../fixtures/world";

// EKRAN-01 W-1b S2 (KK-171): Undo takes the step back on the server. Ayse
// adds Ali's Tuesday shift, presses Undo, and reloads: the shift stays gone,
// and with nothing left to take back Undo is faded.

// A week no other spec uses (0-9 and 500 are taken).
const WEEK = 501;

function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

test("Undo takes the last step back on the server, and a reload keeps it back", async ({ page }) => {
  const monday = sql(`select tests.week(${WEEK + 10 * round()});`);
  const tuesday = sql(`select ('${monday}'::date + 1)::text;`);
  await signIn(page, "ayse");
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto(`/app/schedule?date=${monday}`);
  await page.getByRole("button", { name: "Draft selector: New Schedule", exact: true }).click();
  await page.getByRole("button", { name: "New Schedule (blank)", exact: true }).click();
  await expect(page).toHaveURL(/mode=edit/);

  const undo = page.getByRole("button", { name: "Undo", exact: true });
  await expect(undo).toBeDisabled();

  // Hover first: the add button only takes pointer events on :hover.
  const addShift = page.getByRole("button", { name: `Add shift for Ali Person at Kadikoy on ${tuesday}` });
  await addShift.hover({ force: true });
  await addShift.click();
  const editor = page.getByRole("dialog", { name: "Add shift", exact: true });
  await editor.getByLabel("Start time").fill("9:00 AM");
  await editor.getByLabel("End time").fill("3:00 PM");
  await editor.getByRole("button", { name: "Add shift", exact: true }).click();
  await expect(editor).toHaveCount(0);
  const cards = page.locator('[data-shift-badge]:not([data-ghost="true"])');
  await expect(cards).toHaveCount(1);

  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(page.getByText("Last edit undone")).toBeVisible();
  await expect(cards).toHaveCount(0);
  await expect(undo).toBeDisabled();

  // The reload picks the same edit back up from the server: the shift is not there.
  await page.reload();
  await expect(page).toHaveURL(/mode=edit/);
  await expect(page.getByRole("button", { name: "Discard" })).toBeVisible();
  await expect(cards).toHaveCount(0);
});
