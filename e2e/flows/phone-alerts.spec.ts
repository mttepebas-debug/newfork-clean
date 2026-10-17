import { execSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "../fixtures/test";
import { psql } from "../global-setup";

// Phone alerts (BILDIRIM-15): after opening their schedule, an employee finds the card on Home, turns
// alerts on, and Account → Notifications says this computer takes them; the device is theirs on the server.
// No real push service is touched: the browser's subscription is a stand-in with a Google-shaped address,
// every push service host is blocked, and the API's push worker never runs here (no cron).

const world: { readonly password: string } = JSON.parse(readFileSync(new URL("../.world.json", import.meta.url), "utf8"));
const shots = fileURLToPath(new URL("../../artifacts/bildirim-15/", import.meta.url));
const pushHosts = /^https:\/\/([^/]+\.)?(fcm\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)\//;

// CI's default Chromium is the headless shell, which says "denied" for notifications even when they are
// granted; the app then rightly reads the browser as blocked. Full Chromium in its new headless mode
// answers as a person's browser does, so this file runs there (locally, the installed Chrome).
test.use({ channel: process.env.CI ? "chromium" : "chrome" });

function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

let w: string;
let employeeEmail: string;
let employeeId: string;

test.beforeAll(() => {
  w = `push${Date.now()}`;
  const printed = sql(`
    select tests.world('${w}');
    select tests.person('${w}', 'ada', 'employee', array['K'], array['cook']);
    select tests.password('${w}:ada', '${world.password}');
    select tests.user('${w}:ada');`).split(/\r?\n/);
  employeeEmail = printed.at(-2)!;
  employeeId = printed.at(-1)!;
  mkdirSync(shots, { recursive: true });
});

test("an employee turns phone alerts on from Home and Account says this computer takes them", async ({ browser }) => {
  const endpoint = `https://fcm.googleapis.com/fcm/send/e2e-${w}`;
  const context = await browser.newContext({ permissions: ["notifications"], viewport: { width: 1440, height: 900 } });
  const reached: string[] = [];
  await context.route(pushHosts, (route) => {
    reached.push(route.request().url());
    return route.abort();
  });
  // The browser's push subscription, stood in: the real one would register with Google.
  await context.addInitScript((address: string) => {
    const bytes = (size: number, fill: number) => new Uint8Array(size).fill(fill).buffer;
    let current: object | null = null;
    const make = () => ({
      endpoint: address,
      expirationTime: null,
      getKey: (name: string) => (name === "p256dh" ? bytes(65, 4) : bytes(16, 7)),
      unsubscribe: async () => {
        current = null;
        return true;
      },
    });
    PushManager.prototype.getSubscription = async function () {
      return current as PushSubscription | null;
    };
    PushManager.prototype.subscribe = async function () {
      current = make();
      return current as PushSubscription;
    };
  }, endpoint);

  const page = await context.newPage();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(employeeEmail);
  await page.getByLabel("Password").fill(world.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
  // The browser itself must say alerts are allowed, or no card is right.
  expect(await page.evaluate(() => Notification.permission), "this browser reads granted notifications as").toBe("granted");

  // The card waits until the person opened their schedule here.
  await page.goto("/app/employee-hub");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await expect(page.getByRole("complementary", { name: /Get alerts on this/ })).toHaveCount(0);
  await page.goto("/app/employee-hub/schedule");
  // The schedule is seen once the signed-in app has drawn it here, not when the address loads: the device
  // remembers it then (home-card-memory.ts).
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("newfork.phoneAlerts.scheduleSeen")), { timeout: 15_000 })
    .toBe("1");
  await page.goto("/app/employee-hub");
  const card = page.getByRole("complementary", { name: "Get alerts on this computer" });
  await expect(card).toBeVisible();
  await page.screenshot({ path: `${shots}home-card-1440.png` });

  await card.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByText("Phone alerts are on.")).toBeVisible();
  await expect(card).toHaveCount(0);
  expect(sql(`select count(*) from public.notification_push_subscriptions where user_id = '${employeeId}' and endpoint = '${endpoint}' and revoked_at is null;`)).toBe("1");

  await page.goto("/account/preferences/notifications");
  const channels = page.getByRole("group", { name: "Where you get notified" });
  await expect(channels.getByText("On for this computer.")).toBeVisible();
  await expect(channels.getByRole("switch", { name: "Phone alerts on this device" })).toBeChecked();
  await page.screenshot({ path: `${shots}account-on-1440.png`, fullPage: true });

  // Off again: the server forgets this device.
  await channels.getByRole("switch", { name: "Phone alerts on this device" }).click();
  await expect(channels.getByRole("button", { name: "Turn on" })).toBeVisible();
  expect(sql(`select revoked_reason from public.notification_push_subscriptions where endpoint = '${endpoint}';`)).toBe("person");

  expect(reached).toEqual([]);
  await context.close();
});
