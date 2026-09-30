import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { psql } from "../global-setup";
import { signIn, type Person } from "../fixtures/world";

// FOUNDATION-B FB-6.2.10: the scope half of flow 10 (FB-6.2 "Done when" 8),
// the way into the employee view and back ("Done when" 7), and what the
// Employees drawer says about somebody out of scope (BL-195).
//
// Ayse manages Kadikoy, Mehmet manages Besiktas, Zeynep is an admin.

const run: string = JSON.parse(readFileSync(new URL("../.world.json", import.meta.url), "utf8")).run;

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

test("on a phone the switch sits under More, and the way back under the employee view's More", async ({
  browser,
}) => {
  const ayse = await openPage(browser, "ayse", "/app/workspace", true);

  await ayse.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "More" }).click();
  await ayse.getByRole("dialog", { name: "More" }).getByRole("link", { name: "Employee view" }).click();
  await expect(ayse).toHaveURL(/\/app\/employee-hub$/);

  await ayse.getByRole("navigation", { name: "Employee navigation" }).getByRole("link", { name: "More" }).click();
  await ayse.getByRole("link", { name: /Management view/ }).click();
  await expect(ayse).toHaveURL(/\/app\/workspace$/);
  await expect(ayse.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
});
