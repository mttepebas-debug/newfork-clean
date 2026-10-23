import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { roundWeek, signIn } from "../fixtures/world";
import { psql } from "../global-setup";

// A page's own tabs on a phone, one standard on every page (KARARLAR S-253, Mert 2026-10-23, widening S-152):
// the employee's Schedule · Lineup, My Availability, Shift hub and My documents, and every list page's status
// tabs. The strip stays inside the page's 16 px sides, each tab is as wide as its label, 24 px apart, 14 px and
// 44 high, the first label lines up with the page title, and the open tab has one 2 px line under its label,
// drawn inside the strip, that slides to the tab opened. The desktop keeps its own.

const PHONE = { width: 390, height: 844 };
const soft = expect.configure({ soft: true });
const world: { readonly run: string } = JSON.parse(readFileSync(new URL("../.world.json", import.meta.url), "utf8"));
const sql = (query: string) => execSync(psql, { input: query, encoding: "utf8" }).trim();
const last = (text: string) => text.split(/\r?\n/).at(-1)!;
const STRIPS: [string, string][] = [
  ["/app/employee-hub/schedule", ".employee-schedule-tabs"],
  ["/app/employee-hub/schedule/lineup", ".employee-schedule-tabs"],
  ["/app/employee-hub/my-availability", ".employee-weekly-workspace > .weekly-preferences-tabs"],
  ["/app/employee-hub/my-availability?section=time-off", ".employee-weekly-workspace > .weekly-preferences-tabs"],
  ["/app/employee-hub/shift-hub", ".sx-tabs"],
  ["/app/employee-hub/documents", ".my-documents-page .requests-tabs"],
];
const STATUS = ".list-page .catalog-toolbar-status-row > .catalog-status-tabs";
const LISTS: [string, string][] = [
  ["/app/schedule/requests", STATUS],
  ["/app/employees", STATUS],
  ["/app/important-dates", STATUS],
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
        open:
          tab.getAttribute("aria-current") === "page" ||
          tab.getAttribute("aria-selected") === "true" ||
          tab.getAttribute("aria-pressed") === "true" ||
          tab.classList.contains("active"),
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

async function checkStrips(page: Page, strips: [string, string][], list: boolean) {
  for (const [path, selector] of strips) {
    await page.goto(path);
    await expect(page.locator(selector).first()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(300);
    const m = await measure(page, selector);
    soft(m.left, `${path}: inside the page's left side`).toBe(16);
    if (list) soft(m.width, `${path}: across the page (wider when the tabs scroll)`).toBeGreaterThanOrEqual(PHONE.width - 32);
    else soft(m.width, `${path}: to the page's right side`).toBe(PHONE.width - 32);
    soft(m.border, `${path}: no border for the strip to cut`).toBe("0px");
    soft(m.hairline, `${path}: a 1 px line inside the strip`).toMatch(/inset$|inset /);
    for (const tab of m.tabs) {
      soft(tab.height, `${path}: tab height`).toBe(44);
      soft(tab.bottom, `${path}: the tab ends inside the strip`).toBe(m.bottom);
      soft(tab.fontSize, `${path}: label size`).toBe("14px");
      soft(tab.before, `${path}: the tab is its label`).toBe(0);
    }
    // Each box is rounded on its own, so a gap can read one pixel off.
    for (let i = 1; i < m.tabs.length; i++)
      soft(Math.abs(m.tabs[i]!.left - m.tabs[i - 1]!.left - m.tabs[i - 1]!.width - 24), `${path}: 24 px between labels`).toBeLessThanOrEqual(1);
    soft(m.tabs[0]!.textLeft, `${path}: first label in line with the title`).toBe(m.titleLeft);
    const open = m.tabs.find((tab) => tab.open)!;
    soft(m.sliding, `${path}: the line is placed`).toBe(true);
    soft(m.line, `${path}: one 2 px line under the open tab, inside the strip`).toEqual({ height: "2px", bottom: "0px", x: open.left, width: open.width });
    // S-253: Add is never in a list page's tab row - Requests is the one exception (S-254, checked below).
    if (list && !path.startsWith("/app/schedule/requests"))
      soft(await page.locator(".catalog-toolbar-status-row .list-add-button").count(), `${path}: no Add in the tab row`).toBe(0);
  }
}

test("the employee's page tabs on a phone: label wide, in line with the page, one 2 px line", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: PHONE, hasTouch: true, isMobile: true })).newPage();
  await signIn(page, "emre");
  await expect(page).not.toHaveURL(/\/sign-in/);
  await checkStrips(page, STRIPS, false);

  // A tap on the other tab slides the line under it.
  await page.goto("/app/employee-hub/my-availability");
  const strip = ".employee-weekly-workspace > .weekly-preferences-tabs";
  await page.locator(strip).getByRole("tab", { name: "Time off" }).tap();
  await expect(page).toHaveURL(/section=time-off/);
  await page.waitForTimeout(400);
  const moved = await measure(page, strip);
  const now = moved.tabs.find((tab) => tab.open)!;
  soft(moved.line, "the line moved to Time off").toEqual({ height: "2px", bottom: "0px", x: now.left, width: now.width });
});

test("a list page's status tabs on a phone follow the same standard, and the line slides", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: PHONE, hasTouch: true, isMobile: true })).newPage();
  await signIn(page, "zeynep");
  await expect(page).not.toHaveURL(/\/sign-in/);
  await checkStrips(page, LISTS, true);

  // A tap on Past slides the line under it.
  await page.goto("/app/important-dates");
  await page.locator(STATUS).getByRole("tab", { name: "Past" }).tap();
  await page.waitForTimeout(400);
  const moved = await measure(page, STATUS);
  const now = moved.tabs.find((tab) => tab.open)!;
  soft(now, "Past is open").toBeTruthy();
  soft(moved.line, "the line moved to Past").toEqual({ height: "2px", bottom: "0px", x: now.left, width: now.width });
});

// Requests' "All" got its count after the line was placed, and the line kept the bare label's width: 18 px under
// a 30 px tab, in a full CI run where earlier specs had left requests open (main CI 2026-10-23). Here a fresh
// employee's request is open and the lists wait until the line is placed, so the count always comes after it.
test("Requests' line grows with All when its count comes in after the line is placed", async ({ browser }) => {
  const label = `pptabs${Math.random().toString(36).slice(2, 7)}`;
  const day = sql(`select tests.week(${roundWeek(812)}) + 2;`);
  const [id, revision] = last(
    sql(`
    select tests.person('${world.run}', '${label}', 'employee', array['K'], array['cook']);
    select r ->> 'id', r ->> 'revision' from public.ask_time_off_service(tests.user('${world.run}:${label}'), tests.id('${world.run}'),
      'vacation', '${day}'::date, '${day}'::date, true, null, null, null,
      app_private.time_off_timezone(tests.id('${world.run}'), tests.id('${world.run}:${label}')), gen_random_uuid()) r;`),
  ).split("|") as [string, string];
  try {
    const page = await (await browser.newContext({ viewport: PHONE, hasTouch: true, isMobile: true })).newPage();
    await signIn(page, "zeynep");
    await expect(page).not.toHaveURL(/\/sign-in/);
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(/\/(time-off-requests|shift-exchanges)\?/, async (route) => {
      await held;
      await route.continue();
    });
    await page.goto("/app/schedule/requests");
    const strip = page.locator(STATUS).first();
    await expect(strip).toHaveAttribute("data-tab-line", "", { timeout: 30_000 });
    const all = strip.getByRole("button", { name: /^All/ });
    await expect(all.locator("strong")).toHaveCount(0);
    release();
    await expect(all.locator("strong")).toBeVisible();
    await page.waitForTimeout(400);
    const m = await measure(page, STATUS);
    const open = m.tabs.find((tab) => tab.open)!;
    expect(m.line, "the line under All with its count").toEqual({ height: "2px", bottom: "0px", x: open.left, width: open.width });
  } finally {
    sql(`select public.withdraw_time_off_service(tests.user('${world.run}:${label}'), tests.id('${world.run}'), '${id}', ${revision});`);
  }
});

// KARARLAR S-254 (Mert 2026-10-23), Requests' one exception to S-253: on a phone "+ Add" stands at the right end
// of the tab row, the tabs on the left in their own strip, which scrolls and fades alone; Add keeps the list
// pages' shape, 32 high and 8 px above the row's bottom, the row's line under both. Shown where Add is offered
// (Time off), at 390 and 340.
for (const width of [390, 340]) {
  test(`Requests' Add stands at the tab row's right end on a ${width} px phone`, async ({ browser }) => {
    const page = await (await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true })).newPage();
    await signIn(page, "zeynep");
    await expect(page).not.toHaveURL(/\/sign-in/);
    await page.goto("/app/schedule/requests?type=time_off");
    const add = page.locator(".catalog-toolbar-status-row > .list-add-button");
    await expect(add).toBeVisible({ timeout: 30_000 });
    await expect(add).toHaveAccessibleName("Add time off");
    await expect(page.getByRole("button", { name: "Add time off" })).toHaveCount(1);
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => {
      const box = (el: Element) => el.getBoundingClientRect();
      const row = document.querySelector(".catalog-toolbar-status-row")!;
      const strip = row.querySelector(":scope > .catalog-status-tabs")!;
      const add = row.querySelector(":scope > .list-add-button")!;
      const style = getComputedStyle(add);
      return {
        row: { right: Math.round(box(row).right), bottom: Math.round(box(row).bottom), line: getComputedStyle(row).boxShadow },
        strip: { left: Math.round(box(strip).left), right: Math.round(box(strip).right) },
        add: {
          left: Math.round(box(add).left), right: Math.round(box(add).right), top: Math.round(box(add).top),
          bottom: Math.round(box(add).bottom), height: Math.round(box(add).height), inStrip: strip.contains(add),
          font: style.fontSize, radius: style.borderRadius, padding: style.padding, mask: style.maskImage,
        },
        page: [document.documentElement.scrollWidth, window.innerWidth],
      };
    });
    soft(m.strip.left, "the tabs start on the page's left side").toBe(16);
    soft(m.add.right, "Add ends on the page's right side").toBe(width - 16);
    soft(m.add.right, "Add ends the row").toBe(m.row.right);
    soft(m.add.inStrip, "Add is outside the scrolling strip").toBe(false);
    soft(m.add.left - m.strip.right, "12 px between the tabs and Add").toBe(12);
    soft(m.add.height, "32 high").toBe(32);
    soft(m.row.bottom - m.add.bottom, "8 px above the row's bottom").toBe(8);
    soft(m.add.font, "the list pages' 13 px").toBe("13px");
    soft(m.add.radius, "the list pages' 7 px corner").toBe("7px");
    soft(m.add.padding, "the list pages' 14 px sides").toBe("0px 14px");
    soft(m.add.mask, "Add never fades").toBe("none");
    soft(m.row.line, "the row's line runs under Add too").toMatch(/inset/);
    soft(m.page[0], "no sideways page scroll").toBe(m.page[1]);
  });
}

test("the desktop keeps the page tabs it had", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await signIn(page, "emre");
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto("/app/employee-hub/schedule");
  const tab = page.locator(".employee-schedule-tabs a").first();
  await expect(tab).toBeVisible();
  expect(await tab.evaluate((a) => getComputedStyle(a).fontSize)).toBe("13px");
});
