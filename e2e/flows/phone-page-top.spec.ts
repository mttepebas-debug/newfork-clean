import type { Browser, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { signIn, type Person } from "../fixtures/world";

// One page top on a phone (Mert 2026-10-17, "Bütün headerlarin Separator
// çizgilerin pixel hassasitetinde ayni koordinatlarda olmasi gerekiyor"; A,
// 12 px, the Settings and Account menus under the heading, a top bar on the
// employee's pages too): under the 56 px top bar every page's heading line
// sits 116 px down the screen, and stays there as the page scrolls: the
// heading never folds (Mert 2026-10-17, phone notes #4, "Hep büyük, sabit").

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const OPEN = 116;
// Every page is checked even after one is off, so a run names them all.
const soft = expect.configure({ soft: true });

const PAGES: Record<"zeynep" | "emre", string[]> = {
  zeynep: [
    "/app/workspace",
    "/app/schedule/requests",
    "/app/schedule/lineup",
    "/app/availability",
    "/app/employees",
    "/app/employees/documents",
    "/app/employees/archive",
    "/app/notifications",
    "/app/announcements",
    "/app/announcements/important-dates",
    "/app/settings/general",
    "/app/settings/locations",
    "/app/settings/jobs",
    "/app/settings/notifications",
    "/app/settings/scheduling",
    "/app/settings/scheduling/conflicts",
    "/app/settings/scheduling/shift-types",
    "/app/settings/scheduling/shift-labels",
    "/app/settings/roles",
    "/app/settings/documents",
    "/app/settings/acknowledgements",
    "/app/settings/support",
    "/account/profile",
    "/account/security",
    "/account/preferences",
    "/account/preferences/notifications",
    "/account/workspaces",
    "/app/my-documents",
  ],
  // Home is not here, nor the old time-off address that now opens it: Home's greeting folds into
  // the bar instead (Daylight, Mert 2026-10-18, S-163).
  emre: [
    "/app/employee-hub/schedule",
    "/app/employee-hub/shift-hub",
    "/app/employee-hub/my-availability",
    "/app/employee-hub/documents",
    "/app/employee-hub/schedule/lineup",
    "/app/notifications",
    "/app/announcements",
    "/account/profile",
  ],
};

async function open(browser: Browser, person: Person, size: { width: number; height: number }) {
  const phone = size.width < 700;
  const page = await (await browser.newContext({ viewport: size, hasTouch: phone, isMobile: phone })).newPage();
  await signIn(page, person);
  await expect(page).not.toHaveURL(/\/sign-in/);
  return page;
}

async function visit(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("h1").filter({ visible: true }).first()).not.toBeEmpty();
  // The heading paints before the data: measure only once the page has stopped loading.
  await expect(page.locator(".nf-loading, .nf-skeleton")).toHaveCount(0);
}

// The heading's separator line on screen: the heading draws it either as its
// bottom border or as a 1 px line of its own (::after).
const lineOf = (page: Page) =>
  page.evaluate(() => {
    const heading = [...document.querySelectorAll<HTMLElement>(".catalog-page-header, .settings-page-header, .account-page-header")].find(
      (item) => item.getBoundingClientRect().height > 0 && !item.closest('dialog, [role="dialog"]'),
    );
    if (!heading) return null;
    const box = heading.getBoundingClientRect();
    const line = getComputedStyle(heading, "::after");
    if (line.content !== "none" && line.position === "absolute" && parseFloat(line.height) === 1)
      return Math.round(box.top + parseFloat(line.top));
    const border = parseFloat(getComputedStyle(heading).borderBottomWidth) || 0;
    return border ? Math.round(box.bottom - border) : null;
  });

// Gives the page something to scroll and scrolls it as a finger would, in the
// box that scrolls: a list's frame, Employee Hub's schedule grid, or the page.
const scrollDown = (page: Page) =>
  page.evaluate(async () => {
    const settle = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 40))));
    const heading = [...document.querySelectorAll("h1")].find((item) => item.getBoundingClientRect().height > 0)!;
    let area: Element | null = heading.parentElement;
    while (area && !/(auto|scroll)/.test(getComputedStyle(area).overflowY)) area = area.parentElement;
    // Acknowledgements has no templates in the world yet: its empty list frame first.
    const acknowledgements = document.querySelector(".acknowledgement-page");
    if (acknowledgements && !acknowledgements.querySelector(":scope > .job-catalog")) {
      const list = document.createElement("div");
      list.className = "job-catalog";
      list.style.minHeight = "1px";
      acknowledgements.append(list);
    }
    const frame = [
      ...document.querySelectorAll(
        ".list-page :is(.employee-table-wrap, .job-catalog, .list-cards, .list-frozen-body, .lineup-phone, .lineup-desk-scroll), .acknowledgement-page > .job-catalog, .employee-schedule-board, .employee-hub-page :is(.ems-frame, .sx-workbench, .employee-lineup-page, .employee-weekly-workspace > [role=\"tabpanel\"])",
      ),
    ].find((item) => item.getBoundingClientRect().height > 0 && /(auto|scroll)/.test(getComputedStyle(item).overflowY));
    const box = frame ?? area ?? document.scrollingElement!;
    // Room in the list's frame (whatever lays out its rows), or in the page
    // itself, so the heading stays inside what it sticks in.
    if (frame) {
      // A block of rows; a frame that lays its rows out so a block cannot
      // lengthen it gets the room as padding instead.
      const rows = document.createElement("div");
      rows.style.cssText = "display: block; flex: none; height: 2000px; grid-column: 1 / -1";
      const before = frame.scrollHeight;
      frame.append(rows);
      if (frame.scrollHeight < before + 1000) {
        rows.remove();
        (frame as HTMLElement).style.paddingBottom = "2000px";
      }
    } else {
      const tall = document.createElement("div");
      tall.style.height = "2000px";
      const own = heading.closest("header")!.parentElement!;
      (own.closest("section") ?? own).append(tall);
    }
    await settle();
    for (let y = 40; y <= 480; y += 40) {
      box.scrollTop = y;
      await settle();
    }
  });

for (const person of ["zeynep", "emre"] as const) {
  test(`phone: every page's heading line at ${OPEN} px, scrolled too (${person})`, async ({ browser }) => {
    test.setTimeout(15 * 60_000);
    const page = await open(browser, person, PHONE);
    for (const path of PAGES[person]) {
      await visit(page, path);
      // The top bar is there on every page (Account draws its own row of the same height).
      await expect.soft(page.locator(".mm-top, .account-sidebar").filter({ visible: true }).first(), path).toBeVisible();
      await soft.poll(() => lineOf(page), { message: `${path} open`, timeout: 5000 }).toBe(OPEN);
      // Settings' and Account's menu sits under the line, as a page's tabs do.
      const menu = page.locator('nav[aria-label="Workspace settings"], nav[aria-label="Account"]').filter({ visible: true });
      if (await menu.count()) {
        const top = await menu.first().evaluate((element) => Math.round(element.getBoundingClientRect().top));
        expect.soft(top, `${path} menu under the line`).toBeGreaterThan(OPEN);
        // The menu scrolls sideways and so cuts what is drawn outside it: the
        // active link's focus ring (2 px, 2 px off) must fit inside it.
        const room = await menu.first().evaluate((nav) => {
          const box = nav.getBoundingClientRect();
          const link = nav.querySelector('[aria-current="page"], .active')!.getBoundingClientRect();
          return Math.min(link.top - box.top, box.bottom - link.bottom);
        });
        expect.soft(room, `${path} room for the focus ring`).toBeGreaterThanOrEqual(4);
      }
      await scrollDown(page);
      await soft.poll(() => lineOf(page), { message: `${path} scrolled`, timeout: 5000 }).toBe(OPEN);
      await expect.soft(page.locator("h1").filter({ visible: true }).first(), path).toBeInViewport();
    }
  });
}

// The menu under the heading is rebuilt with each page's heading: a keyboard
// user who picks a page from it stays in it, on the new page's link.
test("phone: choosing a page from the Settings menu keeps focus in the menu", async ({ browser }) => {
  const page = await open(browser, "zeynep", PHONE);
  await visit(page, "/app/settings/general");
  const menu = page.getByRole("navigation", { name: "Workspace settings" });
  await menu.getByRole("link", { name: "Jobs" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: /^Jobs/ })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Jobs" })).toHaveAttribute("aria-current", "page");
  await expect(menu.getByRole("link", { name: "Jobs" })).toBeFocused();
});

// The employee's Home keeps no second workspace bar under the top bar.
test("phone: the employee's Home has the one top bar", async ({ browser }) => {
  const page = await open(browser, "emre", PHONE);
  await visit(page, "/app/employee-hub");
  await expect(page.locator(".mm-top")).toBeVisible();
  await expect(page.locator(".eh-context-bar")).toBeHidden();
  await expect(page.locator(".mm-top").getByRole("link", { name: "Account" })).toBeVisible();
});

// The desktop is untouched: the heading keeps its eyebrow and description and
// draws its line as before, the Settings menu stays at the side.
test.describe("desktop keeps its heading", () => {
  for (const [person, path] of [
    ["zeynep", "/app/schedule/requests"],
    ["zeynep", "/app/settings/general"],
    ["zeynep", "/account/profile"],
    ["emre", "/app/employee-hub/schedule"],
  ] as const) {
    test(`${path} (${person})`, async ({ browser }) => {
      const page = await open(browser, person, DESKTOP);
      await visit(page, path);
      const heading = page.locator(".catalog-page-header, .settings-page-header, .account-page-header").filter({ visible: true }).first();
      await expect(heading.locator("h1 + p, .catalog-page-heading > p, div > p").first()).toBeVisible();
      expect(await heading.evaluate((element) => getComputedStyle(element, "::after").content)).toBe("none");
      await expect(page.locator(".mm-top")).toBeHidden();
      if (path.includes("settings")) await expect(page.locator(".settings-rail nav")).toBeVisible();
    });
  }
});
