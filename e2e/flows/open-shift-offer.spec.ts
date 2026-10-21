import { execSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { personWithPassword, tokenFor } from "../fixtures/documents";
import { draftName, roundLabel, roundWeek, signIn, tokenOf, type Person } from "../fixtures/world";
import { psql } from "../global-setup";

// Open shifts in the pool (Mert, 2026-10-20): Ayse publishes a week with an open Thursday
// cook shift at Kadikoy; the publish asks once what happens to it and she offers it. Ali (Kadikoy,
// cook) finds it in Shift Hub and asks; Ayse gives it to him in Requests. A cook at Besiktas never
// reads it, through any screen or the API. A week whose open shift Ayse keeps reaches nobody.
// E2E_SHOTS=1 also writes the screens to artifacts/acik-vardiya-havuz/.

const run: string = JSON.parse(readFileSync(new URL("../.world.json", import.meta.url), "utf8")).run;
const shots = process.env.E2E_SHOTS ? fileURLToPath(new URL("../../artifacts/acik-vardiya-havuz/", import.meta.url)) : null;

function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

async function open(browser: Browser, person: Person, path: string, width = 1440): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width, height: width > 500 ? 900 : 844 } })).newPage();
  await signIn(page, person);
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto(path);
  return page;
}

async function shot(page: Page, name: string) {
  if (!shots) return;
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}${name}.png` });
}

// A week Ayse writes at Kadikoy with one open cook shift on its Thursday, saved as a draft.
function draftWithOpenShift(week: number, label: string): string {
  return sql(`
    select tests.remember('${run}:session:${label}', (public.acquire_schedule_edit_session_service(tests.user('${run}:ayse'),
      tests.id('${run}'), tests.week(${week}), 'blank', null) -> 'session' ->> 'id')::uuid);
    select tests.add_shift(tests.user('${run}:ayse'), '${run}', tests.id('${run}:session:${label}'), ${week},
      '{"loc": "K", "job": "cook", "day": 3, "start": "16:00", "end": "22:00"}');
    select public.save_schedule_edit_session_service(tests.user('${run}:ayse'), tests.id('${run}'), tests.id('${run}:session:${label}'),
      (select revision from public.schedule_edit_sessions where id = tests.id('${run}:session:${label}')),
      '${draftName("Open shift week")}', null, null) ->> 'id';`).split(/\r?\n/).at(-1)!;
}

const api = async (token: string, path: string) => {
  const response = await fetch(`${process.env.E2E_API_URL}/v1/workspaces/${sql(`select tests.id('${run}');`)}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(response.status).toBe(200);
  return JSON.stringify(await response.json());
};

test("an open shift offered on publishing reaches who may take it, and a manager gives it", async ({ browser }) => {
  test.setTimeout(240_000);
  const week = roundWeek(640);
  const monday = sql(`select tests.week(${week});`);
  const thursday = sql(`select tests.week(${week}) + 3;`);
  draftWithOpenShift(week, roundLabel("open-offer"));
  const sourceOf = () => sql(`select coalesce(max(s.source_shift_id::text), '') from public.schedule_published_shifts s
    join public.schedule_location_publications p on p.id = s.publication_id and p.status = 'current'
    where s.workspace_id = tests.id('${run}') and s.location_id = tests.id('${run}:K') and s.scheduled_date = '${thursday}';`);

  // Ayse publishes and is asked once about the open shift; offering it is the default.
  const ayse = await open(browser, "ayse", `/app/schedule?date=${monday}`);
  await ayse.getByRole("button", { name: "Publish", exact: true }).click();
  const dialog = ayse.getByRole("dialog");
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  const question = dialog.getByRole("group", { name: "1 open shift: what happens when you publish?" });
  await expect(question).toBeVisible();
  await expect(question.getByRole("radio", { name: /Offer to eligible employees/ })).toBeChecked();
  await shot(ayse, "1440-publish-open-shifts");
  await dialog.getByRole("button", { name: "Publish 1 location", exact: true }).click();
  await expect(ayse.getByRole("dialog")).toHaveCount(0);
  await expect.poll(sourceOf, { timeout: 30_000 }).not.toBe("");
  const source = sourceOf();
  const published = sql(`select s.id from public.schedule_published_shifts s
    join public.schedule_location_publications p on p.id = s.publication_id and p.status = 'current' where s.source_shift_id = '${source}';`);
  const caseId = sql(`select coalesce(max(id::text), '') from public.shift_exchange_cases
    where offered_source_id = '${source}' and status = 'open' and owner_id is null;`);
  expect(caseId).not.toBe("");

  // Ali, a cook at Kadikoy, finds it in Available Shifts and asks for it.
  const ali = await open(browser, "ali", `/app/employee-hub/shift-hub?hub_view=available&from=${thursday}&to=${thursday}`, 390);
  const card = ali.getByRole("article", { name: /Your manager is offering this open shift/ });
  await expect(card).toContainText("Offered by your manager");
  await shot(ali, "390-shift-hub-open-shift");
  await ali.getByRole("button", { name: "I’ll take it" }).click();
  await expect
    .poll(() => sql(`select count(*) from public.shift_exchange_applications a join public.employee_profiles p on p.id = a.employee_id
      where a.case_id = '${caseId}' and p.first_name = 'Ali' and a.status = 'pending_manager';`), { timeout: 30_000 })
    .toBe("1");

  // A cook at Besiktas reads nothing of it, on any read the API gives an employee.
  const bora = personWithPassword(roundLabel("bora"), "employee", ["B"], "cook");
  const boraToken = await tokenFor(bora);
  const aliToken = await tokenOf("ali");
  const pool = (token: string) => api(token, `/shift-exchanges?view=employee&from=${thursday}&to=${thursday}`);
  expect(await pool(aliToken)).toContain(source);
  expect(await pool(boraToken)).not.toContain(source);
  expect(await api(boraToken, `/employee-hub?from=${monday}&to=${thursday}`)).not.toContain(published);
  expect(await api(boraToken, `/employee-hub/schedule?date=${thursday}`)).not.toContain(published);

  // Ayse gives it to Ali in Requests.
  await ayse.goto("/app/schedule/requests?type=shift_changes");
  await ayse.getByRole("row", { name: /^Shift pickup: Ali Person wants the open 4:00 PM Cook shift at Kadikoy/ }).first().click();
  const drawer = ayse.getByRole("dialog", { name: "Review shift change" });
  await expect(drawer).toContainText("Open shift");
  await shot(ayse, "1440-requests-open-shift");
  await drawer.getByRole("button", { name: "Give to Ali", exact: true }).click();
  await expect
    .poll(() => sql(`select coalesce(max(p.first_name), '') from public.schedule_published_shifts s
      join public.schedule_location_publications pub on pub.id = s.publication_id and pub.status = 'current'
      join public.employee_profiles p on p.id = s.employee_id where s.source_shift_id = '${source}';`), { timeout: 30_000 })
    .toBe("Ali");
});

test("an open shift kept on publishing reaches no employee", async () => {
  const week = roundWeek(650);
  const thursday = sql(`select tests.week(${week}) + 3;`);
  const draft = draftWithOpenShift(week, roundLabel("open-keep"));
  const ayse = await tokenOf("ayse");
  const workspace = sql(`select tests.id('${run}');`);
  const post = async (path: string, body: object) => {
    const response = await fetch(`${process.env.E2E_API_URL}${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${ayse}`, "content-type": "application/json", "x-newfork-workspace-id": workspace },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(200);
    return (await response.json()) as { fingerprint: string; draft_revision: number; open_shifts?: unknown[]; status: string };
  };
  const scope = { draft_id: draft, location_ids: [sql(`select tests.id('${run}:K');`)] };
  const preview = await post("/schedule/publish-preview", scope);
  expect(preview.open_shifts).toHaveLength(1);
  expect((await post("/schedule/publish", { ...scope, expected_draft_revision: preview.draft_revision,
    fingerprint: preview.fingerprint, open_shifts: "keep" })).status).toBe("published");

  const [published, source] = sql(`select s.id || ' ' || s.source_shift_id from public.schedule_published_shifts s
    join public.schedule_location_publications p on p.id = s.publication_id and p.status = 'current'
    where s.workspace_id = tests.id('${run}') and s.location_id = tests.id('${run}:K') and s.scheduled_date = '${thursday}';`).split(" ");
  expect(source).toBeTruthy();
  const ali = await tokenOf("ali");
  expect(await api(ali, `/shift-exchanges?view=employee&from=${thursday}&to=${thursday}`)).not.toContain(source);
  expect(await api(ali, `/employee-hub/schedule?date=${thursday}`)).not.toContain(published!);
  // Yes beside the no: Ali's own read answers, and nothing of the kept shift is in it.
  expect(await api(ali, `/employee-hub?from=${thursday}&to=${thursday}`)).toContain("\"open_shifts\":[]");
});
