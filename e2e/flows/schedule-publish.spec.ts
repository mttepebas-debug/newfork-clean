import { execSync } from "node:child_process";
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { psql } from "../global-setup";
import { draftName, roundLabel, roundWeek, signIn, type Person } from "../fixtures/world";

// FOUNDATION-B FB-6.1.12, flow 5: a manager adds a shift, saves it as a named
// draft, previews it and publishes it. The employee then sees the shift, and
// its "On call" tag, on their own schedule.

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

test("a manager publishes a week and the employee sees the shift with its tag", async ({ browser }) => {
  const tag = roundLabel("On call");
  // The "On call" tag has to exist in the workspace catalog before the quick
  // editor can offer it; only an admin/owner manages the catalog.
  const zeynep = await openPage(browser, "zeynep", "/app/settings/scheduling/shift-labels");
  await zeynep.getByRole("button", { name: "New shift label", exact: true }).click();
  await zeynep.getByLabel("Name").fill(tag);
  await zeynep.getByRole("button", { name: "Save shift label", exact: true }).click();
  await expect(zeynep.getByRole("button", { name: `Edit ${tag}`, exact: true })).toBeVisible();

  const monday = sql(`select tests.week(${roundWeek(2)});`);
  const ayse = await openPage(browser, "ayse", `/app/schedule?date=${monday}`);

  await ayse.getByRole("button", { name: "Draft selector: New Schedule", exact: true }).click();
  await ayse.getByRole("button", { name: "New Schedule (blank)", exact: true }).click();
  await expect(ayse).toHaveURL(/mode=edit/);

  // The button only turns interactive on :hover (opacity/pointer-events are
  // CSS-driven); force the first move so the real hover state is in place
  // before the follow-up click, or Playwright's own pre-click check never
  // lets the mouse arrive.
  const addShiftButton = ayse.getByRole("button", {
    name: `Add shift for Emre Person at Kadikoy on ${monday}`,
    exact: true,
  });
  await addShiftButton.hover({ force: true });
  await addShiftButton.click();
  const editor = ayse.getByRole("dialog", { name: "Add shift", exact: true });
  await editor.getByLabel("Start time").fill("9:00 AM");
  await editor.getByLabel("End time").fill("5:00 PM");
  await editor.getByRole("combobox", { name: "Labels", exact: true }).click();
  await editor.getByRole("option", { name: tag, exact: true }).click();
  await editor.getByRole("button", { name: "Add shift", exact: true }).click();
  await expect(editor).toHaveCount(0);

  // Save (the manager's "kaydet" step): a named draft.
  await ayse.getByRole("button", { name: /^(?:Save draft|Publish)$/ }).click();
  await ayse.getByLabel("Draft name").fill(draftName("Ayse week"));
  await ayse.getByRole("button", { name: "Save As", exact: true }).click();
  await expect(ayse).not.toHaveURL(/mode=edit/);

  // Preview, then publish. Scoped to the dialog: the topbar's own "Next week"
  // nav button also matches an unscoped, unexact "Next" query.
  await ayse.getByRole("button", { name: "Publish", exact: true }).click();
  const publishDialog = ayse.getByRole("dialog");
  await expect(publishDialog).toContainText("Select locations to publish");
  await publishDialog.getByRole("button", { name: "Next", exact: true }).click();
  await expect(ayse.getByTestId("schedule-publish-preview")).toBeVisible();
  await publishDialog.getByRole("button", { name: "Next", exact: true }).click();
  await publishDialog.getByRole("button", { name: "Publish 1 location", exact: true }).click();
  await expect(ayse.getByRole("dialog")).toHaveCount(0);
  await expect(ayse.getByRole("button", { name: "Published", exact: true })).toBeVisible();

  const emre = await openPage(browser, "emre", `/app/employee-hub/schedule?date=${monday}`);
  const shiftBadge = emre.getByRole("button", { name: /On call/ });
  await expect(shiftBadge).toBeVisible();
  await expect(shiftBadge).toHaveAccessibleName(/9:00 AM - 5:00 PM/);
});
