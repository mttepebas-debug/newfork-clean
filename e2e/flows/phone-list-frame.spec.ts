import type { Browser, CDPSession, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { signIn } from "../fixtures/world";

// CALISAN-SCROLL (Mert 2026-10-19 ~06:30 AM): on an employee's phone pages only the list scrolls. The top bar,
// the page heading, the page tabs and the page's own controls stay; the list scrolls in its own frame, no taller
// than its rows, so a list that fits never moves; nothing is wider than the screen; a pull refreshes only while
// the list is at its top. Lineup: the date and the wheel go up with the list, the shift tabs and then the ticket
// with Team · Notes stop at the frame's top and the team passes under them. The world has no lineup for Emre
// today, so his day's answer is a made-up one with a long team (route.fulfill).

const PHONE = { width: 390, height: 844 };

const PAGES: [path: string, frame: string, fixed: string[]][] = [
  ["/app/employee-hub/schedule", ".ems-frame", ["h1", ".employee-schedule-tabs", ".ems-seg"]],
  ["/app/employee-hub/schedule/lineup", ".employee-lineup-page", ["h1", ".employee-schedule-tabs"]],
  ["/app/employee-hub/shift-hub?hub_view=available", ".sx-workbench", ["h1", ".sx-tabs", ".sx-filters"]],
  ["/app/employee-hub/shift-hub?hub_view=requests", ".sx-workbench", ["h1", ".sx-tabs", ".sx-filters"]],
  ["/app/employee-hub/shift-hub?hub_view=history", ".sx-workbench", ["h1", ".sx-tabs", ".sx-filters"]],
  ["/app/employee-hub/my-availability?section=time-off", '.employee-weekly-workspace > [role="tabpanel"]', ["h1", '[role="tablist"]']],
];
// Announcements already scrolls its list in the list pages' frame (frozen-header.spec.ts, phone-page-top.spec.ts).

/** A tall block of rows at the end of the list (a frame cannot shrink below its own padding, so not padding). */
const lengthen = (element: Element) => {
  const rows = document.createElement("div");
  rows.style.cssText = "display: block; flex: none; height: 2000px; grid-column: 1 / -1";
  element.append(rows);
};

const names = ["Maria Lopez", "Hannah Lee", "Emre Person", "Ali Kaya", "Zeynep Arslan", "Mehmet Demir", "Ayse Yilmaz", "John Park",
  "Lucia Gomez", "Tom Reed", "Sara Kim", "Omar Haddad", "Nina Patel", "Leo Rossi", "Ivy Chen", "Ben Carter", "Mia Brooks", "Kai Tanaka"];

async function phone(browser: Browser): Promise<{ page: Page; cdp: CDPSession }> {
  const context = await browser.newContext({ viewport: PHONE, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  // A published Dinner lineup with eighteen people on every day Emre opens.
  await page.route(/\/my-lineups\/\d{4}-\d{2}-\d{2}$/, async (route) => {
    const url = new URL(route.request().url());
    const date = url.pathname.slice(-10);
    const workspace = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.exec(url.pathname)?.[0] ?? "";
    const row = (i: number) => ({
      start_time: "16:00", end_time: "22:00", crosses_midnight: false, job_name: ["Server", "Cook", "Host"][i % 3]!,
      job_color: "#2255ee", section_name: null, label_names: [], called_off: false,
    });
    await route.fulfill({
      json: {
        workspace_id: workspace,
        date,
        lineups: [{
          id: "91000000-0000-4000-8000-000000000001", version_id: "90000000-0000-4000-8000-000000000001", version: 1,
          location: { id: "20000000-0000-4000-8000-000000000001", name: "Downtown", timezone: "America/Los_Angeles" },
          shift_type_id: null, shift_type_name: "Dinner", color: "#5b4bd6", shared_at: `${date}T21:10:00+00:00`,
          ask_ack: false, acknowledged_at: null, notes: { specials: "", n86: "", shift_notes: "" }, mine: [row(0)],
          team: names.map((name, i) => ({
            ...row(i), employee_id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, name,
            department_name: ["Front of House", "Back of House"][i % 2]!, is_me: i === 2,
          })),
        }],
      },
    });
  });
  await signIn(page, "emre");
  await expect(page).not.toHaveURL(/\/sign-in/);
  return { page, cdp: await context.newCDPSession(page) };
}

const topOf = (page: Page, selector: string) =>
  page.locator(selector).filter({ visible: true }).first().evaluate((element) => Math.round(element.getBoundingClientRect().top));

/** How far the app's main area, the screen sideways and `frame` can scroll. */
const room = (page: Page, frame: string) =>
  page.evaluate((selector) => {
    const main = document.querySelector(".app-main")!;
    const list = [...document.querySelectorAll(selector)].find((item) => item.getBoundingClientRect().height > 0)!;
    return {
      page: main.scrollHeight - main.clientHeight,
      sideways: Math.max(main.scrollWidth - main.clientWidth, document.documentElement.scrollWidth - innerWidth),
      list: list.scrollHeight - list.clientHeight,
    };
  }, frame);

for (const [path, frame, fixed] of PAGES) {
  test(`phone: only the list scrolls on ${path} (emre)`, async ({ browser }) => {
    const { page } = await phone(browser);
    await page.goto(path);
    const list = page.locator(frame).filter({ visible: true }).first();
    await expect(list).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".nf-loading")).toHaveCount(0, { timeout: 30_000 });
    // As it opens: the page itself never scrolls, nothing is wider than the screen.
    const open = await room(page, frame);
    expect(open.page, "the page scrolls").toBeLessThanOrEqual(0);
    expect(open.sideways, "wider than the screen").toBeLessThanOrEqual(0);
    // A long list (room added to the frame) scrolls in its frame; the page still doesn't, and the top stays.
    const before = await Promise.all(fixed.map((selector) => topOf(page, selector)));
    await list.evaluate(lengthen);
    const long = await room(page, frame);
    expect(long.page, "the page scrolls with a long list").toBeLessThanOrEqual(0);
    expect(long.list, "the list scrolls").toBeGreaterThan(1000);
    await list.evaluate((element) => {
      element.scrollTop = 600;
    });
    for (const [index, selector] of fixed.entries())
      await expect.poll(() => topOf(page, selector), { message: selector }).toBe(before[index]);
  });
}

test("phone: Lineup's shift tabs, ticket and Team · Notes stop at the top while the team passes (emre)", async ({ browser }) => {
  const { page } = await phone(browser);
  await page.goto("/app/employee-hub/schedule/lineup");
  const frame = page.locator(".employee-lineup-page");
  await expect(page.getByRole("region", { name: "Dinner lineup" })).toBeVisible({ timeout: 30_000 });
  const frameTop = await topOf(page, ".employee-lineup-page");
  await frame.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  // The wheel has gone up out of sight; the shift tabs sit on the frame's top, the ticket and tabs under them.
  await expect.poll(() => page.locator(".lineup-wheel").evaluate((element) => element.getBoundingClientRect().bottom)).toBeLessThanOrEqual(frameTop);
  const tabs = await page.locator(".employee-lineup > .lineup-shift-tabs").evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { top: Math.round(box.top), bottom: Math.round(box.bottom) };
  });
  expect(tabs.top).toBe(frameTop);
  expect(await topOf(page, ".employee-lineup-head")).toBe(tabs.bottom);
  await expect(page.getByRole("tab", { name: /^Team/ })).toBeInViewport();
  // The last person is reachable and sits under the head, not behind it.
  const last = page.getByText(names.at(-1)!, { exact: true });
  await expect(last).toBeInViewport();
  const headBottom = await page.locator(".employee-lineup-head").evaluate((element) => element.getBoundingClientRect().bottom);
  expect(await last.evaluate((element) => element.getBoundingClientRect().top)).toBeGreaterThanOrEqual(headBottom);
});

/** A finger from (x, y) straight down by `distance` px, released at the end. */
async function pullFrom(cdp: CDPSession, x: number, y: number, distance: number) {
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", at: number) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y: at }] });
  await touch("touchStart", y);
  for (let step = 1; step <= 12; step++) await touch("touchMove", y + (distance * step) / 12);
  await touch("touchEnd", y + distance);
}

test("phone: a pull refreshes My shifts only while its days are at their top (emre)", async ({ browser }) => {
  const { page, cdp } = await phone(browser);
  await page.goto("/app/employee-hub/schedule");
  const frame = page.locator(".ems-frame");
  await expect(frame).toBeVisible({ timeout: 30_000 });
  await frame.evaluate(lengthen);
  await page.evaluate(() => {
    const mark = document.querySelector(".app-main > .pull-mark")!;
    const w = window as unknown as { __refreshes: number };
    w.__refreshes = 0;
    new MutationObserver(() => {
      if (mark.classList.contains("is-refreshing")) w.__refreshes += 1;
    }).observe(mark, { attributes: true, attributeFilter: ["class"] });
  });
  const refreshes = () => page.evaluate(() => (window as unknown as { __refreshes: number }).__refreshes);
  const box = (await page.locator(".ems-seg").boundingBox())!;
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + box.height / 2);
  // The days scrolled down: a pull from the week switch does nothing.
  await frame.evaluate((element) => {
    element.scrollTop = 300;
  });
  await pullFrom(cdp, x, y, 260);
  await page.waitForTimeout(400);
  expect(await refreshes()).toBe(0);
  // Back at the top: the same pull refreshes.
  await frame.evaluate((element) => {
    element.scrollTop = 0;
  });
  await pullFrom(cdp, x, y, 260);
  await expect.poll(refreshes).toBe(1);
});
