import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { psql } from "../global-setup";
import { roundLabel, roundWeek, signIn, type Person } from "../fixtures/world";

// EKRAN-02 C2 (KARARLAR "Takas inceleme penceresi H2"): Ali (Kadikoy) and Deniz
// (Besiktas) swap Monday shifts. Each location's manager opens the swap from
// Requests in its review window and approves; the first approval is recorded,
// the second moves both shifts.

const run: string = JSON.parse(readFileSync(new URL("../.world.json", import.meta.url), "utf8")).run;

function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

function holder(label: string): string {
  return sql(`select coalesce(p.first_name, '') from public.schedule_published_shifts s
    join public.employee_profiles p on p.id = s.employee_id
    where s.id = tests.id('${run}:shift:${label}');`);
}

async function openRequests(browser: Browser, person: Person): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, person);
  await expect(page).toHaveURL(/\/app\/workspace/);
  await page.goto("/app/schedule/requests?type=swap");
  return page;
}

// The row's name as Requests writes it (TAKAS-RELEASE: one sentence), with the day
// it names: "Shift swap: Ali Person and Deniz Person want to swap their Cook shifts."
// or "Shift pickup: Ali Person and Deniz Person want to take over Emre Person’s 9:00 AM Cook shift at Kadikoy on Wed, Jan 16."
function rowName(day: string, kind: "swap" | "pickup") {
  if (kind === "swap") return /^Shift swap: Ali Person and Deniz Person want to swap/;
  const when = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${day}T12:00:00Z`));
  return new RegExp(`^Shift pickup: .*Emre Person’s .* on ${when}\\.`);
}

test("two managers approve a swap from its review window in Requests", async ({ browser }) => {
  // A week no other flow publishes: publishing a week again must never undo
  // this test's approved swap (schedule-publish-approved-exchange.spec.ts).
  const week = roundWeek(600);
  const caseId = sql(`
    select tests.publish_week('${run}', ${week}, '[
      {"label": "${roundLabel("ali-k-rv")}", "person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"},
      {"label": "${roundLabel("deniz-b-rv")}", "person": "deniz", "loc": "B", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"}
    ]');
    select public.shift_exchanges_command_service(tests.user('${run}:ali'), tests.id('${run}'),
      jsonb_build_object('action', 'create', 'kind', 'swap',
        'shift_id', tests.id('${run}:shift:${roundLabel("ali-k-rv")}'), 'requested_shift_id', tests.id('${run}:shift:${roundLabel("deniz-b-rv")}')),
      gen_random_uuid()) ->> 'case_id';`).split(/\r?\n/).at(-1)!;
  sql(`select public.shift_exchanges_command_service(tests.user('${run}:deniz'), tests.id('${run}'),
      jsonb_build_object('action', 'accept', 'case_id', c.id, 'application_id', a.id, 'expected_revision', c.revision),
      gen_random_uuid())
    from public.shift_exchange_cases c join public.shift_exchange_applications a on a.case_id = c.id
    where c.id = '${caseId}';`);
  const day = sql(`select tests.week(${week}) + 1;`);

  const ayse = await openRequests(browser, "ayse");
  await ayse.getByRole("row", { name: rowName(day, "swap") }).first().click();
  const first = ayse.getByRole("dialog", { name: "Swap request" });
  await expect(first).toContainText("Ali Person ⇄ Deniz Person");
  await first.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(ayse.getByText("Your approval is recorded. The other location's manager decides next.")).toBeVisible();
  // Kadikoy's vote is recorded; nobody's shift has moved yet.
  await expect.poll(() => sql(`select count(*) from public.shift_exchange_votes where case_id = '${caseId}';`)).toBe("1");
  expect(holder(roundLabel("ali-k-rv"))).toBe("Ali");

  const mehmet = await openRequests(browser, "mehmet");
  await mehmet.getByRole("row", { name: rowName(day, "swap") }).first().click();
  await mehmet.getByRole("dialog", { name: "Swap request" }).getByRole("button", { name: "Approve", exact: true }).click();
  await expect(mehmet.getByText("Swap approved.")).toBeVisible();
  // BL-180: the shared CI machine can outrun the default poll window.
  await expect.poll(() => holder(roundLabel("ali-k-rv")), { timeout: 30_000 }).toBe("Deniz");
  expect(holder(roundLabel("deniz-b-rv"))).toBe("Ali");
});

// Requests review (Mert, 2026-10-11): Emre looks for cover; Ali and Deniz both
// ask for his shift. Ayse declines Ali alone, with a reason only Ali reads;
// Deniz's request stays and the cover stays in her list.
test("a manager declines one person asking for a cover; the others stay", async ({ browser }) => {
  const week = roundWeek(610);
  const shift = roundLabel("emre-k-dc");
  const caseId = sql(`
    select tests.publish_week('${run}', ${week}, '[
      {"label": "${shift}", "person": "emre", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "15:00"}
    ]');
    select public.shift_exchanges_command_service(tests.user('${run}:emre'), tests.id('${run}'),
      jsonb_build_object('action', 'create', 'kind', 'cover', 'shift_id', tests.id('${run}:shift:${shift}')),
      gen_random_uuid()) ->> 'case_id';`).split(/\r?\n/).at(-1)!;
  for (const who of ["ali", "deniz"]) {
    sql(`select public.shift_exchanges_command_service(tests.user('${run}:${who}'), tests.id('${run}'),
        jsonb_build_object('action', 'apply', 'shift_id', tests.id('${run}:shift:${shift}'), 'case_id', '${caseId}'),
        gen_random_uuid());`);
  }
  const day = sql(`select tests.week(${week}) + 2;`);

  const ayse = await openRequests(browser, "ayse");
  await ayse.getByRole("row", { name: rowName(day, "pickup") }).first().click();
  const drawer = ayse.getByRole("dialog", { name: "Review shift change" });
  await drawer.getByRole("button", { name: "Decline Ali Person" }).click();
  await drawer.getByLabel("Reason for Ali").fill("You are over your hours this week");
  await drawer.getByRole("button", { name: "Decline Ali", exact: true }).click();
  await drawer.getByRole("button", { name: "Confirm decline" }).click();
  await expect(ayse.getByText("Ali's request is declined. The others can still take the shift.")).toBeVisible();

  await expect.poll(() => sql(`select string_agg(p.first_name || ':' || a.status, ',' order by p.first_name)
    from public.shift_exchange_applications a join public.employee_profiles p on p.id = a.employee_id
    where a.case_id = '${caseId}';`)).toBe("Ali:rejected_by_manager,Deniz:pending_manager");
  // The reason reaches Ali, not Emre, whose shift it is.
  const reason = (who: string) => sql(`select coalesce(string_agg(h ->> 'message', ','), '')
    from jsonb_array_elements(public.shift_exchanges_read_service(tests.user('${run}:${who}'), tests.id('${run}'), false,
      tests.week(${week}), tests.week(${week}) + 6) -> 'cases') c
    cross join lateral jsonb_array_elements(c -> 'history') h
    where c ->> 'id' = '${caseId}' and h ->> 'action' = 'application_rejected';`);
  expect(reason("ali")).toBe("You are over your hours this week");
  expect(reason("emre")).not.toContain("over your hours");
});
