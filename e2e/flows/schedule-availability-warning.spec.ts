import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { psql } from "../global-setup";
import { draftName, roundLabel, roundWeek, signIn, type Person } from "../fixtures/world";

// AVAIL-002 (KARARLAR "Müsaitlik" M4, M5, M8, M9, M11, M12): availability is a
// preference that asks on every write and never blocks or makes a conflict.
// Writing onto an employee's own "unavailable" hours opens the rule box; a
// manager's note alone opens the note card under its cell and is never drawn
// on the grid; Auto-fill leaves the marked person out; Pre-flight lists the
// marks on one folded line and asks nothing; a mark made after publishing says
// so on the card, approved time off does not; changing the entry mode tells
// every employee and leaves an open swap request alone.
//
// Weeks: 4, 7 and 0 are this file's (the other specs hold 1-3, 5, 6, 8, 9);
// each --repeat-each round gets its own through roundWeek.

const world: { readonly run: string; readonly password: string } = JSON.parse(
  readFileSync(new URL("../.world.json", import.meta.url), "utf8"),
);
const run = world.run;

function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

async function openPage(browser: Browser, who: Person | { readonly email: string }, path: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  if (typeof who === "string") await signIn(page, who);
  else {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(who.email);
    await page.getByLabel("Password").fill(world.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  }
  // Managers/admins land in the workspace, employees in the Employee Hub
  // (sign-in-lands.spec.ts): just wait past the sign-in screen itself.
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto(path);
  return page;
}

// Somebody made for one test only, so nothing they carry reaches another spec.
// tests.person names people initcap(label) || ' Person'.
function freshPerson(tag: string): { readonly label: string; readonly name: string } {
  const label = `${tag}${Math.random().toString(36).slice(2, 7)}`;
  sql(`select tests.person('${run}', '${label}', 'employee', array['K'], array['cook']);`);
  return { label, name: `${label[0]!.toUpperCase()}${label.slice(1)} Person` };
}

// Opens the shift editor on an empty cell. The button only turns interactive
// on :hover (opacity/pointer-events are CSS-driven); force the first move so
// the real hover state is in place before the click.
async function openAddShift(page: Page, name: string, date: string, start: string, end: string) {
  const add = page.getByRole("button", { name: `Add shift for ${name} at Kadikoy on ${date}`, exact: true });
  await add.hover({ force: true });
  await add.click();
  const editor = page.getByRole("dialog", { name: "Add shift", exact: true });
  await editor.getByLabel("Start time").fill(start);
  await editor.getByLabel("End time").fill(end);
  // The hours typed are the hours written: a time that slips back to the
  // default would still overlap and hide behind a passing box.
  const shown = (clock: string) => clock.replace(/^(\d):/, "0$1:");
  await expect(editor.getByLabel("Start time")).toHaveValue(shown(start));
  await expect(editor.getByLabel("End time")).toHaveValue(shown(end));
  await editor.getByRole("button", { name: "Add shift", exact: true }).click();
  return editor;
}

async function startBlankSchedule(page: Page) {
  await page.getByRole("button", { name: /^Draft selector: / }).click();
  await page.getByRole("button", { name: "New Schedule (blank)", exact: true }).click();
  await expect(page).toHaveURL(/mode=edit/);
}

async function saveAs(page: Page, name: string) {
  await page.getByRole("button", { name: /^(?:Save draft|Publish)$/ }).click();
  await page.getByLabel("Draft name").fill(name);
  await page.getByRole("button", { name: "Save As", exact: true }).click();
  await expect(page).not.toHaveURL(/mode=edit/);
}

const cell = (page: Page, employeeId: string, date: string) =>
  page.locator(`.schedule-cell[data-employee-id="${employeeId}"][data-date="${date}"]`);

// The world is shared by every spec in the run: leave Ali's own week as this
// file always has (Tuesday 6pm-10pm unavailable), whatever a test set last.
test.afterAll(() => {
  sql(`select tests.availability('${run}', 'ali', 2, '18:00', '22:00');`);
});

test("M8, M9, M11: the rule box on every write, a quiet Pre-flight, and 'Changed after publishing' only for a later mark", async ({
  browser,
}) => {
  const week = roundWeek(4);
  // Ali's own weekly mark, made from Employee Hub > My availability: Tuesday
  // 6pm-10pm he's unavailable.
  sql(`select tests.availability('${run}', 'ali', 2, '18:00', '22:00');`);
  const [monday, tuesday, thursday, friday, aliId] = sql(
    `select tests.week(${week}) || ' ' || tests.week(${week}) + 1 || ' ' || tests.week(${week}) + 3 || ' ' || tests.week(${week}) + 4 || ' ' || tests.id('${run}:ali');`,
  ).split(" ") as [string, string, string, string, string];

  const ayse = await openPage(browser, "ayse", `/app/schedule?date=${monday}`);
  await startBlankSchedule(ayse);

  // (a) M8: writing onto his marked hours asks, every time.
  const editor = await openAddShift(ayse, "Ali Person", tuesday, "6:00 PM", "10:00 PM");
  const ruleBox = ayse.getByRole("dialog", { name: "Shift conflict", exact: true });
  await expect(ruleBox).toBeVisible();
  await expect(ruleBox).toContainText("Do you want to assign this shift anyway?");
  await expect(ruleBox).toContainText("unavailable");
  await expect(ruleBox.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
  // Escape is Cancel: the box closes, the editor and what was typed stay.
  await ayse.keyboard.press("Escape");
  await expect(ruleBox).toHaveCount(0);
  await expect(editor).toBeVisible();
  // Asked again on the next try; Cancel also keeps the editor.
  await editor.getByRole("button", { name: "Add shift", exact: true }).click();
  await expect(ruleBox).toBeVisible();
  await ruleBox.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(ruleBox).toHaveCount(0);
  await expect(editor).toBeVisible();
  // Place shift writes it.
  await editor.getByRole("button", { name: "Add shift", exact: true }).click();
  await ruleBox.getByRole("button", { name: "Place shift", exact: true }).click();
  await expect(ruleBox).toHaveCount(0);
  await expect(editor).toHaveCount(0);

  // The card carries the warning: an orange mark, an accessible name and a
  // description that say Ali's status, not that anything changed (G14).
  const tuesdayCard = cell(ayse, aliId, tuesday).locator("[data-shift-badge]");
  await expect(tuesdayCard).toHaveAttribute("data-availability-warning", "true");
  await expect(tuesdayCard).toHaveAccessibleName(/shows as unavailable for this shift/);
  await expect(tuesdayCard).toHaveAccessibleDescription(/^Ali Person/);
  await expect(tuesdayCard).not.toHaveAccessibleDescription(/Changed after publishing/);

  // Thursday and Friday are free: nothing asks.
  for (const day of [thursday, friday]) {
    await expect(await openAddShift(ayse, "Ali Person", day, "9:00 AM", "3:00 PM")).toHaveCount(0);
    await expect(ruleBox).toHaveCount(0);
    await expect(cell(ayse, aliId, day).locator("[data-shift-badge]")).toBeVisible();
  }

  await saveAs(ayse, draftName("Ayse week"));

  // (d) M9: Pre-flight is ready, lists Ali on one folded line and asks nothing.
  // Scoped to the dialog: the topbar's own "Next week" nav button also
  // matches an unscoped, unexact "Next" query.
  async function preflight() {
    const dialog = ayse.getByRole("dialog");
    await expect(dialog).toContainText("Select locations to publish");
    await dialog.getByRole("button", { name: "Next", exact: true }).click();
    await expect(ayse.getByTestId("schedule-publish-preview")).toBeVisible();
    await expect(dialog.getByText("Ready to publish", { exact: true })).toBeVisible();
    await expect(dialog.getByText("1 person is scheduled while unavailable", { exact: true })).toBeVisible();
    await expect(dialog.getByText("No blockers · one thing to glance at", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("checkbox")).toHaveCount(0);
    await expect(dialog.getByText(/Previously accepted|Acknowledged by/)).toHaveCount(0);
    const next = dialog.getByRole("button", { name: "Next", exact: true });
    await expect(next).toBeEnabled();
    await next.click();
    await dialog.getByRole("button", { name: "Publish 1 location", exact: true }).click();
    await expect(ayse.getByRole("dialog")).toHaveCount(0);
  }
  await ayse.getByRole("button", { name: "Publish", exact: true }).click();
  await preflight();
  await expect(ayse.getByRole("button", { name: "Published", exact: true })).toBeVisible();

  // And again on a republish of the same week: still nothing to tick.
  const publishAnotherDraft = ayse.getByRole("button", { name: "Publish another draft", exact: true });
  const menuAlreadyOpen = await publishAnotherDraft
    .waitFor({ state: "visible", timeout: 2_000 })
    .then(() => true)
    .catch(() => false);
  if (!menuAlreadyOpen) {
    await ayse.getByRole("button", { name: "Published", exact: true }).click();
    await publishAnotherDraft.waitFor({ state: "visible" });
  }
  await publishAnotherDraft.click();
  await preflight();

  // (e) M11: after publishing, Ali marks Thursday morning; Friday he gets
  // approved time off. Only Thursday's card says "Changed after publishing".
  sql(`select tests.availability('${run}', 'ali', 4, '09:00', '15:00');
    select tests.approved_leave(tests.id('${run}'), tests.id('${run}:ali'), tests.user('${run}:ali'), tests.id('${run}:K'), tests.week(${week}) + 4);`);
  await ayse.reload();

  // The published week in view mode: no orange "!" anywhere, red time off stays
  // (KARARLAR Schedule, 2026-10-06).
  await expect(cell(ayse, aliId, friday)).toHaveAttribute("data-availability-kind", "time_off");
  await expect(ayse.locator(".schedule-availability-mark")).toHaveCount(0);
  await ayse.getByRole("button", { name: /^Draft selector:/ }).click();
  await ayse.getByRole("button", { name: "Edit live schedule", exact: true }).click();
  await expect(ayse).toHaveURL(/mode=edit/);

  await expect(cell(ayse, aliId, thursday)).toHaveAttribute("data-availability-kind", "unavailable");
  const thursdayCard = cell(ayse, aliId, thursday).locator("[data-shift-badge]");
  await expect(thursdayCard).toHaveAttribute("data-availability-warning", "true");
  await expect(thursdayCard).toHaveAccessibleDescription(/Changed after publishing/);
  // The "!" window says it too, under the day and hours.
  await thursdayCard.getByRole("button", { name: "Ali Person: unavailable during this shift", exact: true }).click();
  await expect(ayse.getByRole("dialog", { name: "Ali Person: unavailable during this shift", exact: true }))
    .toContainText("Changed after publishing");
  await ayse.keyboard.press("Escape");

  await expect(cell(ayse, aliId, friday)).toHaveAttribute("data-availability-kind", "time_off");
  await expect(cell(ayse, aliId, friday).locator("[data-shift-badge]")).not.toHaveAccessibleDescription(
    /Changed after publishing/,
  );
  // The card can only say it for an own mark, so read the flag itself too:
  // approved time off is no change of availability.
  expect(
    sql(`select s ->> 'availability_changed_after_publish'
      from jsonb_array_elements(public.get_schedule_read_model_service(
        tests.user('${run}:ayse'), tests.id('${run}'), tests.week(${week})) -> 'shifts') s
      where s ->> 'employee_id' = tests.id('${run}:ali')::text and s ->> 'scheduled_date' = '${friday}';`),
  ).toBe("false");
});

test("M8, D3: Auto-fill leaves Ali out of his marked evening, and no write is refused for availability", async ({
  browser,
}) => {
  const week = roundWeek(7);
  sql(`select tests.availability('${run}', 'ali', 2, '18:00', '22:00');`);
  const [monday, tuesday, aliId] = sql(
    `select tests.week(${week}) || ' ' || tests.week(${week}) + 1 || ' ' || tests.id('${run}:ali');`,
  ).split(" ") as [string, string, string];

  // A saved draft with an open Kadikoy cook shift on Tuesday evening, made the
  // way the Schedule screen makes one.
  const openDraft = draftName("Open evening");
  const session = `${run}:session:${roundLabel("open-evening")}`;
  sql(`
    select tests.remember('${session}', (public.acquire_schedule_edit_session_service(
      tests.user('${run}:ayse'), tests.id('${run}'), tests.week(${week}), 'blank', null) -> 'session' ->> 'id')::uuid);
    select tests.add_shift(tests.user('${run}:ayse'), '${run}', tests.id('${session}'), ${week},
      '{"loc": "K", "job": "cook", "day": 1, "start": "18:00", "end": "22:00"}');
    select public.save_schedule_edit_session_service(tests.user('${run}:ayse'), tests.id('${run}'), tests.id('${session}'),
      (select revision from public.schedule_edit_sessions where id = tests.id('${session}')), '${openDraft}', null, null);`);

  const ayse = await openPage(browser, "ayse", `/app/schedule?date=${monday}`);
  await ayse.getByRole("button", { name: /^Draft selector: / }).click();
  await ayse.getByRole("button", { name: `Edit ${openDraft}`, exact: true }).click();
  await expect(ayse).toHaveURL(/mode=edit/);

  // D3: the marked employee is never a candidate for the open shift.
  await ayse.getByRole("button", { name: "Auto-fill", exact: true }).click();
  const review = ayse.getByRole("dialog", { name: "Review auto-fill", exact: true });
  const choice = review.getByLabel(`Assignment for Cook on ${tuesday}`, { exact: true });
  await expect(choice).toBeVisible();
  const candidates = (await choice.locator("option").allTextContents()).filter((text) => text !== "Leave open");
  expect(candidates.length).toBeGreaterThan(0);
  expect(candidates.join(" | ")).not.toContain("Ali Person");
  // Its write goes through.
  await review.getByRole("button", { name: "Apply 1 assignments", exact: true }).click();
  await expect(review.getByRole("status")).toHaveText("Applied 1 shift.");
  await review.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(review).toHaveCount(0);

  // M8: Ayse still writes Ali onto his marked evening after Place shift.
  await openAddShift(ayse, "Ali Person", tuesday, "6:00 PM", "10:00 PM");
  const ruleBox = ayse.getByRole("dialog", { name: "Shift conflict", exact: true });
  await ruleBox.getByRole("button", { name: "Place shift", exact: true }).click();
  await expect(ayse.getByRole("dialog", { name: "Add shift", exact: true })).toHaveCount(0);
  await expect(cell(ayse, aliId, tuesday).locator("[data-shift-badge]")).toHaveAttribute(
    "data-availability-warning",
    "true",
  );

  // Both writes reached the saved draft: Ali's evening, and the open shift
  // filled by somebody else.
  const filled = draftName("Evening filled");
  await saveAs(ayse, filled);
  await expect
    .poll(() =>
      sql(`select count(*) filter (where s.employee_id = tests.id('${run}:ali'))
          || ' ' || count(*) filter (where s.employee_id is not null and s.employee_id <> tests.id('${run}:ali'))
        from public.schedule_draft_shifts s join public.schedule_drafts d on d.id = s.draft_id
        where d.workspace_id = tests.id('${run}') and d.name = '${filled}' and d.archived_at is null
          and s.scheduled_date = tests.week(${week}) + 1 and s.start_time = '18:00';`),
    )
    .toBe("1 1");
});

test("M12: a manager's note alone opens the note card and never shows on the grid", async ({ browser }) => {
  const week = roundWeek(0);
  const person = freshPerson("nora");
  const [monday, wednesday, personId] = sql(
    `select tests.week(${week}) || ' ' || tests.week(${week}) + 2 || ' ' || tests.id('${run}:${person.label}');`,
  ).split(" ") as [string, string, string];

  // Ayse's note for Wednesday mornings, saved through the service the Employees
  // drawer saves it with (source 'manager'). The person has no week of her own.
  sql(`select public.weekly_preferences_save_service(tests.user('${run}:ayse'), tests.id('${run}'),
      jsonb_build_object('source', 'manager', 'employee_id', tests.id('${run}:${person.label}'),
        'preference', jsonb_build_object('input_mode', 'time_range', 'days', (
          select jsonb_agg(jsonb_build_object('day', d, 'all_day', false, 'shift_type_ids', '[]'::jsonb,
            'ranges', case when d = 3 then jsonb_build_array(jsonb_build_object('start', '09:00', 'end', '12:00')) else '[]'::jsonb end)
            order by d) from generate_series(0, 6) d)),
        'enabled', true,
        'notes', jsonb_build_array('', '', '', 'School mornings', '', '', ''),
        'expected_revision', m -> 'manager' -> 'revision',
        'settings_revision', m -> 'settings' -> 'revision'),
      gen_random_uuid())
    from (select public.weekly_preferences_read_service(tests.user('${run}:ayse'), tests.id('${run}'),
      tests.id('${run}:${person.label}')) m) model;`);
  // The day the note was written, as the card names it (Kadikoy's time zone).
  const writtenOn = sql(`select to_char(r.updated_at at time zone 'Europe/Istanbul', 'Mon FMDD')
    from public.manager_weekly_reminders r where r.employee_id = tests.id('${run}:${person.label}');`);

  const ayse = await openPage(browser, "ayse", `/app/schedule?date=${monday}`);
  await startBlankSchedule(ayse);
  const wednesdayCell = cell(ayse, personId, wednesday);
  await expect(wednesdayCell).toBeVisible();
  // Nothing on the grid says there is a note.
  await expect(wednesdayCell).not.toHaveAttribute("data-availability-kind");

  const editor = await openAddShift(ayse, person.name, wednesday, "9:00 AM", "12:00 PM");
  const card = ayse.getByRole("dialog", { name: `Manager note for ${person.name}`, exact: true });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Manager note · Wed 9:00 AM – 12:00 PM");
  await expect(card).toContainText("School mornings");
  await expect(card).toContainText(`Ayse Person · ${writtenOn}`);
  // A note alone is the card, not the rule box.
  await expect(ayse.getByRole("dialog", { name: "Shift conflict", exact: true })).toHaveCount(0);

  await card.getByRole("button", { name: "Place shift", exact: true }).click();
  await expect(card).toHaveCount(0);
  await expect(editor).toHaveCount(0);
  // The shift is written and, like the cell, carries no mark from the note.
  const shift = wednesdayCell.locator("[data-shift-badge]");
  await expect(shift).toBeVisible();
  await expect(shift).not.toHaveAttribute("data-availability-warning");
  await expect(wednesdayCell).not.toHaveAttribute("data-availability-kind");
});

test("M4, M5, D4: the owner changes the entry mode; an employee with no saved week is told, an open swap stays open", async ({
  browser,
}) => {
  const week = roundWeek(7);
  // Somebody who never saved a week.
  const newcomer = freshPerson("omer");
  // Ali has a saved week the change converts.
  sql(`select tests.availability('${run}', 'ali', 2, '18:00', '22:00');`);

  // An open swap: Ali offers his Kadikoy Tuesday for Deniz's Besiktas one and
  // Deniz accepts; it waits on the managers (shift-hub-swap.spec.ts).
  const caseId = sql(`
    select tests.publish_week('${run}', ${week}, '[
      {"label": "${roundLabel("ali-mode")}", "person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"},
      {"label": "${roundLabel("deniz-mode")}", "person": "deniz", "loc": "B", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"}
    ]');
    select public.shift_exchanges_command_service(tests.user('${run}:ali'), tests.id('${run}'),
      jsonb_build_object('action', 'create', 'kind', 'swap',
        'shift_id', tests.id('${run}:shift:${roundLabel("ali-mode")}'), 'requested_shift_id', tests.id('${run}:shift:${roundLabel("deniz-mode")}')),
      gen_random_uuid()) ->> 'case_id';`).split(/\r?\n/).at(-1)!;
  sql(`select public.shift_exchanges_command_service(tests.user('${run}:deniz'), tests.id('${run}'),
      jsonb_build_object('action', 'accept', 'case_id', c.id, 'application_id', a.id, 'expected_revision', c.revision),
      gen_random_uuid())
    from public.shift_exchange_cases c join public.shift_exchange_applications a on a.case_id = c.id
    where c.id = '${caseId}';`);
  const swapState = () =>
    sql(`select c.status || ' ' || a.status || ' ' || c.revision
      from public.shift_exchange_cases c join public.shift_exchange_applications a on a.case_id = c.id
      where c.id = '${caseId}';`);
  const before = swapState();
  expect(before).toMatch(/^open pending_manager /);

  // The world's owner has no sign-in until somebody gives them a password.
  const owner = await openPage(
    browser,
    { email: sql(`select tests.password('${run}:owner', '${world.password}');`) },
    "/app/settings/scheduling",
  );
  try {
    // Settings > Scheduling > Availability: Time range -> Shift type.
    const settings = owner.getByRole("region", { name: "Availability settings", exact: true });
    // The radio itself is visually hidden; the owner presses its label.
    await settings.locator("label", { hasText: "Shift type" }).click();
    await expect(settings.getByRole("radio", { name: "Shift type", exact: true })).toBeChecked();
    await expect(settings).toContainText("Employees will be notified to check theirs.");
    await settings.getByRole("button", { name: "Save", exact: true }).click();
    await expect(settings.getByRole("status")).toHaveText("Saved");
    expect(
      sql(`select availability_input_mode from public.workspace_scheduling_settings where workspace_id = tests.id('${run}');`),
    ).toBe("shift_type");

    // D4: "Check your availability" goes to every employee, the newcomer with
    // no saved week too, and never to a manager. Read from the outbox: no
    // worker delivers it during a local run (announcement-reaches-its-people).
    await expect
      .poll(() =>
        sql(`select coalesce(bool_or(o.payload -> 'recipient_user_ids' ? tests.user('${run}:${newcomer.label}')::text), false)
            || ' ' || coalesce(bool_or(o.payload -> 'recipient_user_ids' ? tests.user('${run}:ali')::text), false)
            || ' ' || coalesce(bool_or(o.payload -> 'recipient_user_ids' ? tests.user('${run}:ayse')::text), false)
            || ' ' || coalesce(max(o.payload ->> 'title'), '')
          from public.notification_outbox o
          where o.workspace_id = tests.id('${run}') and o.type_key = 'availability.status_changed'
            and o.payload ->> 'input_mode' = 'shift_type';`),
      )
      .toBe("true true false Check your availability");

    // M5: the swap is untouched -- same state, same revision.
    expect(swapState()).toBe(before);
  } finally {
    // Back to Time range for the rest of the run (tests.availability writes in it).
    sql(`select public.weekly_preference_settings_save_service(tests.user('${run}:owner'), tests.id('${run}'),
        jsonb_build_object('input_mode', 'time_range', 'onboarding_required', s.availability_onboarding_required,
          'expected_revision', s.availability_preferences_revision),
        gen_random_uuid())
      from public.workspace_scheduling_settings s
      where s.workspace_id = tests.id('${run}') and s.availability_input_mode <> 'time_range';`);
  }
});

// M8: availability is always a warning, so Settings > Conflict handling has no
// rule for it, only the one sentence saying so (BL-185).
test("Settings > Conflict handling offers no Employee availability rule", async ({ browser }) => {
  const zeynep = await openPage(browser, "zeynep", "/app/settings/scheduling/conflicts");
  await expect(zeynep.getByRole("heading", { name: "Conflict handling", exact: true })).toBeVisible();
  await expect(zeynep.getByText("Employee availability")).toHaveCount(0);
  await expect(
    zeynep.getByText("Availability is a preference: you'll see a warning, never a block."),
  ).toBeVisible();
});
