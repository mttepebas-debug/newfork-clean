import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { psql } from "../global-setup";
import { pickDays } from "../fixtures/time-off";
import { round, roundWeek, signIn, type Person } from "../fixtures/world";

// BILDIRIM-10 (KARARLAR S-123, variant A): somebody at Kadikoy asks for a day
// off; Ayse, Kadikoy's manager, sees it in the panel the left menu's
// Notifications opens, reviews it from there in Requests → Time off (time off
// rebuild D7), and the employee finds the decision in their own list.

const world: { readonly run: string; readonly password: string } = JSON.parse(
  readFileSync(new URL("../.world.json", import.meta.url), "utf8"),
);
const run = world.run;

function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

async function signedIn(browser: Browser, who: Person | { readonly email: string }): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  if (typeof who === "string") await signIn(page, who);
  else {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(who.email);
    await page.getByLabel("Password").fill(world.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  }
  await expect(page).not.toHaveURL(/\/sign-in/);
  return page;
}

/** Somebody at Kadikoy only, with a sign-in: Ayse's approval alone decides. */
function personAtKadikoy() {
  const label = `inbox${Math.random().toString(36).slice(2, 7)}`;
  const name = `${label[0]!.toUpperCase()}${label.slice(1)} Person`;
  const week = roundWeek(10);
  const email = sql(`
    select tests.person('${run}', '${label}', 'employee', array['K'], array['cook']);
    select tests.password('${run}:${label}', '${world.password}');`)
    .split(/\r?\n/)
    .at(-1)!;
  const day = sql(`select tests.week(${week}) + 3;`);
  return { label, name, email, day };
}

/** The left menu's Notifications opens the panel beside it. */
async function openPanel(page: Page) {
  await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: /^Notifications/ }).click();
  const panel = page.getByRole("dialog", { name: "Notifications" });
  await expect(panel).toBeVisible();
  return panel;
}

test("a manager opens time off from the notification panel, approves it, and the employee sees the decision", async ({ browser }) => {
  const asker = personAtKadikoy();
  const note = `Dentist ${round()}`;

  // Employee Hub -> My availability -> Time off: one full day.
  const employee = await signedIn(browser, asker);
  await employee.goto("/app/employee-hub/my-availability?section=time-off");
  const mineList = employee.getByRole("region", { name: "Time off" });
  await mineList.getByRole("button", { name: "Request time off" }).click();
  const form = employee.getByRole("dialog", { name: "Request time off" });
  await form.getByRole("radio", { name: /Personal/ }).check();
  await pickDays(form, "First day", asker.day, asker.day);
  await form.getByLabel(/Note/).fill(note);
  await form.getByRole("button", { name: "Send request" }).click();
  await expect(form).toBeHidden();
  const request = sql(`select id from public.time_off_requests
    where employee_id = tests.id('${run}:${asker.label}') and kind = 'leave';`);

  // Ayse's menu counts it; the panel shows it under Needs action, and Review opens it where it is answered.
  const ayse = await signedIn(browser, "ayse");
  await ayse.goto("/app/workspace");
  const menuItem = ayse.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: /^Notifications, \d+ unread$/ });
  await expect(menuItem).toBeVisible();
  const panel = await openPanel(ayse);
  await panel.getByRole("tab", { name: /^Needs action/ }).click();
  const row = panel.getByRole("listitem").filter({ hasText: `Time off request from ${asker.name}` });
  await expect(row).toContainText(note);
  await row.getByRole("button", { name: "Review", exact: true }).click();
  await expect(ayse).toHaveURL(`/app/schedule/requests?type=time_off&request=${request}`);
  const drawer = ayse.getByRole("dialog", { name: "Review time off" });
  await drawer.getByRole("button", { name: "Approve", exact: true }).click();
  await expect.poll(() => sql(`select status from public.time_off_requests where id = '${request}';`)).toBe("approved");
  await drawer.getByRole("button", { name: "Close details" }).click();
  await expect(drawer).toBeHidden();
  // The card closes for every decider; Needs action no longer lists it.
  const again = await openPanel(ayse);
  await again.getByRole("tab", { name: /^Needs action/ }).click();
  await expect(again.getByRole("listitem").filter({ hasText: `Time off request from ${asker.name}` })).toHaveCount(0);

  // The employee's own list has the decision, live.
  const mine = await openPanel(employee);
  await expect(mine.getByRole("button", { name: /^(Unread: )?Your time off .* is approved$/ })).toBeVisible();
});

// BILDIRIM-13 (Mert 2026-10-16, variant A): on a phone the manager's top bar
// carries the bell; tapping it opens the list full screen, Back closes it.
test("a manager on a phone opens the notification list from the top bar's bell", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
  await signIn(page, "ayse");
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto("/app/schedule/requests");
  const bar = page.getByRole("banner", { name: "Workspace bar" });
  await expect(bar).toBeVisible();
  await bar.getByRole("button", { name: /^Notifications/ }).tap();
  const list = page.getByRole("dialog", { name: "Notifications" });
  await expect(list).toBeVisible();
  await expect(list.getByRole("tab", { name: /^All/ })).toBeVisible();
  await list.getByRole("button", { name: "Back" }).tap();
  await expect(list).toBeHidden();
  // More no longer carries Notifications; the bell is the way in.
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "More" }).tap();
  await expect(page.getByRole("dialog", { name: "More" }).getByRole("link", { name: "Notifications" })).toHaveCount(0);
});
