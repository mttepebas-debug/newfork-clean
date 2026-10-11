import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { psql } from "../global-setup";
import { signIn, type Person } from "../fixtures/world";

// BL-995 (KARARLAR §1.1, Mert 2026-10-09): Ali is on approved time off on
// Wednesday, and Emre looks for cover for his Wednesday shift. Shift Hub shows
// Ali the shift as not open to him and where to ask for those hours back; once
// his cancellation of those hours is approved, the shift is open to him like
// any other, and taking it shortens nothing.

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

test("approved time off keeps a shift from the employee until they get those hours back", async ({ browser }) => {
  const hub = `/app/employee-hub/shift-hub?hub_view=available&from=${day}&to=${day}`;
  const ali = await open(browser, "ali", hub);
  await expect(ali.getByText("On time off")).toBeVisible();
  await expect(ali.getByText(/To take it, ask to cancel those hours first/)).toBeVisible();
  await expect(ali.getByRole("button", { name: /^Request/ })).toHaveCount(0);
  await ali.getByRole("link", { name: /Ask to cancel time off/ }).click();
  await expect(ali).toHaveURL(/\/app\/employee-hub\/my-availability/);

  // Ali's cancellation of those hours, approved by Zeynep, who approved the leave.
  sql(`
    select tests.remember('${run}:ali:cancel', (public.request_time_off_cancellation_service(tests.user('${run}:ali'), tests.id('${run}'),
      tests.id('${run}:ali:time_off'),
      (select r.revision from public.schedule_time_off_requests r where r.id = tests.id('${run}:ali:time_off')),
      (select jsonb_build_array(jsonb_build_object('segment_id', s.id, 'starts_at', x ->> 'starts_at', 'ends_at', x ->> 'ends_at'))
       from public.schedule_time_off_segments s
       cross join (select public.shift_exchange_shift(tests.id('${run}'), tests.id('${run}:shift:emre-wed6')) x) q
       where s.request_id = tests.id('${run}:ali:time_off') and s.segment_date = tests.week(6) + 2),
      'Taking Emre''s shift', gen_random_uuid()) ->> 'request_id')::uuid);
    select public.decide_time_off_service(tests.user('${run}:zeynep'), tests.id('${run}'),
      tests.id('${run}:ali:cancel'), 'approve', '',
      app_private.time_off_impact(tests.id('${run}'), tests.id('${run}:ali:cancel')) ->> 'fingerprint');`);

  await ali.goto(hub);
  await expect(ali.getByText("On time off")).toHaveCount(0);
  await ali.getByRole("button", { name: "Request to cover" }).click();
  await expect
    .poll(() => sql(`select count(*) from public.shift_exchange_applications where case_id = '${caseId}' and status = 'pending_manager';`))
    .toBe("1");

  const ayse = await open(browser, "ayse", `/app/schedule/requests?tab=shift-changes&case=${caseId}&from=${day}&to=${day}`);
  await ayse.getByRole("button", { name: "Review Ali Person" }).click();
  await ayse.getByRole("button", { name: /^Approve transfer to Ali/ }).click();
  await ayse.getByRole("button", { name: /^Confirm transfer to Ali/ }).click();
  await expect
    .poll(() => sql(`select p.first_name from public.schedule_published_shifts s join public.employee_profiles p on p.id = s.employee_id
      where s.id = tests.id('${run}:shift:emre-wed6');`), { timeout: 30_000 })
    .toBe("Ali");
  expect(sql(`select count(*) from public.notification_outbox o where o.type_key = 'requests.time_off.shortened'
    and o.payload ->> 'request_id' = tests.id('${run}:ali:time_off')::text;`)).toBe("0");
});
