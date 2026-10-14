import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "../fixtures/test";
import { psql } from "../global-setup";
import { signIn, type Person } from "../fixtures/world";

// BL-182 (G9b): Ali is on approved time off on Wednesday, and Emre looks for
// cover for his Wednesday shift. Ali may take it from Shift Hub after agreeing
// that his time off shortens; it shortens only when Ayse approves the
// transfer, and Zeynep, who approved the time off, is told.

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
    select tests.leave('${run}', 'ali', 6);
    -- An admin decides alone (FB-6.3 rule 6), against the impact it reads now.
    select public.decide_time_off_service(tests.user('${run}:zeynep'), tests.id('${run}'),
      tests.id('${run}:ali:time_off'), 'approve', '',
      app_private.time_off_impact(tests.id('${run}'), tests.id('${run}:ali:time_off')) ->> 'fingerprint');
    select public.shift_exchanges_command_service(tests.user('${run}:emre'), tests.id('${run}'),
      jsonb_build_object('action', 'create', 'kind', 'cover', 'shift_id', tests.id('${run}:shift:emre-wed6')),
      gen_random_uuid()) ->> 'case_id';`).split(/\r?\n/).at(-1)!;
  day = sql(`select tests.week(6) + 2;`);
  console.log(`shift-hub-time-off setup: ${Date.now() - started} ms`);
});

test("an employee takes a shift inside their approved time off and it shortens at approval", async ({ browser }) => {
  const leaveCovers = () => sql(`select bool_or(public.time_off_effective_ranges(s.id) && tstzrange(
      (x ->> 'starts_at')::timestamptz, (x ->> 'ends_at')::timestamptz, '[)'))
    from public.schedule_time_off_segments s join public.schedule_time_off_requests r on r.id = s.request_id
    cross join (select public.shift_exchange_shift(tests.id('${run}'), tests.id('${run}:shift:emre-wed6')) x) q
    where r.employee_id = tests.id('${run}:ali') and r.request_type = 'time_off' and s.segment_date = tests.week(6) + 2;`);

  const ali = await open(browser, "ali", `/app/employee-hub/shift-hub?hub_view=available&from=${day}&to=${day}`);
  await expect(ali.getByText("During your time off")).toBeVisible();
  await expect(ali.getByText(/your time off is shortened for these hours/)).toBeVisible();
  await ali.getByRole("button", { name: "Request anyway" }).click();
  await expect
    .poll(() => sql(`select count(*) from public.shift_exchange_applications where case_id = '${caseId}' and status = 'pending_manager';`))
    .toBe("1");
  expect(leaveCovers()).toBe("t");

  const ayse = await open(browser, "ayse", `/app/schedule/requests?tab=shift-changes&case=${caseId}&from=${day}&to=${day}`);
  await ayse.getByRole("button", { name: "Review Ali Person" }).click();
  await expect(ayse.getByText(/agreed to work during approved time off/)).toBeVisible();
  await ayse.getByRole("button", { name: /^Approve transfer to Ali/ }).click();
  await ayse.getByRole("button", { name: /^Confirm transfer to Ali/ }).click();
  await expect
    .poll(() => sql(`select p.first_name from public.schedule_published_shifts s join public.employee_profiles p on p.id = s.employee_id
      where s.id = tests.id('${run}:shift:emre-wed6');`), { timeout: 30_000 })
    .toBe("Ali");
  expect(leaveCovers()).toBe("f");
  expect(sql(`select count(*) from public.notification_outbox o where o.type_key = 'requests.time_off.shortened'
    and o.payload -> 'recipient_user_ids' ? tests.user('${run}:zeynep')::text;`)).toBe("1");
});
