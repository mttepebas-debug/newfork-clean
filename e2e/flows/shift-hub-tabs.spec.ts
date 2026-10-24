import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { signIn } from "../fixtures/world";

// A page's tab row stays put (Mert 2026-10-23, "shift hub da sayfa sekmelerinin olduğu yerde en sağda küçük bir
// scroll bar oluşmuş. bunu sil ve sekmeleri sabitle"). On a desktop Shift Hub's row scrolled: its tabs stood 1 px
// below it, so a scroll bar stood at its right end, and once the page moved the sky behind the frozen row (frozen-top.css)
// let it slide 32 px sideways. On a phone a strip scrolls only when its tabs do not fit; the sky let Shift Hub's and
// My Availability's slide 16 px once the page moved.

const soft = expect.configure({ soft: true });

/** How far the row moves when asked to scroll down and sideways (0, 0 when it stays put). */
const slides = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((row) => {
    row.scrollTop = 5;
    row.scrollLeft = 50;
    const moved = { x: row.scrollLeft, y: row.scrollTop };
    row.scrollTop = 0;
    row.scrollLeft = 0;
    return moved;
  });

async function checkRow(page: Page, path: string, selector: string) {
  await page.goto(path);
  await expect(page.locator(selector).first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(300);
  soft(await slides(page, selector), `${path}: the row stays put`).toEqual({ x: 0, y: 0 });
  // The world's page is short: a spacer lets it scroll, and the row freezes under the page title.
  await page.locator("main.app-main").evaluate((main) => {
    const spacer = document.createElement("div");
    spacer.style.height = "2000px";
    main.append(spacer);
    main.scrollTo(0, 200);
  });
  await expect(page.locator("main.app-main[data-frozen-scrolled]")).toBeAttached();
  await page.waitForTimeout(300);
  soft(await slides(page, selector), `${path}: the row stays put once the page moved`).toEqual({ x: 0, y: 0 });
}

test("Shift Hub's tab row stays put on a desktop, with no scroll bar", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await signIn(page, "emre");
  await expect(page).not.toHaveURL(/\/sign-in/);
  await checkRow(page, "/app/employee-hub/shift-hub", ".sx-tabs");
});

test("a phone's frozen tab strips slide only when their tabs do not fit", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
  await signIn(page, "emre");
  await expect(page).not.toHaveURL(/\/sign-in/);
  await checkRow(page, "/app/employee-hub/shift-hub", ".sx-tabs");
  await checkRow(page, "/app/employee-hub/my-availability", ".employee-weekly-workspace > .weekly-preferences-tabs");
});
