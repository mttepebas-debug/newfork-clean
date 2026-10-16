import type { Browser, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { signIn, type Person } from "../fixtures/world";

// Every screen keeps its heading and tabs in place; only the content scrolls
// (Mert 2026-10-16, "header ve tableri freeze yap bütün ekranlarda"). On a
// phone the heading folds to one line once the page has moved ("B"). A window
// shorter than 560 px scrolls the whole page as before.

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

const headingSize = (page: Page) =>
  page.evaluate(() => {
    const heading = [...document.querySelectorAll("h1")].find((item) => item.getBoundingClientRect().height > 0)!;
    return parseFloat(getComputedStyle(heading).fontSize);
  });

test.describe("desktop: the heading and tabs stay where they are", () => {
  for (const [person, path, more] of [
    ["zeynep", "/app/workspace", []],
    ["zeynep", "/app/settings/scheduling", [".settings-rail"]],
    ["zeynep", "/app/settings/scheduling/conflicts", []],
    ["zeynep", "/account/security", [".account-sidebar"]],
    ["emre", "/app/employee-hub", [".eh-context-bar"]],
    ["emre", "/app/employee-hub/my-availability", ['[role="tablist"]']],
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

test.describe("phone: the heading folds to one line and stays on top", () => {
  for (const [person, path, more] of [
    ["zeynep", "/app/workspace", []],
    ["zeynep", "/app/settings/scheduling", [".settings-rail"]],
    ["zeynep", "/account/security", [".account-sidebar"]],
    ["emre", "/app/employee-hub", []],
    ["emre", "/app/employee-hub/my-availability", ['[role="tablist"]']],
  ] as const) {
    test(`${path} (${person})`, async ({ browser }) => {
      const page = await open(browser, person, PHONE);
      await visit(page, path);
      const size = await headingSize(page);
      const rail = more[0] === ".settings-rail" ? await topOf(page, ".settings-rail") : null;
      expect(await scrollPage(page)).toBeGreaterThan(0);
      await expect.poll(() => headingSize(page)).toBeLessThan(size);
      await expect(page.locator("h1").filter({ visible: true }).first()).toBeInViewport();
      for (const selector of more) await expect(page.locator(selector).filter({ visible: true }).first()).toBeInViewport();
      // The Settings menu row no longer scrolls a second time with the page.
      if (rail !== null) expect(await topOf(page, ".settings-rail")).toBe(rail);
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
