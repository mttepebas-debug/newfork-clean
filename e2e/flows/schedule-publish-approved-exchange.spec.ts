import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { psql } from "../global-setup";
import { roundLabel, roundWeek, signIn, type Person } from "../fixtures/world";

// BL-198: an approved shift change is never undone by publishing a draft
// that missed it. Ali (Kadikoy) and Deniz (Besiktas) swap and both managers
// approve, exactly as shift-hub-swap.spec.ts drives through Requests -> Shift
// changes; here a manager instead tries to publish an older draft that still
// gives the swapped shift to somebody else. Schedule > Publish must refuse it
// with the reason, not a bare 500 or a silent overwrite.

const run: string = JSON.parse(readFileSync(new URL("../.world.json", import.meta.url), "utf8")).run;

// Week 5: shift-hub-swap.spec.ts publishes week 1 and schedule-multi-location.spec.ts
// publishes week 3 in this same shared world -- a distinct week avoids
// republishing one already-active draft name for the same workspace/week
// (BL-210).
const WEEK = 5;

function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

async function openSchedule(browser: Browser, person: Person, path: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, person);
  await expect(page).toHaveURL(/\/app\/workspace/);
  await page.goto(path);
  return page;
}

test("publishing a draft that undoes an approved swap is refused, not overwritten", async ({ browser }) => {
  const week = roundWeek(WEEK);
  const caseId = sql(`
    select tests.publish_week('${run}', ${week}, '[
      {"label": "${roundLabel("ali-swap")}", "person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"},
      {"label": "${roundLabel("deniz-swap")}", "person": "deniz", "loc": "B", "job": "cook", "day": 2, "start": "09:00", "end": "15:00"}
    ]');
    select public.shift_exchanges_command_service(tests.user('${run}:ali'), tests.id('${run}'),
      jsonb_build_object('action', 'create', 'kind', 'swap',
        'shift_id', tests.id('${run}:shift:${roundLabel("ali-swap")}'), 'requested_shift_id', tests.id('${run}:shift:${roundLabel("deniz-swap")}')),
      gen_random_uuid()) ->> 'case_id';`).split(/\r?\n/).at(-1)!;
  sql(`select public.shift_exchanges_command_service(tests.user('${run}:deniz'), tests.id('${run}'),
      jsonb_build_object('action', 'accept', 'case_id', c.id, 'application_id', a.id, 'expected_revision', c.revision),
      gen_random_uuid())
    from public.shift_exchange_cases c join public.shift_exchange_applications a on a.case_id = c.id
    where c.id = '${caseId}';`);
  // Kadikoy's manager votes, then Besiktas's -- the second approval commits
  // the swap, same as the UI flow in shift-hub-swap.spec.ts.
  for (const manager of ["ayse", "mehmet"]) {
    sql(`select public.shift_exchanges_command_service(tests.user('${run}:${manager}'), tests.id('${run}'),
        jsonb_build_object('action', 'approve', 'case_id', c.id, 'application_id', a.id, 'expected_revision', c.revision,
          'fingerprint', public.shift_exchange_preview(tests.user('${run}:${manager}'), tests.id('${run}'), c.id, a.id) ->> 'fingerprint'),
        gen_random_uuid())
      from public.shift_exchange_cases c join public.shift_exchange_applications a on a.case_id = c.id
      where c.id = '${caseId}';`);
  }

  // An older draft, saved from a screen that never saw the swap: Kadikoy's
  // slot the swap moved to Deniz still shows Ali, who had it before.
  sql(`
    select tests.remember('${run}:session:${roundLabel("stale")}', (public.acquire_schedule_edit_session_service(
      tests.user('${run}:ayse'), tests.id('${run}'), tests.week(${week}), 'blank', null) -> 'session' ->> 'id')::uuid);
    select tests.add_shift(tests.user('${run}:ayse'), '${run}', tests.id('${run}:session:${roundLabel("stale")}'), ${week},
      '{"person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"}');
    select public.save_schedule_edit_session_service(tests.user('${run}:ayse'), tests.id('${run}'),
      tests.id('${run}:session:${roundLabel("stale")}'), (select revision from public.schedule_edit_sessions where id = tests.id('${run}:session:${roundLabel("stale")}')),
      'Before the swap', null, null);`);

  const monday = sql(`select tests.week(${week});`);
  const ayse = await openSchedule(browser, "ayse", `/app/schedule?date=${monday}`);

  await ayse.getByRole("button", { name: "Published", exact: true }).click();
  await ayse.getByRole("button", { name: "Publish another draft", exact: true }).click();

  const publishDialog = ayse.getByRole("dialog");
  await expect(publishDialog).toContainText("Select locations to publish");
  await publishDialog.getByRole("button", { name: "Next", exact: true }).click();
  await expect(ayse.getByTestId("schedule-publish-preview")).toBeVisible();

  await expect(publishDialog).toContainText("Publishing would undo it.");
  await expect(
    publishDialog.getByRole("button", { name: "Next", exact: true }),
  ).toBeDisabled();

  await publishDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(ayse.getByRole("dialog")).toHaveCount(0);

  // Refused, not silently applied: Kadikoy's slot is still Deniz's, from the
  // approved swap, and the workspace has published no new version.
  const holder = sql(`select coalesce(p.first_name, '') from public.schedule_published_shifts s
    join public.employee_profiles p on p.id = s.employee_id
    where s.id = tests.id('${run}:shift:${roundLabel("ali-swap")}');`);
  expect(holder).toBe("Deniz");
  const versionCount = sql(`select count(distinct version_number) from public.schedule_location_publications
    where workspace_id = tests.id('${run}') and location_id = tests.id('${run}:K')
      and week_start = tests.week(${week});`);
  expect(versionCount).toBe("1");
});
