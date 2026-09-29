import { execSync } from "node:child_process";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { psql } from "../global-setup";

// SEC-003 (BL-267): changing the password on Account > Security asks for the
// current one, and the server checks it. Before, the current password was
// sent along but only checked when a hosted Auth setting happened to be on,
// so anyone holding an open session (a shared tablet somebody forgot to sign
// out of) could set a new password without knowing the old one.
//
// Kai gets a workspace of their own: a password changed here must not break
// the shared world's people for the specs that run after this one.

const oldPassword = "kai-old-pass-2026";
const newPassword = "kai-new-pass-2026";

function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

/** A fresh workspace with one employee, Kai; returns Kai's email. */
function kaiWithPassword(): string {
  const w = `sec3pw${Date.now()}`;
  const printed = sql(`
    select tests.world('${w}');
    select tests.person('${w}', 'kai', 'employee', array['K'], array['cook']);
    select tests.password('${w}:kai', '${oldPassword}');
  `);
  return printed.split(/\r?\n/).at(-1) ?? "";
}

async function signInAs(page: Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/** Whether a brand-new browser gets in with this password. */
async function signsInWith(browser: Browser, email: string, password: string): Promise<boolean> {
  const fresh = await browser.newContext();
  const page = await fresh.newPage();
  await signInAs(page, email, password);
  const inside = await page
    .waitForURL(/\/app\//, { timeout: 10_000 })
    .then(() => true, () => false);
  await fresh.close();
  return inside;
}

async function changePassword(page: Page, current: string) {
  await page.goto("/account/security");
  await page.getByLabel("Current password").first().fill(current);
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirm password").fill(newPassword);
  await page.getByRole("button", { name: "Change password", exact: true }).click();
}

test("a wrong current password does not change the password", async ({ page, browser }) => {
  const email = kaiWithPassword();
  await signInAs(page, email, oldPassword);
  await expect(page).toHaveURL(/\/app\//);

  await changePassword(page, "not-kais-password");

  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByText("Password changed; other sessions were signed out")).toHaveCount(0);
  expect(await signsInWith(browser, email, newPassword)).toBe(false);
  expect(await signsInWith(browser, email, oldPassword)).toBe(true);
});

test("the right current password changes it, and the new one signs in", async ({ page, browser }) => {
  const email = kaiWithPassword();
  await signInAs(page, email, oldPassword);
  await expect(page).toHaveURL(/\/app\//);

  await changePassword(page, oldPassword);

  await expect(page.getByText("Password changed; other sessions were signed out")).toBeVisible();
  expect(await signsInWith(browser, email, newPassword)).toBe(true);
  expect(await signsInWith(browser, email, oldPassword)).toBe(false);
});
