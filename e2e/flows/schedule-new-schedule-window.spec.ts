import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "../fixtures/test";
import { psql } from "../global-setup";
import { draftName, roundLabel, roundWeek, signIn } from "../fixtures/world";

// Mert 2026-10-12, design B: the New Schedule window holds the week's
// schedules, templates and export as tabs; the top bar has no Export or
// Templates buttons. Ayse saves the live week as a draft, saves that draft as
// a template, and uses the template in a new blank draft: Use asks where it
// goes first, opens it for editing, then applies.

const run: string = JSON.parse(readFileSync(new URL("../.world.json", import.meta.url), "utf8")).run;
const WEEK = 530;

function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

test("the New Schedule window: schedules, a template saved from a draft and used in a blank draft", async ({ browser }) => {
  const week = roundWeek(WEEK);
  sql(`
    select tests.publish_week('${run}', ${week}, '[
      {"label": "${roundLabel("window")}", "person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"}
    ]');`);
  const monday = sql(`select tests.week(${week});`);
  const plan = draftName("Window plan");
  const template = draftName("Window week");

  const page = await (await browser.newContext()).newPage();
  await signIn(page, "ayse");
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto(`/app/schedule?date=${monday}`);
  await expect(page.getByRole("button", { name: "Export", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Templates", exact: true })).toHaveCount(0);

  // Schedules: the live week first, with its shifts and hours.
  await page.getByRole("button", { name: /^Draft selector:/ }).click();
  const windowRoot = page.getByRole("dialog", { name: /^Schedules for / });
  await expect(windowRoot.getByRole("tab", { name: /^Schedules/ })).toHaveAttribute("aria-selected", "true");
  const live = windowRoot.locator("[data-published-draft-row]");
  await expect(live).toContainText("Live");
  await expect(live).toContainText("shift");
  await windowRoot.getByRole("button", { name: "Edit live schedule", exact: true }).click();
  await expect(page).toHaveURL(/mode=edit/);
  await page.getByRole("button", { name: /^(?:Save draft|Publish)$/ }).click();
  await page.getByLabel("Draft name").fill(plan);
  await page.getByRole("button", { name: "Save As", exact: true }).click();
  await expect(page).not.toHaveURL(/mode=edit/);

  // Templates: Save template saves a draft of this week.
  await page.getByRole("button", { name: /^Draft selector:/ }).click();
  await windowRoot.getByRole("tab", { name: /^Templates/ }).click();
  await windowRoot.getByRole("button", { name: "Save template", exact: true }).click();
  const form = windowRoot.getByRole("region", { name: "Save a draft as a template" });
  await form.getByLabel("Draft").selectOption({ label: plan });
  await form.getByLabel("Template name").fill(template);
  await form.getByRole("button", { name: "Save template", exact: true }).click();
  await expect(windowRoot.getByRole("button", { name: `Use template ${template}`, exact: true })).toBeVisible();

  // Use with no edit open: pick a new blank draft; it opens for editing, then the template applies.
  await windowRoot.getByRole("button", { name: `Use template ${template}`, exact: true }).click();
  await windowRoot.getByRole("radio", { name: "New blank draft" }).check();
  await windowRoot.getByRole("button", { name: "Open for editing", exact: true }).click();
  await expect(page).toHaveURL(/mode=edit/);
  await windowRoot.getByRole("button", { name: "Apply template", exact: true }).click();
  await expect(windowRoot).toHaveCount(0);
  await expect(page.locator('[data-shift-badge]:not([data-ghost="true"])')).toHaveCount(1);

  // Export is the window's third tab.
  await page.getByRole("button", { name: /^Draft selector:/ }).click();
  await windowRoot.getByRole("tab", { name: "Export", exact: true }).click();
  await expect(windowRoot.getByRole("region", { name: "Export settings" })).toContainText("Editing · not saved");
  await page.keyboard.press("Escape");
  await expect(windowRoot).toHaveCount(0);

  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await page.getByRole("alertdialog", { name: "Discard unsaved changes?" }).getByRole("button", { name: "Discard", exact: true }).click();
  await expect(page).not.toHaveURL(/mode=edit/);
});
