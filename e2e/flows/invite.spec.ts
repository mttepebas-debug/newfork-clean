import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "../fixtures/test";
import { psql } from "../global-setup";
import { signIn, tokenOf, type Person } from "../fixtures/world";

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

const invitationsOf = (employeeId: string): string =>
  sql(`select count(*) from public.employee_invitations where employee_id = '${employeeId}';`);

test("a manager invites somebody at her own location, they accept, and the list shows them on board", async ({
  browser,
}) => {
  const firstName = `Inv${tag()}`;
  const name = `${firstName} Invitee`;
  const employeeId = uninvitedRecord(firstName, "K");
  const inviteeEmail = accountWithoutWorkspace(`invitee-${firstName}`);

  const ayse = await (await browser.newContext()).newPage();
  await signIn(ayse, "ayse");
  await expect(ayse).not.toHaveURL(/\/sign-in/);
  await ayse.goto("/app/employees");
  const row = ayse.getByRole("row", { name: new RegExp(name) });
  await expect(row.getByText("Not Invited", { exact: true })).toBeVisible();

  // The invitation goes out from the record's own drawer: the address in
  // Profile, Invite in the footer, the access on Access (Tur 4 B): with
  // nothing chosen, Invite opens Access and asks. The name opens Profile; the
  // location and job cells open Employment.
  await row.getByText(name, { exact: true }).click();
  const drawer = ayse.getByRole("dialog", { name });
  await drawer.getByLabel("E-mail").fill(inviteeEmail);
  await drawer.getByRole("button", { name: "Invite", exact: true }).click();
  await expect(drawer.getByRole("alert").filter({ hasText: "Choose at least one access." })).toBeVisible();
  // A manager gives the employee app; the management app is not hers to give.
  await expect(drawer.getByLabel("Management app")).toBeDisabled();
  await drawer.getByLabel("Employee app").check();
  await drawer.getByRole("button", { name: "Invite", exact: true }).click();
  // No email leaves a local run; the drawer hands over the link the email
  // would have carried.
  const link = await drawer.getByRole("link", { name: "Open acceptance link" }).getAttribute("href");
  expect(link).toContain("/invite/accept?token=");
  await expect(row.getByText("Invited", { exact: true })).toBeVisible();

  // BL-1069: Access shows Ayse the invitation she sent and its buttons, though
  // her role does not read access; it no longer offers a second Invite that
  // would take the first link back.
  await ayse.goto(`/app/employees?employeeId=${employeeId}&section=access`);
  const access = ayse.getByRole("dialog", { name });
  // One line: the address, the pill and the invitation's own links.
  await expect(access.getByText("Pending", { exact: true })).toBeVisible();
  await expect(access.getByRole("button", { name: "Resend", exact: true })).toBeVisible();
  await expect(access.getByRole("button", { name: "Revoke", exact: true })).toBeVisible();
  await expect(access.getByRole("button", { name: "Invite", exact: true })).toHaveCount(0);
  await expect(access.getByLabel("Employee app")).toBeChecked();

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
      body: JSON.stringify({
        email: `far-${tag()}@world.test`,
        access: { employee_role_id: ids.role, management_role_id: null, managed_location_ids: [] },
      }),
    });

  // Ayse manages Kadikoy; the record works at Besiktas only.
  expect((await invite("ayse")).status).toBe(403);
  expect(invitationsOf(employeeId)).toBe("0");

  // The same request from an admin goes through: it was the location that
  // refused Ayse, not the request.
  expect((await invite("zeynep")).status).toBe(200);
  expect(invitationsOf(employeeId)).toBe("1");
});

// BL-922 (KARARLAR Employees S2): Resend opens a new link, and the old
// email's link then points to the newer email instead of "withdrawn". Tur 4 B
// (Mert, 2026-10-20) keeps Resend, Copy link and Revoke on Access.
test("Resend's new link leaves the old one pointing to the newer email", async ({
  browser,
}) => {
  const firstName = `Rem${tag()}`;
  const name = `${firstName} Invitee`;
  const employeeId = uninvitedRecord(firstName, "K");
  const inviteeEmail = accountWithoutWorkspace(`reminded-${firstName}`);
  const pending = (): string =>
    sql(`select token_hash || '|' || expires_at || '|' || resend_count from public.employee_invitations
         where employee_id = '${employeeId}' and status = 'pending';`);

  // An admin: the invitation's state and its links are on Access.
  const zeynep = await (await browser.newContext()).newPage();
  await signIn(zeynep, "zeynep");
  await expect(zeynep).not.toHaveURL(/\/sign-in/);
  await zeynep.goto("/app/employees");
  const row = zeynep.getByRole("row", { name: new RegExp(name) });
  await row.getByText(name, { exact: true }).click();
  let drawer = zeynep.getByRole("dialog", { name });
  // Exact: an admin also reads the Emergency e-mail field.
  await drawer.getByLabel("E-mail", { exact: true }).fill(inviteeEmail);
  await drawer.getByRole("button", { name: "Invite", exact: true }).click();
  await drawer.getByLabel("Employee app").check();
  await drawer.getByRole("button", { name: "Invite", exact: true }).click();
  const firstLink = await drawer.getByRole("link", { name: "Open acceptance link" }).getAttribute("href");
  expect(firstLink).toContain("/invite/accept?token=");
  const [hash] = pending().split("|");

  await zeynep.goto(`/app/employees?employeeId=${employeeId}&section=access`);
  drawer = zeynep.getByRole("dialog", { name });
  // Resend replaces the link; the first email's link sends the person on.
  await drawer.getByRole("button", { name: "Resend", exact: true }).click();
  await expect(drawer.getByRole("link", { name: "Open acceptance link" })).not.toHaveAttribute("href", firstLink!);
  expect(pending().split("|")[0]).not.toBe(hash);

  // The invitation page is for a signed-in account: signed out, the link
  // goes through sign-in and back.
  const invitee = await (await browser.newContext()).newPage();
  await invitee.goto(firstLink!);
  await invitee.getByRole("button", { name: "I already have an account", exact: true }).click();
  await invitee.getByLabel("Email").fill(inviteeEmail);
  await invitee.getByLabel("Password").fill(world.password);
  await invitee.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(invitee.getByRole("heading", { name: "A newer invitation was sent to you" })).toBeVisible();
  await expect(invitee.getByText("Open the latest email.")).toBeVisible();
});
