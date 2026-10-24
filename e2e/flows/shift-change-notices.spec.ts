import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { personWithPassword, signInAs } from "../fixtures/documents";
import { psql } from "../global-setup";
import { roundLabel, roundWeek, signIn, type Person } from "../fixtures/world";

// TAKAS-BILDIRIM (Mert, 2026-10-20, items 30 and 32): Emre releases his Thursday shift. A teammate at
// Kadikoy hears of it in Notifications, opens it straight onto the card and takes it. Ayse, Kadikoy's
// manager, is asked to decide; once she approves, the teammate reads that the pickup is approved and
// Emre that he no longer works it. The teammate is this spec's own: the password reset spec changes a
// world person's password.

const run: string = JSON.parse(readFileSync(new URL("../.world.json", import.meta.url), "utf8")).run;

function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

async function open(browser: Browser, person: Person | { email: string }): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  if (typeof person === "string") await signIn(page, person);
  else await signInAs(page, person.email);
  await expect(page).not.toHaveURL(/\/sign-in/);
  return page;
}

/** The left menu's Notifications opens the panel beside it. */
async function openPanel(page: Page) {
  await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: /^Notifications/ }).click();
  const panel = page.getByRole("dialog", { name: "Notifications" });
  await expect(panel).toBeVisible();
  return panel;
}

test("a release, its request and the decision each reach the people they change", async ({ browser }) => {
  test.setTimeout(180_000);
  const week = roundWeek(650);
  const label = roundLabel("emre-k-sn");
  sql(`select tests.publish_week('${run}', ${week}, '[
    {"label": "${label}", "person": "emre", "loc": "K", "job": "cook", "day": 3, "start": "10:00", "end": "14:00"}
  ]');`);
  const mate = `notice${Math.random().toString(36).slice(2, 7).replace(/[0-9]/g, "x")}`;
  // A notice names a person short and the shift by its day only (S-248).
  const mateShort = `${mate[0]!.toUpperCase()}${mate.slice(1)} P.`;
  const mateEmail = personWithPassword(mate, "employee", ["K"], "cook");

  // Emre releases it (Shift Hub's Release shift, tested in shift-hub-release.spec.ts).
  const caseId = sql(`select public.shift_exchanges_command_service(tests.user('${run}:emre'), tests.id('${run}'),
    jsonb_build_object('action', 'create', 'kind', 'cover', 'shift_id', tests.id('${run}:shift:${label}')), gen_random_uuid()) ->> 'case_id';`);

  // The teammate hears of it and opens it onto the card in Available Shifts.
  const teammate = await open(browser, { email: mateEmail });
  const panel = await openPanel(teammate);
  await panel.getByRole("tab", { name: /^Needs action/ }).click();
  const offer = panel.getByRole("listitem").filter({ hasText: "Extra shift on" }).filter({ hasText: "Emre P. can't make it" });
  await expect(offer).toHaveCount(1);
  // The row's own button opens it; the unread dot before it only reads it (S-251).
  await offer.getByRole("button", { name: /^(Unread: )?Extra shift on/ }).click();
  await expect(teammate).toHaveURL(new RegExp(`/app/employee-hub/shift-hub\\?case=${caseId}`));
  await teammate.getByRole("button", { name: "I’ll take it" }).click();
  await expect
    .poll(() => sql(`select count(*) from public.shift_exchange_applications a
      where a.case_id = '${caseId}' and a.employee_id = tests.id('${run}:${mate}') and a.status = 'pending_manager';`), { timeout: 30_000 })
    .toBe("1");

  // Ayse is asked to decide.
  const ayse = await open(browser, "ayse");
  const asks = await openPanel(ayse);
  await asks.getByRole("tab", { name: /^Needs action/ }).click();
  await expect(asks.getByRole("listitem").filter({ hasText: `${mateShort} wants Emre P.'s shift` })
    .filter({ hasText: "Decide by" })).toHaveCount(1);

  // She approves (Requests' review, tested in requests-swap-review.spec.ts); her card closes.
  sql(`select public.shift_exchanges_command_service(tests.user('${run}:ayse'), tests.id('${run}'), jsonb_build_object(
    'action', 'approve', 'case_id', '${caseId}'::uuid,
    'application_id', (select id from public.shift_exchange_applications where case_id = '${caseId}' and status = 'pending_manager'),
    'expected_revision', (select revision from public.shift_exchange_cases where id = '${caseId}'),
    'fingerprint', public.shift_exchange_preview(tests.user('${run}:ayse'), tests.id('${run}'), '${caseId}'::uuid,
      (select id from public.shift_exchange_applications where case_id = '${caseId}' and status = 'pending_manager')) ->> 'fingerprint'),
    gen_random_uuid());`);
  await expect(asks.getByRole("listitem").filter({ hasText: `${mateShort} wants Emre P.'s shift` })).toHaveCount(0, { timeout: 30_000 });

  // The teammate and Emre read the decision, live.
  await teammate.keyboard.press("Escape");
  const mine = await openPanel(teammate);
  await expect(mine.getByRole("button", { name: /^(Unread: )?Your pickup is approved$/ })).toBeVisible({ timeout: 30_000 });
  const emre = await open(browser, "emre");
  const his = await openPanel(emre);
  await expect(his.getByRole("button", { name: /^(Unread: )?Your .+ shift is covered$/ }).first()).toBeVisible();
});
