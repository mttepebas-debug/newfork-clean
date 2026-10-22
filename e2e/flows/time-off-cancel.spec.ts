import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { roundLabel, roundWeek } from "../fixtures/world";
import { psql } from "../global-setup";

// Time off rebuild D4 (KARARLAR S-239 (4), (6)): behind the time-off-v2 flag. An employee asks to cancel
// approved time off in Employee Hub → My Availability → Time off; Ayse, Kadikoy's manager, approves the
// cancellation in Requests → Time off and the rest of the time off goes, while the shift its approval opened
// stays open. Ayse also revokes approved time off with a note, and the employee reads it. Fresh employees at
// Kadikoy; their days are a week about two years out (tests.week), whenever the run is. The time off is
// asked and approved through the services (D2 and D3 have their own flows).

const world: { readonly run: string; readonly password: string; readonly emails: Record<string, string> } = JSON.parse(
  readFileSync(new URL("../.world.json", import.meta.url), "utf8"),
);
const sql = (query: string) => execSync(psql, { input: query, encoding: "utf8" }).trim();
const last = (text: string) => text.split(/\r?\n/).at(-1)!;

function freshEmployee() {
  const label = `tocan${Math.random().toString(36).slice(2, 7)}`;
  const email = last(
    sql(`
    select tests.person('${world.run}', '${label}', 'employee', array['K'], array['cook']);
    select tests.password('${world.run}:${label}', '${world.password}');`),
  );
  const name = `${label.charAt(0).toUpperCase()}${label.slice(1)} Person`;
  return { label, email, name, first: name.split(" ")[0]! };
}

/** Approved time off on the given days: asked as the employee, then approved as Ayse on the shifts it opens. */
function approvedTimeOff(label: string, first: string, lastDay: string): string {
  const id = last(
    sql(`select public.ask_time_off_service(tests.user('${world.run}:${label}'), tests.id('${world.run}'), 'vacation',
      '${first}'::date, '${lastDay}'::date, true, null, null, 'Family visit',
      app_private.time_off_timezone(tests.id('${world.run}'), tests.id('${world.run}:${label}')), gen_random_uuid()) ->> 'id';`),
  );
  sql(`select public.answer_time_off_service(tests.user('${world.run}:ayse'), tests.id('${world.run}'), r.id, 'approve', null, r.revision,
      app_private.time_off_shifts_print(app_private.time_off_shifts_at_stake(r)))
    from public.time_off_requests r where r.id = '${id}';`);
  return id;
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

test("an employee asks to cancel approved time off; the manager approves and the shift stays open", async ({ browser }) => {
  const { label, email, name, first } = freshEmployee();
  const week = roundWeek(791);
  const shiftLabel = roundLabel(`${label}-tue`);
  const [tuesday, wednesday] = sql(`select (tests.week(${week}) + 1) || ' ' || (tests.week(${week}) + 2);`).split(" ") as [string, string];
  sql(`select tests.publish_week('${world.run}', ${week}, '[
    {"label": "${shiftLabel}", "person": "${label}", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"}
  ]');`);
  const leaveId = approvedTimeOff(label, tuesday, wednesday);

  const employee = await signInWithFlag(browser, email);
  await employee.goto("/app/employee-hub/my-availability?section=time-off");
  const panel = employee.getByRole("region", { name: "Time off" });
  await expect(panel.getByRole("row", { name: /Vacation/ })).toContainText("Approved");
  await panel.getByRole("button", { name: /^Actions for Vacation/ }).click();
  await employee.getByRole("menuitem", { name: "Ask to cancel" }).click();
  const detail = employee.getByRole("dialog", { name: "Time off" });
  await detail.getByRole("textbox", { name: /Why do you want to cancel\?/ }).fill("Plans changed");
  await detail.getByRole("button", { name: "Send cancellation request" }).click();
  await expect(detail.getByText("Cancellation asked")).toBeVisible();
  await expect(detail.getByRole("button", { name: "Withdraw cancellation" })).toBeVisible();

  const manager = await signInWithFlag(browser, world.emails.ayse!);
  await manager.goto("/app/schedule/requests?type=time_off");
  await manager.getByRole("row", { name: new RegExp(`${name} asks to cancel time off`) }).click();
  const drawer = manager.getByRole("dialog", { name: "Review time off" });
  await expect(drawer.getByText("Plans changed")).toBeVisible();
  await drawer.getByRole("button", { name: "Approve", exact: true }).click();
  const confirm = manager.getByRole("alertdialog", { name: `Cancel ${first}'s time off?` });
  await expect(confirm).toContainText("The rest of the time off is removed. Shifts that went to open shifts stay open.");
  await confirm.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(drawer.getByText("Approved. The rest of the time off is removed.")).toBeVisible();

  expect(
    sql(`select r.status || ' ' || isempty(r.effective) || ' ' || (s.employee_id is null)
         from public.time_off_requests r, public.schedule_published_shifts s
         where r.id = '${leaveId}' and s.id = tests.id('${world.run}:shift:${shiftLabel}');`),
  ).toBe("cancelled true true");

  await employee.reload();
  await panel.getByRole("tab", { name: /Past/ }).click();
  await panel.getByRole("row", { name: /Vacation/ }).click();
  const ended = employee.getByRole("dialog", { name: "Time off" });
  await expect(ended.locator(".tor-steps")).toContainText("Cancelled");
  await expect(ended).toContainText("Shifts that went to open shifts stay open.");
});

test("a manager revokes approved time off with a note, and the employee reads it", async ({ browser }) => {
  const { label, email, name, first } = freshEmployee();
  const thursday = sql(`select (tests.week(${roundWeek(791)}) + 3)::text;`);
  const leaveId = approvedTimeOff(label, thursday, thursday);

  const manager = await signInWithFlag(browser, world.emails.ayse!);
  await manager.goto("/app/schedule/requests?type=time_off");
  await manager.getByRole("row", { name: new RegExp(`${name} asks for vacation`) }).click();
  const drawer = manager.getByRole("dialog", { name: "Review time off" });
  const revoke = drawer.getByRole("button", { name: "Revoke", exact: true });
  await expect(revoke).toBeDisabled();
  await drawer.getByRole("textbox", { name: /Why are you revoking it\?/ }).fill("Inventory day, everyone is needed.");
  await revoke.click();
  await drawer.getByRole("button", { name: "Confirm revoke", exact: true }).click();
  await expect(drawer.getByText(`Revoked. ${first} is told.`)).toBeVisible();
  expect(sql(`select status || ' ' || isempty(effective) || ' ' || ended_note from public.time_off_requests where id = '${leaveId}';`)).toBe(
    "revoked true Inventory day, everyone is needed.",
  );

  const employee = await signInWithFlag(browser, email);
  await employee.goto("/app/employee-hub/my-availability?section=time-off");
  const panel = employee.getByRole("region", { name: "Time off" });
  await panel.getByRole("tab", { name: /Past/ }).click();
  await panel.getByRole("row", { name: /Vacation/ }).click();
  await expect(employee.getByRole("dialog", { name: "Time off" })).toContainText("Inventory day, everyone is needed.");
});
