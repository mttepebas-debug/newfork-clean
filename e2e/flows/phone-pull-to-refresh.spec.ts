import type { Browser, CDPSession, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { signIn } from "../fixtures/world";

// Pull to refresh on every page of a phone (Mert 2026-10-18, S-163 (9)): at
// the top of a page a pull down past the line asks again for what the page
// shows; a drag that starts on a part with its own drag (the Lineup day
// wheel) never turns into a refresh. A phone's Schedule shows no grid ("on a
// computer"), so a manager's Lineup and Employees stand for the manager.

const PHONE = { width: 390, height: 844 };

async function phone(browser: Browser, person: "zeynep" | "emre"): Promise<{ page: Page; cdp: CDPSession }> {
  const context = await browser.newContext({ viewport: PHONE, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await signIn(page, person);
  await expect(page).not.toHaveURL(/\/sign-in/);
  return { page, cdp: await context.newCDPSession(page) };
}

/** A finger from (x, y) straight down by `distance` px, released at the end; `held` runs before the release. */
async function pullFrom(cdp: CDPSession, x: number, y: number, distance: number, held?: () => Promise<void>) {
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", at: number) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y: at }] });
  await touch("touchStart", y);
  for (let step = 1; step <= 12; step++) await touch("touchMove", y + (distance * step) / 12);
  await held?.();
  await touch("touchEnd", y + distance);
}

/**
 * The mark draws over every frozen heading or tab of the page (it lets touches
 * through, so a hit test cannot see it; its layer is compared instead) and is
 * showing while the finger holds.
 */
const markOnTop = (page: Page) =>
  page.evaluate(() => {
    const mark = document.querySelector<HTMLElement>(".app-main > .pull-mark")!;
    const layer = (element: Element) => Number.parseInt(getComputedStyle(element).zIndex, 10) || 0;
    const frozen = [...document.querySelectorAll("[data-frozen-piece]")].map(layer);
    return frozen.length > 0 && layer(mark) > Math.max(...frozen) && Number(getComputedStyle(mark).opacity) > 0.9;
  });

const centre = async (page: Page, selector: string) => {
  const box = (await page.locator(selector).filter({ visible: true }).first().boundingBox())!;
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
};

/** Counts the API reads whose path matches `path` from now on. */
function countReads(page: Page, path: RegExp) {
  let reads = 0;
  page.on("request", (request) => {
    if (request.method() === "GET" && path.test(new URL(request.url()).pathname)) reads += 1;
  });
  return () => reads;
}

/** Counts how often the shell's mark starts a refresh from now on. */
async function watchRefreshes(page: Page) {
  await page.evaluate(() => {
    const mark = document.querySelector(".app-main > .pull-mark")!;
    const w = window as unknown as { __refreshes: number };
    w.__refreshes = 0;
    new MutationObserver(() => {
      if (mark.classList.contains("is-refreshing")) w.__refreshes += 1;
    }).observe(mark, { attributes: true, attributeFilter: ["class"] });
  });
  return () => page.evaluate(() => (window as unknown as { __refreshes: number }).__refreshes);
}

test("phone: a manager's Lineup keeps its day wheel, and Employees refreshes from its top (zeynep)", async ({ browser }) => {
  const { page, cdp } = await phone(browser, "zeynep");
  await page.goto("/app/schedule/lineup");
  await expect(page.locator(".lineup-wheel").filter({ visible: true }).first()).toBeVisible();
  const mark = page.locator(".app-main > .pull-mark");
  await expect(mark).toHaveCount(1);
  const refreshes = await watchRefreshes(page);
  // A drag that starts on the day wheel is the wheel's (it turns, opens no day and never refreshes).
  const wheel = await centre(page, ".lineup-wheel");
  await pullFrom(cdp, wheel.x, wheel.y, 220);
  await page.waitForTimeout(400);
  expect(await refreshes()).toBe(0);
  // From the page's heading the same pull refreshes the day's lineup.
  const lineupReads = countReads(page, /\/lineups\//);
  const top = await centre(page, "h1");
  await pullFrom(cdp, top.x, top.y, 260);
  await expect(mark).toHaveClass(/is-refreshing/);
  await expect.poll(lineupReads).toBeGreaterThan(0);
  await expect(mark).toHaveClass(/is-idle/);

  await page.goto("/app/employees");
  await expect(page.locator("h1").filter({ visible: true }).first()).toBeVisible();
  const people = countReads(page, /\/employees/);
  const heading = await centre(page, "h1");
  // Employees freezes its heading; the mark still shows over it while the finger holds.
  await pullFrom(cdp, heading.x, heading.y, 260, async () => {
    expect(await markOnTop(page)).toBe(true);
  });
  await expect.poll(people).toBeGreaterThan(0);
});

test("phone: an employee's Lineup keeps its day wheel, and Announcements refreshes (emre)", async ({ browser }) => {
  const { page, cdp } = await phone(browser, "emre");
  await page.goto("/app/employee-hub/schedule/lineup");
  await expect(page.locator(".lineup-wheel")).toBeVisible();
  const refreshes = await watchRefreshes(page);
  const wheel = await centre(page, ".lineup-wheel");
  await pullFrom(cdp, wheel.x, wheel.y, 220);
  await page.waitForTimeout(400);
  expect(await refreshes()).toBe(0);
  const lineupReads = countReads(page, /\/my-lineups\//);
  const top = await centre(page, "h1");
  await pullFrom(cdp, top.x, top.y, 260);
  await expect.poll(lineupReads).toBeGreaterThan(0);

  await page.goto("/app/announcements");
  await expect(page.locator("h1").filter({ visible: true }).first()).toBeVisible();
  const posts = countReads(page, /\/communications\/announcements$/);
  const heading = await centre(page, "h1");
  await pullFrom(cdp, heading.x, heading.y, 260);
  await expect.poll(posts).toBeGreaterThan(0);
});

test("phone: Home has the shell's one mark, not one of its own (emre)", async ({ browser }) => {
  const { page } = await phone(browser, "emre");
  await page.goto("/app/employee-hub");
  await expect(page.locator(".dl-home")).toBeVisible();
  await expect(page.locator(".pull-mark")).toHaveCount(1);
  await expect(page.locator(".app-main > .pull-mark")).toHaveCount(1);
});
