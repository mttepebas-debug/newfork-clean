import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { signIn } from "../fixtures/world";

// A page's own tabs on a phone (S-152; Mert 2026-10-17, variant D "sola dayalı,
// çizgi sekme kadar"): on Schedule · Lineup, My Availability and Shift hub the
// strip runs edge to edge, each tab is its label with 12 px on each side, the
// first label lines up with the page title, and the open tab has one 2 px line
// as wide as the tab, drawn inside the strip, that slides to the tab opened.
// Tabs inside a page's content and the desktop keep theirs.

const PHONE = { width: 390, height: 844 };
const soft = expect.configure({ soft: true });
const STRIPS: [string, string][] = [
  ["/app/employee-hub/schedule", ".employee-schedule-tabs"],
  ["/app/employee-hub/schedule/lineup", ".employee-schedule-tabs"],
  ["/app/employee-hub/my-availability", ".employee-weekly-workspace > .weekly-preferences-tabs"],
  ["/app/employee-hub/my-availability?section=time-off", ".employee-weekly-workspace > .weekly-preferences-tabs"],
  ["/app/employee-hub/shift-hub", ".sx-tabs"],
];

const measure = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((list) => {
    const title = document.querySelector("h1")!;
    const titleRange = document.createRange();
    titleRange.selectNodeContents(title.firstChild ?? title);
    const box = list.getBoundingClientRect();
    const tabs = [...list.querySelectorAll<HTMLElement>(":scope > a, :scope > button")].map((tab) => {
      const range = document.createRange();
      range.selectNodeContents(tab);
      const r = tab.getBoundingClientRect();
      const text = range.getBoundingClientRect();
      return {
        open: tab.getAttribute("aria-current") === "page" || tab.getAttribute("aria-selected") === "true",
        left: Math.round(r.left - box.left + list.scrollLeft),
        width: Math.round(r.width),
        height: Math.round(r.height),
        bottom: Math.round(r.bottom),
        before: Math.round(text.left - r.left),
        textLeft: Math.round(text.left),
        fontSize: getComputedStyle(tab).fontSize,
      };
    });
    const style = getComputedStyle(list);
    const line = getComputedStyle(list, "::after");
    const x = new DOMMatrixReadOnly(line.transform === "none" ? undefined : line.transform).m41;
    return {
      left: Math.round(box.left),
      width: Math.round(box.width),
      bottom: Math.round(box.bottom),
      border: style.borderBottomWidth,
      hairline: style.boxShadow,
      sliding: list.hasAttribute("data-tab-line"),
      line: { height: line.height, bottom: line.bottom, x: Math.round(x), width: Math.round(parseFloat(line.width)) },
      titleLeft: Math.round(titleRange.getBoundingClientRect().left),
      tabs,
    };
  });

test("the employee's page tabs on a phone: label wide, in line with the page, one 2 px line", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: PHONE, hasTouch: true, isMobile: true })).newPage();
  await signIn(page, "emre");
  await expect(page).not.toHaveURL(/\/sign-in/);
  for (const [path, selector] of STRIPS) {
    await page.goto(path);
    await expect(page.locator(selector).first()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(300);
    const m = await measure(page, selector);
    soft(m.left, `${path}: from the left edge`).toBe(0);
    soft(m.width, `${path}: to the right edge`).toBe(PHONE.width);
    soft(m.border, `${path}: no border for the strip to cut`).toBe("0px");
    soft(m.hairline, `${path}: a 1 px line inside the strip`).toMatch(/inset$|inset /);
    for (const tab of m.tabs) {
      soft(tab.height, `${path}: tab height`).toBe(44);
      soft(tab.bottom, `${path}: the tab ends inside the strip`).toBe(m.bottom);
      soft(tab.fontSize, `${path}: label size`).toBe("14px");
      soft(tab.before, `${path}: 12 px before the label`).toBe(12);
    }
    soft(m.tabs[0]!.textLeft, `${path}: first label in line with the title`).toBe(m.titleLeft);
    const open = m.tabs.find((tab) => tab.open)!;
    soft(m.sliding, `${path}: the line is placed`).toBe(true);
    soft(m.line, `${path}: one 2 px line under the open tab, inside the strip`).toEqual({ height: "2px", bottom: "0px", x: open.left, width: open.width });
  }

  // A tap on the other tab slides the line under it.
  await page.goto("/app/employee-hub/my-availability");
  const strip = ".employee-weekly-workspace > .weekly-preferences-tabs";
  await page.locator(strip).getByRole("tab", { name: "Time off" }).tap();
  await expect(page).toHaveURL(/section=time-off/);
  await page.waitForTimeout(400);
  const moved = await measure(page, strip);
  const now = moved.tabs.find((tab) => tab.open)!;
  soft(moved.line, "the line moved to Time off").toEqual({ height: "2px", bottom: "0px", x: now.left, width: now.width });

  // A tab strip inside a page's content keeps its own look (Mert: "içerikler için değil").
  await page.goto("/app/employee-hub/documents");
  const content = await page.locator(".requests-tabs button").first().evaluate((tab) => getComputedStyle(tab).fontSize);
  soft(content, "Documents keeps its own tabs").toBe("13px");
});

test("the desktop keeps the page tabs it had", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await signIn(page, "emre");
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto("/app/employee-hub/schedule");
  const tab = page.locator(".employee-schedule-tabs a").first();
  await expect(tab).toBeVisible();
  expect(await tab.evaluate((a) => getComputedStyle(a).fontSize)).toBe("13px");
});
