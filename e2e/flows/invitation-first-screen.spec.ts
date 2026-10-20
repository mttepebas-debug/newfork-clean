import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "../fixtures/test";
import { psql } from "../global-setup";

// BL-624, KARARLAR "Girişten sonra yönlendirme" (view A, Mert 2026-10-05):
// a waiting invitation is the first screen of every open of the app, also for
// somebody with a workspace to land in; "every open" is every sign-in and
// every new tab (Mert, 2026-10-19). Ali works at one workspace and another
// one invites him: he sees the invitation before his work, "Not now" takes
// him to his work, a reload does not ask again, a new tab does.

const world: { readonly run: string; readonly password: string } = JSON.parse(
  readFileSync(new URL("../.world.json", import.meta.url), "utf8"),
);
const run = world.run;

function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

const tag = (): string => Math.random().toString(36).slice(2, 7);

test("a waiting invitation comes first on every open, and Not now goes to work", async ({
  page,
  context,
}) => {
  const label = `invfirst${tag()}`;
  const inviter = `${run}:inviter-${label}`;
  // Ali works at the run's world as an employee, with nothing waiting.
  const email = sql(`
    select tests.person('${run}', '${label}', 'employee');
    select tests.password('${run}:${label}', '${world.password}');
    select u.email from auth.users u where u.id = tests.user('${run}:${label}');`)
    .split(/\r?\n/)
    .at(-1)!;
  // Another workspace invites the same address.
  sql(`
    select tests.world('${inviter}');
    select public.create_employee_command_service(
      tests.user('${inviter}:owner'), tests.id('${inviter}'), gen_random_uuid(),
      jsonb_build_object(
        'first_name', 'Ali', 'middle_name', '', 'last_name', 'Invited', 'preferred_name', '',
        'invitation_email', '${email}', 'start_date', '', 'internal_note', '',
        'location_ids', jsonb_build_array(tests.id('${inviter}:K')),
        'primary_location_id', tests.id('${inviter}:K'),
        'job_ids', jsonb_build_array(tests.id('${inviter}:job:cook')),
        'primary_job_id', tests.id('${inviter}:job:cook'),
        'is_remote', false, 'is_excluded_from_schedule', false, 'expected_revision', null),
      -- An access is what makes the record send its invitation (the employee app).
      jsonb_build_object('employee_role_id', (select r.id from public.workspace_roles r
       where r.workspace_id = tests.id('${inviter}') and r.system_key = 'employee'),
       'management_role_id', null, 'managed_location_ids', '[]'::jsonb));
    select tests.settle();`);

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(world.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Active invitation found" })).toBeVisible();
  await expect(page.getByText(`World ${inviter}`, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: `Join World ${inviter}` })).toBeVisible();
  await expect(
    page.getByText(`Takes you to World ${run}. The invitation stays listed in Workspaces.`),
  ).toBeVisible();

  await page.getByRole("button", { name: "Not now", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/employee-hub/);

  // A reload is the same open: it does not ask again.
  await page.reload();
  await expect(page).toHaveURL(/\/app\/employee-hub/);
  await expect(page.getByRole("heading", { name: "Active invitation found" })).toHaveCount(0);

  // A new tab is a new open: the invitation comes first again, and Not now
  // takes it back to the page the tab asked for.
  const second = await context.newPage();
  await second.goto("/app/employee-hub");
  await expect(second.getByRole("heading", { name: "Active invitation found" })).toBeVisible();
  await expect(
    second.getByText("Takes you back to the page you opened. The invitation stays listed in Workspaces."),
  ).toBeVisible();

  // Declining the only invitation answers it: the tab goes on to that page.
  await second.getByRole("button", { name: `Decline invitation to World ${inviter}` }).click();
  await second.getByRole("button", { name: "Confirm decline" }).click();
  await expect(second).toHaveURL(/\/app\/employee-hub/);
});
