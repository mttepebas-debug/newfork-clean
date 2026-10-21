import { execSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { psql } from "../global-setup";
import { signIn, tokenOf } from "../fixtures/world";

// A phone alert's tap (BILDIRIM-15): the notice's address is the first page the Home Screen app loads, on a
// phone. Ali, an employee at Kadikoy, taps Ayse's announcement and reads its title and message; the same
// with the app already open, where the service worker tells the app the address instead. The notice carries
// the management page's address; it opens where the person is (NOTICE-VIEW): Ali's is the employee view, an
// Important Date opens as the post rather than a no-access card, and Ayse in her employee view stays in it.

const world: { readonly run: string } = JSON.parse(readFileSync(new URL("../.world.json", import.meta.url), "utf8"));
const shots = fileURLToPath(new URL("../../artifacts/bildirim-15/", import.meta.url));

function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

async function publish(title: string, message: string, dates = false): Promise<string> {
  const ids = JSON.parse(
    sql(`select json_build_object('workspace', tests.id('${world.run}'), 'kadikoy', tests.id('${world.run}:K'));`),
  ) as { workspace: string; kadikoy: string };
  const day = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const published = await fetch(`${process.env.E2E_API_URL}/v1/workspaces/${ids.workspace}/communications/announcements`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await tokenOf("ayse")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      announcement_id: null,
      expected_revision: null,
      intent: "publish",
      announcement: {
        title,
        body: message,
        category: "general",
        category_other: null,
        starts_on: dates ? day : null,
        ends_on: null,
        event_from: null,
        event_until: null,
        recurrence: "none",
        on_important_dates: dates,
        on_calendar: false,
        on_schedule: false,
        ask_ack: false,
        publish_at: null,
        locations: [{ location_id: ids.kadikoy, day: "open", opens: null, closes: null }],
        people: [],
        choices: {},
        fingerprint: null,
        bring_back: [],
      },
    }),
  });
  expect(published.status, await published.clone().text()).toBe(201);
  return ((await published.json()) as { announcement_id: string }).announcement_id;
}

/** The address the notice to Ali carries, which his alert opens. */
function aliNotice(id: string): string {
  return sql(`
    select url from public.person_notifications
    where user_id = tests.user('${world.run}:ali') and type_key = 'announcements.published' and subject_id = '${id}';`);
}

/** A phone alert tapped with the app open: the service worker tells the app the address. */
function tap(page: Page, url: string) {
  return page.evaluate((address) => {
    navigator.serviceWorker.dispatchEvent(new MessageEvent("message", { data: { type: "newfork:open", url: address } }));
  }, url);
}

test("a tapped notice opens its announcement on a phone, cold and with the app open", async ({ browser }) => {
  mkdirSync(shots, { recursive: true });
  const suffix = Math.random().toString(36).slice(2, 7);
  const title = `Walk-in closed ${suffix}`;
  const message = "Use the reach-in on the line until Friday.";
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await signIn(page, "ali");
  await expect(page).not.toHaveURL(/\/sign-in/);
  // Ali has his announcements open when the post goes out: the list he holds does not have it yet.
  await page.goto("/app/employee-hub/announcements");
  await expect(page.getByRole("heading", { name: "Announcements", level: 1 })).toBeVisible();
  // The reader's feed comes with the loaded list, whatever other posts the shared world holds (S-181).
  await expect(page.getByRole("heading", { level: 2, name: /^(Current|No announcements yet)/ })).toBeVisible();

  const id = await publish(title, message);
  const address = aliNotice(id);
  expect(address).toBe(`/app/announcements/${id}`);
  const opened = new RegExp(`/app/employee-hub/announcements/${id}$`);
  const reader = page.getByRole("dialog", { name: title });

  // Warm: the app is open on that list; the worker says where the tap goes.
  await tap(page, address);
  await expect(page).toHaveURL(opened);
  await expect(reader.getByRole("heading", { name: title })).toBeVisible();
  await expect(reader.getByText(message)).toBeVisible();
  await page.screenshot({ path: `${shots}tap-warm-390.png` });
  await reader.locator("footer").getByRole("button", { name: "Close", exact: true }).click();
  await expect(reader).toHaveCount(0);

  // Cold: the app starts on the notice's address.
  await page.goto(address);
  await expect(page).toHaveURL(opened);
  await expect(reader.getByRole("heading", { name: title })).toBeVisible();
  await expect(reader.getByText(message)).toBeVisible();
  await page.screenshot({ path: `${shots}tap-cold-390.png` });
  await context.close();
});

test("an Important Date's notice opens the post for an employee, not a no-access card", async ({ browser }) => {
  mkdirSync(shots, { recursive: true });
  const title = `Inspection ${Math.random().toString(36).slice(2, 7)}`;
  const id = await publish(title, "The health inspector comes in the morning.", true);
  const address = aliNotice(id);
  expect(address).toBe(`/app/announcements/important-dates/${id}`);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await signIn(page, "ali");
  await expect(page).not.toHaveURL(/\/sign-in/);

  await page.goto(address);
  await expect(page).toHaveURL(new RegExp(`/app/employee-hub/announcements/${id}$`));
  await expect(page.getByRole("dialog", { name: title }).getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByRole("heading", { name: /You don't have access/ })).toHaveCount(0);
  await page.screenshot({ path: `${shots}tap-important-date-390.png` });
  await context.close();
});

test("a notice tapped in the employee view keeps a manager there", async ({ browser }) => {
  mkdirSync(shots, { recursive: true });
  const title = `Staff meal ${Math.random().toString(36).slice(2, 7)}`;
  const id = await publish(title, "Family meal moves to 3:30.");
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await signIn(page, "ayse");
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto("/app/employee-hub");
  const sidebar = page.getByRole("complementary", { name: "Application sidebar" });
  await expect(sidebar.getByRole("link", { name: /Management view/ })).toBeVisible();

  await tap(page, `/app/announcements/${id}`);
  await expect(page).toHaveURL(new RegExp(`/app/employee-hub/announcements/${id}$`));
  await expect(page.getByRole("dialog", { name: title }).getByRole("heading", { name: title })).toBeVisible();
  // Still the employee's frame: the way back to management, and no management pages in the menu.
  await expect(sidebar.getByRole("link", { name: /Management view/ })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: /^Employees$/ })).toHaveCount(0);
  await page.screenshot({ path: `${shots}tap-employee-view-1440.png` });
  await context.close();
});
