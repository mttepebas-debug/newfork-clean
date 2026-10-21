import type { Browser, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { signIn, type Person } from "../fixtures/world";

// One side gutter on a phone (Mert 2026-10-19, S-186: "telefonda bütün
// sayfaların yan kenar boşluğu 16 px"): every page's content, from the page
// box down to its heading, starts 16 px from the screen's left edge and ends
// 16 px from its right, and no page is wider than the screen. Before, the
// employee's own pages were 12 px (14 px from 621 to 720 px wide).

const GUTTER = 16;
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
    "/account/documents",
  ],
  emre: [
    "/app/employee-hub",
    "/app/employee-hub/schedule",
    "/app/employee-hub/schedule/lineup",
    "/app/employee-hub/shift-hub",
    "/app/employee-hub/my-availability",
    "/app/employee-hub/notifications",
    "/app/employee-hub/announcements",
    "/account/profile",
    "/account/documents",
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
  await expect(page.locator(".nf-loading, .nf-skeleton")).toHaveCount(0);
}

// How far the page's content sits from each edge of the screen: the innermost
// content edge of every box from the page's heading block out to the page
// itself (the heading's text is as wide as its words, so it is left out).
const gutters = (page: Page) =>
  page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const heading = [...document.querySelectorAll("h1")].find(
      (item) => item.getBoundingClientRect().height > 0 && !item.closest('dialog, [role="dialog"]'),
    )!;
    let left = 0;
    let right = 0;
    for (let box: HTMLElement | null = heading.closest<HTMLElement>("header, section"); box && box !== document.body; box = box.parentElement) {
      const style = getComputedStyle(box);
      const rect = box.getBoundingClientRect();
      left = Math.max(left, rect.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft));
      right = Math.max(right, width - rect.right + parseFloat(style.borderRightWidth) + parseFloat(style.paddingRight));
    }
    // The page scrolls inside the main area and a phone list inside its own
    // frame, so a strip that bleeds past the gutter widens one of those boxes,
    // not the document: every box the page scrolls in is checked (a box that
    // lets its content show past it scrolls nothing itself).
    const frames = [
      document.documentElement,
      ...[
        ...document.querySelectorAll(
          ".app-main, .settings-content, .account-shell, .account-layout-grid, .account-content-scroll, .list-frozen-body, .employee-lineup-page, .ems-frame, .sx-workbench, .employee-weekly-workspace > [role=\"tabpanel\"]",
        ),
      ].filter((frame) => /(auto|scroll)/.test(getComputedStyle(frame).overflowX)),
    ];
    const wider = frames.some((frame) => frame.scrollWidth > frame.clientWidth);
    return { left: Math.round(left), right: Math.round(right), wider };
  });

for (const width of [390, 700]) {
  for (const person of ["zeynep", "emre"] as const) {
    test(`phone ${width}: every page keeps ${GUTTER} px from both edges (${person})`, async ({ browser }) => {
      test.setTimeout(10 * 60_000);
      const page = await open(browser, person, { width, height: 844 });
      for (const path of PAGES[person]) {
        await visit(page, path);
        const measured = await gutters(page);
        soft(measured, path).toEqual({ left: GUTTER, right: GUTTER, wider: false });
      }
    });
  }
}

// The employee's Lineup bleeds its pinned heading and its day wheel over the
// gutter: both run exactly from one edge of the screen to the other.
test("phone: the employee's Lineup strips reach both edges and no further", async ({ browser }) => {
  const page = await open(browser, "emre", { width: 390, height: 844 });
  await visit(page, "/app/employee-hub/schedule/lineup");
  for (const strip of [".employee-lineup-pin", ".employee-lineup-day .lineup-wheel"]) {
    const box = await page.locator(strip).first().evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: Math.round(rect.left), right: Math.round(rect.right) };
    });
    soft(box, strip).toEqual({ left: 0, right: 390 });
  }
});

// The desktop is untouched: the employee's page starts 32 px right of the menu (S-172).
test("desktop: the employee's Schedule keeps its 32 px", async ({ browser }) => {
  const page = await open(browser, "emre", { width: 1440, height: 900 });
  await visit(page, "/app/employee-hub/schedule");
  const offset = await page.evaluate(() => {
    const main = document.querySelector(".app-main")!.getBoundingClientRect();
    const heading = [...document.querySelectorAll("h1")].find((item) => item.getBoundingClientRect().height > 0)!;
    return Math.round(heading.getBoundingClientRect().left - main.left);
  });
  expect(offset).toBe(32);
});
