import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { psql } from "../global-setup";
import { roundLabel, roundWeek, signIn, type Person } from "../fixtures/world";

// FOUNDATION-B 5.1: Shift Hub is the only way shifts change hands. Ali
// (Kadikoy) and Deniz (Besiktas) swap two shifts at the same time; each
// location's manager approves their side on Requests -> Shift changes, and
// only the second approval moves the shifts.

const run: string = JSON.parse(readFileSync(new URL("../.world.json", import.meta.url), "utf8")).run;

// The employees' side (offer and acceptance) is set up through the product's
// own service, as the world itself is.
function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

function holder(label: string): string {
  return sql(`select coalesce(p.first_name, '') from public.schedule_published_shifts s
    join public.employee_profiles p on p.id = s.employee_id
    where s.id = tests.id('${run}:shift:${label}');`);
}

async function openSchedule(browser: Browser, person: Person, path: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, person);
  await expect(page).toHaveURL(/\/app\/workspace/);
  await page.goto(path);
  return page;
}

test("a two-location swap completes after both managers approve", async ({ browser }) => {
  const week = roundWeek(1);
  const caseId = sql(`
    select tests.publish_week('${run}', ${week}, '[
      {"label": "${roundLabel("ali-k")}", "person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"},
      {"label": "${roundLabel("deniz-b")}", "person": "deniz", "loc": "B", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"}
    ]');
    select public.shift_exchanges_command_service(tests.user('${run}:ali'), tests.id('${run}'),
      jsonb_build_object('action', 'create', 'kind', 'swap',
        'shift_id', tests.id('${run}:shift:${roundLabel("ali-k")}'), 'requested_shift_id', tests.id('${run}:shift:${roundLabel("deniz-b")}')),
      gen_random_uuid()) ->> 'case_id';`).split(/\r?\n/).at(-1)!;
  sql(`select public.shift_exchanges_command_service(tests.user('${run}:deniz'), tests.id('${run}'),
      jsonb_build_object('action', 'accept', 'case_id', c.id, 'application_id', a.id, 'expected_revision', c.revision),
      gen_random_uuid())
    from public.shift_exchange_cases c join public.shift_exchange_applications a on a.case_id = c.id
    where c.id = '${caseId}';`);
  const day = sql(`select tests.week(${week}) + 1;`);
  const casePath = `/app/schedule/requests?tab=shift-changes&case=${caseId}&from=${day}&to=${day}`;

  const ayse = await openSchedule(browser, "ayse", casePath);
  // The case opens from the link; the decision buttons belong to a candidate.
  await ayse.getByRole("button", { name: "Review Deniz Person", exact: true }).click();
  await ayse.getByRole("button", { name: "Approve my location", exact: true }).click();
  await ayse.getByRole("button", { name: "Record my approval", exact: true }).click();
  // Kadikoy's vote is recorded; nobody's shift has moved yet.
  await expect
    .poll(() => sql(`select count(*) from public.shift_exchange_votes where case_id = '${caseId}';`))
    .toBe("1");
  expect(holder(roundLabel("ali-k"))).toBe("Ali");

  const mehmet = await openSchedule(browser, "mehmet", casePath);
  await mehmet.getByRole("button", { name: "Review Deniz Person", exact: true }).click();
  await mehmet.getByRole("button", { name: /^Approve transfer to Deniz/ }).click();
  await mehmet.getByRole("button", { name: /^Confirm transfer to Deniz/ }).click();
  // BL-180: on the shared CI machine (three self-hosted runners on one box)
  // the click-to-commit round trip can occasionally outrun the default 15s
  // poll window; this only widens the wait, the awaited value is unchanged.
  await expect.poll(() => holder(roundLabel("ali-k")), { timeout: 30_000 }).toBe("Deniz");
  expect(holder(roundLabel("deniz-b"))).toBe("Ali");
});
