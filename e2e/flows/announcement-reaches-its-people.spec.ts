import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { psql } from "../global-setup";
import { signIn, tokenOf, type Person } from "../fixtures/world";

// FOUNDATION-B flow 7 (FB-6.7 "Done when" 9; KARARLAR "Duyurular ve önemli
// tarihler" K1, K5; EKRAN-08 one announcement record): Ayse, the Kadikoy
// manager, writes a Kadikoy announcement in the drawer, asks people to
// acknowledge it and publishes it. Ali works at Kadikoy and Besiktas: he sees
// it and acknowledges it. A second Kadikoy manager sees it too (K5). Ayse
// cannot write one for Besiktas, which she does not manage (K1).

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

// A manager's list shows Active and Past tables; the post sits in Active.
const activeRow = (page: Page, title: string) =>
  page.getByRole("table", { name: "Active announcements" }).getByText(title, { exact: true });

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

  // Ayse writes it in the drawer (EKRAN-08). Details holds the locations: her
  // only one is checked from the start, and Besiktas is not on offer (K1).
  const ayse = await openAs(browser, "ayse", "/app/announcements");
  await ayse.getByRole("button", { name: "New", exact: true }).click();
  const editor = ayse.getByRole("dialog", { name: "New announcement" });
  await editor.getByLabel("Title", { exact: true }).fill(title);
  await editor.getByLabel("Message", { exact: true }).fill("Count the walk-in before close.");
  await expect(editor.getByRole("checkbox", { name: "Kadikoy", exact: true })).toBeChecked();
  await expect(editor.getByRole("checkbox", { name: "Besiktas", exact: true })).toHaveCount(0);
  await editor.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(activeRow(ayse, title)).toBeVisible();

  // She opens the draft, walks to Audience, asks people to acknowledge and
  // publishes it.
  await activeRow(ayse, title).click();
  const draft = ayse.getByRole("dialog", { name: title });
  await expect(draft.getByRole("checkbox", { name: "Kadikoy", exact: true })).toBeChecked();
  await draft.getByRole("button", { name: "Next", exact: true }).click();
  await draft.getByRole("checkbox", { name: /^Ask people to acknowledge/ }).check();
  await draft.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(draft).toHaveCount(0);
  await expect(
    ayse.getByRole("table", { name: "Active announcements" }).getByRole("row").filter({ hasText: title }),
  ).toContainText("Published");

  // Ali, at Kadikoy and Besiktas, reads it from his list, where it asks him
  // to acknowledge, and acknowledges it.
  const ali = await openAs(browser, "ali", "/app/announcements");
  const aliRow = ali.locator(".announcement-reader-list").getByRole("button", { name: title });
  await expect(aliRow).toContainText("Acknowledge");
  await aliRow.click();
  const reader = ali.getByRole("dialog", { name: title });
  await reader.getByRole("button", { name: "Acknowledge", exact: true }).click();
  await expect(reader.getByText("Acknowledged", { exact: true })).toBeVisible();
  await expect(reader.getByRole("button", { name: "Acknowledge", exact: true })).toHaveCount(0);

  // The other Kadikoy manager sees it too; Mehmet, the Besiktas manager,
  // does not (K5, K6).
  const hande = await openAsEmail(browser, handeEmail, "/app/announcements");
  await expect(activeRow(hande, title)).toBeVisible();
  const mehmet = await openAs(browser, "mehmet", "/app/announcements");
  await expect(mehmet.getByRole("table", { name: "Active announcements" })).toBeVisible();
  await expect(activeRow(mehmet, title)).toHaveCount(0);

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
      intent: "draft",
      announcement: {
        title: `Besiktas ${suffix}`,
        body: "Not hers.",
        category: "general",
        category_other: null,
        starts_on: null,
        ends_on: null,
        event_from: null,
        event_until: null,
        recurrence: "none",
        on_important_dates: false,
        on_calendar: false,
        on_schedule: false,
        ask_ack: false,
        publish_at: null,
        locations: [{ location_id: ids.besiktas, day: "open", opens: null, closes: null }],
        people: [],
        choices: {},
        fingerprint: null,
        bring_back: [],
      },
    }),
  });
  expect(refused.status).toBe(403);
  expect(await refused.json()).toMatchObject({ reason: "authz.out_of_scope" });
});
