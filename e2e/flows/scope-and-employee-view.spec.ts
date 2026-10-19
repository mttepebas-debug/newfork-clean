import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Browser, Locator, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { psql } from "../global-setup";
import { signIn, type Person } from "../fixtures/world";

// FOUNDATION-B FB-6.2.10: the scope half of flow 10 (FB-6.2 "Done when" 8),
// the way into the employee view and back ("Done when" 7), and what the
// Employees drawer says about somebody out of scope (BL-195).
// EMP-001 "Done when" 27: the owner cannot take the Owner job or a location
// off their own record; a manager assigned to a location and marked "Exclude
// from schedule" still manages it, without a row in its grid.
//
// Ayse manages Kadikoy, Mehmet manages Besiktas, Zeynep is an admin.

const world: { readonly run: string; readonly password: string } = JSON.parse(
  readFileSync(new URL("../.world.json", import.meta.url), "utf8"),
);
const run = world.run;

function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

async function openPage(browser: Browser, person: Person, path: string, phone = false): Promise<Page> {
  const context = await browser.newContext(phone ? { viewport: { width: 390, height: 844 } } : {});
  const page = await context.newPage();
  await signIn(page, person);
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto(path);
  return page;
}

const employeeRow = (page: Page, name: string) => page.getByRole("row", { name: new RegExp(name) });

// Somebody outside the six people global-setup gave a sign-in: by email.
async function signedInAs(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(world.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
  return page;
}

// From the Employees list: the name opens the drawer, then its Employment section.
async function openEmployment(page: Page, name: string): Promise<Locator> {
  await employeeRow(page, name).getByText(name, { exact: true }).click();
  const drawer = page.getByRole("dialog", { name });
  await drawer
    .getByRole("navigation", { name: "Employee sections" })
    .getByRole("button", { name: "Employment", exact: true })
    .click();
  return drawer;
}

test("a manager sees a fellow manager at her own location and not the one at another", async ({ browser }) => {
  // A second Kadikoy manager, made for this test: the world has only Ayse there.
  const label = `peer${Math.random().toString(36).slice(2, 7)}`;
  sql(`select tests.person('${run}', '${label}', 'manager', array['K'], array['cook']);`);
  // tests.person names people initcap(label) || ' Person'.
  const peer = `${label[0]!.toUpperCase()}${label.slice(1)} Person`;

  // Both managers are on the admin's list, so a missing row below is scope,
  // not a missing person.
  const zeynep = await openPage(browser, "zeynep", "/app/employees");
  await expect(employeeRow(zeynep, peer)).toBeVisible();
  await expect(employeeRow(zeynep, "Mehmet Person")).toBeVisible();

  const ayse = await openPage(browser, "ayse", "/app/employees");
  await expect(employeeRow(ayse, peer)).toBeVisible();
  await expect(employeeRow(ayse, "Mehmet Person")).toHaveCount(0);

  // The peer's record opens too, not only its row.
  await employeeRow(ayse, peer).getByText(peer, { exact: true }).click();
  await expect(ayse.getByRole("dialog", { name: peer })).toBeVisible();
});

test("a manager excluded from the schedule still sees her location's people, and has no row in its grid", async ({
  browser,
}) => {
  // A second Kadikoy manager, made for this test, with her own sign-in.
  const label = `off${Math.random().toString(36).slice(2, 7)}`;
  // tests.person names people initcap(label) || ' Person'.
  const name = `${label[0]!.toUpperCase()}${label.slice(1)} Person`;
  const email = sql(`
    select tests.person('${run}', '${label}', 'manager', array['K'], array['cook']);
    select tests.password('${run}:${label}', '${world.password}');`)
    .split(/\r?\n/)
    .at(-1)!;
  const scheduleRow = (page: Page, person: string) => page.getByRole("rowheader").filter({ hasText: person });

  // Assigned and not marked yet: she has a row in Kadikoy's grid.
  const zeynep = await openPage(browser, "zeynep", "/app/schedule");
  await expect(scheduleRow(zeynep, name)).toHaveCount(1);

  // The admin marks her in the Employees drawer; Kadikoy stays checked.
  await zeynep.goto("/app/employees");
  const drawer = await openEmployment(zeynep, name);
  await drawer.getByLabel("Exclude from schedule").check();
  await drawer.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect
    .poll(() =>
      sql(`select e.is_excluded_from_schedule::text || ' ' || string_agg(l.name, ', ')
           from public.employee_profiles e
           join public.employee_location_assignments a on a.employee_id = e.id and a.ended_at is null
           join public.locations l on l.id = a.location_id
           where e.id = tests.id('${run}:${label}') group by e.id;`),
    )
    .toBe("true Kadikoy");

  // Her row is gone from the grid; the rest of Kadikoy is still there.
  await zeynep.goto("/app/schedule");
  await expect(scheduleRow(zeynep, "Emre Person")).toHaveCount(1);
  await expect(scheduleRow(zeynep, name)).toHaveCount(0);

  // She still manages Kadikoy: its people are on her Employees list, the
  // other location's are not.
  const manager = await signedInAs(browser, email);
  await manager.goto("/app/employees");
  await expect(employeeRow(manager, "Emre Person")).toBeVisible();
  await expect(employeeRow(manager, "Mehmet Person")).toHaveCount(0);

  // And her own Schedule shows Kadikoy's grid without her in it.
  await manager.goto("/app/schedule");
  await expect(manager.locator('[id^="schedule-loc-"]')).toHaveCount(1);
  await expect(manager.locator('[id^="schedule-loc-"]')).toContainText("Kadikoy");
  await expect(scheduleRow(manager, "Emre Person")).toHaveCount(1);
  await expect(scheduleRow(manager, name)).toHaveCount(0);
});

test("the owner's own drawer keeps the Owner job and every location locked", async ({ browser }) => {
  // The world's owner (Olcay Owner, filed at both locations with the Owner
  // job) has no sign-in until somebody gives them a password.
  const owner = await signedInAs(browser, sql(`select tests.password('${run}:owner', '${world.password}');`));
  await owner.goto("/app/employees");
  const own = await openEmployment(owner, "Olcay Owner");

  // The Owner job: held, not theirs to untick, and never the primary.
  const jobs = own.getByRole("group", { name: /^Jobs/ });
  const ownerJob = jobs.getByRole("checkbox", { name: "Owner", exact: true });
  await expect(ownerJob).toBeChecked();
  await expect(ownerJob).toBeDisabled();
  const ownerJobRow = jobs
    .locator('div[data-locked="true"]')
    .filter({ has: owner.getByRole("checkbox", { name: "Owner", exact: true }) });
  await expect(ownerJobRow).toHaveCount(1);
  await expect(ownerJobRow.getByRole("radio")).toHaveCount(0);
  // General Manager and Assistant Manager, the other jobs setup makes under
  // Management (ROL-CIFT, design §4.13), are ordinary ones.
  for (const job of ["General Manager", "Assistant Manager"]) {
    await expect(jobs.getByRole("checkbox", { name: job, exact: true })).toBeEnabled();
  }

  // Every location: checked, locked, and none marked primary.
  const locations = own.getByRole("group", { name: /^Locations/ });
  for (const place of ["Kadikoy", "Besiktas"]) {
    const location = locations.getByRole("checkbox", { name: place, exact: true });
    await expect(location).toBeChecked();
    await expect(location).toBeDisabled();
  }
  await expect(locations.getByRole("checkbox", { disabled: false })).toHaveCount(0);
  await expect(locations.getByRole("checkbox", { checked: false })).toHaveCount(0);
  await expect(locations.getByRole("radio")).toHaveCount(0);

  // On anybody else's record the Owner job is off, and nobody's to tick.
  await owner.goto("/app/employees");
  const hers = (await openEmployment(owner, "Ayse Person"))
    .getByRole("group", { name: /^Jobs/ })
    .getByRole("checkbox", { name: "Owner", exact: true });
  await expect(hers).not.toBeChecked();
  await expect(hers).toBeDisabled();
});

test("the drawer of somebody out of scope says no access instead of a raw error", async ({ browser }) => {
  const mehmet = sql(`select tests.id('${run}:mehmet');`);
  const ayse = await openPage(browser, "ayse", `/app/employees?employeeId=${mehmet}&section=profile`);

  const drawer = ayse.getByRole("dialog");
  await expect(drawer.getByRole("heading", { name: "You don't have access to this employee" })).toBeVisible();
  await expect(drawer.getByRole("link", { name: "Back to Home" })).toBeVisible();
  await expect(drawer.getByRole("alert")).toHaveCount(0);
  await expect(drawer).not.toContainText("Mehmet");
});

test("a manager switches to the employee view from the sidebar and comes back", async ({ browser }) => {
  const ayse = await openPage(browser, "ayse", "/app/workspace");
  const sidebar = ayse.getByRole("complementary", { name: "Application sidebar" });
  const primary = sidebar.getByRole("navigation", { name: "Primary" });
  await expect(primary.getByRole("link", { name: "Employees" })).toBeVisible();

  await sidebar.getByRole("link", { name: "Employee view" }).click();
  await expect(ayse).toHaveURL(/\/app\/employee-hub$/);
  // The employee's own frame: management pages are gone from the sidebar.
  await expect(primary.getByRole("link", { name: "Employees" })).toHaveCount(0);
  await expect(sidebar.getByRole("link", { name: "Employee view" })).toHaveCount(0);

  await sidebar.getByRole("link", { name: "Management view" }).click();
  await expect(ayse).toHaveURL(/\/app\/workspace$/);
  await expect(primary.getByRole("link", { name: "Employees" })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Employee view" })).toBeVisible();
});

// ACCOUNT-BACK (Mert 2026-10-18): Account's "Back to workspace" returns to the
// page it came from, in the view it came from; it used to drop a manager who
// went to Account from the employee view into the management view.
test("Back to workspace in Account returns to the page and the view it came from", async ({ browser }) => {
  const ayse = await openPage(browser, "ayse", "/app/employee-hub/schedule");
  const sidebar = ayse.getByRole("complementary", { name: "Application sidebar" });
  const backFromAccount = async () => {
    await sidebar.getByRole("link", { name: /^Account/ }).click();
    await expect(ayse).toHaveURL(/\/account\/profile$/);
    // A second Account page on the way, as people do.
    await ayse.getByRole("navigation", { name: "Account" }).getByRole("link", { name: "Security" }).click();
    await ayse.getByRole("button", { name: "Back to workspace" }).click();
  };

  await backFromAccount();
  await expect(ayse).toHaveURL(/\/app\/employee-hub\/schedule$/);
  await expect(sidebar.getByRole("link", { name: "Management view" })).toBeVisible();

  await ayse.goto("/app/employees");
  await backFromAccount();
  await expect(ayse).toHaveURL(/\/app\/employees$/);
  await expect(sidebar.getByRole("link", { name: "Employee view" })).toBeVisible();
});

test("on a phone the switch sits under More, and the way back under the employee view's More", async ({
  browser,
}) => {
  const ayse = await openPage(browser, "ayse", "/app/workspace", true);

  await ayse.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "More" }).click();
  await ayse.getByRole("dialog", { name: "More" }).getByRole("link", { name: "Employee view" }).click();
  await expect(ayse).toHaveURL(/\/app\/employee-hub$/);

  await ayse.getByRole("navigation", { name: "Employee navigation" }).getByRole("button", { name: "More" }).click();
  await ayse.getByRole("dialog", { name: "More" }).getByRole("link", { name: "Management view" }).click();
  await expect(ayse).toHaveURL(/\/app\/workspace$/);
  await expect(ayse.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
});
