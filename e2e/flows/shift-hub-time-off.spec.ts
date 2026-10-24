import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { psql } from "../global-setup";
import { signIn, type Person } from "../fixtures/world";

// BL-995 (KARARLAR §1.1, Mert 2026-10-09): Ali is on approved time off on
// Wednesday, and Emre looks for cover for his Wednesday shift. Shift Hub shows
// Ali the shift as not open to him and where to ask to cancel; once his
// cancellation is approved, the shift is open to him like any other, and taking
// it changes his time off no further. Time off rebuild D8: asked, answered and
// cancelled with the time off services (ask_time_off_service and the rest), not
// the old ones, so this runs before and after the old tables go.

const run: string = JSON.parse(readFileSync(new URL("../.world.json", import.meta.url), "utf8")).run;

function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

async function open(browser: Browser, person: Person, path: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, person);
  // An employee lands in Employee Hub, a manager in the workspace (sign-in-lands).
  await expect(page).toHaveURL(/\/app\/(employee-hub|workspace)/);
  await page.goto(path);
  return page;
}

// The week, Ali's leave and Emre's cover case are setup, not the test (BL-763):
// under CI load these SQL calls alone can eat a test's 60 s.
let caseId = "";
let day = "";
test.beforeAll(() => {
  test.setTimeout(180_000);
  const started = Date.now();
  caseId = sql(`
    select tests.publish_week('${run}', 6, '[
      {"label": "emre-wed6", "person": "emre", "loc": "K", "job": "cook", "day": 2, "start": "10:00", "end": "14:00"}
    ]');
    -- Ali asks for Wednesday off; Zeynep, an admin, approves it (one answer is enough, KARARLAR S-239). Ali has
    -- no shift that day, so no shift opens.
    select tests.remember('${run}:ali:time_off', (public.ask_time_off_service(tests.user('${run}:ali'), tests.id('${run}'),
      'vacation', tests.week(6) + 2, tests.week(6) + 2, true, null, null, 'e2e',
      app_private.time_off_timezone(tests.id('${run}'), tests.id('${run}:ali')), gen_random_uuid()) ->> 'id')::uuid);
    select public.answer_time_off_service(tests.user('${run}:zeynep'), tests.id('${run}'), r.id, 'approve', null, r.revision,
      app_private.time_off_shifts_print(app_private.time_off_shifts_at_stake(r)))
    from public.time_off_requests r where r.id = tests.id('${run}:ali:time_off');
    select public.shift_exchanges_command_service(tests.user('${run}:emre'), tests.id('${run}'),
      jsonb_build_object('action', 'create', 'kind', 'cover', 'shift_id', tests.id('${run}:shift:emre-wed6')),
      gen_random_uuid()) ->> 'case_id';`).split(/\r?\n/).at(-1)!;
  day = sql(`select tests.week(6) + 2;`);
  console.log(`shift-hub-time-off setup: ${Date.now() - started} ms`);
});

test("approved time off keeps a shift from the employee until they get those hours back", async ({ browser }) => {
  const hub = `/app/employee-hub/shift-hub?hub_view=available&from=${day}&to=${day}`;
  const ali = await open(browser, "ali", hub);
  await expect(ali.getByText("On time off")).toBeVisible();
  await expect(ali.getByText(/To take it, ask to cancel those hours first/)).toBeVisible();
  await expect(ali.getByRole("button", { name: /^Request/ })).toHaveCount(0);
  await ali.getByRole("link", { name: /Ask to cancel time off/ }).click();
  await expect(ali).toHaveURL(/\/app\/employee-hub\/my-availability/);

  // Ali asks to cancel his time off, and Zeynep, who approved it, approves the cancellation.
  sql(`
    select tests.remember('${run}:ali:cancel', (public.ask_time_off_cancellation_service(tests.user('${run}:ali'), tests.id('${run}'),
      tests.id('${run}:ali:time_off'), 'Taking Emre''s shift',
      (select r.revision from public.time_off_requests r where r.id = tests.id('${run}:ali:time_off')),
      gen_random_uuid()) -> 'cancellation' ->> 'id')::uuid);
    select public.answer_time_off_service(tests.user('${run}:zeynep'), tests.id('${run}'), r.id, 'approve', null, r.revision, null)
    from public.time_off_requests r where r.id = tests.id('${run}:ali:cancel');`);

  await ali.goto(hub);
  await expect(ali.getByText("On time off")).toHaveCount(0);
  // TAKAS-RELEASE: the released shift is a card in Ali's deck.
  await ali.getByRole("button", { name: "I’ll take it" }).click();
  await expect
    .poll(() => sql(`select count(*) from public.shift_exchange_applications where case_id = '${caseId}' and status = 'pending_manager';`))
    .toBe("1");

  const ayse = await open(browser, "ayse", `/app/schedule/requests?tab=shift-changes&case=${caseId}&from=${day}&to=${day}`);
  // The link opens the cover's drawer in Requests; giving the shift is one step (Mert, 2026-10-11).
  const drawer = ayse.getByRole("dialog", { name: "Review shift change" });
  await drawer.getByRole("radio", { name: /Ali Person/ }).check();
  await drawer.getByRole("button", { name: /^Give to Ali/ }).click();
  await expect
    .poll(() => sql(`select p.first_name from public.schedule_published_shifts s join public.employee_profiles p on p.id = s.employee_id
      where s.id = tests.id('${run}:shift:emre-wed6');`), { timeout: 30_000 })
    .toBe("Ali");
  // Taking it changes his time off no further: cancelled by his own request, the one cancellation there is.
  expect(sql(`select r.status || ' ' || (select count(*) from public.time_off_requests c where c.cancels_id = r.id)
    from public.time_off_requests r where r.id = tests.id('${run}:ali:time_off');`)).toBe("cancelled 1");
});
