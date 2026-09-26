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

/** Signs up a brand-new account and starts a workspace, landing on setup step 1. */
async function signUpAndStartWorkspace(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Create a workspace account" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
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
  await page.getByRole("button", { name: "Save legal name" }).click();
  await expect(page.getByText("Legal name saved")).toBeVisible();

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
