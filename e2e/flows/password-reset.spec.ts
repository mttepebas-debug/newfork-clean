import { expect, test, type Page } from "@playwright/test";
import { emailOf } from "../fixtures/world";

// BL-137: forgot password, end to end. The reset email goes out through
// Resend, which a local or CI run has no key for, so Supabase's mail catcher
// never sees it. The link's token is minted here through the same admin call
// the API makes (auth.admin.generateLink, type recovery), and the rest runs
// through the real screens.

const sameAnswer = "If an account exists for this email, we sent a reset link.";
const newPassword = "reset-pass-2026";

async function recoveryTokenHash(email: string): Promise<string> {
  const url = process.env.E2E_SUPABASE_URL;
  const key = process.env.E2E_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("playwright.config.ts did not set the admin env");
  const response = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "recovery", email }),
  });
  const body = (await response.json()) as { hashed_token?: string };
  if (!response.ok || !body.hashed_token) throw new Error(`generate_link failed (${response.status})`);
  return body.hashed_token;
}

async function askForLink(page: Page, email: string) {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(sameAnswer)).toBeVisible();
}

async function saveNewPassword(page: Page, tokenHash: string) {
  // The API puts the token in the fragment, which never reaches a server log.
  await page.goto(`/reset-password#token_hash=${encodeURIComponent(tokenHash)}`);
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirm password").fill(newPassword);
  await page.getByRole("button", { name: "Save password" }).click();
}

test("a person resets a forgotten password with a one-time link and signs in with it", async ({
  page,
  browser,
}) => {
  const email = emailOf("deniz");

  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);

  // The same answer for an account and for an address nobody owns.
  await askForLink(page, email);
  await askForLink(page, `nobody-${Date.now()}@example.test`);

  const tokenHash = await recoveryTokenHash(email);
  await saveNewPassword(page, tokenHash);
  await expect(page).toHaveURL(/\/app\/employee-hub/);

  // The link works once.
  await saveNewPassword(page, tokenHash);
  await expect(page.getByText("This reset link has expired or was already used.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Request a new link" })).toBeVisible();

  // A fresh browser signs in with the new password.
  const fresh = await browser.newContext();
  const other = await fresh.newPage();
  await other.goto("/sign-in");
  await other.getByLabel("Email").fill(email);
  await other.getByLabel("Password").fill(newPassword);
  await other.getByRole("button", { name: "Sign in" }).click();
  await expect(other).toHaveURL(/\/app\/employee-hub/);
  await fresh.close();
});
