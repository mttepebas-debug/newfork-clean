import { expect, test, type Browser, type Page } from "@playwright/test";
import { signIn, type Person } from "../fixtures/world";

// FOUNDATION-B 3b (user decision 2026-09-24, option A): only a draft is
// locked. Ayse edits her draft, and Zeynep, an admin, is told who has it.
// Edits of the week itself lock nothing: Ayse (Kadikoy), Mehmet (Besiktas)
// and Zeynep all edit the same week at the same time.

async function openSchedule(browser: Browser, person: Person): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, person);
  await expect(page).toHaveURL(/\/app\/workspace/);
  await page.goto("/app/schedule");
  return page;
}

async function startBlankEdit(page: Page) {
  await page.getByRole("button", { name: "Draft selector: New Schedule" }).click();
  await page.getByRole("button", { name: "New Schedule (blank)" }).click();
}

async function editDraft(page: Page, name: string) {
  await page.getByRole("button", { name: /^Draft selector:/ }).click();
  await page.getByRole("button", { name: `Edit ${name}` }).click();
}

test("one person edits a draft at a time, and the admin is told who has it", async ({ browser }) => {
  const ayse = await openSchedule(browser, "ayse");
  await startBlankEdit(ayse);
  await expect(ayse).toHaveURL(/mode=edit/);
  await ayse.getByRole("button", { name: /^(?:Save draft|Publish)$/ }).click();
  await ayse.getByLabel("Draft name").fill("Ayse plan");
  await ayse.getByRole("button", { name: "Save As" }).click();
  await expect(ayse).not.toHaveURL(/mode=edit/);
  await editDraft(ayse, "Ayse plan");
  await expect(ayse).toHaveURL(/mode=edit/);

  const zeynep = await openSchedule(browser, "zeynep");
  await editDraft(zeynep, "Ayse plan");
  const dialog = zeynep.getByRole("dialog", { name: "Draft is being edited" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Ayse Person is editing "Ayse plan"');
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
  await expect(zeynep.getByRole("dialog", { name: "Draft is being edited" })).toHaveCount(0);
});
