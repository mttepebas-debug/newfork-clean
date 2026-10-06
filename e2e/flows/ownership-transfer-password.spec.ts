import { execSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { psql } from "../global-setup";

// SEC-003 (BL-268): taking over a workspace on Account > Workspaces needs the
// account password, and the API is the one that checks it. Before, the
// browser checked the password itself (a fresh sign-in) and the API only
// looked at how new the token was, so anybody holding a session could refresh
// the token and accept without ever knowing the password.
//
// Each test gets a workspace of its own, owner Olcay and admin Ada, with a
// transfer to Ada already waiting: accepting it must not hand over the shared
// world's workspace the other specs build on.

const adaPassword = "ada-pass-2026";

function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

interface Offer {
  readonly w: string;
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly transferId: string;
  readonly adaEmail: string;
}

/** A workspace whose owner has offered it to admin Ada. */
function offerToAda(tag: string): Offer {
  const w = `sec3ot${Date.now()}${tag}`;
  const printed = sql(`
    select tests.world('${w}');
    select tests.person('${w}', 'ada', 'admin', array['K'], array['cook']);
    select public.initiate_workspace_ownership_transfer_service(
      tests.user('${w}:owner'), tests.id('${w}'), tests.user('${w}:ada'));
    select json_build_object(
      'workspaceId', tests.id('${w}'),
      'workspaceName', (select name from public.workspaces where id = tests.id('${w}')),
      'transferId', (select id from public.workspace_ownership_transfers
                     where workspace_id = tests.id('${w}') and status = 'pending'),
      'adaEmail', tests.password('${w}:ada', '${adaPassword}'))::text;
  `);
  return { w, ...JSON.parse(printed.split(/\r?\n/).at(-1) ?? "{}") };
}

function transferStatus(offer: Offer): string {
  return sql(`select status from public.workspace_ownership_transfers where id = '${offer.transferId}';`);
}

async function signInAs(page: Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/app\//);
}

/** A brand-new access token for Ada, straight from the auth server. */
async function freshToken(email: string, password: string): Promise<string> {
  const url = process.env.E2E_SUPABASE_URL;
  const anon = process.env.E2E_ANON_KEY;
  if (!url || !anon) throw new Error("playwright.config.ts did not set the auth env");
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = (await response.json()) as { access_token?: string };
  if (!response.ok || !body.access_token) throw new Error(`sign-in failed (${response.status})`);
  return body.access_token;
}

// Building a world is setup, not the test (BL-763): its own budget, not the 60 s.
let offerForPage: Offer;
let offerForToken: Offer;
test.beforeAll(() => {
  test.setTimeout(180_000);
  const started = Date.now();
  offerForPage = offerToAda("a");
  offerForToken = offerToAda("b");
  console.log(`ownership-transfer-password setup: ${Date.now() - started} ms`);
});

test("Ada takes over the workspace with their password on Account > Workspaces", async ({ page }) => {
  const offer = offerForPage;
  await signInAs(page, offer.adaEmail, adaPassword);

  await page.goto("/account/workspaces");
  await page.getByRole("button", { name: `Accept owner transfer for ${offer.workspaceName}` }).click();
  await page.getByLabel("Account password").fill(adaPassword);
  await page.getByRole("button", { name: "Accept transfer", exact: true }).click();

  await expect.poll(() => transferStatus(offer)).toBe("accepted");
});

test("a fresh token with the wrong password does not take over the workspace", async () => {
  const offer = offerForToken;
  // A token minted this second: the old check (how recent the token is) passes.
  const token = await freshToken(offer.adaEmail, adaPassword);

  const response = await fetch(
    `${process.env.E2E_API_URL}/v1/account/workspaces/${offer.workspaceId}/ownership-transfer/respond`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ transferId: offer.transferId, action: "accept", password: "not-adas-password" }),
    },
  );

  expect(response.status).toBeGreaterThanOrEqual(400);
  expect(response.status).toBeLessThan(500);
  expect(transferStatus(offer)).toBe("pending");
});
