import { execSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Browser, BrowserContextOptions, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { psql } from "../global-setup";

// Account > Notifications and Settings > Notifications on the notification
// core (BILDIRIM-11, KARARLAR S-123):
// - when the owner turns off every optional type of a topic, that topic is
//   gone from a person's table;
// - a person's channel choice holds after a reload.
// The workspace is this file's own: turning notifications off in the shared
// world would reach every later spec.

const world: { readonly password: string } = JSON.parse(
  readFileSync(new URL("../.world.json", import.meta.url), "utf8"),
);
const shots = fileURLToPath(new URL("../../artifacts/bildirim-11/", import.meta.url));

function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

let w: string;
let ownerEmail: string;
let employeeEmail: string;

test.beforeAll(() => {
  test.setTimeout(180_000);
  w = `notif${Date.now()}`;
  const printed = sql(`
    select tests.world('${w}');
    select tests.person('${w}', 'ada', 'employee', array['K'], array['cook']);
    select tests.password('${w}:owner', '${world.password}');
    select tests.password('${w}:ada', '${world.password}');`).split(/\r?\n/);
  ownerEmail = printed.at(-2)!;
  employeeEmail = printed.at(-1)!;
  mkdirSync(shots, { recursive: true });
});

async function open(browser: Browser, email: string, path: string, options: BrowserContextOptions = {}): Promise<Page> {
  const page = await (await browser.newContext(options)).newPage();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(world.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto(path);
  return page;
}

const openShiftTypes = [
  "An extra shift you can take is open",
  "An open shift you asked for went to someone else",
  "The owner of a shift you asked for kept it",
];
const topics = (page: Page) => page.getByRole("table", { name: "What reaches you" });

test("an optional topic the owner turns off is gone from a person's table", async ({ browser }) => {
  const employee = await open(browser, employeeEmail, "/account/preferences/notifications");
  await expect(topics(employee).getByRole("rowheader", { name: "Open shifts" })).toBeVisible();

  const owner = await open(browser, ownerEmail, "/app/settings/notifications");
  await expect(owner.getByRole("heading", { name: "Notifications", level: 1 })).toBeVisible();
  // Always sent is a closed list, not a control.
  await expect(owner.getByRole("group", { name: "Channels" }).getByRole("switch", { name: "Text messages" })).toHaveCount(0);
  for (const name of openShiftTypes) {
    const toggle = owner.getByRole("switch", { name });
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(toggle).not.toBeChecked();
  }
  await owner.getByRole("button", { name: "Save" }).click();
  await expect(owner.getByText("Notification settings saved")).toBeVisible();
  expect(
    sql(`select count(*) from public.notification_workspace_muted_types where workspace_id = tests.id('${w}');`),
  ).toBe("3");

  await owner.reload();
  for (const name of openShiftTypes) await expect(owner.getByRole("switch", { name })).not.toBeChecked();

  await employee.reload();
  await expect(topics(employee).getByRole("rowheader", { name: "My schedule" })).toBeVisible();
  await expect(topics(employee).getByRole("rowheader", { name: "Open shifts" })).toHaveCount(0);

  // Back as it was: the owner turns them on again and the topic returns.
  for (const name of openShiftTypes) await owner.getByRole("switch", { name }).click();
  await owner.getByRole("button", { name: "Save" }).click();
  await expect(owner.getByText("Notification settings saved")).toBeVisible();
  await employee.reload();
  await expect(topics(employee).getByRole("rowheader", { name: "Open shifts" })).toBeVisible();
});

test("a person's channel choice holds after a reload", async ({ browser }) => {
  const employee = await open(browser, employeeEmail, "/account/preferences/notifications");
  const timeOffEmail = employee.getByRole("checkbox", { name: "Time off by email" });
  await expect(timeOffEmail).toBeChecked();
  await expect(employee.getByRole("button", { name: "Save" })).toBeDisabled();
  await timeOffEmail.click();
  await employee.getByRole("button", { name: "Save" }).click();
  await expect(employee.getByText("Notification choices saved")).toBeVisible();
  expect(
    sql(`select enabled from public.notification_preferences
         where workspace_id = tests.id('${w}') and topic_key = 'time_off' and channel = 'email';`),
  ).toBe("f");

  await employee.reload();
  await expect(employee.getByRole("checkbox", { name: "Time off by email" })).not.toBeChecked();
  await expect(employee.getByRole("checkbox", { name: "Time off by phone alerts" })).toBeChecked();
  await expect(employee.getByRole("button", { name: "Save" })).toBeDisabled();
});

test("both pages at desktop 1440 and phone 390", async ({ browser }) => {
  const desktop = { viewport: { width: 1440, height: 1200 }, reducedMotion: "reduce" as const };
  const phone = { viewport: { width: 390, height: 1700 }, hasTouch: true, isMobile: true, reducedMotion: "reduce" as const };
  for (const [label, options] of [["1440", desktop], ["390", phone]] as const) {
    const account = await open(browser, employeeEmail, "/account/preferences/notifications", options);
    await expect(topics(account)).toBeVisible();
    await account.screenshot({ path: `${shots}${label}-account-notifications.png` });

    const settings = await open(browser, ownerEmail, "/app/settings/notifications", options);
    await expect(settings.getByRole("group", { name: "Optional notifications" })).toBeVisible();
    await settings.screenshot({ path: `${shots}${label}-settings-notifications.png` });
    await settings.getByText("Always sent").click();
    await expect(settings.getByText("Somebody asked for time off")).toBeVisible();
    await settings.getByText("Always sent").scrollIntoViewIfNeeded();
    await settings.screenshot({ path: `${shots}${label}-settings-notifications-always-sent.png` });
  }
});
