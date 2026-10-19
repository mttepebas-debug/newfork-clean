import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { psql } from "../global-setup";
import { roundLabel, roundWeek, signIn, type Person } from "../fixtures/world";

// LINEUP-PUBLISH-WEB (KARARLAR "Lineup yayını öne alındı", 2026-10-17): Ayse publishes Kadikoy's lineup for a
// day from the Lineup page's Publish window; Emre opens Schedule → Lineup, sees it and acknowledges; Ayse's
// lineup then says Read 1/N. Taken back, Emre's page says it isn't published yet.

const run: string = JSON.parse(readFileSync(new URL("../.world.json", import.meta.url), "utf8")).run;

function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

async function openPage(browser: Browser, person: Person, path: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, person);
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto(path);
  return page;
}

test("a manager publishes a lineup, the employee acknowledges it, and it is taken back", async ({ browser }) => {
  // A week no other flow publishes.
  const week = roundWeek(640);
  sql(`select tests.publish_week('${run}', ${week}, '[
    {"label": "${roundLabel("emre-k-lineup")}", "person": "emre", "loc": "K", "job": "cook", "day": 2, "start": "16:00", "end": "22:00"},
    {"label": "${roundLabel("ali-k-lineup")}", "person": "ali", "loc": "K", "job": "cook", "day": 2, "start": "17:00", "end": "23:00"}
  ]');`);
  const day = sql(`select tests.week(${week}) + 2;`);

  const ayse = await openPage(browser, "ayse", `/app/schedule/lineup?date=${day}`);
  // The desktop, F (Mert 2026-10-19): Kadikoy's ticket, its team in the list under it.
  await ayse.getByRole("combobox", { name: "Location" }).selectOption({ label: "Kadikoy" });
  const kadikoy = ayse.getByRole("region", { name: /^Kadikoy, / });
  await expect(ayse.getByRole("tabpanel")).toContainText("Emre Person");
  const trigger = ayse.getByRole("button", { name: /^Publish, \d+ lineups? waiting$/ });
  await trigger.click();
  const window = ayse.getByRole("dialog", { name: "Publish lineups" });
  const box = window.getByRole("region", { name: "Kadikoy" }).getByRole("checkbox").first();
  await expect(box).toHaveAttribute("aria-checked", "true");
  // Publish says what it did (Mert 2026-10-17, notice A; mockup v-e.js .d-pub): the window's Publish says
  // Publishing… and keeps focus; then the window closes and the page's Publish says Published, focused, then is
  // as it was; the shift's Published lights up once. No green line, no notice.
  const go = window.getByRole("button", { name: /^Publish \d+$/ });
  await go.focus();
  await ayse.keyboard.press("Enter");
  await expect(window.getByRole("button", { name: "Publishing…" })).toBeFocused();
  await expect(window).toHaveCount(0);
  const done = ayse.getByRole("button", { name: "Published", exact: true });
  await expect(done).toBeFocused();
  await expect(done).toHaveAttribute("aria-live", "polite");
  await expect(ayse.getByText(/notified/)).toHaveCount(0);
  await expect(kadikoy.locator(".lineup-card-status.is-live.is-flash")).toHaveCount(1);
  await expect(kadikoy.locator(".lineup-card-at.is-flash")).toHaveCount(1);
  await expect(ayse.getByRole("button", { name: /^Publish(, \d+ lineups? waiting)?$/ })).toBeFocused();
  await expect(kadikoy.getByRole("tab", { name: /^Read 0\/\d+$/ })).toBeVisible();

  const emre = await openPage(browser, "emre", `/app/employee-hub/schedule/lineup?date=${day}`);
  await expect(emre.getByRole("link", { name: "Lineup", exact: true }).first()).toBeVisible();
  const ticket = emre.locator(".employee-lineup-ticket");
  await expect(ticket).toContainText("4:00 PM – 10:00 PM");
  await expect(ticket).toContainText("Kadikoy");
  // Mert 2026-10-17: the shift tabs (hers the one pressable and pressed), her ticket, then Team · Notes.
  await expect(emre.getByRole("group", { name: "Shifts" }).locator("button:not([disabled])")).toHaveCount(1);
  await expect(emre.getByRole("group", { name: "Shifts" }).locator('button[aria-pressed="true"]')).toHaveCount(1);
  const order = await emre.evaluate(() =>
    [".lineup-shift-tabs", ".employee-lineup-ticket", ".employee-lineup-tabs"].map(
      (selector) => document.querySelector(selector)!.getBoundingClientRect().top,
    ),
  );
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  await expect(emre.locator(".lineup-day-head")).toHaveCount(0);
  await expect(emre.locator(".employee-lineup-place")).toHaveText("Kadikoy");
  await expect(emre.getByRole("list", { name: "Cook" })).toContainText("Ali Person");
  await emre.getByRole("button", { name: "Acknowledge", exact: true }).click();
  await expect(emre.getByText("Acknowledged.", { exact: true })).toBeVisible();
  await expect(emre.getByRole("button", { name: "Acknowledge", exact: true })).toHaveCount(0);

  await ayse.reload();
  await ayse.getByRole("combobox", { name: "Location" }).selectOption({ label: "Kadikoy" });
  // Who read it (Mert 2026-10-17): the ticket's Read tab; Emre is under Read, Ali not yet.
  await ayse.getByRole("region", { name: /^Kadikoy, / }).getByRole("tab", { name: /^Read 1\/\d+$/ }).click();
  const readers = ayse.getByRole("tabpanel");
  await expect(readers.getByRole("region", { name: "Read", exact: true })).toContainText("Emre Person");
  await expect(readers.getByRole("region", { name: "Not read yet" })).toContainText("Ali Person");

  // Take it back with the green Edit (S-162): the phone's Edit window, in the middle of the page.
  await ayse.getByRole("button", { name: /^Publish/ }).click();
  const again = ayse.getByRole("dialog", { name: "Publish lineups" });
  const row = again.getByRole("region", { name: "Kadikoy" }).getByRole("listitem").first();
  await expect(again.getByRole("button", { name: /Unpublish/ })).toHaveCount(0);
  await row.getByRole("button", { name: /^Edit .+ lineup$/ }).click();
  const ask = ayse.getByRole("alertdialog", { name: /^Edit .+ lineup\?$/ });
  await expect(ask).toContainText("Back to draft");
  await expect(ask).toContainText("Everyone gets the new version");
  const said = ask.getByText(/^Kadikoy · Published at \d{1,2}:\d{2} [AP]M$/);
  await expect(said).toBeVisible();
  const middle = (await ask.boundingBox())!;
  expect(Math.abs(middle.x + middle.width / 2 - ayse.viewportSize()!.width / 2)).toBeLessThanOrEqual(2);
  await ask.getByRole("button", { name: "Edit", exact: true }).focus();
  await ayse.keyboard.press("Enter");
  // While it works: Unpublishing…, still focused, and the window still says when it went out (D1, D2).
  const working = ask.getByRole("button", { name: "Unpublishing…" });
  await expect(working).toBeFocused();
  await expect(working).toHaveAttribute("aria-busy", "true");
  await expect(said).toBeVisible();
  await expect(ask).toHaveCount(0);
  // Back to draft, ticked to go out again, its box holding the focus; the Publish window stays open.
  const draft = again.getByRole("region", { name: "Kadikoy" }).getByRole("checkbox").first();
  await expect(draft).toHaveAttribute("aria-checked", "true");
  await expect(draft).toBeFocused();

  await emre.reload();
  await expect(emre.getByText(/lineup isn't published yet$/)).toBeVisible();
  await expect(emre.getByText("You'll get a notification when it is.", { exact: true })).toBeVisible();
});

// LINEUP-PUBLISH-PHONE (KARARLAR Lineup, Mert 2026-10-17: E · Çark tarih): on a phone Ayse turns the day wheel
// to the day, reads the team (nothing to edit), publishes from the dock over the bottom bar through the
// sheet, and the Read tab counts. Only the page header stays while the page scrolls (Mert 2026-10-17 ~8 AM).
test("a manager publishes a lineup from a phone", async ({ browser }) => {
  const week = roundWeek(641);
  sql(`select tests.publish_week('${run}', ${week}, '[
    {"label": "${roundLabel("emre-k-lineup-phone")}", "person": "emre", "loc": "K", "job": "cook", "day": 3, "start": "16:00", "end": "22:00"},
    {"label": "${roundLabel("ali-k-lineup-phone")}", "person": "ali", "loc": "K", "job": "cook", "day": 3, "start": "17:00", "end": "23:00"}
  ]');`);
  const day = sql(`select tests.week(${week}) + 3;`);
  const before = sql(`select tests.week(${week}) + 2;`);

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const ayse = await context.newPage();
  await signIn(ayse, "ayse");
  await expect(ayse).not.toHaveURL(/\/sign-in/);
  await ayse.goto(`/app/schedule/lineup?date=${before}`);

  // The wheel: › turns it a day, and the page loads that day.
  const wheel = ayse.getByRole("group", { name: "Day. Swipe or use the arrow keys." });
  await expect(wheel.locator('[aria-pressed="true"]')).toHaveCount(1);
  await ayse.getByRole("button", { name: "Next day" }).tap();
  await expect(ayse).toHaveURL(new RegExp(`date=${day}`));
  await ayse.getByRole("combobox", { name: "Location" }).selectOption({ label: "Kadikoy" });

  // Read-only: the rows open nothing.
  const team = ayse.getByRole("list", { name: "Cook" });
  await expect(team).toContainText("Emre Person");
  await expect(team.getByRole("button")).toHaveCount(0);
  // The card (Mert 2026-10-17, card 1): the place and day; Draft over "Not published yet"; Edit off; Read off.
  const card = ayse.locator(".lineup-card");
  await expect(card.locator(".lineup-card-loc")).toHaveText("Kadikoy");
  await expect(card.getByText("Draft", { exact: true })).toBeVisible();
  await expect(card.getByText("Not published yet", { exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: "Edit", exact: true })).toBeDisabled();
  await expect(card.getByRole("tab", { name: "Read" })).toBeDisabled();

  // Only the page header stays put, at its full size; the date row, the wheel and the shift tabs scroll away.
  const header = ayse.locator(".lineup-phone-head .catalog-page-header");
  const open = await header.boundingBox();
  await ayse.evaluate(() => {
    const tall = document.createElement("div");
    tall.style.height = "1600px";
    document.querySelector(".lineup-phone-pane")!.append(tall);
    document.querySelector(".app-main")!.scrollTop = 2000;
  });
  await expect(ayse.locator("#lineup-title")).toBeInViewport();
  await expect.poll(async () => (await header.boundingBox())?.height).toBe(open?.height);
  for (const piece of [".lineup-toolbar", ".lineup-wheel", ".lineup-shift-tabs"])
    await expect
      .poll(() =>
        ayse.evaluate(
          (selector) =>
            document.querySelector(selector)!.getBoundingClientRect().bottom <=
            document.querySelector(".lineup-phone-head")!.getBoundingClientRect().bottom,
          piece,
        ),
      )
      .toBe(true);
  await ayse.evaluate(() => {
    document.querySelector(".app-main")!.scrollTop = 0;
  });

  // Publish sits over the bottom bar and opens the window as a sheet.
  await ayse.locator(".lineup-phone-dock").getByRole("button", { name: /^Publish, \d+ lineups? waiting$/ }).tap();
  const sheet = ayse.getByRole("dialog", { name: "Publish lineups" });
  await expect(sheet).toHaveClass(/is-sheet/);
  await sheet.getByRole("button", { name: /^Publish \d+$/ }).tap();
  // Publishing… in the sheet, then the sheet closes and the floating Publish says Published (notice A).
  await expect(sheet.getByRole("button", { name: "Publishing…" })).toBeVisible();
  await expect(sheet).toHaveCount(0);
  const dockSaid = ayse.locator(".lineup-phone-dock").getByRole("button", { name: "Published", exact: true });
  await expect(dockSaid).toBeVisible();
  await expect(dockSaid).toBeFocused();
  await expect(ayse.getByText(/notified/)).toHaveCount(0);
  // The card's Live and "Published at" light up once, with the sheet gone.
  await expect(card.locator(".lineup-card-status.is-live.is-flash")).toHaveCount(1);
  await expect(card.locator(".lineup-card-at.is-flash")).toHaveCount(1);

  // Live now, and nothing left to publish on this shift: Publish goes, focus to the card's Edit.
  await expect(card.getByText("Live", { exact: true })).toBeVisible();
  await expect(card.getByText(/^Published at \d{1,2}:\d{2} [AP]M$/)).toBeVisible();
  await expect(ayse.locator(".lineup-phone-dock")).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Edit", exact: true })).toBeFocused();
  await ayse.getByRole("tab", { name: /^Read \d+\/\d+$/ }).tap();
  await expect(ayse.getByRole("tabpanel").getByRole("progressbar", { name: /^0 of \d+ read$/ })).toBeVisible();
  await expect(ayse.getByRole("tabpanel").getByRole("region", { name: "Not read yet" })).toContainText("Emre Person");

  // Edit takes it back to draft after the app's own window (A).
  await card.getByRole("button", { name: "Edit", exact: true }).tap();
  const ask = ayse.getByRole("alertdialog", { name: /^Edit .+ lineup\?$/ });
  await expect(ask).toContainText("Everyone gets the new version");
  await ask.getByRole("button", { name: "Edit", exact: true }).tap();
  await expect(ask).toHaveCount(0);
  await expect(card.getByText("Draft", { exact: true })).toBeVisible();
  await expect(ayse.locator(".lineup-phone-dock").getByRole("button", { name: /^Publish, \d+ lineups? waiting$/ })).toBeVisible();
  await context.close();
});

// Mert 2026-10-17 (~8:10, ~8:30 AM): the date row, the wheel, the shift tabs and what comes under them (the
// manager's location and date head, the employee's ticket) keep one rhythm on both phone Lineups: 14 px between
// the rows, 16 px under the tabs; on the manager's page the date row sits 18 px under the header's line. On
// both only the page header stays when the page scrolls.
test("the manager's and the employee's phone Lineup keep one rhythm", async ({ browser }) => {
  const week = roundWeek(642);
  sql(`select tests.publish_week('${run}', ${week}, '[
    {"label": "${roundLabel("emre-k-lineup-rhythm")}", "person": "emre", "loc": "K", "job": "cook", "day": 2, "start": "16:00", "end": "22:00"}
  ]');`);
  const day = sql(`select tests.week(${week}) + 2;`);
  const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

  const ayse = await (await browser.newContext(phone)).newPage();
  await signIn(ayse, "ayse");
  await expect(ayse).not.toHaveURL(/\/sign-in/);
  await ayse.goto(`/app/schedule/lineup?date=${day}`);
  await ayse.getByRole("combobox", { name: "Location" }).selectOption({ label: "Kadikoy" });
  await expect(ayse.getByRole("list", { name: "Cook" })).toContainText("Emre Person");
  // Publish it, so Emre's page shows the same pieces.
  await ayse.locator(".lineup-phone-dock").getByRole("button", { name: /^Publish, \d+ lineups? waiting$/ }).tap();
  const sheet = ayse.getByRole("dialog", { name: "Publish lineups" });
  await sheet.getByRole("button", { name: /^Publish \d+$/ }).tap();
  // The sheet closes on its own once it has gone out.
  await expect(sheet).toHaveCount(0);

  const emre = await (await browser.newContext(phone)).newPage();
  await signIn(emre, "emre");
  await expect(emre).not.toHaveURL(/\/sign-in/);
  await emre.goto(`/app/employee-hub/schedule/lineup?date=${day}`);
  await expect(emre.locator(".employee-lineup-ticket")).toContainText("Kadikoy");

  const rows = (page: Page, under: string) =>
    page.evaluate((under) => {
      const top = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().top;
      const bottom = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().bottom;
      const toolbar = top(".lineup-toolbar");
      return {
        line: toolbar - bottom(".catalog-page-header"),
        wheel: top(".lineup-wheel") - toolbar,
        tabs: top(".lineup-shift-tabs") - toolbar,
        head: top(under) - toolbar,
      };
    }, under);
  // The manager's lineup card sits where the employee's ticket does (Mert 2026-10-17 ~9:10 AM: the place and day
  // went into the card).
  const manager = await rows(ayse, ".lineup-card");
  const employee = await rows(emre, ".employee-lineup-ticket");
  expect(Math.abs(manager.line - 18)).toBeLessThanOrEqual(0.5);
  for (const key of ["wheel", "tabs", "head"] as const) expect(Math.abs(manager[key] - employee[key])).toBeLessThanOrEqual(0.5);
  expect(Math.abs(manager.wheel - 50)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(manager.tabs - 128)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(manager.head - 187)).toBeLessThanOrEqual(0.5);

  // Scrolled: the page header stays at the top at its full size; the wheel goes away under it. What scrolls is the
  // box around the wheel: the manager's main area; the employee's list frame under My shifts · Lineup (S-184).
  for (const page of [ayse, emre]) {
    const header = page.locator(".catalog-page-header").first();
    const open = await header.boundingBox();
    await page.evaluate(() => {
      const tall = document.createElement("div");
      tall.style.height = "1600px";
      document.querySelector(".lineup-phone-pane, .employee-lineup")!.append(tall);
      let box = document.querySelector(".lineup-wheel")!.parentElement;
      while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
      box!.scrollTop = 600;
    });
    await expect(page.locator("#lineup-title, #employee-hub-title")).toBeInViewport();
    await expect.poll(async () => (await header.boundingBox())?.height).toBe(open?.height);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const area = document.querySelector(".app-main")!.getBoundingClientRect().top;
          const pin = document.querySelector(".lineup-phone-head, .employee-lineup-pin")!.getBoundingClientRect();
          const wheel = document.querySelector(".lineup-wheel")!.getBoundingClientRect();
          return Math.round(pin.top - area) === 0 && wheel.bottom <= pin.bottom;
        }),
      )
      .toBe(true);
  }
});

// LINEUP-E-UI-BC (Mert 2026-10-17 ~9:10 AM, All locations): someone with more than one location opens the phone
// Lineup on All locations, every location's lineup one under the other; picking one shows that one alone. Zeynep
// (admin) sees both locations; Ali works at both and sees his lineup at each.
test("All locations on the manager's and the employee's phone", async ({ browser }) => {
  const week = roundWeek(643);
  sql(`select tests.publish_week('${run}', ${week}, '[
    {"label": "${roundLabel("ali-k-all")}", "person": "ali", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "12:00"},
    {"label": "${roundLabel("ali-b-all")}", "person": "ali", "loc": "B", "job": "cook", "day": 2, "start": "13:00", "end": "17:00"}
  ]');`);
  const day = sql(`select tests.week(${week}) + 2;`);
  const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

  const zeynep = await (await browser.newContext(phone)).newPage();
  await signIn(zeynep, "zeynep");
  await expect(zeynep).not.toHaveURL(/\/sign-in/);
  await zeynep.goto(`/app/schedule/lineup?date=${day}`);
  const location = zeynep.getByRole("combobox", { name: "Location" });
  await expect(location).toHaveValue("");
  await expect(location.locator("option").first()).toHaveText("All locations");
  const cards = zeynep.locator(".lineup-card");
  await expect(cards).toHaveCount(2);
  // In the workspace's location order, as the list under it.
  const order = (await location.locator("option").allTextContents()).slice(1);
  expect([...order].sort()).toEqual(["Besiktas", "Kadikoy"]);
  await expect(cards.locator(".lineup-card-loc")).toHaveText(order);
  await expect(zeynep.getByRole("separator")).toHaveCount(1);
  // Publish both from the dock, so Ali sees them.
  await zeynep.locator(".lineup-phone-dock").getByRole("button", { name: /^Publish, \d+ lineups? waiting$/ }).tap();
  const sheet = zeynep.getByRole("dialog", { name: "Publish lineups" });
  await sheet.getByRole("button", { name: /^Publish \d+$/ }).tap();
  // The sheet closes on its own once it has gone out.
  await expect(sheet).toHaveCount(0);
  await expect(cards.getByText("Live", { exact: true })).toHaveCount(2);
  // One location picked: that one alone.
  await location.selectOption({ label: "Besiktas" });
  await expect(cards).toHaveCount(1);
  await expect(cards.locator(".lineup-card-loc")).toHaveText("Besiktas");

  const ali = await (await browser.newContext(phone)).newPage();
  await signIn(ali, "ali");
  await expect(ali).not.toHaveURL(/\/sign-in/);
  await ali.goto(`/app/employee-hub/schedule/lineup?date=${day}`);
  const tickets = ali.locator(".employee-lineup-ticket");
  await expect(tickets).toHaveCount(2);
  await expect(tickets.locator(".employee-lineup-place")).toHaveText(["Kadikoy", "Besiktas"]);
  await expect(ali.getByRole("combobox", { name: "Location" })).toHaveValue("");
  // A tap on a ticket folds its Team · Notes; Acknowledge stays.
  await tickets.first().locator(".employee-lineup-time").tap();
  await expect(ali.getByRole("tablist")).toHaveCount(1);
  await expect(ali.getByRole("button", { name: "Acknowledge", exact: true })).toHaveCount(2);
  await ali.getByRole("combobox", { name: "Location" }).selectOption({ label: "Kadikoy" });
  await expect(tickets).toHaveCount(1);
  await expect(tickets.locator(".employee-lineup-place")).toHaveText("Kadikoy");
});
