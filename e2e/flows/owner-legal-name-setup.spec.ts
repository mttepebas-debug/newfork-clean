import { execSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { psql } from "../global-setup";

// BL-080: the owner's legal name (the name on their ID) is taken at the first
// step of the setup wizard -- the screen a brand-new owner lands on right
// after creating a workspace, labelled "Name as it appears on your ID" -- and
// is required. It is never guessed from the account name. The owner can
// change it later on Account > Profile, under its own "Legal name" section.
//
// This owner does not come from the test world builder (supabase/test-support
// /builder.sql already fills a legal name for tests.world's owner): it is
// created here through the real sign-up and "Create your workspace" screens,
// the way BL-080's very first owner is.

function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

/** The legal name on file for the owner who signed up with this email. */
function legalNameFor(email: string): string {
  return sql(`
    select p.legal_first_name || ' ' || p.legal_last_name
    from auth.users u
    join public.employee_profiles e on e.user_id = u.id
    join public.employee_private_profiles p
      on p.employee_id = e.id and p.workspace_id = e.workspace_id
    where u.email = '${email}';
  `);
}

/**
 * The confirmation link Supabase mailed to this address, read from the local
 * mail catcher (Mailpit). Sign-up needs a confirmed email (SEC-003).
 */
async function confirmationLink(email: string): Promise<string> {
  const mailpit = process.env.E2E_MAILPIT_URL;
  if (!mailpit) throw new Error("playwright.config.ts did not find the local mail catcher");
  let link: string | undefined;
  await expect
    .poll(async () => {
      const found = (await (
        await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)
      ).json()) as { messages: { ID: string }[] };
      const id = found.messages[0]?.ID;
      if (!id) return false;
      const message = (await (await fetch(`${mailpit}/api/v1/message/${id}`)).json()) as { Text: string };
      link = /https?:\/\/\S+\/auth\/v1\/verify\?[^\s)]+/.exec(message.Text)?.[0];
      return Boolean(link);
    })
    .toBe(true);
  return link!;
}

/** Signs up a brand-new account and starts a workspace, landing on setup step 1. */
async function signUpAndStartWorkspace(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Create a workspace account" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  // No session until the email is confirmed: the screen says so instead.
  // ponytail: test id until nf-arayuz's wording lands; then match the text.
  await expect(page.getByTestId("signup-check-email")).toBeVisible();

  // The link redirects to the configured site (the user's dev server, not this
  // run's port), so it is followed only as far as the auth server that confirms.
  const confirmed = await fetch(await confirmationLink(email), { redirect: "manual" });
  expect(confirmed.status).toBeGreaterThanOrEqual(300);
  expect(confirmed.status).toBeLessThan(400);
  expect(confirmed.headers.get("location") ?? "").not.toContain("error");

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/workspaces$/);

  await page.getByRole("button", { name: "Create your workspace" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
}

test("a new owner gives their legal name at setup, sees it in Account > Profile, and can change it", async ({
  page,
}) => {
  const email = `bl080-${Date.now()}-${Math.random().toString(36).slice(2)}@newfork.test`;
  await signUpAndStartWorkspace(page, email, "owner-pass-2026");

  const continueButton = page.getByRole("button", { name: "Continue" });
  await page.getByLabel("First name").fill("Jordan");
  await page.getByLabel("Last name").fill("Rivera");
  await continueButton.click();
  // Setup moved to step 2 ("Where does your team work?"): step 1 was accepted.
  await expect(
    page.getByRole("heading", { name: "Where does your team work?" }),
  ).toBeVisible();

  expect(legalNameFor(email)).toBe("Jordan Rivera");

  await page.goto("/account/profile");
  await expect(page.getByRole("heading", { name: "Legal name" })).toBeVisible();
  await expect(page.getByLabel("Legal first name")).toHaveValue("Jordan");
  await expect(page.getByLabel("Legal last name")).toHaveValue("Rivera");

  await page.getByLabel("Legal first name").fill("Jordana");
  // One Save for the whole page, and it stays off until the phone is given.
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await page.getByLabel("Phone number").fill("415 555 0142");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Profile saved")).toBeVisible();

  expect(legalNameFor(email)).toBe("Jordana Rivera");
});

test("setup's first step will not continue without a first and last name", async ({ page }) => {
  const email = `bl080-empty-${Date.now()}-${Math.random().toString(36).slice(2)}@newfork.test`;
  await signUpAndStartWorkspace(page, email, "owner-pass-2026");

  const continueButton = page.getByRole("button", { name: "Continue" });
  await expect(continueButton).toBeDisabled();

  await page.getByLabel("First name").fill("Only First");
  await expect(continueButton).toBeDisabled();

  await page.getByLabel("First name").fill("");
  await page.getByLabel("Last name").fill("Only Last");
  await expect(continueButton).toBeDisabled();

  await page.getByLabel("First name").fill("Both");
  await expect(continueButton).toBeEnabled();
});
