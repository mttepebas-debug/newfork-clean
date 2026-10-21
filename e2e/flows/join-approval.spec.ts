import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { password } from "../global-setup";
import { signIn } from "../fixtures/world";
import { lastLine, ownerWithPassword, run, signInAs, sql, tag } from "../fixtures/documents";

// KATILIM-ONAY (KARARLAR S-231, Mert 2026-10-21): Settings > General, "New people wait for approval".
// On, somebody who finishes onboarding waits until a manager approves them from their drawer; off, the
// people waiting only for approval are let in at once. The test world has it off (tests.world); each
// test here turns it back off, so the specs after it find the world as it was.

const switchName = "New people wait for approval";

test.afterEach(() => {
  sql(`select public.set_onboarding_approval_service(tests.user('${run}:owner'), tests.id('${run}'), false);`);
});

/** Somebody added at Kadikoy as a cook who accepted the invitation; returns their email and record. */
function joined(key: string, firstName: string): { email: string; employeeId: string } {
  const email = lastLine(
    sql(`
    select tests.new_user('${run}:${key}', '${firstName} Person');
    select tests.password('${run}:${key}', '${password}');`),
  );
  const employeeId = lastLine(
    sql(`
    with created as (
      select public.create_employee_command_service(
        tests.user('${run}:owner'), tests.id('${run}'), gen_random_uuid(),
        jsonb_build_object(
          'first_name', '${firstName}', 'middle_name', '', 'last_name', 'Person', 'preferred_name', '',
          'invitation_email', '${email}', 'start_date', '', 'internal_note', '',
          'location_ids', jsonb_build_array(tests.id('${run}:K')),
          'primary_location_id', tests.id('${run}:K'),
          'job_ids', jsonb_build_array(tests.id('${run}:job:cook')),
          'primary_job_id', tests.id('${run}:job:cook'),
          'is_remote', false, 'is_excluded_from_schedule', false, 'expected_revision', null),
        jsonb_build_object('employee_role_id', (select id from public.workspace_roles
         where workspace_id = tests.id('${run}') and system_key = 'employee'),
         'management_role_id', null, 'managed_location_ids', '[]'::jsonb)) as employee
    )
    select public.accept_employee_invitation_by_id_service(
      tests.user('${run}:${key}'), (employee ->> 'invitation_id')::uuid) is not null from created;
    select tests.settle();
    select id from public.employee_profiles where workspace_id = tests.id('${run}') and user_id = tests.user('${run}:${key}');`),
  );
  return { email, employeeId };
}

/** They finish onboarding: their details as invited, then Submit (the way the test world's people do). */
function finishes(key: string, firstName: string): void {
  sql(`
    select public.save_employee_onboarding_profile_service(
      tests.user('${run}:${key}'),
      jsonb_build_object('legal_first_name', '${firstName}', 'legal_last_name', 'Person',
        'phone', tests.phone('${run}:${key}'), 'emergency_contact_name', 'Contact',
        'emergency_contact_relationship', 'Friend', 'emergency_contact_phone', '+14155550100'),
      (select c.revision from public.employee_onboarding_cases c
       join public.employee_profiles e on e.id = c.employee_id
       where e.workspace_id = tests.id('${run}') and e.user_id = tests.user('${run}:${key}')),
      tests.id('${run}'));
    select public.submit_employee_onboarding_service(
      tests.user('${run}:${key}'),
      (select c.revision from public.employee_onboarding_cases c
       join public.employee_profiles e on e.id = c.employee_id
       where e.workspace_id = tests.id('${run}') and e.user_id = tests.user('${run}:${key}')),
      tests.id('${run}'));
    select tests.settle();`);
}

const membership = (key: string): string =>
  lastLine(
    sql(`select status from public.workspace_memberships
      where workspace_id = tests.id('${run}') and user_id = tests.user('${run}:${key}');`),
  );

const approvalRequired = (): string =>
  lastLine(sql(`select public.employee_onboarding_final_approval_required(tests.id('${run}'));`));

/** The owner's Settings > General, the switch as it stands. */
async function generalAsOwner(page: Page) {
  await signInAs(page, ownerWithPassword());
  await page.goto("/app/settings/general");
  return page.getByRole("switch", { name: switchName });
}

test("with the switch on, somebody who finishes onboarding waits until a manager approves them", async ({ browser }) => {
  // The owner turns it on in Settings > General.
  const owner = await (await browser.newContext()).newPage();
  const toggle = await generalAsOwner(owner);
  await expect(toggle).not.toBeChecked();
  await expect(owner.getByText("New people start as soon as they finish their required details and documents.")).toBeVisible();
  await toggle.click();
  await expect(owner.getByText("New people now wait for approval.")).toBeVisible();
  await expect(toggle).toBeChecked();
  await expect(
    owner.getByText(
      "New people finish their required details and documents first. A manager then approves them, and their schedule opens.",
    ),
  ).toBeVisible();
  await expect.poll(approvalRequired).toBe("t");

  // Somebody new finishes onboarding: they wait, the workspace stays closed.
  const key = `ja${tag()}`;
  const firstName = `Ja${tag()}`;
  const { email, employeeId } = joined(key, firstName);
  finishes(key, firstName);
  expect(membership(key)).toBe("pending_activation");
  const person = await (await browser.newContext()).newPage();
  await signInAs(person, email);
  await person.goto("/app/schedule");
  await expect(person).toHaveURL(/\/workspaces$/);

  // Ayse, a Kadikoy manager, approves them from their drawer.
  const ayse = await (await browser.newContext()).newPage();
  await signIn(ayse, "ayse");
  await expect(ayse).not.toHaveURL(/\/sign-in/);
  await ayse.goto(`/app/employees?employeeId=${employeeId}&section=profile`);
  const drawer = ayse.getByRole("dialog", { name: `${firstName} Person` });
  await expect(drawer.getByRole("heading", { name: "Waiting for approval" })).toBeVisible();
  await drawer.getByRole("button", { name: "Approve", exact: true }).click();
  await expect.poll(() => membership(key)).toBe("active");

  // And they are in.
  await person.goto("/app/employee-hub");
  await expect(person).toHaveURL(/\/app\/employee-hub/);
});

test("turning the switch off lets in whoever waits only for approval", async ({ page }) => {
  sql(`select public.set_onboarding_approval_service(tests.user('${run}:owner'), tests.id('${run}'), true);`);
  const key = `jo${tag()}`;
  const firstName = `Jo${tag()}`;
  joined(key, firstName);
  finishes(key, firstName);
  expect(membership(key)).toBe("pending_activation");

  const toggle = await generalAsOwner(page);
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(page.getByText("New people now start when they finish onboarding.")).toBeVisible();
  await expect(toggle).not.toBeChecked();
  await expect.poll(() => membership(key)).toBe("active");
  expect(approvalRequired()).toBe("f");
});
