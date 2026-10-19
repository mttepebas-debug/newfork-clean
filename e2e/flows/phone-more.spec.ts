import type { Browser, Locator, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { signIn, type Person } from "../fixtures/world";

// CALISAN-MORE (Mert 2026-10-17): on a phone the employee's More opens the
// same sheet management's More opens: from the bottom of the same page, every
// row the same height, Sign out last.

const PHONE = { width: 390, height: 844 };

async function phone(browser: Browser, person: Person, path: string): Promise<Page> {
  const page = await (await browser.newContext({ viewport: PHONE, hasTouch: true, isMobile: true })).newPage();
  await signIn(page, person);
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto(path);
  return page;
}

// The sheet's box and each row's height and label edge.
const shape = (sheet: Locator) =>
  sheet.evaluate((dialog) => {
    const body = dialog.firstElementChild!.getBoundingClientRect();
    const rows = [...dialog.querySelectorAll("nav a, nav button")].map((row) => {
      const label = row.querySelector(".phone-more-label")!.getBoundingClientRect();
      return { height: row.getBoundingClientRect().height, labelLeft: Math.round(label.left) };
    });
    return { bottom: Math.round(body.bottom), left: Math.round(body.left), width: Math.round(body.width), rows };
  });

test("the employee's More opens the management sheet over the page, and closes", async ({ browser }) => {
  const manager = await phone(browser, "ayse", "/app/workspace");
  await manager.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "More" }).tap();
  const managementShape = await shape(manager.getByRole("dialog", { name: "More" }));

  const emre = await phone(browser, "emre", "/app/employee-hub");
  const more = emre.getByRole("navigation", { name: "Employee navigation" }).getByRole("button", { name: "More" });
  await more.tap();
  const sheet = emre.getByRole("dialog", { name: "More" });
  await expect(sheet).toBeVisible();
  // Over the same page: the address does not change.
  await expect(emre).toHaveURL(/\/app\/employee-hub$/);
  await expect(sheet.getByRole("link")).toHaveText(["My availability", "Announcements", /^Documents/, /My account/, "Switch workspace"]);
  await expect(sheet.getByRole("button", { name: "Sign out" })).toBeVisible();

  const employeeShape = await shape(sheet);
  // Same place as management's: full width, resting on the bottom edge.
  expect({ ...employeeShape, rows: [] }).toEqual({ ...managementShape, rows: [] });
  expect(employeeShape.bottom).toBe(PHONE.height);
  // Every row in both sheets is 48 px, and every label starts at the same edge.
  for (const rows of [employeeShape.rows, managementShape.rows]) {
    expect(rows.map((row) => row.height)).toEqual(rows.map(() => 48));
    expect(new Set(rows.map((row) => row.labelLeft)).size).toBe(1);
  }
  expect(employeeShape.rows[0]?.labelLeft).toBe(managementShape.rows[0]?.labelLeft);

  await sheet.getByRole("link", { name: "My availability" }).tap();
  await expect(emre).toHaveURL(/\/app\/employee-hub\/my-availability/);
  await expect(sheet).toBeHidden();

  await more.tap();
  await expect(sheet).toBeVisible();
  await emre.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
});

test("the old More page's address opens the employee's Home", async ({ browser }) => {
  const emre = await phone(browser, "emre", "/app/employee-hub/more");
  await expect(emre).toHaveURL(/\/app\/employee-hub$/);
  await expect(emre.getByRole("dialog", { name: "More" })).toBeHidden();
});
