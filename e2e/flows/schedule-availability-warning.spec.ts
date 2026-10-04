import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { psql } from "../global-setup";
import { draftName, roundWeek, signIn, type Person } from "../fixtures/world";

// AVAIL-002 (M8, M9): availability is always a warning, never a block or a
// conflict. A manager can still write a shift onto hours an employee marked
// "unavailable" -- the cell carries a warning -- and Publish lists it as a
// note for a last look, asking nothing, every time. Settings > Conflict
// handling has no rule for it (BL-185).

const run: string = JSON.parse(readFileSync(new URL("../.world.json", import.meta.url), "utf8")).run;

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

test("a manager writes to Ali's marked-unavailable hours and Publish lists it as a note without asking, then and on republish", async ({
  browser,
}) => {
  // Ali's own weekly mark, made from Employee Hub > My availability: Tuesday
  // 6pm-10pm he's unavailable. Never a block (BL-186) -- the manager can
  // still write him in there.
  sql(`select tests.availability('${run}', 'ali', 2, '18:00', '22:00');`);

  const monday = sql(`select tests.week(${roundWeek(4)});`);
  const tuesday = sql(`select tests.week(${roundWeek(4)}) + 1;`);

  const ayse = await openPage(browser, "ayse", `/app/schedule?date=${monday}`);

  await ayse.getByRole("button", { name: "Draft selector: New Schedule", exact: true }).click();
  await ayse.getByRole("button", { name: "New Schedule (blank)", exact: true }).click();
  await expect(ayse).toHaveURL(/mode=edit/);

  // The button only turns interactive on :hover (opacity/pointer-events are
  // CSS-driven); force the first move so the real hover state is in place
  // before the follow-up click, or Playwright's own pre-click check never
  // lets the mouse arrive.
  const addShiftButton = ayse.getByRole("button", {
    name: `Add shift for Ali Person at Kadikoy on ${tuesday}`,
    exact: true,
  });
  await addShiftButton.hover({ force: true });
  await addShiftButton.click();
  const editor = ayse.getByRole("dialog", { name: "Add shift", exact: true });
  await editor.getByLabel("Start time").fill("6:00 PM");
  await editor.getByLabel("End time").fill("10:00 PM");
  await editor.getByRole("button", { name: "Add shift", exact: true }).click();
  await expect(editor).toHaveCount(0);

  // The write itself is silent -- no confirmation dialog, no block. The card
  // is where the warning shows: an orange mark, an accessible name and a
  // description that say Ali's status, not that anything changed (G14).
  const shiftBadge = ayse.getByRole("button", { name: /shows as unavailable for this shift/ });
  await expect(shiftBadge).toBeVisible();
  await expect(shiftBadge).toHaveAttribute("data-availability-warning", "true");
  await expect(shiftBadge).toHaveAccessibleDescription(/^Ali Person shows as unavailable for this shift/);

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

  // Pre-flight lists the mark by name among the notes and asks nothing (M9):
  // no acknowledgment box, Next is open straight away.
  await expect(publishDialog.getByText("Notes and already-live issues", { exact: true })).toBeVisible();
  await expect(publishDialog.getByText("Ali Person shows as unavailable for this shift.")).toBeVisible();
  await expect(publishDialog.getByRole("checkbox", { name: /I've seen (this warning|these \d+ warnings)/ })).toHaveCount(0);
  const nextButton = publishDialog.getByRole("button", { name: "Next", exact: true });
  await expect(nextButton).toBeEnabled();
  await nextButton.click();
  await publishDialog.getByRole("button", { name: "Publish 1 location", exact: true }).click();
  await expect(ayse.getByRole("dialog")).toHaveCount(0);
  await expect(ayse.getByRole("button", { name: "Published", exact: true })).toBeVisible();

  // Republish the same, unchanged week: the mark is listed again as a note,
  // with nothing "previously accepted" and still nothing to tick.
  const publishAnotherDraft = ayse.getByRole("button", { name: "Publish another draft", exact: true });
  const menuAlreadyOpen = await publishAnotherDraft
    .waitFor({ state: "visible", timeout: 2_000 })
    .then(() => true)
    .catch(() => false);
  if (!menuAlreadyOpen) {
    await ayse.getByRole("button", { name: "Published", exact: true }).click();
    await publishAnotherDraft.waitFor({ state: "visible" });
  }
  await publishAnotherDraft.click();
  const secondDialog = ayse.getByRole("dialog");
  await expect(secondDialog).toContainText("Select locations to publish");
  await secondDialog.getByRole("button", { name: "Next", exact: true }).click();
  await expect(ayse.getByTestId("schedule-publish-preview")).toBeVisible();

  await expect(secondDialog.getByText("Ali Person shows as unavailable for this shift.")).toBeVisible();
  await expect(secondDialog.getByText(/Previously accepted/)).toHaveCount(0);
  await expect(secondDialog.getByRole("checkbox", { name: /I've seen (this warning|these \d+ warnings)/ })).toHaveCount(0);
  const secondNext = secondDialog.getByRole("button", { name: "Next", exact: true });
  await expect(secondNext).toBeEnabled();
  await secondNext.click();
  await secondDialog.getByRole("button", { name: "Publish 1 location", exact: true }).click();
  await expect(ayse.getByRole("dialog")).toHaveCount(0);
});

test("Settings > Conflict handling no longer offers an Employee availability rule", async ({ browser }) => {
  const zeynep = await openPage(browser, "zeynep", "/app/settings/scheduling/conflicts");
  await expect(zeynep.getByRole("heading", { name: "Conflict handling", exact: true })).toBeVisible();
  await expect(zeynep.getByText("Employee availability")).toHaveCount(0);
  await expect(
    zeynep.getByText("Availability is a preference: you'll see a warning, never a block."),
  ).toBeVisible();
});
