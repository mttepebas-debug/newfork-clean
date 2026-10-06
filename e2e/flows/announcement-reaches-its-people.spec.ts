import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { psql } from "../global-setup";
import { signIn, tokenOf, type Person } from "../fixtures/world";

// FOUNDATION-B flow 7 (FB-6.7 "Done when" 9; KARARLAR "Duyurular ve önemli
// tarihler" K1, K5): Ayse, the Kadikoy manager, writes a Kadikoy announcement
// for employees and publishes it. Ali works at Kadikoy and Besiktas: he sees
// it and acknowledges it. A second Kadikoy manager it was not aimed at sees it
// too (K5). Ayse cannot write one for Besiktas, which she does not manage (K1).

const world: { readonly run: string; readonly password: string } = JSON.parse(
  readFileSync(new URL("../.world.json", import.meta.url), "utf8"),
);
const run = world.run;

function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

async function openAs(browser: Browser, person: Person, path: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, person);
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto(path);
  return page;
}

// Somebody made for this test, outside the six people global-setup signs in.
async function openAsEmail(browser: Browser, email: string, path: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(world.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto(path);
  return page;
}

const announcementRow = (page: Page, title: string) =>
  page.getByRole("table", { name: "Announcements" }).getByText(title, { exact: true });

test("a Kadikoy announcement reaches Kadikoy, its managers and nobody it should not (flow 7)", async ({ browser }) => {
  // Four people sign in one after another; the budget is three times on purpose (VAR-E2E-2).
  test.slow();
  const suffix = Math.random().toString(36).slice(2, 7);
  const title = `Inventory count ${suffix}`;
  // A second Kadikoy manager, with a sign-in of their own (tests.password
  // answers the email).
  const label = `hande${suffix}`;
  sql(`select tests.person('${run}', '${label}', 'manager', array['K'], array['cook']);`);
  const handeEmail = sql(`select tests.password('${run}:${label}', '${world.password}');`);

  // Ayse writes it. Her only location is the one it starts at, and Besiktas is
  // not on offer (K1).
  const ayse = await openAs(browser, "ayse", "/app/announcements");
  await ayse.getByRole("button", { name: "New announcement" }).click();
  const editor = ayse.getByRole("dialog", { name: "Add announcement" });
  await editor.getByLabel("Title").fill(title);
  await editor.getByLabel("Message").fill("Count the walk-in before close.");
  await editor.getByText("Locations", { exact: true }).click();
  await expect(editor.getByRole("checkbox", { name: "Kadikoy" })).toBeChecked();
  await expect(editor.getByRole("checkbox", { name: "Besiktas" })).toHaveCount(0);
  await editor.getByRole("button", { name: "Save draft" }).click();
  await expect(announcementRow(ayse, title)).toBeVisible();

  await announcementRow(ayse, title).click();
  await ayse.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(announcementRow(ayse, title)).toBeVisible();

  // Ali, at Kadikoy and Besiktas, sees it and acknowledges it.
  const ali = await openAs(browser, "ali", "/app/announcements");
  await expect(announcementRow(ali, title)).toBeVisible();
  // Acknowledge from the row: opening the row first would put the drawer
  // over the row's own button.
  const aliRow = ali
    .getByRole("table", { name: "Announcements" })
    .getByRole("row")
    .filter({ hasText: title });
  await aliRow.getByRole("button", { name: "Acknowledge" }).click();
  await expect(aliRow.getByLabel("Acknowledged")).toBeVisible();

  // The other Kadikoy manager was not aimed at (employees only) and sees it
  // anyway; Mehmet, the Besiktas manager, does not (K5, K6).
  const hande = await openAsEmail(browser, handeEmail, "/app/announcements");
  await expect(announcementRow(hande, title)).toBeVisible();
  const mehmet = await openAs(browser, "mehmet", "/app/announcements");
  await expect(mehmet.getByRole("heading", { name: "Announcements" })).toBeVisible();
  await expect(announcementRow(mehmet, title)).toHaveCount(0);

  // Who it told: Ali, the other Kadikoy manager and the admin; not Ayse, who
  // wrote it (KK-89), and not Mehmet.
  const told = sql(`
    select string_agg(distinct coalesce(p.first_name, ''), ',' order by coalesce(p.first_name, ''))
    from public.notification_outbox o
    join public.announcements a on a.id::text = o.subject_id and a.title = '${title}'
    cross join lateral jsonb_array_elements_text(o.payload -> 'recipient_user_ids') r(user_id)
    left join public.employee_profiles p on p.user_id = r.user_id::uuid and p.workspace_id = a.workspace_id;`);
  const names = told.split(",");
  expect(names).toEqual(expect.arrayContaining(["Ali", "Zeynep", label[0]!.toUpperCase() + label.slice(1)]));
  expect(names).not.toContain("Ayse");
  expect(names).not.toContain("Mehmet");

  // K1: Ayse cannot write one for Besiktas, past the screen too.
  const ids = JSON.parse(
    sql(`select json_build_object('workspace', tests.id('${run}'), 'besiktas', tests.id('${run}:B'));`),
  ) as { workspace: string; besiktas: string };
  const refused = await fetch(`${process.env.E2E_API_URL}/v1/workspaces/${ids.workspace}/communications/announcements`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await tokenOf("ayse")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      announcement_id: null,
      expected_revision: null,
      announcement: {
        title: `Besiktas ${suffix}`, body: "Not hers.", category: "general", audience_roles: ["employee"],
        location_ids: [ids.besiktas], publish_at: null, expires_at: null, action_url: null,
      },
    }),
  });
  expect(refused.status).toBe(403);
  expect(await refused.json()).toMatchObject({ reason: "authz.out_of_scope" });
});
