import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { psql } from "../global-setup";

// Employee Hub → My Availability, day by day (KARARLAR "Müsaitlik giriş
// ekranı = 4 · Gün gün"; Mert 2026-10-16, "A · Alt sayfa"): on a computer the
// days sit on the left and the chosen day on the right, one Save for the
// week; on a phone a day opens in a sheet and saves on its own. One range a
// day. Each test has its own employee, so no other spec sees the week.

const world: { readonly run: string; readonly password: string } = JSON.parse(
  readFileSync(new URL("../.world.json", import.meta.url), "utf8"),
);
const sql = (query: string) => execSync(psql, { input: query, encoding: "utf8" }).trim();

function freshEmployee(tag: string) {
  const label = `${tag}${Math.random().toString(36).slice(2, 7)}`;
  const email = sql(`
    select tests.person('${world.run}', '${label}', 'employee', array['K'], array['cook']);
    select tests.password('${world.run}:${label}', '${world.password}');`)
    .split(/\r?\n/)
    .at(-1)!;
  return { label, email };
}
const savedWeek = (label: string) =>
  JSON.parse(
    sql(`select p.preference::text from public.employee_weekly_preferences p where p.employee_id = tests.id('${world.run}:${label}');`) || "null",
  ) as { days: { day: number; all_day: boolean; ranges: { start: string; end: string }[] }[] } | null;

async function open(browser: Browser, email: string, size: { width: number; height: number }): Promise<Page> {
  const phone = size.width < 700;
  const page = await (await browser.newContext({ viewport: size, hasTouch: phone, isMobile: phone })).newPage();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(world.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto("/app/employee-hub/my-availability");
  return page;
}

test("desktop: Friday's evening and the Thursday it was copied to are saved with one Save", async ({ browser }) => {
  const person = freshEmployee("dayweek");
  const page = await open(browser, person.email, { width: 1440, height: 900 });
  const days = page.getByRole("navigation", { name: "Days" });
  await days.getByRole("button", { name: /^Friday/ }).click();
  await expect(page.getByRole("heading", { level: 3, name: "Friday" })).toBeVisible();
  await page.getByRole("radio", { name: /^Some hours/ }).click();
  await expect(page.getByRole("combobox", { name: "From" })).toHaveValue(String(18 * 60));
  await page.getByRole("button", { name: "Thursday, now Available" }).click();
  const bar = page.getByRole("region", { name: "Unsaved changes" });
  await expect(bar).toContainText("2 days changed. Your managers see it after you save.");
  await bar.getByRole("button", { name: "Save availability" }).click();
  await expect(bar).toBeHidden();
  await expect(page.getByText(/^Shared with your managers · /)).toBeVisible();
  // No toast after a save (Tur 2).
  await expect(page.getByRole("status").filter({ hasText: /saved/i })).toHaveCount(0);

  await page.reload();
  await expect(days.getByRole("button", { name: /^Friday/ })).toHaveText(/Unavailable after 6:00 PM/);
  await expect(days.getByRole("button", { name: /^Thursday/ })).toHaveText(/Unavailable after 6:00 PM/);
  const week = savedWeek(person.label)!;
  expect(week.days.find((day) => day.day === 5)!.ranges).toEqual([{ start: "18:00", end: "24:00" }]);
  expect(week.days.find((day) => day.day === 4)!.ranges).toEqual([{ start: "18:00", end: "24:00" }]);
});

test("phone: Monday opens in a sheet, saves on its own and stays saved", async ({ browser }) => {
  const person = freshEmployee("daysheet");
  const page = await open(browser, person.email, { width: 390, height: 844 });
  const monday = page.locator(".dav-list > .dav-row").first();
  await expect(monday).toHaveText(/MondayAvailable all day/);
  await monday.tap();
  const sheet = page.getByRole("dialog", { name: "Monday" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Save" })).toBeDisabled();
  await sheet.getByRole("radio", { name: /^Unavailable/ }).tap();
  await sheet.getByRole("button", { name: "Save" }).tap();
  await expect(sheet).toBeHidden();
  await expect(monday).toHaveText(/Unavailable all day/);
  // An unavailable day turns orange (Mert 2026-10-16).
  await expect(monday).toHaveClass(/is-blocked/);
  await page.reload();
  await expect(page.locator(".dav-list > .dav-row").first()).toHaveText(/Unavailable all day/);
  expect(savedWeek(person.label)!.days.find((day) => day.day === 1)!.all_day).toBe(true);
});
