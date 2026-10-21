import { execSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "../fixtures/test";
import { psql } from "../global-setup";

// Phone alerts (BILDIRIM-15, TELEFON-TUR2): on this device's first Home an employee finds the offer right
// under "Your day", turns alerts on there and sees the answer inside it; Account → Notifications says this
// computer takes them; the device is theirs on the server.
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
  // The browser's push subscription, stood in: the real one would register with Google. A browser keeps its
  // subscription from page to page, so the stand-in keeps it in this origin's storage, not in the page.
  await context.addInitScript((address: string) => {
    const held = "e2e.pushSubscription";
    const bytes = (size: number, fill: number) => new Uint8Array(size).fill(fill).buffer;
    const make = () => ({
      endpoint: address,
      expirationTime: null,
      getKey: (name: string) => (name === "p256dh" ? bytes(65, 4) : bytes(16, 7)),
      unsubscribe: async () => {
        window.localStorage.removeItem(held);
        return true;
      },
    });
    PushManager.prototype.getSubscription = async function () {
      return (window.localStorage.getItem(held) === address ? make() : null) as PushSubscription | null;
    };
    PushManager.prototype.subscribe = async function () {
      window.localStorage.setItem(held, address);
      return make() as PushSubscription;
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

  // One entry per opening (K26): this device's first Home gets the offer under "Your day", not the block.
  await page.goto("/app/employee-hub");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  const card = page.getByRole("complementary", { name: /Your schedule is here\.|No shifts yet\./ });
  await expect(card).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Get shift alerts on this computer" })).toHaveCount(0);
  await page.screenshot({ path: `${shots}home-card-1440.png` });

  await card.getByRole("button", { name: "Turn on alerts" }).click();
  // The answer stays in the card.
  await expect(card.getByText("Alerts are on")).toBeVisible();
  await expect(card.getByText(/Test alert sent · /)).toBeVisible();
  expect(sql(`select count(*) from public.notification_push_subscriptions where user_id = '${employeeId}' and endpoint = '${endpoint}' and revoked_at is null;`)).toBe("1");

  await page.goto("/account/preferences/notifications");
  // What this browser itself holds after the page changed: its worker and the subscription it saved
  // (the address's host and last 8 characters only).
  const browserHolds = () =>
    page.evaluate(async () => {
      const worker = await navigator.serviceWorker.getRegistration("/");
      const subscription = await worker?.pushManager.getSubscription();
      return {
        permission: Notification.permission,
        worker: worker ? new URL(worker.scope).pathname : null,
        subscription: subscription ? `${new URL(subscription.endpoint).host}…${subscription.endpoint.slice(-8)}` : null,
      };
    });
  expect(await browserHolds(), "this browser after the page changed").toEqual({
    permission: "granted",
    worker: "/",
    subscription: `fcm.googleapis.com…${endpoint.slice(-8)}`,
  });
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
