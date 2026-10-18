import { execSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "../fixtures/test";
import { psql } from "../global-setup";
import { signIn, tokenOf } from "../fixtures/world";

// An employee reads an announcement on a phone with an ad blocker on (BILDIRIM-15). Mert's iPhone opened the reader
// with its title and message hidden and only Close left: EasyList, which most blockers use, hid every box named
// like an ad slot. Ali opens Ayse's post from his list and from its phone alert; the reader shows its title and
// message above its Close button.

const world: { readonly run: string } = JSON.parse(readFileSync(new URL("../.world.json", import.meta.url), "utf8"));
const shots = fileURLToPath(new URL("../../artifacts/bildirim-15/", import.meta.url));

function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

// EasyList's own rules for the names the reader used to have; every page here carries them, as a blocker adds
// them to every page.
const AD_BLOCKER = [".ad-head", ".ad-body", ".ad-title", ".ad-tabs", ".ad-bar", ".ad-field", ".ad-note", ".ad-row"]
  .map((name) => `${name}{display:none!important}`)
  .join("");

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript((css) => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = css;
      document.head.append(style);
    });
  }, AD_BLOCKER);
});

async function publish(title: string, message: string): Promise<string> {
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
  return ((await published.json()) as { announcement_id: string }).announcement_id;
}

test("an employee reads an announcement in the reader with an ad blocker on", async ({ page }) => {
  mkdirSync(shots, { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const title = `Walk-in closed ${Math.random().toString(36).slice(2, 7)}`;
  const message = "Use the reach-in on the line until Friday.";
  await publish(title, message);

  await signIn(page, "ali");
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto("/app/announcements");
  await page.getByRole("list", { name: "Current announcements" }).getByRole("button", { name: title }).click();

  const reader = page.getByRole("dialog", { name: title });
  const heading = reader.getByRole("heading", { name: title });
  await expect(heading).toBeVisible();
  await expect(reader.getByText(message)).toBeVisible();
  // Once it has slid in.
  await expect(reader).toHaveCSS("opacity", "1");
  await page.screenshot({ path: `${shots}reader-ad-blocker.png` });
  // On the screen, in order: the title, the message, then Close at the bottom.
  const close = reader.locator("footer").getByRole("button", { name: "Close", exact: true });
  const [top, text, foot] = await Promise.all([heading.boundingBox(), reader.getByText(message).boundingBox(), close.boundingBox()]);
  const screen = page.viewportSize()!;
  expect(top!.y, "the title is on the screen").toBeGreaterThanOrEqual(0);
  expect(text!.y).toBeGreaterThan(top!.y);
  expect(foot!.y).toBeGreaterThan(text!.y);
  expect(foot!.y + foot!.height).toBeLessThanOrEqual(screen.height);
  expect(errors).toEqual([]);
});

// Mert's iPhone (iOS 26.6.2, 17 Oct): a post with no message, opened by tapping its phone alert, showed a white
// drawer with only Close. The tap reaches the reader two ways: the app was closed (it starts at the post's
// address) or open (the service worker asks it to move there).
for (const way of ["closed", "open"] as const) {
  test(`a post with no message opened from its phone alert with the app ${way}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const title = `DENEME ${Math.random().toString(36).slice(2, 7)}`;
    const id = await publish(title, "");
    await signIn(page, "ali");
    await expect(page).not.toHaveURL(/\/sign-in/);
    if (way === "closed") {
      await page.goto(`/app/announcements/${id}`);
    } else {
      await page.goto("/app");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.evaluate((url) => {
        navigator.serviceWorker.dispatchEvent(new MessageEvent("message", { data: { type: "newfork:open", url } }));
      }, `/app/announcements/${id}`);
    }
    const reader = page.getByRole("dialog", { name: title });
    const heading = reader.getByRole("heading", { name: title });
    await expect(heading).toBeVisible();
    await expect(reader).toHaveCSS("opacity", "1");
    await page.screenshot({ path: `${shots}reader-ad-blocker-empty-${way}.png` });
    const close = reader.locator("footer").getByRole("button", { name: "Close", exact: true });
    const [top, foot] = await Promise.all([heading.boundingBox(), close.boundingBox()]);
    const screen = page.viewportSize()!;
    expect(top!.y, "the title is on the screen").toBeGreaterThanOrEqual(0);
    expect(foot!.y, "Close sits at the bottom").toBeGreaterThan(screen.height / 2);
    expect(foot!.y + foot!.height).toBeLessThanOrEqual(screen.height);
    expect(errors).toEqual([]);
  });
}
