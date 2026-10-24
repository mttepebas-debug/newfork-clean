import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { roundLabel, roundWeek } from "../fixtures/world";
import { psql } from "../global-setup";
import { pickDays } from "../fixtures/time-off";

// Time off rebuild D5 (KARARLAR S-239 (1), (6)): Ayse, Kadikoy's manager, adds
// approved time off for a fresh employee at Kadikoy from Requests → Time off → Add time off, from today to
// tomorrow. It is a record, not a request: approved at once, and the employee's published shift tomorrow goes
// to open shifts. The employee reads it as approved, added by Ayse, in Employee Hub → My Availability → Time off.

const world: { readonly run: string; readonly password: string; readonly emails: Record<string, string> } = JSON.parse(
  readFileSync(new URL("../.world.json", import.meta.url), "utf8"),
);
const sql = (query: string) => execSync(psql, { input: query, encoding: "utf8" }).trim();
const last = (text: string) => text.split(/\r?\n/).at(-1)!;

function freshEmployee() {
  const label = `maria${Math.random().toString(36).slice(2, 7).replace(/[0-9]/g, "x")}`;
  const email = last(
    sql(`
    select tests.person('${world.run}', '${label}', 'employee', array['K'], array['cook']);
    select tests.password('${world.run}:${label}', '${world.password}');`),
  );
  const name = `${label.charAt(0).toUpperCase()}${label.slice(1)} Person`;
  return { label, email, name, first: name.split(" ")[0]! };
}

async function signInWithFlag(browser: Browser, email: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(world.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
  return page;
}

test("a manager adds time off for an employee from today; the shift goes to open shifts and the employee reads it", async ({ browser }) => {
  const { label, email, name, first } = freshEmployee();
  const shiftLabel = roundLabel(`${label}-tomorrow`);
  sql(`select tests.publish_week('${world.run}', ${roundWeek(793)}, '[
    {"label": "${shiftLabel}", "person": "${label}", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"}
  ]');`);
  // ponytail: a publish is for the weeks ahead; the shift is moved to tomorrow at Kadikoy by hand, past the
  // assignment guard, which would ask for a fresh acceptance of the moved shift.
  const [today, tomorrow] = last(
    sql(`set session_replication_role = replica;
      update public.schedule_published_shifts s
      set scheduled_date = (now() at time zone l.timezone)::date + 1
      from public.locations l
      where s.id = tests.id('${world.run}:shift:${shiftLabel}') and l.id = s.location_id;
      set session_replication_role = origin;
      select (now() at time zone l.timezone)::date || ' ' || ((now() at time zone l.timezone)::date + 1)
      from public.locations l where l.id = tests.id('${world.run}:K');`),
  ).split(" ") as [string, string];

  const manager = await signInWithFlag(browser, world.emails.ayse!);
  await manager.goto("/app/schedule/requests?type=time_off");
  await manager.getByRole("button", { name: "Add time off" }).click();
  const drawer = manager.getByRole("dialog", { name: "Add time off" });
  await drawer.getByRole("combobox", { name: "Employee" }).selectOption({ label: name });
  await drawer.getByRole("radio", { name: /Sick/ }).check();
  await pickDays(drawer, "First day", today, tomorrow);
  await drawer.getByRole("textbox", { name: new RegExp(`Note for ${first}`) }).fill("Doctor said rest.");
  await expect(drawer.getByText("1 shift goes to open shifts")).toBeVisible();
  await drawer.getByRole("button", { name: "Add time off", exact: true }).click();
  const confirm = drawer.getByRole("alertdialog", { name: `Add time off for ${first}?` });
  await expect(confirm).toContainText("1 shift goes to open shifts.");
  await confirm.getByRole("button", { name: "Add time off", exact: true }).click();

  const review = manager.getByRole("dialog", { name: "Review time off" });
  await expect(review).toContainText(/Added by /);
  await expect(review).toContainText("Approved");

  expect(
    sql(`select r.status || ' ' || (r.created_by = r.decided_by) || ' ' || (s.employee_id is null)
         from public.time_off_requests r, public.schedule_published_shifts s
         where r.employee_id = tests.id('${world.run}:${label}') and s.id = tests.id('${world.run}:shift:${shiftLabel}');`),
  ).toBe("approved true true");

  const employee = await signInWithFlag(browser, email);
  await employee.goto("/app/employee-hub/my-availability?section=time-off");
  const panel = employee.getByRole("region", { name: "Time off" });
  await expect(panel.getByRole("row", { name: /Sick/ })).toContainText("Approved");
  await panel.getByRole("row", { name: /Sick/ }).click();
  const detail = employee.getByRole("dialog", { name: "Time off" });
  await expect(detail.locator(".tor-steps")).toContainText(/Added by .+ on /);
  await expect(detail).toContainText("Doctor said rest.");
});
