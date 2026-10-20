import { expect, test } from "../fixtures/test";
import { lastLine, personWithPassword, run, signInAs, sql, tag } from "../fixtures/documents";

// AVATAR-IKON 5.1 (Mert, 19 Oct: B): the avatar is one per workspace, and a new workspace's
// onboarding starts with the last one the person used. Kept unless they change it.

test("a second workspace's onboarding starts with the last avatar", async ({ page }) => {
  const key = `oav${tag()}`;
  const second = `${run}${key}`;

  // Active in this run's world with the Shaker drawing as their avatar there.
  const email = personWithPassword(key, "employee", ["K"], "server");
  sql(`select public.save_own_avatar_service(
    tests.user('${run}:${key}'), tests.id('${run}'), '{"art_key": "003-bartender"}'::jsonb);`);

  // A second workspace invites the same account; they accept and have not onboarded there yet.
  const secondId = lastLine(
    sql(`
    select tests.world('${second}');
    select public.accept_employee_invitation_by_id_service(tests.user('${run}:${key}'), ((
      public.create_employee_command_service(
        tests.user('${second}:owner'), tests.id('${second}'), gen_random_uuid(),
        jsonb_build_object(
          'first_name', 'Oav', 'middle_name', '', 'last_name', 'Person', 'preferred_name', '',
          'invitation_email', '${email}', 'start_date', '', 'internal_note', '',
          'location_ids', jsonb_build_array(tests.id('${second}:K')), 'primary_location_id', tests.id('${second}:K'),
          'job_ids', jsonb_build_array(tests.id('${second}:job:cook')), 'primary_job_id', tests.id('${second}:job:cook'),
          'is_remote', false, 'is_excluded_from_schedule', false, 'expected_revision', null),
        (select r.id from public.workspace_roles r where r.workspace_id = tests.id('${second}') and r.system_key = 'employee'))
    ) ->> 'invitation_id')::uuid);
    select tests.settle();
    select tests.id('${second}');`),
  );
  const membership = lastLine(
    sql(`select m.id from public.workspace_memberships m
      where m.workspace_id = '${secondId}' and m.user_id = tests.user('${run}:${key}');`),
  );

  await signInAs(page, email);
  await page.goto(`/welcome/${secondId}/profile`);
  await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();
  const box = page.getByRole("group", { name: "Your avatar" });
  await expect(
    box.getByText(`From your World ${run} profile. It will be your avatar here too, unless you change it.`),
  ).toBeVisible();
  await expect(box.getByRole("button", { name: "Change" })).toBeVisible();
  await expect(box.getByRole("button", { name: "Add avatar" })).toHaveCount(0);
  // Offered, not kept yet: nothing is saved here before the profile is.
  expect(sql(`select count(*) from public.member_avatars where membership_id = '${membership}';`)).toBe("0");

  await page.getByLabel("Legal first name", { exact: true }).fill("Oav");
  await page.getByLabel("Legal last name", { exact: true }).fill("Person");
  const phone = page.getByLabel("Phone", { exact: true });
  // An account that has a phone shows it read-only (BL-335).
  if (await phone.isEditable()) await phone.fill(`415${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`);
  await page.getByLabel("Date of birth", { exact: true }).fill("1996-04-12");
  await page.getByLabel("Street address", { exact: true }).fill("12 Moda Cd");
  await page.getByLabel("City", { exact: true }).fill("Istanbul");
  await page.getByLabel("State", { exact: true }).fill("Istanbul");
  await page.getByLabel("ZIP code", { exact: true }).fill("34710");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Who we call in an emergency" })).toBeVisible();
  await page.getByLabel("Full name", { exact: true }).fill("Deniz Contact");
  await page.getByLabel("Relationship", { exact: true }).selectOption("Friend");
  await page.getByLabel("Phone", { exact: true }).fill("4155550100");
  await page.getByRole("button", { name: "Save and continue" }).click();

  // The wizard moves on by itself once the save lands; then the drawing is this workspace's too.
  await expect(page).not.toHaveURL(/\/profile(\/emergency)?$/);
  await expect
    .poll(() => sql(`select art_key from public.member_avatars where membership_id = '${membership}';`))
    .toBe("003-bartender");
});
