import type { Browser, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { signIn, type Person } from "../fixtures/world";

// Every screen keeps its heading and tabs in place; only the content scrolls
// (Mert 2026-10-16, "header ve tableri freeze yap bütün ekranlarda"). The
// heading never folds, on a phone too (Mert 2026-10-17, phone notes #4, "Hep
// büyük, sabit"). A window shorter than 560 px scrolls the whole page as before.

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

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

// The top of an element on screen, or null when there is none.
const topOf = (page: Page, selector: string) =>
  page.evaluate((selector) => {
    const element = [...document.querySelectorAll(selector)].find((item) => item.getBoundingClientRect().height > 0);
    return element ? Math.round(element.getBoundingClientRect().top) : null;
  }, selector);

// Scrolls the area the page scrolls in (the heading's scrolling box, or the
// document) to its end; returns how far it went.
const scrollPage = (page: Page) =>
  page.evaluate(() => {
    const heading = [...document.querySelectorAll("h1")].find((item) => item.getBoundingClientRect().height > 0)!;
    let box: Element | null = heading.parentElement;
    while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
    const area = box ?? document.scrollingElement!;
    area.scrollTop = area.scrollHeight;
    return area.scrollTop;
  });

// Scrolls the page down 20 px at a time, as a finger would, and follows a
// piece of content under the heading: it must move exactly as far as the
// page did (the content never jumps). It also notes whether the heading
// changed size and whether content ever drew over the frozen top (Account's
// menu, phone notes #9).
const sweep = (page: Page) =>
  page.evaluate(async () => {
    const settle = () =>
      new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 30))));
    const heading = [...document.querySelectorAll("h1")].find((item) => item.getBoundingClientRect().height > 0)!;
    let box: Element | null = heading.parentElement;
    while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
    const area = box ?? document.scrollingElement!;
    const size = parseFloat(getComputedStyle(heading).fontSize);
    const content = document.elementFromPoint(innerWidth / 2, innerHeight * 0.6)!;
    if (content.closest("[data-frozen-piece]")) throw new Error("the followed element is part of the frozen top");
    const start = content.getBoundingClientRect().top;
    let worst = 0;
    let resized = false;
    let covered = 0;
    for (let y = 20; y <= area.scrollHeight - area.clientHeight; y += 20) {
      area.scrollTop = y;
      await settle();
      worst = Math.max(worst, Math.abs(content.getBoundingClientRect().top - (start - area.scrollTop)));
      resized ||= parseFloat(getComputedStyle(heading).fontSize) !== size;
      for (const piece of document.querySelectorAll("[data-frozen-piece]")) {
        const box = piece.getBoundingClientRect();
        for (let x = box.left + 8; x < box.right - 4; x += 24) {
          const hit = document.elementFromPoint(x, box.top + box.height / 2);
          if (hit && !hit.closest("[data-frozen-piece]") && hit !== piece.parentElement) covered += 1;
        }
      }
    }
    return { worst, resized, covered };
  });

test.describe("desktop: the heading and tabs stay where they are", () => {
  for (const [person, path, more] of [
    ["zeynep", "/app/workspace", []],
    ["zeynep", "/app/settings/scheduling", [".settings-rail"]],
    ["zeynep", "/app/settings/scheduling/conflicts", []],
    ["zeynep", "/account/security", [".account-sidebar"]],
  ] as const) {
    test(`${path} (${person})`, async ({ browser }) => {
      const page = await open(browser, person, DESKTOP);
      await visit(page, path);
      const pinned = ["h1", ...more];
      const before = await Promise.all(pinned.map((selector) => topOf(page, selector)));
      expect(await scrollPage(page)).toBeGreaterThan(0);
      for (const [index, selector] of pinned.entries())
        await expect.poll(() => topOf(page, selector), { message: selector }).toBe(before[index]);
    });
  }
});

// The employee's Home is the one exception: its greeting fades and folds into
// the bar as the page scrolls, and the bar stays (Daylight, Mert 2026-10-18).
test("the employee's Home keeps its bar while the greeting scrolls away (emre)", async ({ browser }) => {
  const page = await open(browser, "emre", DESKTOP);
  await visit(page, "/app/employee-hub");
  const before = await topOf(page, ".eh-context-bar");
  expect(await scrollPage(page)).toBeGreaterThan(0);
  await expect.poll(() => topOf(page, ".eh-context-bar")).toBe(before);
});

test.describe("phone: the heading keeps its size and stays on top", () => {
  for (const [person, path, more] of [
    ["zeynep", "/app/workspace", []],
    // The Settings menu sits under the heading's line on a phone (MOBIL-BASLIK).
    ["zeynep", "/app/settings/scheduling", ['nav[aria-label="Workspace settings"]']],
    ["zeynep", "/account/security", [".account-sidebar", 'nav[aria-label="Account"]']],
    ["zeynep", "/account/preferences/notifications", ['nav[aria-label="Account"]']],
  ] as const) {
    test(`${path} (${person})`, async ({ browser }) => {
      const page = await open(browser, person, PHONE);
      await visit(page, path);
      const rail = path.includes("/settings/") ? await topOf(page, ".settings-content") : null;
      const before = await topOf(page, "h1");
      const { worst, resized, covered } = await sweep(page);
      expect(resized).toBe(false);
      expect(await topOf(page, "h1")).toBe(before);
      // the content never jumps and never draws over the heading or its menu
      expect(worst).toBeLessThanOrEqual(2);
      expect(covered).toBe(0);
      await expect(page.locator("h1").filter({ visible: true }).first()).toBeInViewport();
      for (const selector of more) await expect(page.locator(selector).filter({ visible: true }).first()).toBeInViewport();
      // Settings' scrolling area no longer scrolls a second time with the page.
      if (rail !== null) expect(await topOf(page, ".settings-content")).toBe(rail);
    });
  }
});

// Lineup and Settings → Acknowledgements scroll only their list. The world
// has too little to fill them, so a tall block goes into the list (and
// Acknowledgements, which has no templates yet, gets an empty list first).
// The phone Lineup holds its own top (E, 2026-10-17): lineup-publish.spec.ts.
test.describe("lists scroll inside their frame while the heading stays", () => {
  for (const [path, size, frame] of [
    // The desktop Lineup (F): the list under the location's ticket.
    ["/app/schedule/lineup", DESKTOP, ".lineup-desk-scroll"],
    ["/app/settings/acknowledgements", DESKTOP, ".acknowledgement-page > .job-catalog"],
    // Availability's people list scrolls in its own frame beside the week (AVAIL-GUN-3).
    ["/app/availability", DESKTOP, ".avt-split > .avt-list"],
  ] as const) {
    test(`${path} at ${size.width}`, async ({ browser }) => {
      const page = await open(browser, "zeynep", size);
      await visit(page, path);
      await page.evaluate((frame) => {
        if (!document.querySelector(frame)) {
          const list = document.createElement("div");
          list.className = "job-catalog";
          document.querySelector(".acknowledgement-page")!.append(list);
        }
        const tall = document.createElement("div");
        tall.style.height = "2000px";
        document.querySelector(frame)!.append(tall);
      }, frame);
      const before = await topOf(page, "h1");
      const moved = await page.evaluate((frame) => {
        const list = document.querySelector(frame)!;
        list.scrollTop = 500;
        const area = list.closest(".settings-content") ?? document.querySelector(".app-main")!;
        return { list: list.scrollTop, area: area.scrollHeight - area.clientHeight };
      }, frame);
      expect(moved.list).toBeGreaterThan(0);
      // the page around the list has nothing to scroll
      expect(moved.area).toBeLessThanOrEqual(1);
      await expect(page.locator("h1").filter({ visible: true }).first()).toBeInViewport();
      if (size.width > 700) await expect.poll(() => topOf(page, "h1")).toBe(before);
    });
  }
});

// My Availability (Mert 2026-10-16, "A · Alt sayfa"): the heading and the
// tabs stay; on a phone the seven days fit under them and nothing scrolls,
// and a day's sheet fits too, at 390 x 844 and at 390 x 800.
test.describe("My Availability", () => {
  test("desktop: the heading and tabs stay where they are", async ({ browser }) => {
    const page = await open(browser, "emre", DESKTOP);
    await visit(page, "/app/employee-hub/my-availability");
    await expect(page.getByRole("navigation", { name: "Days" })).toBeVisible();
    const pinned = ["h1", '[role="tablist"]'];
    const before = await Promise.all(pinned.map((selector) => topOf(page, selector)));
    await scrollPage(page);
    for (const [index, selector] of pinned.entries())
      await expect.poll(() => topOf(page, selector), { message: selector }).toBe(before[index]);
  });

  for (const height of [844, 800]) {
    test(`phone 390 x ${height}: the week and a day's sheet fit without scrolling`, async ({ browser }) => {
      const page = await open(browser, "emre", { width: 390, height });
      await visit(page, "/app/employee-hub/my-availability");
      const days = page.locator(".dav-list > .dav-row");
      await expect(days).toHaveCount(7);
      const overflow = () =>
        page.evaluate(() => {
          const main = document.querySelector(".app-main")!;
          return main.scrollHeight - main.clientHeight;
        });
      expect(await overflow()).toBeLessThanOrEqual(0);
      await expect(page.locator("h1").filter({ visible: true }).first()).toBeInViewport();
      await expect(page.getByRole("tablist", { name: "My availability" })).toBeInViewport();
      await expect(days.last()).toBeInViewport({ ratio: 1 });
      await days.nth(4).tap();
      const sheet = page.getByRole("dialog", { name: "Friday" });
      await expect(sheet).toBeVisible();
      await sheet.getByRole("radio", { name: /^Some hours/ }).tap();
      const fit = await sheet.evaluate((element) => ({
        inside: element.scrollHeight - element.clientHeight,
        bottom: Math.round(element.getBoundingClientRect().bottom),
        top: Math.round(element.getBoundingClientRect().top),
      }));
      expect(fit.inside).toBeLessThanOrEqual(0);
      expect(fit.top).toBeGreaterThanOrEqual(0);
      expect(fit.bottom).toBeLessThanOrEqual(height);
      await expect(sheet.getByRole("button", { name: "Save" })).toBeInViewport({ ratio: 1 });
      await sheet.getByRole("button", { name: "Cancel" }).tap();
      await expect(sheet).toBeHidden();
    });
  }
});

test("a window shorter than 560 px scrolls the whole page as before", async ({ browser }) => {
  const page = await open(browser, "zeynep", { width: 1440, height: 500 });
  await visit(page, "/app/workspace");
  const before = await topOf(page, "h1");
  expect(await scrollPage(page)).toBeGreaterThan(0);
  await expect.poll(() => topOf(page, "h1")).toBeLessThan(before!);
});
