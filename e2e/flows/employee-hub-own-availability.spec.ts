import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { psql } from "../global-setup";
import { round } from "../fixtures/world";

// AVAIL-GUN-1 (spec "Kurallar" 5): a published shift on hours the employee
// marked unavailable stays theirs and carries a small note, under the shift
// in Employee Hub -> Home, under the next 7 days, and in the shift's window, with two
// ways out: "Swap or give up" (Shift Hub's offer) and "Request time off".
// A shift outside the marked hours carries no note.
//
// Employee Hub lists shifts from two days ago to six weeks ahead, so the shifts
// are next week's (tests.week(-99) is next Monday), not ~700 days out. The
// employee is fresh, so no other spec's shifts or week reach this Home. The
// week is Besiktas's: schedule-shift-note.spec.ts builds and publishes the
// same week at Kadikoy from a blank draft, and a week already out there
// breaks its Publish (CI run 39023052297).

const world: { readonly run: string; readonly password: string } = JSON.parse(
  readFileSync(new URL("../.world.json", import.meta.url), "utf8"),
);
const sql = (query: string) => execSync(psql, { input: query, encoding: "utf8" }).trim();

function freshEmployee() {
  const label = `ownav${Math.random().toString(36).slice(2, 7)}`;
  const email = sql(`
    select tests.person('${world.run}', '${label}', 'employee', array['B'], array['cook']);
    select tests.password('${world.run}:${label}', '${world.password}');`)
    .split(/\r?\n/)
    .at(-1)!;
  return { label, email };
}

async function signInAs(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(world.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
  return page;
}

test("a shift on hours the employee marked unavailable carries a note with swap and time off", async ({ browser }) => {
  const { label, email } = freshEmployee();
  const week = -99 + round();
  // Monday evening (the marked hours) and Wednesday morning (free).
  sql(`select tests.publish_week('${world.run}', ${week}, '[
    {"label": "${label}-mon", "person": "${label}", "loc": "B", "job": "cook", "day": 0, "start": "18:00", "end": "22:00"},
    {"label": "${label}-wed", "person": "${label}", "loc": "B", "job": "cook", "day": 2, "start": "09:00", "end": "13:00"}
  ]');`);
  const evening = sql(`select tests.id('${world.run}:shift:${label}-mon');`);
  const morning = sql(`select tests.id('${world.run}:shift:${label}-wed');`);
  // The employee marks Monday 6 PM - 11 PM unavailable after the week is out,
  // as My Availability saves it.
  sql(`select public.weekly_preferences_save_service(tests.user('${world.run}:${label}'), tests.id('${world.run}'),
      jsonb_build_object('employee_id', tests.id('${world.run}:${label}'), 'source', 'employee',
        'expected_revision', coalesce((m -> 'employee' ->> 'revision')::integer, 0),
        'settings_revision', (m -> 'settings' ->> 'revision')::integer,
        'preference', jsonb_set(public.empty_weekly_preference(), '{days,1,ranges}', '[{"start": "18:00", "end": "23:00"}]')),
      gen_random_uuid())
    from (select public.weekly_preferences_read_service(tests.user('${world.run}:${label}'), tests.id('${world.run}')) m) x;`);

  const page = await signInAs(browser, email);
  await page.goto("/app/employee-hub");
  // Daylight Home (Mert 2026-10-18): the notes sit under the next 7 days.
  const flags = page.getByRole("list", { name: "Shifts on hours you marked unavailable" });
  const note = flags.getByRole("note");
  // One note: the Monday evening's; the Wednesday morning has none.
  await expect(note).toHaveCount(1);
  await expect(note).toContainText(/You marked Mon .+ unavailable\./);
  await expect(note).toContainText("You're scheduled, so the shift is yours.");
  await expect(flags.getByRole("link", { name: /6:00 PM – 10:00 PM/ })).toHaveAttribute("href", `/app/employee-hub?shift=${evening}`);
  await expect(note.getByRole("link", { name: "Swap or give up" })).toHaveAttribute(
    "href",
    `/app/employee-hub/shift-hub?offer=${evening}`,
  );

  // The shift's window carries the same note; the morning's window does not.
  await page.goto(`/app/employee-hub?shift=${evening}`);
  const sheet = page.getByRole("dialog", { name: "Your shift", exact: true });
  await expect(sheet.getByRole("note")).toContainText(/You marked Mon .+ unavailable\./);
  await sheet.getByRole("note").getByRole("link", { name: "Request time off" }).click();
  await expect(page).toHaveURL(/\/app\/employee-hub\/my-availability\?section=time-off$/);
  await expect(page.getByRole("region", { name: "Time off" }).getByRole("button", { name: "Request time off" })).toBeVisible();

  await page.goto(`/app/employee-hub?shift=${morning}`);
  await expect(sheet).toContainText("Besiktas");
  await expect(sheet.getByRole("note")).toHaveCount(0);

  // "Swap or give up" opens Shift Hub's offer on that shift.
  await page.goto("/app/employee-hub");
  await page.getByRole("list", { name: "Shifts on hours you marked unavailable" }).getByRole("link", { name: "Swap or give up" }).click();
  await expect(page).toHaveURL(new RegExp(`/app/employee-hub/shift-hub\\?offer=${evening}`));
});
