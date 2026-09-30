import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { psql } from "../global-setup";
import { emailOf, signIn, type Person } from "../fixtures/world";

// FOUNDATION-B FB-6.2.10, flow 2 (FB-6.2 "Done when" 8): a manager invites
// somebody who works at her own location, the invited person accepts through
// the link, and the Employees list shows them on board. Somebody who works
// only at another location is out of her reach: the API answers 403.
//
// Each test files its own record, so a rerun never meets the last run's
// invitation. The owner files it without an invitation; inviting is the
// manager's part.

const world: { readonly run: string; readonly password: string } = JSON.parse(
  readFileSync(new URL("../.world.json", import.meta.url), "utf8"),
);
const run = world.run;

function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

const tag = (): string => Math.random().toString(36).slice(2, 7);

/** An employee record nobody has invited yet, working at one location. */
function uninvitedRecord(firstName: string, loc: "K" | "B"): string {
  return sql(`
    select public.create_employee_command_service(
      tests.user('${run}:owner'), tests.id('${run}'), gen_random_uuid(),
      jsonb_build_object(
        'first_name', '${firstName}', 'middle_name', '', 'last_name', 'Invitee', 'preferred_name', '',
        'invitation_email', '', 'start_date', '', 'internal_note', '',
        'location_ids', jsonb_build_array(tests.id('${run}:${loc}')),
        'primary_location_id', tests.id('${run}:${loc}'),
        'job_ids', jsonb_build_array(tests.id('${run}:job:cook')),
        'primary_job_id', tests.id('${run}:job:cook'),
        'is_remote', false, 'is_excluded_from_schedule', false, 'expected_revision', null),
      null) ->> 'id';`);
}

/** An account with a confirmed email and no workspace yet; returns its email. */
function accountWithoutWorkspace(label: string): string {
  return sql(`
    select tests.new_user('${run}:${label}', 'Ilk Invitee');
    select tests.password('${run}:${label}', '${world.password}');`)
    .split(/\r?\n/)
    .at(-1)!;
}

/** An access token for a person of the world, straight from the auth server. */
async function tokenOf(person: Person): Promise<string> {
  const response = await fetch(`${process.env.E2E_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: process.env.E2E_ANON_KEY ?? "", "Content-Type": "application/json" },
    body: JSON.stringify({ email: emailOf(person), password: world.password }),
  });
  const body = (await response.json()) as { access_token?: string };
  if (!response.ok || !body.access_token) throw new Error(`sign-in failed (${response.status})`);
  return body.access_token;
}

const invitationsOf = (employeeId: string): string =>
  sql(`select count(*) from public.employee_invitations where employee_id = '${employeeId}';`);

test("a manager invites somebody at her own location, they accept, and the list shows them on board", async ({
  browser,
}) => {
  const firstName = `Inv${tag()}`;
  const name = `${firstName} Invitee`;
  uninvitedRecord(firstName, "K");
  const inviteeEmail = accountWithoutWorkspace(`invitee-${firstName}`);

  const ayse = await (await browser.newContext()).newPage();
  await signIn(ayse, "ayse");
  await expect(ayse).not.toHaveURL(/\/sign-in/);
  await ayse.goto("/app/employees");
  const row = ayse.getByRole("row", { name: new RegExp(name) });
  await expect(row.getByText("Not Invited", { exact: true })).toBeVisible();

  // The invitation goes out from the record's own drawer: the address in
  // Profile, the role and Invite in the footer. The name opens Profile; the
  // location and job cells open Employment.
  await row.getByText(name, { exact: true }).click();
  const drawer = ayse.getByRole("dialog", { name });
  await drawer.getByLabel("E-mail").fill(inviteeEmail);
  await drawer.getByLabel("Invite role").selectOption({ label: "Employee" });
  await drawer.getByRole("button", { name: "Invite", exact: true }).click();
  // No email leaves a local run; the drawer hands over the link the email
  // would have carried.
  const link = await drawer.getByRole("link", { name: "Open acceptance link" }).getAttribute("href");
  expect(link).toContain("/invite/accept?token=");
  await expect(row.getByText("Invited", { exact: true })).toBeVisible();

  // The invited person opens the link signed out. It offers a new account
  // first; this one already has theirs, so they sign in and accept.
  const invitee = await (await browser.newContext()).newPage();
  await invitee.goto(link!);
  await invitee.getByRole("button", { name: "I already have an account", exact: true }).click();
  await invitee.getByLabel("Email").fill(inviteeEmail);
  await invitee.getByLabel("Password").fill(world.password);
  await invitee.getByRole("button", { name: "Sign in", exact: true }).click();
  await invitee.getByRole("button", { name: "Accept invitation", exact: true }).click();
  await expect(invitee.getByRole("heading", { name: "You're in" })).toBeVisible();

  await ayse.goto("/app/employees");
  await expect(
    ayse.getByRole("row", { name: new RegExp(name) }).getByText("Onboarding", { exact: true }),
  ).toBeVisible();
});

test("a manager's invitation for somebody at another location is refused with 403", async () => {
  const employeeId = uninvitedRecord(`Far${tag()}`, "B");
  const ids: { readonly workspace: string; readonly role: string } = JSON.parse(
    sql(`select json_build_object(
      'workspace', tests.id('${run}'),
      'role', (select id from public.workspace_roles
               where workspace_id = tests.id('${run}') and system_key = 'employee'))::text;`),
  );
  const invite = async (person: Person) =>
    fetch(`${process.env.E2E_API_URL}/v1/workspaces/${ids.workspace}/employees/${employeeId}/invitations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await tokenOf(person)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: `far-${tag()}@world.test`, roleId: ids.role }),
    });

  // Ayse manages Kadikoy; the record works at Besiktas only.
  expect((await invite("ayse")).status).toBe(403);
  expect(invitationsOf(employeeId)).toBe("0");

  // The same request from an admin goes through: it was the location that
  // refused Ayse, not the request.
  expect((await invite("zeynep")).status).toBe(200);
  expect(invitationsOf(employeeId)).toBe("1");
});
