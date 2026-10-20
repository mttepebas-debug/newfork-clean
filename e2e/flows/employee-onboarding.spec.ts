import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { password } from "../global-setup";
import { emailOf, signIn } from "../fixtures/world";
import {
  card,
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
// still missing (KARARLAR "Kisitli kisi").
// A Kadikoy manager (the built-in Manager role reviews documents, BL-560)
// approves the card; access opens and they land in the
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
  const reviewer = personWithPassword(`${key}-kmgr`, "manager", ["K"], "cook");

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
  // Tur 4 B: Invite opens Access; the employee app is ticked there.
  await drawer.getByRole("button", { name: "Invite", exact: true }).click();
  await drawer.getByLabel("Employee app").check();
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
  // The step is the day-by-day week (Mert 2026-10-16), worded as a preference.
  await expect(invitee.getByRole("heading", { name: "When do you prefer not to work?" })).toBeVisible();
  await expect(invitee.getByRole("navigation", { name: "Days" }).getByRole("button")).toHaveCount(7);
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

// TEL-2 (Mert, 2026-10-09). The phone is masked as it is typed and erased; a
// number somebody else in the workspace has, or one's own as the emergency
// contact's, turns the field red with a line under it, and nothing moves.
test("onboarding masks the phone and says in red when it is somebody else's or one's own", async ({ page }) => {
  const key = `tel${tag()}`;
  const firstName = `Tel${tag()}`;
  const email = lastLine(
    sql(`
    select tests.new_user('${run}:${key}', '${firstName} Person');
    select tests.password('${run}:${key}', '${password}');`),
  );
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
        (select id from public.workspace_roles
         where workspace_id = tests.id('${run}') and system_key = 'employee')) as employee
    )
    select public.accept_employee_invitation_by_id_service(
      tests.user('${run}:${key}'), (employee ->> 'invitation_id')::uuid) is not null from created;
    select tests.settle();`);
  // Emre's number, as onboarding saved it.
  const emre = lastLine(
    sql(`select substr(phone, 3) from public.employee_private_profiles where employee_id = tests.id('${run}:emre');`),
  );

  // The avatar card's answer is held until the fields are measured: it comes in where its room already was.
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/me/last-avatar", async (route) => {
    await held;
    await route.continue();
  });
  await signInAs(page, email);
  await page.goto("/welcome");
  await page.getByRole("button", { name: "Begin" }).click();
  await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();
  await page.getByLabel("Legal first name", { exact: true }).fill(firstName);
  await page.getByLabel("Legal last name", { exact: true }).fill("Person");

  // Each separator comes with the digit that closes its group and goes with it.
  const phone = page.getByLabel("Phone", { exact: true });
  // Its neighbour in the row and the row under it, before any line appears.
  const birth = page.getByLabel("Date of birth", { exact: true });
  const street = page.getByLabel("Street address", { exact: true });
  const before = [await birth.boundingBox(), await street.boundingBox()];
  release();
  await expect(page.getByRole("group", { name: "Your avatar" })).toBeVisible();
  const shown: string[] = [];
  for (const digit of emre) {
    await phone.press(digit);
    shown.push(await phone.inputValue());
  }
  const [a, b, c] = [emre.slice(0, 3), emre.slice(3, 6), emre.slice(6)];
  expect(shown[2]).toBe(`(${a})`);
  expect(shown[5]).toBe(`(${a}) ${b}-`);
  expect(shown[9]).toBe(`(${a}) ${b}-${c}`);

  // Emre has it: red, a line under it, and the next field where it was.
  await expect(phone).toHaveAttribute("aria-invalid", "true");
  // Its room was kept all along: the copy that holds it is hidden, not this one.
  await expect(page.getByRole("alert").filter({ hasText: "Someone in this workspace already uses this number." })).toBeVisible();
  expect([await birth.boundingBox(), await street.boundingBox()]).toEqual(before);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();

  // Back in the field, the caret at the end of the number, as a click there leaves it.
  await phone.click();
  await phone.press("End");
  await phone.press("Backspace");
  await expect(phone).toHaveValue(`(${a}) ${b}-${c.slice(0, 3)}`);
  await expect(phone).not.toHaveAttribute("aria-invalid", "true");
  await phone.press("Backspace");
  await phone.press("Backspace");
  await phone.press("Backspace");
  await expect(phone).toHaveValue(`(${a}) ${b}-`);
  await phone.press("Backspace");
  await expect(phone).toHaveValue(`(${a}) ${b.slice(0, 2)}`);

  const own = freshPhone();
  await phone.fill(own);
  await expect(phone).not.toHaveAttribute("aria-invalid", "true");
  await birth.fill("1996-04-12");
  await street.fill("12 Moda Cd");
  await page.getByLabel("City", { exact: true }).fill("Istanbul");
  await page.getByLabel("State", { exact: true }).fill("Istanbul");
  await page.getByLabel("ZIP code", { exact: true }).fill("34710");
  await page.getByRole("button", { name: "Continue" }).click();

  // The emergency contact is somebody else; a coworker's number is fine.
  await expect(page.getByRole("heading", { name: "Who we call in an emergency" })).toBeVisible();
  await page.getByLabel("Full name", { exact: true }).fill("Deniz Contact");
  await page.getByLabel("Relationship", { exact: true }).selectOption("Friend");
  const contact = page.getByLabel("Phone", { exact: true });
  const email2 = page.getByLabel("Email (optional)", { exact: true });
  const emailBefore = await email2.boundingBox();
  await contact.fill(own);
  await expect(contact).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("alert").filter({ hasText: "This is your own number. Enter someone else's." })).toBeVisible();
  expect(await email2.boundingBox()).toEqual(emailBefore);
  await contact.press("Backspace");
  await expect(contact).not.toHaveAttribute("aria-invalid", "true");
  await contact.fill(emre);
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByRole("heading", { name: "Who we call in an emergency" })).toBeHidden();
  expect(
    lastLine(
      sql(`
      select emergency_contact_phone || ' ' || phone from public.employee_private_profiles p
      join public.employee_profiles e on e.id = p.employee_id
      where e.workspace_id = tests.id('${run}') and e.user_id = tests.user('${run}:${key}');`),
    ),
  ).toBe(`+1${emre} +1${own}`);
});

// Mert 2026-10-17: on a phone the availability step is a fixed frame. The bar
// and the heading stay on top and the two buttons at the bottom; only the days
// scroll between them, and the page itself never does.
for (const height of [844, 800]) {
  test(`on a 390 x ${height} phone the availability step scrolls its days alone`, async ({ page }) => {
    const key = `fr${height}${tag()}`;
    const firstName = `Fr${tag()}`;
    const email = lastLine(
      sql(`
      select tests.new_user('${run}:${key}', '${firstName} Person');
      select tests.password('${run}:${key}', '${password}');`),
    );
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
          (select id from public.workspace_roles
           where workspace_id = tests.id('${run}') and system_key = 'employee')) as employee
      )
      select public.accept_employee_invitation_by_id_service(
        tests.user('${run}:${key}'), (employee ->> 'invitation_id')::uuid) is not null from created;
      select tests.settle();`);

    await page.setViewportSize({ width: 390, height });
    await signInAs(page, email);
    await page.goto("/welcome");
    await expect(page.getByRole("button", { name: "Begin" })).toBeVisible();
    const welcome = /^\/welcome\/[0-9a-f-]{36}/.exec(new URL(page.url()).pathname)![0];
    await page.goto(`${welcome}/availability`);
    await expect(page.getByRole("heading", { name: "When do you prefer not to work?" })).toBeVisible();

    const list = page.locator(".dav-list");
    await expect(list.locator(".dav-row")).toHaveCount(7);
    const skip = page.getByRole("button", { name: "Skip for now" });
    const save = page.getByRole("button", { name: "Save and continue" });
    const sunday = list.locator('[data-weekday="0"]');
    const inView = async () => {
      const box = (await skip.boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(height);
      expect(((await save.boundingBox())!).y + ((await save.boundingBox())!).height).toBeLessThanOrEqual(height);
    };

    // The page fits the screen; the days overflow inside their own box.
    const page_ = await page.evaluate(() => ({
      scroll: document.scrollingElement!.scrollHeight,
      view: window.innerHeight,
    }));
    expect(page_.scroll).toBeLessThanOrEqual(page_.view);
    const box = await list.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
    expect(box.scroll).toBeGreaterThan(box.client);
    await inView();
    const before = await save.boundingBox();

    // Down to Sunday: the list moves, the buttons and the heading do not.
    await list.hover();
    await page.mouse.wheel(0, 600);
    await expect.poll(() => list.evaluate((el) => Math.ceil(el.scrollTop + el.clientHeight) >= el.scrollHeight)).toBe(true);
    const listBox = (await list.boundingBox())!;
    const sundayBox = (await sunday.boundingBox())!;
    expect(sundayBox.y + sundayBox.height).toBeLessThanOrEqual(listBox.y + listBox.height + 1);
    expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
    expect(await save.boundingBox()).toEqual(before);
    await inView();

    // A day still opens in its sheet from the bottom, over the fixed parts.
    await sunday.click();
    const sheet = page.getByRole("dialog", { name: "Sunday" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: "Cancel" }).click();
    await expect(sheet).toBeHidden();

    // The way on works from where it sits.
    await skip.click();
    await expect(page).not.toHaveURL(new RegExp(`${welcome}/availability$`));
  });
}

/**
 * A number nobody in the world has: a workspace refuses one another of its
 * people holds (TEL-2), and every spec here onboards into the same world.
 */
const freshPhone = (): string => `415${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;

/** Both profile pages of employee onboarding, saved: the details, then the emergency contact. */
async function fillProfile(page: Page, legalFirstName: string, legalLastName: string) {
  await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();
  await page.getByLabel("Legal first name", { exact: true }).fill(legalFirstName);
  await page.getByLabel("Legal last name", { exact: true }).fill(legalLastName);
  await page.getByLabel("Phone", { exact: true }).fill(freshPhone());
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
