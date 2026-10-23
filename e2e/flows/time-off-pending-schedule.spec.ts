import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { draftName, roundWeek } from "../fixtures/world";
import { psql } from "../global-setup";

// Time off rebuild D3b (KARARLAR S-239 (9)): time off waiting for an answer is only a warning on the
// Schedule, behind the time-off-v2 flag. While Ayse edits the week, the day a fresh Kadikoy employee asked
// off has a dashed red edge and a small ring whose window says when; a shift written there is written at
// once, with one short notice; Pre-flight lists a note that opens the request in Requests → Time off and
// publishing goes ahead. Without the flag the grid draws nothing new. The request is made in the new table
// (ask_time_off_service), on a week about two years out (tests.week) that no other spec uses.

const world: { readonly run: string; readonly password: string; readonly emails: Record<string, string> } = JSON.parse(
  readFileSync(new URL("../.world.json", import.meta.url), "utf8"),
);
const sql = (query: string) => execSync(psql, { input: query, encoding: "utf8" }).trim();
const last = (text: string) => text.split(/\r?\n/).at(-1)!;

// The screen reads a day as "Fri, Oct 24" (BL-611).
const weekdayDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

function freshEmployee() {
  const label = `topend${Math.random().toString(36).slice(2, 7)}`;
  const id = last(
    sql(`
    select tests.person('${world.run}', '${label}', 'employee', array['K'], array['cook']);
    select tests.id('${world.run}:${label}');`),
  );
  return { label, id, name: `${label.charAt(0).toUpperCase()}${label.slice(1)} Person`, first: `${label.charAt(0).toUpperCase()}${label.slice(1)}` };
}

async function ayse(browser: Browser, flag: boolean): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (flag) await context.addInitScript(() => window.localStorage.setItem("newfork:time-off-v2", "1"));
  const page = await context.newPage();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(world.emails.ayse!);
  await page.getByLabel("Password").fill(world.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
  return page;
}

async function editBlankWeek(page: Page, monday: string) {
  await page.goto(`/app/schedule?date=${monday}`);
  await page.getByRole("button", { name: /^Draft selector: / }).click();
  await page.getByRole("button", { name: "Blank schedule", exact: true }).click();
  await expect(page).toHaveURL(/mode=edit/);
}

const cell = (page: Page, employeeId: string, date: string) =>
  page.locator(`.schedule-cell[data-employee-id="${employeeId}"][data-date="${date}"]`);

test("time off waiting for an answer: a mark while editing, a short notice on the write, a note at Pre-flight, no block", async ({ browser }) => {
  const person = freshEmployee();
  const week = roundWeek(800);
  const [monday, friday] = sql(`select tests.week(${week}) || ' ' || (tests.week(${week}) + 4);`).split(" ") as [string, string];
  const requestId = last(sql(`
    select public.ask_time_off_service(tests.user('${world.run}:${person.label}'), tests.id('${world.run}'), 'vacation',
      '${friday}'::date, '${friday}'::date, true, null, null, null,
      (select l.timezone from public.locations l where l.id = tests.id('${world.run}:K')), gen_random_uuid()) ->> 'id';`));

  // Without the flag: today's grid, nothing new.
  const plain = await ayse(browser, false);
  await plain.goto(`/app/schedule?date=${monday}`);
  await expect(cell(plain, person.id, friday)).toBeVisible();
  await expect(plain.locator("[data-pending-time-off='true']")).toHaveCount(0);
  await plain.context().close();

  const page = await ayse(browser, true);
  // The published week shows nothing; editing it does.
  await page.goto(`/app/schedule?date=${monday}`);
  await expect(cell(page, person.id, friday)).toBeVisible();
  await expect(cell(page, person.id, friday)).not.toHaveAttribute("data-pending-time-off", "true");
  await editBlankWeek(page, monday);
  const fridayCell = cell(page, person.id, friday);
  await expect(fridayCell).toHaveAttribute("data-pending-time-off", "true");
  await expect(page.locator(`[data-pending-time-off='true'][data-employee-id="${person.id}"]`)).toHaveCount(1);
  // Not approved time off: no red cell, and Add shift is there.
  await expect(fridayCell).not.toHaveAttribute("data-availability-kind", "time_off");

  const ring = page.getByRole("button", { name: `${person.name}: time off waiting for an answer on ${weekdayDate(friday)}`, exact: true });
  // Its window closes on any scroll (Mert, 2026-10-09): a row below the fold is brought into view first,
  // or the scroll of the click itself closes the window it opened.
  await ring.scrollIntoViewIfNeeded();
  await ring.click();
  await expect(page.getByRole("dialog", { name: `${person.name}: time off waiting for an answer on ${weekdayDate(friday)}` }))
    .toContainText(`Time off waiting for an answer: ${weekdayDate(friday)}, all day`);
  await page.keyboard.press("Escape");

  // Writing a shift there asks nothing; the short notice says why to look.
  const add = page.getByRole("button", { name: `Add shift for ${person.name} at Kadikoy on ${friday}`, exact: true });
  await add.hover({ force: true });
  await add.click();
  const editor = page.getByRole("dialog", { name: "Add shift", exact: true });
  await editor.getByLabel("Start time").fill("9:00 AM");
  await editor.getByLabel("End time").fill("3:00 PM");
  await editor.getByRole("button", { name: "Add shift", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Shift conflict", exact: true })).toHaveCount(0);
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: `Shift added to ${person.name}.` }))
    .toContainText(`${person.first} has time off waiting for an answer on ${weekdayDate(friday)}.`);
  await expect(fridayCell.locator("[data-shift-badge]")).toBeVisible();

  // Pre-flight: a note with a way to the request; publishing is not held.
  await page.getByRole("button", { name: /^(?:Save draft|Publish)$/ }).first().click();
  await page.getByLabel("Draft name").fill(draftName("Pending time off"));
  await page.getByRole("button", { name: "Save As", exact: true }).click();
  await expect(page).not.toHaveURL(/mode=edit/);
  await page.getByRole("button", { name: "Publish", exact: true }).first().click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Ready to publish")).toBeVisible();
  await expect(page.getByText(`${person.name} has time off waiting for a decision on`)).toBeVisible();
  await expect(page.getByRole("link", { name: `Review ${person.name}'s time off request` }))
    .toHaveAttribute("href", `/app/schedule/requests?type=time_off&request=${requestId}`);
  const publish = page.getByRole("button", { name: /^Publish 1 location$/ });
  await expect(publish).toBeEnabled();
  await publish.click();
  await expect.poll(() => sql(`select count(*) from public.schedule_published_shifts s
    join public.schedule_location_publications p on p.id = s.publication_id and p.status = 'current'
    where s.employee_id = '${person.id}' and s.scheduled_date = '${friday}';`)).toBe("1");
  // Still waiting: publishing answered nothing.
  expect(sql(`select status from public.time_off_requests where id = '${requestId}';`)).toBe("pending");
});
