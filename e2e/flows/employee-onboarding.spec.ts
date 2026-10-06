import { expect, test, type Page } from "@playwright/test";
import { password } from "../global-setup";
import { emailOf, signIn } from "../fixtures/world";
import {
  card,
  documentManagerRole,
  lastLine,
  ownJob,
  personWithPassword,
  publishedDocument,
  run,
  signInAs,
  sql,
  standing,
  tag,
  tokenFor,
} from "../fixtures/documents";

// FOUNDATION-B flow 3 (FB-6.6 A3): somebody invited to a Kadikoy job accepts,
// fills their profile, skips availability, sends the required document and
// the whole onboarding for review. Until it is approved they see only what is
// still missing and their own notifications (KARARLAR "Kisitli kisi", D4).
// A Kadikoy manager who reviews documents approves the card (the built-in
// Manager role does not review documents); access opens and they land in the
// employee interface. Employee onboarding has no "Start over".
//
// A legal name typed differently from the invitation is approved only by an
// owner or an admin (FB-6.6 S1, Mert 2026-10-02): the manager who reviews the
// rest of the onboarding cannot approve it.

test("an invited employee onboards, waits on the document, and lands in the employee hub once it is approved", async ({
  browser,
}) => {
  const key = `onb${tag()}`;
  const firstName = `Onb${tag()}`;
  const name = `${firstName} Invitee`;
  const title = `Food handler card ${key}`;

  // A job only this person works, and the document every holder of it owes.
  const jobId = ownJob(key, `Barista ${key}`);
  const documentId = publishedDocument(title, [jobId]);
  const reviewer = personWithPassword(`${key}-kmgr`, documentManagerRole(key), ["K"], "cook");

  // A Kadikoy record on that job nobody has invited yet, and an account with
  // no workspace for the invitation to land on.
  sql(`
    select public.create_employee_command_service(
      tests.user('${run}:owner'), tests.id('${run}'), gen_random_uuid(),
      jsonb_build_object(
        'first_name', '${firstName}', 'middle_name', '', 'last_name', 'Invitee', 'preferred_name', '',
        'invitation_email', '', 'start_date', '', 'internal_note', '',
        'location_ids', jsonb_build_array(tests.id('${run}:K')),
        'primary_location_id', tests.id('${run}:K'),
        'job_ids', jsonb_build_array('${jobId}'::uuid),
        'primary_job_id', '${jobId}'::uuid,
        'is_remote', false, 'is_excluded_from_schedule', false, 'expected_revision', null),
      null);`);
  const email = lastLine(
    sql(`
    select tests.new_user('${run}:${key}', '${name}');
    select tests.password('${run}:${key}', '${password}');`),
  );

  // Ayse invites from the record's own drawer.
  const ayse = await (await browser.newContext()).newPage();
  await signIn(ayse, "ayse");
  await expect(ayse).not.toHaveURL(/\/sign-in/);
  await ayse.goto("/app/employees");
  await ayse.getByRole("row", { name: new RegExp(name) }).getByText(name, { exact: true }).click();
  const drawer = ayse.getByRole("dialog", { name });
  await drawer.getByLabel("E-mail").fill(email);
  await drawer.getByLabel("Invite role").selectOption({ label: "Employee" });
  await drawer.getByRole("button", { name: "Invite", exact: true }).click();
  const link = await drawer.getByRole("link", { name: "Open acceptance link" }).getAttribute("href");
  expect(link).toContain("/invite/accept?token=");

  // They accept and start onboarding.
  const invitee = await (await browser.newContext()).newPage();
  await invitee.goto(link!);
  await invitee.getByRole("button", { name: "I already have an account", exact: true }).click();
  await invitee.getByLabel("Email").fill(email);
  await invitee.getByLabel("Password").fill(password);
  await invitee.getByRole("button", { name: "Sign in", exact: true }).click();
  await invitee.getByRole("button", { name: "Accept invitation", exact: true }).click();
  await invitee.getByRole("button", { name: "Start onboarding", exact: true }).click();
  await expect(invitee.getByRole("heading", { name: "Let's set up your employee account" })).toBeVisible();
  const welcome = /^\/welcome\/[0-9a-f-]{36}/.exec(new URL(invitee.url()).pathname)![0];
  const steps = invitee.getByRole("navigation", { name: "Onboarding steps" });
  // The document reached them with the invitation: it is a step of its own.
  await expect(steps.getByRole("button", { name: /^Documents/ })).toBeVisible();
  await expect(invitee.getByRole("button", { name: /start over/i })).toHaveCount(0);
  await invitee.getByRole("button", { name: "Begin" }).click();

  // Every save moves the wizard on by itself, a moment after the save lands.
  // Each step below waits for that move before acting: a click made while it
  // is still on its way gets pulled to another page (main CI 37152119602).

  // Profile: the legal name as invited, so nobody has to review it. Saving it
  // takes them straight to the card, the one thing still missing.
  await fillProfile(invitee, firstName, "Invitee");
  await expect(steps.getByRole("button", { name: /^Profile\s*,\s*done$/ })).toBeVisible();
  await expect(invitee).toHaveURL(new RegExp(`${welcome}/documents/[0-9a-f-]{36}$`));
  await expect(invitee.getByRole("heading", { name: title })).toBeVisible();

  // The required document: a photo or a file, sent for review. Nothing
  // required is left, so the wizard moves on to Review.
  await invitee.getByLabel(/Choose a file/).setInputFiles(card);
  await expect(invitee.getByRole("button", { name: card.name, exact: true })).toBeVisible();
  await invitee.getByRole("button", { name: "Submit and continue" }).click();
  await expect(invitee).toHaveURL(new RegExp(`${welcome}/review$`));
  expect(standing(documentId, email)).toBe("awaiting_review pending_review");

  // Availability can wait: opened from the steps and skipped, back to Review.
  await steps.getByRole("button", { name: "Availability (optional)", exact: true }).click();
  await expect(invitee).toHaveURL(new RegExp(`${welcome}/availability$`));
  await invitee.getByRole("button", { name: "Skip for now" }).click();
  await expect(invitee).toHaveURL(new RegExp(`${welcome}/review$`));

  // Review: everything required is in; the whole onboarding goes to the manager.
  await expect(invitee.getByRole("button", { name: /start over/i })).toHaveCount(0);
  await invitee.getByRole("button", { name: "Send for review" }).click();
  await expect(invitee.getByRole("heading", { name: "Sent to your manager" })).toBeVisible();

  // Until it is approved the workspace stays closed: the app sends them to
  // Workspaces, where the only way in is their onboarding.
  await invitee.goto("/app/schedule");
  await expect(invitee).toHaveURL(/\/workspaces$/);
  await invitee.getByRole("button", { name: `Continue onboarding for World ${run}`, exact: true }).click();
  await expect(invitee).toHaveURL(new RegExp(welcome));
  // Their own notifications open all the same (D4).
  await invitee.goto("/account/inbox");
  await expect(invitee.getByLabel("Notification category")).toBeVisible();

  // The Kadikoy manager who reviews documents approves the card from
  // Employees > Documents.
  const manager = await (await browser.newContext()).newPage();
  await signInAs(manager, reviewer);
  await manager.goto("/app/employees/documents");
  await manager.getByLabel("Search employee documents").fill(firstName);
  await manager
    .getByRole("table", { name: "Employee documents" })
    .getByRole("row", { name: new RegExp(title) })
    .click();
  const review = manager.getByRole("dialog", { name: title });
  await review.getByRole("button", { name: "Approve", exact: true }).click();
  await expect.poll(() => standing(documentId, email)).toBe("completed accepted");

  // Nothing else was waiting: access opens and onboarding hands them over to
  // the employee interface.
  await invitee.goto(welcome);
  await expect(invitee).toHaveURL(/\/app\/employee-hub/);
});

test("a legal name typed differently from the invitation is approved by an admin, not by the manager", async ({
  page,
}) => {
  // Ayse's record says Emre Yilmaz; Emre has accepted and starts onboarding.
  const key = `ln${tag()}`;
  const firstName = `Emre${tag()}`;
  const email = lastLine(
    sql(`
    select tests.new_user('${run}:${key}', '${firstName} Yilmaz');
    select tests.password('${run}:${key}', '${password}');`),
  );
  const employeeId = lastLine(
    sql(`
    with created as (
      select public.create_employee_command_service(
        tests.user('${run}:owner'), tests.id('${run}'), gen_random_uuid(),
        jsonb_build_object(
          'first_name', '${firstName}', 'middle_name', '', 'last_name', 'Yilmaz', 'preferred_name', '',
          'invitation_email', '${email}', 'start_date', '', 'internal_note', '',
          'location_ids', jsonb_build_array(tests.id('${run}:K')),
          'primary_location_id', tests.id('${run}:K'),
          'job_ids', jsonb_build_array(tests.id('${run}:job:cook')),
          'primary_job_id', tests.id('${run}:job:cook'),
          'is_remote', false, 'is_excluded_from_schedule', false, 'expected_revision', null),
        (select id from public.workspace_roles
         where workspace_id = tests.id('${run}') and system_key = 'employee')) as employee
    )
    select public.accept_employee_invitation_by_id_service(
      tests.user('${run}:${key}'), (employee ->> 'invitation_id')::uuid) is not null from created;
    select tests.settle();
    select id from public.employee_profiles where workspace_id = tests.id('${run}') and user_id = tests.user('${run}:${key}');`),
  );

  // He writes his legal name as it is on his ID: Emre Can Yilmaz.
  await signInAs(page, email);
  await page.goto("/welcome");
  await page.getByRole("button", { name: "Begin" }).click();
  await fillProfile(page, `${firstName} Can`, "Yilmaz");
  const profile = () =>
    lastLine(
      sql(`
      select json_build_object('requirement', r.id, 'status', r.status, 'revision', c.revision)::text
      from public.employee_onboarding_requirements r
      join public.employee_onboarding_cases c on c.id = r.case_id
      where r.employee_id = '${employeeId}' and r.kind = 'profile';`),
    );
  await expect.poll(() => JSON.parse(profile()).status).toBe("awaiting_review");

  const onboarding = `${process.env.E2E_API_URL}/v1/workspaces/${lastLine(sql(`select tests.id('${run}');`))}/employees/${employeeId}/onboarding`;
  const acceptLegalName = async (reviewer: string) => {
    const { requirement, revision } = JSON.parse(profile()) as { requirement: string; revision: number };
    return (
      await fetch(`${onboarding}/review`, {
        method: "POST",
        headers: { Authorization: `Bearer ${await tokenFor(reviewer)}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept_requirement", requirementId: requirement, reason: "", revision }),
      })
    ).status;
  };

  // Ayse reviews his onboarding, but the legal name is not hers to approve.
  const ayse = emailOf("ayse");
  expect((await fetch(onboarding, { headers: { Authorization: `Bearer ${await tokenFor(ayse)}` } })).status).toBe(200);
  expect(await acceptLegalName(ayse)).toBe(403);
  expect(JSON.parse(profile()).status).toBe("awaiting_review");

  // Zeynep, an admin, approves it.
  expect(await acceptLegalName(emailOf("zeynep"))).toBe(200);
  expect(JSON.parse(profile()).status).toBe("completed");
});

/** Both profile pages of employee onboarding, saved: the details, then the emergency contact. */
async function fillProfile(page: Page, legalFirstName: string, legalLastName: string) {
  await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();
  await page.getByLabel("Legal first name", { exact: true }).fill(legalFirstName);
  await page.getByLabel("Legal last name", { exact: true }).fill(legalLastName);
  await page.getByLabel("Phone", { exact: true }).fill("4155550142");
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
}
