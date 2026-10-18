import { mkdirSync } from "node:fs";
import type { Browser, Locator, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { signIn, type Person } from "../fixtures/world";

// CALISAN-SCHEDULE-LISTE (Mert 2026-10-17): Employee → Schedule opens on My shifts, the Home lab's "Zaman
// çizgisi" week list: This week · Next week, one card per day. The week changes only from the switch; a finger
// swiped sideways over the list leaves it alone (that swipe belongs to the page tabs). Team schedule is the
// published board, on a desktop only. The world has no shifts in the current two weeks (its weeks are far
// ahead), so the hub's answer for them gets three of Emre's own days added (route.fetch, then changed).

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const shots = "artifacts/calisan-schedule-liste/";
mkdirSync(shots, { recursive: true });

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const uuid = (n: number) => `c4150000-0000-4000-8000-${String(n).padStart(12, "0")}`;

async function open(browser: Browser, person: Person, size: typeof PHONE, path: string): Promise<Page> {
  const phone = size === PHONE;
  const page = await (await browser.newContext({ viewport: size, hasTouch: phone, isMobile: phone })).newPage();
  // The two weeks My shifts asks for: from its Monday (or Sunday) to the Sunday after next.
  await page.route(
    (url) => url.pathname.endsWith("/employee-hub") && url.searchParams.has("from") && addDays(url.searchParams.get("from")!, 13) === url.searchParams.get("to"),
    async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      const start = new URL(route.request().url()).searchParams.get("from")!;
      const where = { location_id: body.locations[0].id, location_name: body.locations[0].name, job_name: "Cook", note: "", employee_id: body.employee.id };
      body.shifts.push(
        { ...where, id: uuid(1), scheduled_date: addDays(start, 1), start_time: "09:00", end_time: "17:00" },
        { ...where, id: uuid(2), scheduled_date: addDays(start, 8), start_time: "16:00", end_time: "22:00" },
      );
      body.requests.push({
        id: uuid(3), kind: "time_off", status: "approved", title: "Time off", detail: "", revision: 1,
        created_at: new Date().toISOString(), can_cancel: false,
        periods: [{ id: uuid(4), segment_date: addDays(start, 3), start_time: null, end_time: null, status: "approved" }],
      });
      await route.fulfill({ response, json: body });
    },
  );
  await signIn(page, person);
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto(path);
  return page;
}

/** A finger across `on`'s middle, `dx` px sideways (Chrome's touch events through the DevTools protocol). */
async function swipe(page: Page, on: Locator, dx: number) {
  const box = (await on.boundingBox())!;
  const x = box.x + box.width / 2 - dx / 2;
  const y = box.y + Math.min(box.height / 2, 60);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let step = 1; step <= 8; step++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + (dx * step) / 8, y }] });
    await page.waitForTimeout(25);
  }
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
  await expect(thisWeek.locator(`[data-day="${addDays(start, 1)}"]`)).toContainText("9:00 AM – 5:00 PM");
  await expect(thisWeek.locator(`[data-day="${addDays(start, 1)}"]`)).toContainText("· Cook");
  await expect(thisWeek.locator(`[data-day="${addDays(start, 3)}"]`)).toContainText("Time off · Approved");
  await expect(thisWeek.locator(".ems-day.today")).toHaveCount(1);
  await emre.screenshot({ path: `${shots}my-shifts-1440.png` });

  await emre.getByRole("tab", { name: "Next week" }).click();
  await expect(emre.getByRole("tab", { name: "Next week" })).toHaveAttribute("aria-selected", "true");
  const nextWeek = emre.getByRole("tabpanel", { name: "Next week" });
  await expect(nextWeek.locator(`[data-day="${addDays(start, 8)}"]`)).toContainText("4:00 PM – 10:00 PM");
  await expect.poll(() => emre.locator(".ems-pager").evaluate((el) => el.scrollLeft)).toBeGreaterThan(300);
  await emre.screenshot({ path: `${shots}my-shifts-next-1440.png` });

  await pages.getByRole("link", { name: "Team schedule" }).click();
  await expect(emre).toHaveURL(/\/app\/employee-hub\/schedule\/team/);
  await expect(emre.locator(".employee-schedule-board")).toBeVisible();
  // The side menu has the page under Schedule, before Lineup.
  await expect(emre.locator("a.nav-item-child")).toContainText(["Team schedule", "Lineup"]);
});

test("phone: My shifts · Lineup, a sideways swipe leaves the week, a tap opens the shift", async ({ browser }) => {
  const emre = await open(browser, "emre", PHONE, "/app/employee-hub/schedule");
  const pages = emre.getByRole("navigation", { name: "Schedule pages" });
  await expect(pages.getByRole("link")).toHaveText(["My shifts", "Lineup"]);
  const thisTab = emre.getByRole("tab", { name: "This week" });
  await expect(thisTab).toHaveAttribute("aria-selected", "true");
  await emre.screenshot({ path: `${shots}my-shifts-390.png` });

  // The finger does not move the week.
  await swipe(emre, emre.getByRole("tabpanel", { name: "This week" }), -160);
  await emre.waitForTimeout(400);
  await expect(thisTab).toHaveAttribute("aria-selected", "true");
  expect(await emre.locator(".ems-pager").evaluate((el) => el.scrollLeft)).toBe(0);

  await emre.getByRole("tab", { name: "Next week" }).tap();
  await expect(emre.getByRole("tab", { name: "Next week" })).toHaveAttribute("aria-selected", "true");
  await emre.waitForTimeout(500);
  await emre.screenshot({ path: `${shots}my-shifts-next-390.png` });
  await emre.getByRole("tab", { name: "This week" }).tap();

  await emre.getByRole("tabpanel", { name: "This week" }).getByRole("link", { name: /9:00 AM – 5:00 PM/ }).tap();
  await expect(emre.getByRole("dialog", { name: "Your shift" })).toBeVisible();
  await emre.screenshot({ path: `${shots}my-shifts-sheet-390.png` });

  // The team's board is not a phone page: its address opens My shifts.
  await emre.goto("/app/employee-hub/schedule/team");
  await expect(emre).toHaveURL(/\/app\/employee-hub\/schedule(\?|$)/);
  await expect(emre.getByRole("tab", { name: "This week" })).toBeVisible();
});
