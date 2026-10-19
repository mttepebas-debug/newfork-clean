import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { psql } from "../global-setup";
import { roundLabel, roundWeek, signIn } from "../fixtures/world";

// PRESET-SAAT (KARARLAR S-183, variant A): a shift type keeps several times,
// one primary (Settings → Shift types). Dropping its preset chip on a day opens
// a small list beside the cell; the picked time is written and shows on the
// card. Example: Dinner 4:15–11:30 PM is primary, 5–11 PM is another time;
// Zeynep drops Dinner-Cook on Emre's Wednesday and picks 5–11 PM.

const run: string = JSON.parse(readFileSync(new URL("../.world.json", import.meta.url), "utf8")).run;
// A week no other spec uses.
const WEEK = 540;

function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

// A person working at two locations has a row in each location's section, so a
// cell is named by its section too.
const cell = (page: Page, locationId: string, employeeId: string, date: string) =>
  page.locator(
    `.schedule-cell[data-display-location-id="${locationId}"][data-employee-id="${employeeId}"][data-date="${date}"]`,
  );
const card = (page: Page, locationId: string, employeeId: string, date: string) =>
  cell(page, locationId, employeeId, date).locator('[data-shift-badge]:not([data-ghost="true"])');

test("a dropped preset offers its type's times and the picked one shows on the card", async ({ browser }) => {
  const week = roundWeek(WEEK);
  const dinner = roundLabel("PT Dinner");
  sql(`
    insert into public.shift_types (workspace_id, name, color, default_start_time, default_end_time, time_options)
    values (tests.id('${run}'), '${dinner}', '#7c3aed', '16:15', '23:30', '[{"start_time":"17:00","end_time":"23:00"}]');
    select tests.publish_week('${run}', ${week}, '[
      {"label": "${roundLabel("emre-preset")}", "person": "emre", "loc": "K", "job": "cook", "day": 0, "start": "09:00", "end": "15:00"}
    ]');`);
  const [monday, wednesday, emreId, kadikoyId] = sql(
    `select tests.week(${week}) || ' ' || tests.week(${week}) + 2 || ' ' || tests.id('${run}:emre') || ' ' || tests.id('${run}:K');`,
  ).split(" ") as [string, string, string, string];

  const zeynep = await (await browser.newContext()).newPage();
  await signIn(zeynep, "zeynep");
  await expect(zeynep).not.toHaveURL(/\/sign-in/);
  await zeynep.goto(`/app/schedule?date=${monday}`);
  await zeynep.getByRole("button", { name: /^Draft selector:/ }).click();
  await zeynep.getByRole("button", { name: "Edit live schedule", exact: true }).click();
  await expect(zeynep).toHaveURL(/mode=edit/);

  // The preset chips show in the Job/Position order; the switch that hid a
  // preset's time is gone.
  await zeynep.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(zeynep.getByRole("button", { name: "Use default times for scheduling" })).toHaveCount(0);
  await zeynep.getByRole("menuitemradio", { name: "Job/Position" }).click();
  await zeynep.keyboard.press("Escape");

  // The grid is taller and wider than the window (every spec's people share the
  // world), so the chip is taken in the Kadikoy section and Emre's row, further
  // down, is scrolled in while the chip is held, as a manager's wheel would.
  // The drop finds its cell under the pointer, so it must be on screen and not
  // under the pinned rows (headers, Unassigned) at the top: it is scrolled to
  // the bottom right of the grid.
  const chip = zeynep
    .locator(`.schedule-preset-cell[data-display-location-id="${kadikoyId}"]`)
    .getByRole("button", { name: `${dinner}-Cook`, exact: true });
  const target = cell(zeynep, kadikoyId, emreId, wednesday);
  await chip.scrollIntoViewIfNeeded();
  const from = (await chip.boundingBox())!;
  await zeynep.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await zeynep.mouse.down();
  await zeynep.mouse.move(from.x + from.width / 2 + 16, from.y + from.height / 2 + 16, { steps: 4 });
  await target.evaluate((element) => element.scrollIntoView({ block: "end", inline: "end" }));
  const to = (await target.boundingBox())!;
  const drop = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  expect(
    await zeynep.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest(".schedule-cell")?.getAttribute("data-employee-id"),
      drop,
    ),
  ).toBe(emreId);
  await zeynep.mouse.move(drop.x, drop.y, { steps: 12 });
  await zeynep.mouse.up();

  // The list: the primary first, then the other time.
  const list = zeynep.getByRole("dialog", { name: `Time for ${dinner}-Cook` });
  await expect(list).toBeVisible();
  const options = list.getByRole("option");
  await expect(options).toHaveCount(2);
  await expect(options.first()).toContainText("Primary");
  await options.filter({ hasText: "6h" }).click();
  await expect(list).toHaveCount(0);

  // The card says its time, and the saved shift has it, shown.
  await expect(card(zeynep, kadikoyId, emreId, wednesday)).toContainText("5:00 PM");
  await expect
    .poll(() =>
      sql(`select start_time || ' ' || end_time || ' ' || hide_time_on_badge from public.schedule_edit_session_shifts
           where employee_id = tests.id('${run}:emre') and scheduled_date = '${wednesday}'`),
    )
    .toBe("17:00:00 23:00:00 false");
});
