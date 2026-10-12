import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { psql } from "../global-setup";
import { draftName, emailOf, roundLabel, roundWeek, signIn } from "../fixtures/world";

// EKRAN-01, Mert 2026-10-12 ("Sor + tek kural"): Ayse leaves Schedule edit
// mode with unsaved work and is asked first (Keep editing / Discard and leave
// / Save draft), whether she uses the sidebar or the browser's Back / Forward. With nothing unsaved
// she leaves without a word.

const run: string = JSON.parse(readFileSync(new URL("../.world.json", import.meta.url), "utf8")).run;
const NOTE = "Ayse has not saved this";

function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

/** How Ayse's latest edit of the week ended (or "active"), once it has. */
async function editEnds(week: number, status: string) {
  await expect.poll(() => sql(`
    select s.status from public.schedule_edit_sessions s
    join auth.users u on u.id = s.holder_user_id
    where u.email = '${emailOf("ayse")}' and s.week_start = tests.week(${roundWeek(week)})
    order by s.created_at desc limit 1;`)).toBe(status);
}

const employeesLink = (page: Page) =>
  page.getByRole("complementary", { name: "Application sidebar" })
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Employees" });
const question = (page: Page) => page.getByRole("alertdialog", { name: "Save changes before leaving?" });

async function editLiveWeek(browser: Browser, week: number): Promise<Page> {
  sql(`
    select tests.publish_week('${run}', ${roundWeek(week)}, '[
      {"label": "${roundLabel(`leave-${week}`)}", "person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"}
    ]');`);
  const monday = sql(`select tests.week(${roundWeek(week)});`);
  const page = await (await browser.newContext()).newPage();
  await signIn(page, "ayse");
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto(`/app/schedule?date=${monday}`);
  // Employees, in the app's own history, is one Forward away.
  await employeesLink(page).click();
  await expect(page).toHaveURL(/\/app\/employees/);
  await page.goBack();
  await expect(page).toHaveURL(/\/app\/schedule/);
  await page.getByRole("button", { name: /^Draft selector:/ }).click();
  await page.getByRole("button", { name: "Edit live schedule", exact: true }).click();
  await expect(page).toHaveURL(/mode=edit/);
  return page;
}

async function changeSomething(page: Page) {
  await page.locator('[data-shift-badge]:not([data-ghost="true"])').first().dblclick();
  const editor = page.getByRole("dialog");
  await editor.getByRole("textbox", { name: "Note", exact: true }).fill(NOTE);
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor).toHaveCount(0);
}

test("leaving with unsaved changes asks; Keep editing stays, Discard and leave goes", async ({ browser }) => {
  const ayse = await editLiveWeek(browser, 503);
  await changeSomething(ayse);
  const schedule = ayse.url();

  await employeesLink(ayse).click();
  await expect(question(ayse)).toBeVisible();
  await question(ayse).getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(question(ayse)).toHaveCount(0);
  expect(ayse.url()).toBe(schedule);
  await expect(ayse.locator('[data-shift-badge][data-has-note="true"]')).toHaveCount(1);
  await editEnds(503, "active");

  // Forward to the page she came from asks too, and keeps her on Schedule meanwhile.
  await ayse.goForward();
  await expect(question(ayse)).toBeVisible();
  expect(ayse.url()).toBe(schedule);
  await question(ayse).getByRole("button", { name: "Discard and leave" }).click();
  await expect(ayse).toHaveURL(/\/app\/employees/);
  await editEnds(503, "discarded");
});

test("Save draft on the way out saves the work, then leaves", async ({ browser }) => {
  const ayse = await editLiveWeek(browser, 504);
  await changeSomething(ayse);
  const name = draftName("Left for Employees");

  await employeesLink(ayse).click();
  await question(ayse).getByRole("button", { name: "Save draft", exact: true }).click();
  const saveWindow = ayse.getByRole("dialog").filter({ has: ayse.getByLabel("Draft name") });
  await saveWindow.getByLabel("Draft name").fill(name);
  await saveWindow.getByRole("button", { name: /^(?:Save draft|Save As)$/ }).click();

  await expect(ayse).toHaveURL(/\/app\/employees/);
  expect(sql(`select count(*) from public.schedule_drafts where name = '${name}';`)).toBe("1");
});

test("leaving with nothing unsaved does not ask", async ({ browser }) => {
  const ayse = await editLiveWeek(browser, 505);

  await employeesLink(ayse).click();
  await expect(ayse).toHaveURL(/\/app\/employees/);
  await expect(question(ayse)).toHaveCount(0);
  // Its lock no longer keeps the week from others.
  await editEnds(505, "expired");
});
