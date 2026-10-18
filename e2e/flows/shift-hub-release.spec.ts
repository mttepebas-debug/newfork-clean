import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { psql } from "../global-setup";
import { roundLabel, roundWeek, signIn, type Person } from "../fixtures/world";

// TAKAS-RELEASE (Mert, 2026-10-13/14 plan; first slice 2026-10-17): Emre releases
// his Thursday shift with a note for teammates. Ali finds it in Available Shifts
// and takes it; Deniz says "Not for me" and the card leaves his deck. Emre reads
// who wants it in My requests and takes his shift back in two clicks, no reason.

const run: string = JSON.parse(readFileSync(new URL("../.world.json", import.meta.url), "utf8")).run;

function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

async function open(browser: Browser, person: Person, path: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, person);
  await expect(page).toHaveURL(/\/app\/(employee-hub|workspace)/);
  await page.goto(path);
  return page;
}

test("a released shift reaches teammates' decks, and its owner takes it back", async ({ browser }) => {
  test.setTimeout(180_000);
  const week = roundWeek(620);
  const label = roundLabel("emre-k-rl");
  const shiftId = sql(`
    select tests.publish_week('${run}', ${week}, '[
      {"label": "${label}", "person": "emre", "loc": "K", "job": "cook", "day": 3, "start": "10:00", "end": "14:00"}
    ]');
    select tests.id('${run}:shift:${label}');`).split(/\r?\n/).at(-1)!;
  const day = sql(`select tests.week(${week}) + 3;`);
  const range = `from=${day}&to=${day}`;

  // Emre releases it from the three named options, with a note for teammates.
  const emre = await open(browser, "emre", `/app/employee-hub/shift-hub?offer=${shiftId}&${range}`);
  await emre.getByRole("link", { name: /Release shift/ }).click();
  await emre.getByLabel(/Note for teammates/).fill("Dentist appointment, thanks!");
  await emre.getByRole("button", { name: "Release shift", exact: true }).click();
  // A case keeps the shift's source (the draft shift it was published from), not the published row's id.
  const caseOf = () => sql(`select coalesce(max(c.id::text), '') from public.shift_exchange_cases c
    join public.schedule_published_shifts p on coalesce(p.source_shift_id, p.id) = c.offered_source_id
    where p.id = tests.id('${run}:shift:${label}') and c.status = 'open';`);
  await expect.poll(caseOf, { timeout: 30_000 }).not.toBe("");
  const caseId = caseOf();
  expect(sql(`select teammate_note from public.shift_exchange_cases where id = '${caseId}';`)).toBe("Dentist appointment, thanks!");

  // Ali takes it from his deck.
  const ali = await open(browser, "ali", `/app/employee-hub/shift-hub?hub_view=available&${range}`);
  const card = ali.getByRole("article", { name: /Emre Person can’t make this shift/ });
  await expect(card).toContainText("Dentist appointment, thanks!");
  await ali.getByRole("button", { name: "I’ll take it" }).click();
  await expect
    .poll(() => sql(`select count(*) from public.shift_exchange_applications a join public.employee_profiles p on p.id = a.employee_id
      where a.case_id = '${caseId}' and p.first_name = 'Ali' and a.status = 'pending_manager';`), { timeout: 30_000 })
    .toBe("1");

  // Deniz passes with the left arrow key; the card leaves his deck.
  const deniz = await open(browser, "deniz", `/app/employee-hub/shift-hub?hub_view=available&${range}`);
  const top = deniz.getByRole("article", { name: /Emre Person can’t make this shift/ });
  await top.focus();
  await deniz.keyboard.press("ArrowLeft");
  await expect
    .poll(() => sql(`select count(*) from public.shift_exchange_applications a join public.employee_profiles p on p.id = a.employee_id
      where a.case_id = '${caseId}' and p.first_name = 'Deniz' and a.status = 'declined_by_employee';`), { timeout: 30_000 })
    .toBe("1");
  await deniz.reload();
  await expect(deniz.getByRole("article", { name: /Emre Person can’t make this shift/ })).toHaveCount(0);

  // Emre reads who wants it, not who passed, and takes the shift back.
  await emre.goto(`/app/employee-hub/shift-hub?case=${caseId}&${range}`);
  const release = emre.getByRole("region", { name: "Released shift" });
  await expect(release).toContainText("Ali Person");
  await expect(release).not.toContainText("Deniz Person");
  await release.getByRole("button", { name: "Take back shift", exact: true }).click();
  await release.getByRole("button", { name: "Confirm take back", exact: true }).click();
  await expect
    .poll(() => sql(`select status from public.shift_exchange_cases where id = '${caseId}';`), { timeout: 30_000 })
    .toBe("cancelled");
});
