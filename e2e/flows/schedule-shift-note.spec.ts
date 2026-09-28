import { execSync } from "node:child_process";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { psql } from "../global-setup";
import { emailOf, signIn, type Person } from "../fixtures/world";

// BL-199: Ayse writes a note on Ali's shift in the Schedule's quick editor and
// publishes the week; Ali opens the shift in Employee Hub and reads it under
// "Shift notes". Ayse deletes the note and publishes again; Ali's shift no
// longer carries it.
//
// Employee Hub lists shifts from two days ago to six weeks ahead
// (EmployeeHubPage.tsx), so this is next week's shift, not a tests.week()
// week ~700 days out. The world is fresh every run: nothing else is there.

const NOTE = "Bring the catering order list";

function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

async function openPage(browser: Browser, person: Person, path: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, person);
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto(path);
  return page;
}

/** Ali's current published shift on this day (a republish makes a new row). */
function alisPublishedShift(day: string): string {
  return sql(`
    select p.id from public.schedule_published_shifts p
    join public.schedule_location_publications publication
      on publication.id = p.publication_id and publication.status = 'current'
    join public.employee_profiles e on e.id = p.employee_id
    join auth.users u on u.id = e.user_id
    where u.email = '${emailOf("ali")}' and p.scheduled_date = '${day}';`);
}

async function saveAndPublish(ayse: Page, draftName: string, weekIsLive: boolean) {
  await ayse.getByRole("button", { name: /^(?:Save draft|Publish)$/ }).click();
  await ayse.getByLabel("Draft name").fill(draftName);
  await ayse.getByRole("button", { name: "Save As" }).click();
  await expect(ayse).not.toHaveURL(/mode=edit/);
  if (weekIsLive) {
    // A live week's trigger reads "Published"; its menu may already be open
    // after the save (schedule-multi-location.spec.ts has the same wait).
    const publishAnother = ayse.getByRole("button", { name: "Publish another draft" });
    const menuOpen = await publishAnother
      .waitFor({ state: "visible", timeout: 2_000 })
      .then(() => true, () => false);
    if (!menuOpen) await ayse.getByRole("button", { name: "Published" }).click();
    await publishAnother.click();
  } else {
    await ayse.getByRole("button", { name: "Publish" }).click();
  }
  const dialog = ayse.getByRole("dialog");
  await expect(dialog).toContainText("Select locations to publish");
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await expect(ayse.getByTestId("schedule-publish-preview")).toBeVisible();
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await dialog.getByRole("button", { name: "Publish 1 location" }).click();
  await expect(ayse.getByRole("dialog")).toHaveCount(0);
}

test("a manager's shift note reaches the employee, and deleting it takes it away", async ({ browser }) => {
  const monday = sql(`select (current_date + (8 - extract(isodow from current_date))::integer)::text;`);
  const wednesday = sql(`select ('${monday}'::date + 2)::text;`);
  const notedCard = (page: Page) => page.locator('[data-shift-badge][data-has-note="true"]');

  const ayse = await openPage(browser, "ayse", `/app/schedule?date=${monday}`);
  await ayse.getByRole("button", { name: "Draft selector: New Schedule" }).click();
  await ayse.getByRole("button", { name: "New Schedule (blank)" }).click();
  await expect(ayse).toHaveURL(/mode=edit/);

  // Hover first: the add button only takes pointer events on :hover.
  const addShift = ayse.getByRole("button", { name: `Add shift for Ali Person at Kadikoy on ${wednesday}` });
  await addShift.hover({ force: true });
  await addShift.click();
  const editor = ayse.getByRole("dialog", { name: "Add shift" });
  await editor.getByLabel("Start time").fill("9:00 AM");
  await editor.getByLabel("End time").fill("3:00 PM");
  const note = editor.getByRole("textbox", { name: "Note" });
  await note.fill(NOTE);
  await expect(note).toHaveAttribute("maxlength", "500");
  await expect(note).toHaveAccessibleDescription(`${500 - NOTE.length} characters left`);
  await editor.getByRole("button", { name: "Add shift" }).click();
  await expect(editor).toHaveCount(0);

  // The card says it has a note, and a mouse resting on its corner shows it.
  await expect(notedCard(ayse)).toHaveCount(1);
  await expect(notedCard(ayse)).toHaveAccessibleName(/, has a manager note$/);
  await ayse.locator("[data-shift-note-marker]").hover();
  await expect(ayse.locator(".schedule-shift-note-card")).toContainText(NOTE);

  await saveAndPublish(ayse, "Note week", false);

  const ali = await openPage(browser, "ali", `/app/employee-hub?shift=${alisPublishedShift(wednesday)}`);
  const sheet = ali.getByRole("dialog", { name: "Your shift" });
  await expect(sheet.getByRole("heading", { name: "Shift notes" })).toBeVisible();
  await expect(sheet.getByText(NOTE)).toBeVisible();

  // Ayse opens the live week again, clears the note and publishes.
  await ayse.getByRole("button", { name: /^Draft selector:/ }).click();
  await ayse.getByRole("button", { name: "Edit live schedule" }).click();
  await expect(ayse).toHaveURL(/mode=edit/);
  // In edit mode a click only focuses the card; a double click opens it.
  await notedCard(ayse).dblclick();
  const edit = ayse.getByRole("dialog");
  await expect(edit.getByRole("textbox", { name: "Note" })).toHaveValue(NOTE);
  await edit.getByRole("textbox", { name: "Note" }).fill("");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit).toHaveCount(0);
  await expect(notedCard(ayse)).toHaveCount(0);
  await saveAndPublish(ayse, "Note week, no note", true);

  // The sheet opens on the republished shift (so the check below is not
  // trivially true on an empty page), and carries no note.
  await ali.goto(`/app/employee-hub?shift=${alisPublishedShift(wednesday)}`);
  await expect(sheet).toContainText("Kadikoy");
  await expect(sheet.getByRole("heading", { name: "Shift notes" })).toHaveCount(0);
  await expect(ali.getByText(NOTE)).toHaveCount(0);
});
