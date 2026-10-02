import { expect, test } from "@playwright/test";
import { password } from "../global-setup";
import { signIn } from "../fixtures/world";
import { card, lastLine, ownJob, publishedDocument, run, sql, standing, tag } from "../fixtures/documents";

// FOUNDATION-B flow 3 (FB-6.6 A3): somebody invited to a Kadikoy job accepts,
// fills their profile, skips availability, sends the required document and
// the whole onboarding for review. Until it is approved they see only what is
// still missing and their own notifications (KARARLAR "Kisitli kisi", D4).
// Ayse approves the document; access opens and they land in the employee
// interface. Employee onboarding has no "Start over".
//
// Left out until Mert answers (FB-6.6 S1): who approves a legal name typed
// differently from the invitation. The person types it as invited, so the
// profile needs no review.

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

  // Profile: the legal name as invited, so nobody has to review it.
  await expect(invitee.getByRole("heading", { name: "Your details" })).toBeVisible();
  await invitee.getByLabel("Legal first name", { exact: true }).fill(firstName);
  await invitee.getByLabel("Legal last name", { exact: true }).fill("Invitee");
  await invitee.getByLabel("Phone", { exact: true }).fill("4155550142");
  await invitee.getByLabel("Date of birth", { exact: true }).fill("1996-04-12");
  await invitee.getByLabel("Street address", { exact: true }).fill("12 Moda Cd");
  await invitee.getByLabel("City", { exact: true }).fill("Istanbul");
  await invitee.getByLabel("State", { exact: true }).fill("Istanbul");
  await invitee.getByLabel("ZIP code", { exact: true }).fill("34710");
  await invitee.getByRole("button", { name: "Continue" }).click();
  await expect(invitee.getByRole("heading", { name: "Who we call in an emergency" })).toBeVisible();
  await invitee.getByLabel("Full name", { exact: true }).fill("Deniz Contact");
  await invitee.getByLabel("Relationship", { exact: true }).selectOption("Friend");
  await invitee.getByLabel("Phone", { exact: true }).fill("4155550100");
  await invitee.getByRole("button", { name: "Save and continue" }).click();
  await expect(steps.getByRole("button", { name: "Profile, done", exact: true })).toBeVisible();

  // The required document: a photo or a file, sent for review.
  await steps.getByRole("button", { name: /^Documents/ }).click();
  await invitee.getByRole("button", { name: `Open ${title}`, exact: true }).click();
  await invitee.getByLabel(/Choose a file/).setInputFiles(card);
  await expect(invitee.getByRole("button", { name: card.name, exact: true })).toBeVisible();
  await invitee.getByRole("button", { name: "Submit and continue" }).click();
  await expect.poll(() => standing(documentId, email)).toBe("awaiting_review pending_review");

  // Availability can wait: the step is optional and skipped.
  await steps.getByRole("button", { name: "Availability (optional)", exact: true }).click();
  await invitee.getByRole("button", { name: "Skip for now" }).click();

  // Review: everything required is in; the whole onboarding goes to the manager.
  await steps.getByRole("button", { name: /^Review/ }).click();
  await expect(invitee.getByRole("button", { name: /start over/i })).toHaveCount(0);
  await invitee.getByRole("button", { name: "Send for review" }).click();
  await expect(invitee.getByRole("heading", { name: "Sent to your manager" })).toBeVisible();

  // Until it is approved the workspace stays closed: the app sends them back
  // to their onboarding, the only thing still missing.
  await invitee.goto("/app/schedule");
  await expect(invitee).toHaveURL(new RegExp(welcome));
  // Their own notifications open all the same (D4).
  await invitee.goto("/account/inbox");
  await expect(invitee.getByLabel("Notification category")).toBeVisible();

  // Ayse approves the card from Employees > Documents.
  await ayse.goto("/app/employees/documents");
  await ayse.getByLabel("Search employee documents").fill(firstName);
  await ayse
    .getByRole("table", { name: "Employee documents" })
    .getByRole("row", { name: new RegExp(title) })
    .click();
  const review = ayse.getByRole("dialog", { name: title });
  await review.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(review.getByRole("status")).toHaveText("Decision saved");
  await expect.poll(() => standing(documentId, email)).toBe("completed accepted");

  // Nothing else was waiting: access opens and onboarding hands them over to
  // the employee interface.
  await invitee.goto(welcome);
  await expect(invitee).toHaveURL(/\/app\/employee-hub/);
});
