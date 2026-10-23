import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { roundLabel, roundWeek } from "../fixtures/world";
import { psql } from "../global-setup";

// Time off rebuild D3 (KARARLAR S-239): behind the time-off-v2 flag, an employee asks for time off in
// Employee Hub → My Availability → Time off; Ayse, Kadikoy's manager, answers it in Requests → Time off.
// Approving opens the employee's published shift in those days; the employee sees Approved, and a decline
// with its note. Fresh employees at Kadikoy, so no other spec's time off is theirs; their days are a week
// about two years out (tests.week), whenever the run is.

const world: { readonly run: string; readonly password: string; readonly emails: Record<string, string> } = JSON.parse(
  readFileSync(new URL("../.world.json", import.meta.url), "utf8"),
);
const sql = (query: string) => execSync(psql, { input: query, encoding: "utf8" }).trim();
const last = (text: string) => text.split(/\r?\n/).at(-1)!;

function freshEmployee() {
  const label = `toans${Math.random().toString(36).slice(2, 7)}`;
  const email = last(
    sql(`
    select tests.person('${world.run}', '${label}', 'employee', array['K'], array['cook']);
    select tests.password('${world.run}:${label}', '${world.password}');`),
  );
  const name = `${label.charAt(0).toUpperCase()}${label.slice(1)} Person`;
  return { label, email, name };
}

async function signInWithFlag(browser: Browser, email: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => window.localStorage.setItem("newfork:time-off-v2", "1"));
  const page = await context.newPage();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(world.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
  return page;
}

async function askForDays(page: Page, first: string, lastDay: string) {
  await page.goto("/app/employee-hub/my-availability?section=time-off");
  const panel = page.getByRole("region", { name: "Time off" });
  await panel.getByRole("button", { name: "Request time off" }).click();
  const form = page.getByRole("dialog", { name: "Request time off" });
  await form.getByRole("radio", { name: /Vacation/ }).check();
  await form.getByLabel("First day").fill(first);
  await form.getByLabel("Last day").fill(lastDay);
  await form.getByRole("button", { name: "Send request" }).click();
  await expect(form).toBeHidden();
  return panel;
}

async function openForAyse(browser: Browser, name: string) {
  const page = await signInWithFlag(browser, world.emails.ayse!);
  await page.goto("/app/schedule/requests?type=time_off");
  await page.getByRole("row", { name: new RegExp(`${name} asks for vacation`) }).click();
  const drawer = page.getByRole("dialog", { name: "Review time off" });
  await expect(drawer.getByText("Needs decision")).toBeVisible();
  return { page, drawer };
}

test("a manager approves time off, the shift in it goes to open shifts, and the employee sees Approved", async ({ browser }) => {
  const { label, email, name } = freshEmployee();
  const week = roundWeek(790);
  const shiftLabel = roundLabel(`${label}-tue`);
  const [tuesday, wednesday] = sql(`select (tests.week(${week}) + 1) || ' ' || (tests.week(${week}) + 2);`).split(" ") as [string, string];
  sql(`select tests.publish_week('${world.run}', ${week}, '[
    {"label": "${shiftLabel}", "person": "${label}", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"}
  ]');`);

  const employee = await signInWithFlag(browser, email);
  const panel = await askForDays(employee, tuesday, wednesday);
  await expect(panel.getByRole("row", { name: /Vacation/ })).toContainText("Pending");

  const { drawer } = await openForAyse(browser, name);
  await expect(drawer.getByText("Approving opens 1 shift.")).toBeVisible();
  await drawer.getByRole("tab", { name: /Shifts/ }).click();
  // The drawer's head names the person's locations too; the shift's own location is in the Shifts panel.
  await expect(drawer.getByRole("tabpanel", { name: /Shifts/ }).getByText("Kadikoy")).toBeVisible();
  await drawer.getByRole("button", { name: "Approve", exact: true }).click();
  const confirm = drawer.page().getByRole("alertdialog", { name: "Approve time off?" });
  await expect(confirm).toContainText("1 shift goes to open shifts.");
  await confirm.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(drawer.getByText("Approved. 1 shift went to open shifts.")).toBeVisible();

  expect(
    sql(`select r.status || ' ' || (s.employee_id is null) from public.time_off_requests r, public.schedule_published_shifts s
         where r.employee_id = tests.id('${world.run}:${label}') and s.id = tests.id('${world.run}:shift:${shiftLabel}');`),
  ).toBe("approved true");

  await employee.reload();
  const row = employee.getByRole("region", { name: "Time off" }).getByRole("row", { name: /Vacation/ });
  await expect(row).toContainText("Approved");
  await row.click();
  await expect(employee.getByRole("dialog", { name: "Time off" }).getByText("Ayse Person", { exact: false })).toBeVisible();
});

test("a manager declines time off with two clicks and a note, and the employee sees why", async ({ browser }) => {
  const { label, email, name } = freshEmployee();
  const thursday = sql(`select (tests.week(${roundWeek(790)}) + 3)::text;`);

  const employee = await signInWithFlag(browser, email);
  await askForDays(employee, thursday, thursday);

  const { drawer } = await openForAyse(browser, name);
  await drawer.getByRole("textbox", { name: /Note to/ }).fill("We are short that day.");
  await drawer.getByRole("button", { name: "Decline", exact: true }).click();
  await drawer.getByRole("button", { name: "Confirm decline", exact: true }).click();
  await expect(drawer.getByText("Declined.", { exact: true })).toBeVisible();
  expect(
    sql(`select status || ' ' || decision_note from public.time_off_requests where employee_id = tests.id('${world.run}:${label}');`),
  ).toBe("declined We are short that day.");

  await employee.reload();
  const panel = employee.getByRole("region", { name: "Time off" });
  await panel.getByRole("tab", { name: /Past/ }).click();
  await panel.getByRole("row", { name: /Vacation/ }).click();
  await expect(employee.getByRole("dialog", { name: "Time off" })).toContainText("We are short that day.");
});
