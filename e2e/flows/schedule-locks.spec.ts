import { expect, test, type Browser, type Page } from "@playwright/test";
import { signIn, type Person } from "../fixtures/world";

// FOUNDATION-B stage 3: an edit locks one location and week. Ayse (Kadikoy)
// and Mehmet (Besiktas) edit the same week at the same time; Zeynep, an admin,
// asking for the whole week is told who holds which location.

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

test("two managers edit two locations of the same week, and the admin is told who holds each", async ({
  browser,
}) => {
  const ayse = await openSchedule(browser, "ayse");
  await startBlankEdit(ayse);
  await expect(ayse).toHaveURL(/mode=edit/);

  const mehmet = await openSchedule(browser, "mehmet");
  await startBlankEdit(mehmet);
  await expect(mehmet).toHaveURL(/mode=edit/);

  const zeynep = await openSchedule(browser, "zeynep");
  await startBlankEdit(zeynep);
  const dialog = zeynep.getByRole("dialog", { name: "Schedule is being edited" });
  await expect(dialog).toBeVisible();
  const holders = dialog.getByRole("list", { name: "Locations being edited" });
  await expect(holders).toContainText("Kadikoy: Ayse Person");
  await expect(holders).toContainText("Besiktas: Mehmet Person");
  // E2E_SHOTS=<folder> keeps a picture of the dialog for a screen review.
  if (process.env.E2E_SHOTS) {
    await zeynep.screenshot({ path: `${process.env.E2E_SHOTS}/schedule-lock-dialog.png` });
  }
  await expect(zeynep).not.toHaveURL(/mode=edit/);
});
