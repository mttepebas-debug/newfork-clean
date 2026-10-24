import { mkdirSync } from "node:fs";
import type { Browser, Locator, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { swipeAt } from "../fixtures/finger";
import { signIn, type Person } from "../fixtures/world";

// CALISAN-SCHEDULE-LISTE (Mert 2026-10-17, S-153): Employee → Schedule opens on My shifts, the Home lab's
// "Zaman çizgisi" week list: This week · Next week, one card per day. The week changes only from the switch (and its arrows); a
// finger swiped sideways over the list moves to the next page tab (Lineup), as on every tabbed page (S-146), and
// the week is where it was on the way back. Team schedule is the published board, on a desktop only. The world
// has no shifts in the current two weeks (its weeks are far ahead), so the hub's answer for them gets three of
// Emre's own days added (route.fetch, then changed).

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const shots = "artifacts/calisan-schedule-liste/";
mkdirSync(shots, { recursive: true });

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** This week's Monday at the world's locations (Istanbul): My shifts reads the location's day, not the device's (S-226). */
const thisMonday = () => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
  return addDays(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7));
};
const uuid = (n: number) => `c4150000-0000-4000-8000-${String(n).padStart(12, "0")}`;

async function open(browser: Browser, person: Person, size: typeof PHONE, path: string): Promise<Page> {
  const phone = size === PHONE;
  const page = await (await browser.newContext({ viewport: size, hasTouch: phone, isMobile: phone })).newPage();
  // My shifts asks for each of its two weeks on its own (Monday to Sunday: the world's week starts Monday).
  // This week's Tuesday gets a shift and Thursday approved time off; next week's Tuesday a shift.
  const start = thisMonday();
  await page.route(
    (url) => url.pathname.endsWith("/employee-hub") && url.searchParams.has("from") && addDays(url.searchParams.get("from")!, 6) === url.searchParams.get("to"),
    async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      const from = new URL(route.request().url()).searchParams.get("from")!;
      const inWeek = (date: string) => date >= from && date <= addDays(from, 6);
      const where = { location_id: body.locations[0].id, location_name: body.locations[0].name, job_name: "Cook", note: "", employee_id: body.employee.id };
      body.shifts.push(
        ...[
          { ...where, id: uuid(1), scheduled_date: addDays(start, 1), start_time: "09:00", end_time: "17:00" },
          { ...where, id: uuid(2), scheduled_date: addDays(start, 8), start_time: "16:00", end_time: "22:00" },
        ].filter((item) => inWeek(item.scheduled_date)),
      );
      // The read's days off are what My shifts goes by (time off rebuild D3, D7).
      if (inWeek(addDays(start, 3))) body.leave_days.push(addDays(start, 3));
      await route.fulfill({ response, json: body });
    },
  );
  await signIn(page, person);
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto(path);
  return page;
}

/** The page has loaded: a finger on an outline that the content replaces mid-swipe never reaches the page. */
async function settled(page: Page) {
  await expect(page.locator(".employee-hub-page h1")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".nf-loading")).toHaveCount(0, { timeout: 30_000 });
}

/** Where `on` is on the screen, once it is there. */
async function boxOf(on: Locator) {
  await expect(on).toBeVisible();
  const box = await on.boundingBox();
  if (!box) throw new Error(`No box for ${on}: it is not on the screen`);
  return box;
}

/** A finger across `on`'s middle, `dx` px sideways (Chrome's touch events through the DevTools protocol). */
async function swipe(page: Page, on: Locator, dx: number) {
  const box = await boxOf(on);
  await swipeAt(page, box.x + box.width / 2 - dx / 2, box.y + Math.min(box.height / 2, 60), dx);
}

/** A finger's tap on `on` (Playwright's own tap scrolls the target into view first, which a finger never does). */
async function touch(page: Page, on: Locator) {
  const box = await boxOf(on);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

test("desktop: My shifts first, the week from the switch, Team schedule is the board", async ({ browser }) => {
  const emre = await open(browser, "emre", DESKTOP, "/app/employee-hub/schedule");
  const pages = emre.getByRole("navigation", { name: "Schedule pages" });
  await expect(pages.getByRole("link")).toHaveText(["My shifts", "Team schedule", "Lineup"]);
  await expect(pages.getByRole("link", { name: "My shifts" })).toHaveAttribute("aria-current", "page");

  const thisWeek = emre.getByRole("tabpanel", { name: "This week" });
  await expect(thisWeek.locator(".ems-day")).toHaveCount(7);
  const start = (await thisWeek.locator(".ems-day").first().getAttribute("data-day"))!;
  expect(start).toBe(thisMonday());
  await expect(thisWeek.locator(`[data-day="${addDays(start, 1)}"]`)).toContainText("9:00 AM – 5:00 PM");
  await expect(thisWeek.locator(`[data-day="${addDays(start, 1)}"]`)).toContainText("· Cook");
  await expect(thisWeek.locator(`[data-day="${addDays(start, 3)}"]`)).toContainText("Time off · Approved");
  await expect(thisWeek.locator(".ems-day.today")).toHaveCount(1);
  await emre.screenshot({ path: `${shots}my-shifts-1440.png` });

  await emre.getByRole("tab", { name: "Next week" }).click();
  await expect(emre.getByRole("tab", { name: "Next week" })).toHaveAttribute("aria-selected", "true");
  const nextWeek = emre.getByRole("tabpanel", { name: "Next week" });
  await expect(nextWeek.locator(`[data-day="${addDays(start, 8)}"]`)).toContainText("4:00 PM – 10:00 PM");
  const listLeft = async () => Math.round((await emre.locator(".ems-pager").boundingBox())!.x);
  await expect.poll(async () => Math.round((await nextWeek.boundingBox())!.x)).toBe(await listLeft());
  await emre.screenshot({ path: `${shots}my-shifts-next-1440.png` });

  // Week switch variant A (Mert 2026-10-23, "1-A"): the arrows go on past Next week, the switch names that week
  // under its dates, and This week brings it back to This week · Next week, not the week the arrows reached.
  const tabs = emre.getByRole("tablist", { name: "Week" }).getByRole("tab");
  await emre.getByRole("button", { name: "Following week" }).click();
  await emre.getByRole("button", { name: "Following week" }).click();
  await expect(tabs).toHaveText(["This week", /^[A-Z][a-z]{2} \d{1,2} – [A-Z][a-z]{2} \d{1,2}$/]);
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(emre.getByRole("tabpanel").locator(`[data-day="${addDays(start, 21)}"]`)).toHaveCount(1);
  await tabs.nth(0).click();
  await expect(tabs).toHaveText(["This week", "Next week"]);
  await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(thisWeek.locator(`[data-day="${start}"]`)).toHaveCount(1);
  // The week that left is gone once it slid out: one list, where the list starts.
  await expect(emre.locator(".ems-week")).toHaveCount(1);
  await expect.poll(async () => Math.round((await thisWeek.boundingBox())!.x)).toBe(await listLeft());
  await expect(emre).not.toHaveURL(/[?&]date=/);

  await pages.getByRole("link", { name: "Team schedule" }).click();
  await expect(emre).toHaveURL(/\/app\/employee-hub\/schedule\/team/);
  await expect(emre.locator(".employee-schedule-board")).toBeVisible();
  // A notification about a week further on opens that week, under its dates, beside This week.
  const far = addDays(start, 21);
  await emre.goto(`/app/employee-hub/schedule?date=${far}`);
  const farTab = emre.getByRole("tab", { selected: true });
  await expect(farTab).toHaveText(/^[A-Z][a-z]{2} \d{1,2} – [A-Z][a-z]{2} \d{1,2}$/);
  await expect(emre.getByRole("tabpanel", { name: await farTab.innerText() }).locator(`[data-day="${far}"]`)).toHaveCount(1);
  await emre.goto("/app/employee-hub/schedule/team");
  // The side menu has the page under Schedule, before Lineup.
  await expect(emre.locator("a.nav-item-child")).toContainText(["Team schedule", "Lineup"]);
});

test("phone: My shifts · Lineup, a sideways swipe moves to Lineup and back, a tap opens the shift", async ({ browser }) => {
  const emre = await open(browser, "emre", PHONE, "/app/employee-hub/schedule");
  const pages = emre.getByRole("navigation", { name: "Schedule pages" });
  await expect(pages.getByRole("link")).toHaveText(["My shifts", "Lineup"]);
  const thisTab = emre.getByRole("tab", { name: "This week" });
  await expect(thisTab).toHaveAttribute("aria-selected", "true");
  await emre.screenshot({ path: `${shots}my-shifts-390.png` });

  // The finger moves the page tab, never the week: over the list it goes to Lineup, and back.
  await settled(emre);
  await swipe(emre, emre.getByRole("tabpanel", { name: "This week" }), -160);
  await expect(emre).toHaveURL(/\/app\/employee-hub\/schedule\/lineup/);
  await settled(emre);
  await swipe(emre, emre.locator(".employee-hub-page h1"), 160);
  await expect(emre).toHaveURL(/\/app\/employee-hub\/schedule(\?|$)/);
  await settled(emre);
  await expect(emre.getByRole("tab", { name: "This week" })).toHaveAttribute("aria-selected", "true");
  // Where a week sits in the list's frame (both move together in the tab's own 0.22 s slide-in).
  const offset = (name: string) => emre.getByRole("tabpanel", { name }).evaluate((panel) => Math.round(panel.getBoundingClientRect().x - panel.closest(".ems-pager")!.getBoundingClientRect().x));
  await expect.poll(() => offset("This week")).toBe(0);
  // Nothing on the page is wider than the phone, so no swipe leaves the page itself sideways.
  expect(await emre.evaluate(() => [document.scrollingElement!.scrollLeft, document.querySelector(".app-main")?.scrollLeft ?? 0, document.documentElement.scrollWidth])).toEqual([0, 0, 390]);

  await touch(emre, emre.getByRole("tab", { name: "Next week" }));
  await expect(emre.getByRole("tab", { name: "Next week" })).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => offset("Next week")).toBe(0);
  // The week changes in place: the page moves neither sideways nor down.
  expect(await emre.evaluate(() => [document.querySelector(".app-main")?.scrollLeft, document.querySelector(".app-main")?.scrollTop])).toEqual([0, 0]);
  await emre.screenshot({ path: `${shots}my-shifts-next-390.png` });
  await emre.getByRole("tab", { name: "This week" }).tap();

  await emre.getByRole("tabpanel", { name: "This week" }).getByRole("link", { name: /9:00 AM – 5:00 PM/ }).tap();
  await expect(emre.getByRole("dialog", { name: "Your shift" })).toBeVisible();
  await emre.screenshot({ path: `${shots}my-shifts-sheet-390.png` });
  await emre.keyboard.press("Escape");
  await expect(emre.getByRole("dialog", { name: "Your shift" })).toBeHidden();

  // "Open in my schedule" (a shift's sheet on Home) lands on next week's shift by its #shift- address while the
  // weeks are already loaded: the page's scroll to it must not move the list's frame under the slide.
  const next = addDays(thisMonday(), 8);
  await emre.evaluate((url) => {
    history.pushState(null, "", url);
    dispatchEvent(new PopStateEvent("popstate"));
  }, `/app/employee-hub/schedule?date=${next}&shift=${uuid(2)}#shift-${uuid(2)}`);
  await expect(emre.getByRole("tab", { name: "Next week" })).toHaveAttribute("aria-selected", "true");
  await expect(emre.getByRole("dialog", { name: "Your shift" })).toBeVisible();
  await expect.poll(() => offset("Next week")).toBe(0);
  expect(await emre.locator(".ems-pager").evaluate((pager) => pager.scrollLeft)).toBe(0);
  // The list scrolls in its own frame (CALISAN-SCROLL): the shift's day lands whole under the week switch, its
  // halo too, not cut by the frame's top.
  const landed = await emre.locator(`[id="shift-${uuid(2)}"]`).evaluate((link) => {
    const day = link.closest(".ems-day")!.getBoundingClientRect();
    const frame = link.closest(".ems-frame")!;
    return { day: Math.round(day.top), frame: Math.round(frame.getBoundingClientRect().top), scrolled: frame.scrollTop };
  });
  expect(landed.scrolled).toBeGreaterThan(0);
  expect(landed.day - landed.frame).toBeGreaterThanOrEqual(6);
  await emre.keyboard.press("Escape");
  await emre.getByRole("tab", { name: "This week" }).tap();
  await expect.poll(() => offset("This week")).toBe(0);

  // The team's board is not a phone page: its address opens My shifts.
  await emre.goto("/app/employee-hub/schedule/team");
  await expect(emre).toHaveURL(/\/app\/employee-hub\/schedule(\?|$)/);
  await expect(emre.getByRole("tab", { name: "This week" })).toBeVisible();
});
