import { execSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "../fixtures/test";
import { psql } from "../global-setup";
import { signIn, tokenOf } from "../fixtures/world";

// A phone alert's tap (BILDIRIM-15): the notice's address is the first page the Home Screen app loads, on a
// phone. Ali, an employee at Kadikoy, taps Ayse's announcement and reads its title and message; the same
// with the app already open, where the service worker tells the app the address instead.

const world: { readonly run: string } = JSON.parse(readFileSync(new URL("../.world.json", import.meta.url), "utf8"));
const shots = fileURLToPath(new URL("../../artifacts/bildirim-15/", import.meta.url));

function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
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
  await page.goto("/app/announcements");
  await expect(page.getByRole("heading", { name: "Announcements", level: 1 })).toBeVisible();
  // The reader's feed comes with the loaded list, whatever other posts the shared world holds (S-181).
  await expect(page.getByRole("heading", { level: 2, name: /^(Current|No announcements yet)/ })).toBeVisible();

  const ids = JSON.parse(
    sql(`select json_build_object('workspace', tests.id('${world.run}'), 'kadikoy', tests.id('${world.run}:K'));`),
  ) as { workspace: string; kadikoy: string };
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
        locations: [{ location_id: ids.kadikoy, day: "open", opens: null, closes: null }],
        people: [],
        choices: {},
        fingerprint: null,
        bring_back: [],
      },
    }),
  });
  expect(published.status, await published.clone().text()).toBe(201);
  const { announcement_id: id } = (await published.json()) as { announcement_id: string };
  // The address Ali's notice carries, which his alert opens.
  const address = sql(`
    select url from public.person_notifications
    where user_id = tests.user('${world.run}:ali') and type_key = 'announcements.published' and subject_id = '${id}';`);
  expect(address).toBe(`/app/announcements/${id}`);
  const reader = page.getByRole("dialog", { name: title });

  // Warm: the app is open on that list; the worker says where the tap goes.
  await page.evaluate((url) => {
    navigator.serviceWorker.dispatchEvent(new MessageEvent("message", { data: { type: "newfork:open", url } }));
  }, address);
  await expect(page).toHaveURL(new RegExp(`${address}$`));
  await expect(reader.getByRole("heading", { name: title })).toBeVisible();
  await expect(reader.getByText(message)).toBeVisible();
  await page.screenshot({ path: `${shots}tap-warm-390.png` });
  await reader.locator("footer").getByRole("button", { name: "Close", exact: true }).click();
  await expect(reader).toHaveCount(0);

  // Cold: the app starts on the notice's address.
  await page.goto(address);
  await expect(reader.getByRole("heading", { name: title })).toBeVisible();
  await expect(reader.getByText(message)).toBeVisible();
  await page.screenshot({ path: `${shots}tap-cold-390.png` });
  await context.close();
});
