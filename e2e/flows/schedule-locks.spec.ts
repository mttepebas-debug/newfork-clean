import type { Browser, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { draftName, round, signIn, type Person } from "../fixtures/world";

// FOUNDATION-B 3b (user decision 2026-09-24, option A): only a draft is
// locked. Ayse edits her draft, and Zeynep, an admin, is told who has it.
// Edits of the week itself lock nothing: Ayse (Kadikoy), Mehmet (Besiktas)
// and Zeynep all edit the same week at the same time.

async function openSchedule(browser: Browser, person: Person): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, person);
  await expect(page).toHaveURL(/\/app\/workspace/);
  await page.goto(`/app/schedule?date=${roundDate()}`);
  return page;
}

// Next week in round 0; a later week per --repeat-each round, since the
// sessions a round leaves open would meet the next round (BL-203). Never this
// week: on a Sunday evening here the workspace (Istanbul) is already on Monday,
// and this computer's week is a past week there, closed to editing (BL-1051).
function roundDate(): string {
  const day = new Date();
  day.setDate(day.getDate() + 7 * (1 + round()));
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
}

async function startBlankEdit(page: Page) {
  await page.getByRole("button", { name: "Draft selector: New Schedule", exact: true }).click();
  await page.getByRole("button", { name: "Blank schedule", exact: true }).click();
}

async function editDraft(page: Page, name: string) {
  await page.getByRole("button", { name: /^Draft selector:/ }).click();
  // exact: the draft row's own name also contains "Edit <name>".
  await page.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
}

test("one person edits a draft at a time, and the admin is told who has it", async ({ browser }) => {
  const plan = draftName("Ayse plan");
  const ayse = await openSchedule(browser, "ayse");
  await startBlankEdit(ayse);
  await expect(ayse).toHaveURL(/mode=edit/);
  await ayse.getByRole("button", { name: /^(?:Save draft|Publish)$/ }).click();
  await ayse.getByLabel("Draft name").fill(plan);
  await ayse.getByRole("button", { name: "Save As", exact: true }).click();
  await expect(ayse).not.toHaveURL(/mode=edit/);
  await editDraft(ayse, plan);
  await expect(ayse).toHaveURL(/mode=edit/);

  const zeynep = await openSchedule(browser, "zeynep");
  await editDraft(zeynep, plan);
  const dialog = zeynep.getByRole("dialog", { name: "Draft is being edited", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(`Ayse Person is editing "${plan}"`);
  // E2E_SHOTS=<folder> keeps a picture of the dialog for a screen review.
  if (process.env.E2E_SHOTS) {
    await zeynep.screenshot({ path: `${process.env.E2E_SHOTS}/schedule-lock-dialog.png` });
  }
  await expect(zeynep).not.toHaveURL(/mode=edit/);
});

test("two managers and the admin edit the same week at the same time", async ({ browser }) => {
  const mehmet = await openSchedule(browser, "mehmet");
  await startBlankEdit(mehmet);
  await expect(mehmet).toHaveURL(/mode=edit/);

  const zeynep = await openSchedule(browser, "zeynep");
  await startBlankEdit(zeynep);
  await expect(zeynep).toHaveURL(/mode=edit/);
  await expect(zeynep.getByRole("dialog", { name: "Draft is being edited", exact: true })).toHaveCount(0);
});
