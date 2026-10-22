import type { Browser, Page, Route } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { signIn, type Person } from "../fixtures/world";

// The managers' Home, Daylight "C · Locations first" (Mert 2026-10-19, KARARLAR
// S-210; YONETICI-HOME): the menu calls it Home; a card per location; a card or
// a chip narrows the page to that location; "Needs you" is grouped by location
// with whoever works without a required document on top (S-206); Customize
// still hides and moves the sections and saves them for the person; it also
// orders the location cards among themselves, the person's own order (S-220).
//
// The day itself (who is on now, the missing document, the time off) is fixed
// here: the Home read is page.route'd to one known answer, so the page's
// behaviour does not hang on the clock or on other specs' shifts. The read is
// tested on the database (manager_home_reads_each_location.test.sql) and the
// API (communication-service.test.ts); the layout save below is the real one,
// and the answer keeps the real read's layout so a saved one comes back.

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const KADIKOY = "e1000000-0000-4000-8000-000000000001";
const BESIKTAS = "e1000000-0000-4000-8000-000000000002";

const date = (offset: number) => {
  const day = new Date(Date.now() + offset * 86_400_000);
  return day.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
};
const at = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();
const week = () => Array.from({ length: 7 }, (_, index) => ({ date: date(index), shifts: 4, open: index === 2 ? 1 : 0, published: true }));
const place = (id: string, name: string) => ({
  id,
  name,
  timezone: "America/Los_Angeles",
  today: date(0),
  today_shifts: [] as { starts_at: string; ends_at: string; open: boolean }[],
  floor_managers: [] as { name: string; starts_at: string; ends_at: string }[],
  week: week(),
  open_shifts: [] as { date: string; starts_at: string; ends_at: string; job_name: string }[],
  missing_documents: [] as { employee_id: string; name: string; document: string; requirement_id: string; status: string }[],
});

function answer(workspaceId: string, both: boolean, layout: unknown) {
  const besiktas = {
    ...place(BESIKTAS, "Besiktas"),
    today_shifts: [
      { starts_at: at(-2), ends_at: at(3), open: false },
      { starts_at: at(-1), ends_at: at(4), open: false },
      { starts_at: at(2), ends_at: at(6), open: true },
    ],
    floor_managers: [{ name: "Lina Park", starts_at: at(-2), ends_at: at(3) }],
    open_shifts: [{ date: date(0), starts_at: at(2), ends_at: at(6), job_name: "Server" }],
    missing_documents: [{ employee_id: "e2000000-0000-4000-8000-000000000001", name: "Sam Ortiz", document: "Alcohol Server Permit",
      requirement_id: "e2100000-0000-4000-8000-000000000001", status: "expired" }],
  };
  const kadikoy = { ...place(KADIKOY, "Kadikoy"), today_shifts: [{ starts_at: at(-1), ends_at: at(5), open: false }] };
  return {
    workspace_id: workspaceId,
    now: new Date().toISOString(),
    locations: both ? [besiktas, kadikoy] : [kadikoy],
    layout,
    updates: [],
    coming_up: [],
    time_off: [
      { id: "e3000000-0000-4000-8000-000000000001", employee_id: "e2000000-0000-4000-8000-000000000002", employee_name: "Emre Demir",
        first_date: date(4), last_date: date(6), location_ids: [KADIKOY] },
    ],
  };
}

async function open(browser: Browser, person: Person, size: typeof DESKTOP, both: boolean): Promise<Page> {
  const phone = size.width < 700;
  const page = await (await browser.newContext({ viewport: size, hasTouch: phone, isMobile: phone })).newPage();
  await page.route(/\/v1\/workspaces\/[^/]+\/workspace\/home$/, async (route: Route) => {
    try {
      const response = await route.fetch();
      const real = (await response.json()) as { layout: unknown };
      await route.fulfill({ json: answer(route.request().url().split("/workspaces/")[1]!.split("/")[0]!, both, real.layout) });
    } catch {
      // The page closed while a read was on its way: nothing to answer.
    }
  });
  // Other specs' swaps would wait on this manager too: this Home's list is the fixed day's alone.
  await page.route(/\/v1\/workspaces\/[^/]+\/shift-exchanges(\?.*)?$/, async (route: Route) => {
    try {
      const response = await route.fetch();
      const body = (await response.json()) as { cases?: unknown[] };
      await route.fulfill({ response, json: { ...body, cases: [] } });
    } catch {
      // The page closed while a read was on its way (the list reads every minute): nothing to answer.
    }
  });
  await signIn(page, person);
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto("/app/workspace");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/^(Good morning|Good afternoon|Good evening|Up late),/);
  return page;
}

const needs = (page: Page) => page.getByRole("region", { name: "Needs you" });
const needTitles = (page: Page) => needs(page).locator(".dl-row b").allTextContents();

test("desktop: Home, a card per location, the page narrowed from a card or a chip (zeynep)", async ({ browser }) => {
  const page = await open(browser, "zeynep", DESKTOP, true);
  const primary = page.getByRole("navigation", { name: "Primary" });
  await expect(primary.getByRole("link", { name: "Home", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(primary.getByRole("link", { name: "Workspace", exact: true })).toHaveCount(0);

  const besiktas = page.getByRole("button", { name: /^Besiktas:/ });
  await expect(besiktas).toHaveAccessibleName(/^Besiktas: 2 on now\. 1 person working without a required document/);
  await expect(besiktas).toContainText("Lina Park on the floor");
  await expect(besiktas).toContainText("1 open today");
  await expect(page.getByRole("button", { name: /^Kadikoy:/ })).toContainText("1 need you");
  await expect(page.getByText("3 people on the floor across 2 locations. 2 things need you.")).toBeVisible();

  // By location, the missing document first (S-206).
  await expect(needs(page).locator(".mh-grp")).toHaveText(["Besiktas", "Kadikoy"]);
  expect(await needTitles(page)).toEqual(["Sam Ortiz is working without a required document", "Emre Demir asks for time off"]);

  await page.getByRole("button", { name: /^Kadikoy:/ }).click();
  await expect(page.getByRole("button", { name: /^Kadikoy:/ })).toHaveAttribute("aria-pressed", "true");
  expect(await needTitles(page)).toEqual(["Emre Demir asks for time off"]);
  await expect(page.getByRole("heading", { name: "Next 7 days · Kadikoy" })).toBeVisible();
  const chips = page.getByRole("group", { name: "Location" });
  await chips.getByRole("button", { name: "Besiktas" }).click();
  expect(await needTitles(page)).toEqual(["Sam Ortiz is working without a required document"]);
  await expect(page.getByRole("region", { name: "Open shifts" }).getByText("Besiktas · Server")).toBeVisible();
  await chips.getByRole("button", { name: "All locations" }).click();
  await expect(needs(page).locator(".dl-row")).toHaveCount(2);
});

test("desktop: Customize hides a section, Cancel keeps it, Save layout keeps the choice (zeynep)", async ({ browser }) => {
  const page = await open(browser, "zeynep", DESKTOP, true);
  const openShifts = page.getByRole("region", { name: "Open shifts" });
  await expect(openShifts).toBeVisible();

  await page.getByRole("button", { name: "Customize" }).click();
  await page.getByRole("button", { name: "Hide Open shifts" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(openShifts).toBeVisible();

  await page.getByRole("button", { name: "Customize" }).click();
  await page.getByRole("button", { name: "Hide Open shifts" }).click();
  await page.getByRole("button", { name: "Move Todos up" }).click();
  await page.getByRole("button", { name: "Save layout" }).click();
  await expect(page.getByRole("button", { name: "Customize" })).toBeVisible();
  await expect(openShifts).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("region", { name: "Todos" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Open shifts" })).toHaveCount(0);

  // Put it back as it was, for whoever opens this Home next.
  await page.getByRole("button", { name: "Customize" }).click();
  await page.getByRole("button", { name: "Show Open shifts" }).click();
  await page.getByRole("button", { name: "Move Todos down" }).click();
  await page.getByRole("button", { name: "Save layout" }).click();
  await expect(page.getByRole("region", { name: "Open shifts" })).toBeVisible();
});

// phone-page-top and frozen-header leave Home out (its greeting folds); this
// stands in for them: the top bar holds still, the page scrolls under it, and
// once the greeting is gone the bar's middle shows who is on now.
test("phone: the top bar stays put while Home scrolls under it (zeynep)", async ({ browser }) => {
  const page = await open(browser, "zeynep", PHONE, true);
  const bar = page.locator(".mm-top");
  const box = async () => {
    const rect = await bar.boundingBox();
    return rect && { top: Math.round(rect.y), height: Math.round(rect.height) };
  };
  const before = await box();
  expect(before?.height).toBeGreaterThan(0);
  const pill = page.locator(".mm-top-mid .dl-pill");
  const workspace = bar.locator(".mm-top-workspace");
  // At the top: the workspace's name, no pill; the slot stays out of the row, so the name keeps its width.
  await expect(pill).toHaveCSS("opacity", "0");
  await expect(workspace).toHaveCSS("opacity", "1");
  await expect(page.locator(".mm-top .mm-top-mid")).toHaveCSS("position", "absolute");
  const room = await page.evaluate(() => {
    const name = document.querySelector(".mm-top-workspace")!.getBoundingClientRect();
    const tools = document.querySelector(".mm-top-tools")!.getBoundingClientRect();
    const text = document.querySelector<HTMLElement>(".mm-top-name")!;
    return { gap: Math.round(tools.left - name.right), fits: text.scrollWidth <= text.clientWidth };
  });
  expect(room.fits || room.gap <= 12).toBe(true);
  for (const y of [200, 600, 100000]) {
    const scrolled = await page.evaluate((y) => {
      const main = document.querySelector<HTMLElement>(".app-main")!;
      main.scrollTo(0, y);
      return main.scrollTop;
    }, y);
    expect(scrolled).toBeGreaterThan(0);
    await expect.poll(box).toEqual(before);
  }
  // Scrolled: the pill takes the name's place.
  await expect(pill).toHaveCSS("opacity", "1");
  await expect(pill).toContainText("3 on now");
  await expect(workspace).toHaveCSS("opacity", "0");
  await page.evaluate(() => document.querySelector<HTMLElement>(".app-main")!.scrollTo(0, 0));
  await expect(pill).toHaveCSS("opacity", "0");
  await expect(workspace).toHaveCSS("opacity", "1");
});

test("phone: Home leads the bottom bar; one location is one card and no chips (ayse)", async ({ browser }) => {
  const page = await open(browser, "ayse", PHONE, false);
  const bar = page.getByRole("navigation", { name: "Main navigation" });
  await expect(bar.getByRole("link").first()).toHaveText("Home");
  await expect(page.getByRole("heading", { name: "Your location" })).toBeVisible();
  await expect(page.locator(".mh-loc")).toHaveCount(1);
  await expect(page.getByRole("group", { name: "Location" })).toHaveCount(0);
  expect(await needTitles(page)).toEqual(["Emre Demir asks for time off"]);
  // The page keeps the phone's 16 px edge.
  const left = await page.locator(".mh-loc").evaluate((card) => Math.round(card.getBoundingClientRect().left));
  expect(left).toBe(16);
});

// S-220 (1): the cards ordered among themselves are the person's own order, kept
// on the server: the real Home read here (Besiktas and Kadikoy, by name at first).
test("desktop: Customize orders the location cards, and the order is kept after a reload (zeynep)", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: DESKTOP })).newPage();
  await signIn(page, "zeynep");
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto("/app/workspace");
  const names = () => page.locator(".mh-loc .mh-loc-h b").allTextContents();
  await expect.poll(names).toEqual(["Besiktas", "Kadikoy"]);

  await page.getByRole("button", { name: "Customize Home" }).click();
  await expect(page.getByRole("button", { name: "Move Besiktas left" })).toBeDisabled();
  await page.getByRole("button", { name: "Move Kadikoy left" }).click();
  expect(await names()).toEqual(["Kadikoy", "Besiktas"]);
  await page.getByRole("button", { name: "Save layout" }).click();
  await expect(page.getByRole("button", { name: "Customize Home" })).toBeVisible();
  expect(await names()).toEqual(["Kadikoy", "Besiktas"]);
  await page.reload();
  await expect.poll(names).toEqual(["Kadikoy", "Besiktas"]);

  // Put it back for whoever opens this Home next.
  await page.getByRole("button", { name: "Customize Home" }).click();
  await page.getByRole("button", { name: "Move Besiktas left" }).click();
  await page.getByRole("button", { name: "Save layout" }).click();
  await expect(page.getByRole("button", { name: "Customize Home" })).toBeVisible();
  await page.reload();
  await expect.poll(names).toEqual(["Besiktas", "Kadikoy"]);
});

// S-220 (3): at 1440 the cards fill their rows and none is left alone on the
// last one: four are two and two, five are three and two.
test("desktop: four cards are two rows of two, five are three and two (zeynep)", async ({ browser }) => {
  const page = await open(browser, "zeynep", DESKTOP, true);
  const more = (count: number) => async (route: Route) => {
    try {
      const response = await route.fetch();
      const real = (await response.json()) as { layout: unknown };
      const base = answer(route.request().url().split("/workspaces/")[1]!.split("/")[0]!, true, real.layout);
      const extra = ["Atasehir", "Uskudar", "Moda"].slice(0, count - 2).map((name, index) =>
        place(`e1000000-0000-4000-8000-00000000001${index}`, name));
      await route.fulfill({ json: { ...base, locations: [...base.locations, ...extra] } });
    } catch {
      // The page closed while a read was on its way: nothing to answer.
    }
  };
  const rows = () =>
    page.locator(".mh-loc").evaluateAll((cards) => {
      const byRow = new Map<number, number[]>();
      for (const card of cards) {
        const box = card.getBoundingClientRect();
        byRow.set(Math.round(box.top), [...(byRow.get(Math.round(box.top)) ?? []), Math.round(box.width)]);
      }
      return [...byRow.values()];
    });
  for (const [count, shape] of [
    [4, [2, 2]],
    [5, [3, 2]],
  ] as const) {
    await page.unroute(/\/v1\/workspaces\/[^/]+\/workspace\/home$/);
    await page.route(/\/v1\/workspaces\/[^/]+\/workspace\/home$/, more(count));
    await page.reload();
    await expect(page.locator(".mh-loc")).toHaveCount(count);
    const widths = await rows();
    expect(widths.map((row) => row.length)).toEqual(shape);
    // Each row fills the column: the cards of a row are one width, and a row of two is wider than one of three.
    for (const row of widths) expect(new Set(row).size).toBe(1);
    if (count === 5) expect(widths[1]![0]!).toBeGreaterThan(widths[0]![0]!);
  }
});
