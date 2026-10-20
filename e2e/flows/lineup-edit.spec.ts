import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "../fixtures/test";
import { psql } from "../global-setup";
import { roundLabel, roundWeek, signIn } from "../fixtures/world";

// LINEUP-EDIT W2a (KARARLAR S-178 madde 1-4, ek 2-3, ek b; the design's F "after"): on Kadikoy's draft for a day to
// come, Ayse changes Emre's In in place (the orange dot and "+1 h" under it), gives him a section typed with Other…
// and Save to sections, renames it in the Sections window from the gear by SECTION, writes the Specials, and
// deletes the section with two clicks. The Schedule doesn't change.

const run: string = JSON.parse(readFileSync(new URL("../.world.json", import.meta.url), "utf8")).run;

function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

test("a manager changes a draft lineup's row, its location's sections and its notes in place", async ({ browser }) => {
  const week = roundWeek(670);
  const label = roundLabel("emre-k-lineup-edit");
  sql(`select tests.publish_week('${run}', ${week}, '[
    {"label": "${label}", "person": "emre", "loc": "K", "job": "cook", "day": 3, "start": "16:00", "end": "22:00"}
  ]');`);
  const day = sql(`select tests.week(${week}) + 3;`);
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await signIn(page, "ayse");
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto(`/app/schedule/lineup?date=${day}`);
  await page.getByRole("combobox", { name: "Location" }).selectOption({ label: "Kadikoy" });
  const team = page.getByRole("tabpanel");
  await expect(team).toContainText("Emre Person");

  // In, typed: 3 PM is an hour earlier, so the shift is an hour longer than the Schedule's.
  const start = team.getByRole("textbox", { name: "In, Emre Person" });
  await expect(start).toHaveValue("4:00 PM");
  await start.fill("3 pm");
  await start.press("Enter");
  await expect(start).toHaveValue("3:00 PM");
  await expect(team.locator(".lineup-desk-change.is-longer")).toHaveText("+1 h");
  await expect(team.getByRole("img", { name: "Changed in this lineup only" })).toBeVisible();

  // A section typed with Other…, kept in the location's list by Save to sections.
  const name = `Window ${Date.now() % 100000}`;
  await team.getByRole("combobox", { name: "Section, Emre Person" }).selectOption({ label: "Other…" });
  await team.getByRole("textbox", { name: "New section, Emre Person" }).fill(name);
  await team.getByRole("checkbox", { name: "Save to sections" }).check();
  await team.getByRole("button", { name: "Use this section" }).click();
  const section = team.getByRole("combobox", { name: "Section, Emre Person" });
  await expect(section.locator("option:checked")).toHaveText(name);

  // The Sections window from the gear by SECTION: rename it.
  await team.getByRole("button", { name: "Manage sections" }).click();
  const sections = page.getByRole("dialog", { name: "Sections · Kadikoy" });
  const own = sections
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: `Delete ${name}`, exact: true }) })
    .getByRole("textbox", { name: "Section name" });
  await expect(own).toHaveValue(name);
  await expect(sections.getByRole("listitem").filter({ hasText: "1 person today" })).toHaveCount(1);
  await own.fill(`${name}B`);
  await own.press("Enter");
  await expect(sections.getByRole("button", { name: `Delete ${name}B`, exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("lineup-edit-1440-sections.png") });
  await sections.getByRole("button", { name: "Done" }).click();
  await expect(section.locator("option:checked")).toHaveText(`${name}B`);
  await page.screenshot({ path: test.info().outputPath("lineup-edit-1440-team.png") });

  // The notes in place.
  await page.getByRole("tab", { name: "Notes" }).click();
  await page.getByRole("button", { name: "Edit notes" }).click();
  await page.getByPlaceholder("Tonight's specials").fill("Halibut, $34");
  await page.screenshot({ path: test.info().outputPath("lineup-edit-1440-notes.png") });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("region", { name: "Notes" })).toContainText("Halibut, $34");

  // The Schedule keeps its In.
  expect(sql(`select to_char(start_time, 'HH24:MI') from public.schedule_published_shifts where id = tests.id('${run}:shift:${label}');`)).toBe("16:00");

  // Deleted with two clicks: the draft's row has no section any more.
  await page.getByRole("tab", { name: /^Team/ }).click();
  await team.getByRole("button", { name: "Manage sections" }).click();
  await sections.getByRole("button", { name: `Delete ${name}B`, exact: true }).click();
  const armed = sections.getByRole("button", { name: `Click again to delete ${name}B`, exact: true });
  await expect(armed).toHaveText("Click again to delete");
  await armed.click();
  await expect(sections.getByRole("button", { name: new RegExp(`${name}B$`) })).toHaveCount(0);
  await sections.getByRole("button", { name: "Done" }).click();
  await expect(section.locator("option:checked")).toHaveText("None");

  // The phone's Lineup is as it was (its editing comes with W2b): the team reads, nothing to pick.
  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await signIn(phone, "ayse");
  await phone.goto(`/app/schedule/lineup?date=${day}&location=${sql(`select tests.id('${run}:K');`)}`);
  await expect(phone.getByText("Emre Person").first()).toBeVisible();
  await expect(phone.getByRole("combobox", { name: "Position, Emre Person" })).toHaveCount(0);
  await phone.screenshot({ path: test.info().outputPath("lineup-edit-390-phone.png") });
});
