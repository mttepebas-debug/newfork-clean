import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Browser, Locator, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { psql } from "../global-setup";
import { roundLabel, roundWeek, signIn, type Person } from "../fixtures/world";

// UI-FIELDMSG-2 (Mert 2026-10-18 ~1:00 AM PT): a field's short error goes right under it, a window's own
// error in its band; nothing keeps room while there is nothing to say; side-by-side fields grow as one row;
// the band lies over the body's bottom edge and gives the body that much room, so what it covers can still
// be scrolled to and clicked. Checked on a desktop and a phone.

const run: string = JSON.parse(readFileSync(new URL("../.world.json", import.meta.url), "utf8")).run;

function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

const screens = [
  { name: "desktop", week: 0, options: { viewport: { width: 1440, height: 900 } } },
  {
    name: "phone",
    week: 1,
    options: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
  },
] as const;

async function open(browser: Browser, person: Person, screen: (typeof screens)[number], path: string): Promise<Page> {
  const page = await (await browser.newContext(screen.options)).newPage();
  await signIn(page, person);
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto(path);
  return page;
}

/** In view, not under the band or anything else, and it takes a click. */
async function reachable(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  await expect(control).toBeInViewport();
  const onTop = await control.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return hit !== null && (hit === element || element.contains(hit));
  });
  expect(onTop, "nothing lies over it").toBe(true);
}

/** The band shows the whole message, edge to edge, and is not cut. */
async function bandSays(scope: Locator, text: string) {
  const band = scope.locator(".window-alert[role='alert']");
  await expect(band).toHaveText(text);
  const cut = await band.evaluate((element) => element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1);
  expect(cut, "the band says all of it").toBe(false);
  return band;
}

for (const screen of screens) {
  test.describe(`${screen.name}`, () => {
    test("Lineup Publish: Ask staff to acknowledge stays reachable under the window's error", async ({ browser }) => {
      const week = roundWeek(670 + screen.week);
      sql(`select tests.publish_week('${run}', ${week}, '[
        {"label": "${roundLabel(`emre-k-fieldmsg-${screen.name}`)}", "person": "emre", "loc": "K", "job": "cook", "day": 2, "start": "16:00", "end": "22:00"}
      ]');`);
      const day = sql(`select tests.week(${week}) + 2;`);
      const ayse = await open(browser, "ayse", screen, `/app/schedule/lineup?date=${day}`);
      // The publish fails the way the server says a week isn't published.
      await ayse.route("**/lineups/commands", (route) =>
        route.request().method() === "POST"
          ? route.fulfill({
              status: 409,
              contentType: "application/json",
              body: JSON.stringify({ error: "Week not published", reason: "lineup.week_not_published" }),
            })
          : route.fallback(),
      );
      if (screen.name === "phone") {
        await ayse.getByRole("combobox", { name: "Location" }).selectOption({ label: "Kadikoy" });
        await ayse.locator(".lineup-phone-dock").getByRole("button", { name: /^Publish, \d+ lineups? waiting$/ }).click();
      } else {
        await expect(ayse.getByRole("article", { name: "Kadikoy" })).toContainText("Emre Person");
        await ayse.getByRole("button", { name: /^Publish, \d+ lineups? waiting$/ }).click();
      }
      const window = ayse.getByRole("dialog", { name: "Publish lineups" });
      const ask = window.getByRole("switch", { name: "Ask staff to acknowledge" });
      const before = await ask.getAttribute("aria-checked");
      await window.getByRole("button", { name: /^Publish \d+$/ }).click();
      await bandSays(window, "Publish this week's Schedule first. Then publish the lineup.");
      await reachable(ask);
      await ask.click();
      await expect(ask).toHaveAttribute("aria-checked", before === "true" ? "false" : "true");
    });

    test("Swap request: the decline reason stays reachable under the window's error", async ({ browser }) => {
      const week = roundWeek(680 + screen.week);
      const ali = roundLabel(`ali-k-fieldmsg-${screen.name}`);
      const deniz = roundLabel(`deniz-b-fieldmsg-${screen.name}`);
      const caseId = sql(`
        select tests.publish_week('${run}', ${week}, '[
          {"label": "${ali}", "person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"},
          {"label": "${deniz}", "person": "deniz", "loc": "B", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"}
        ]');
        select public.shift_exchanges_command_service(tests.user('${run}:ali'), tests.id('${run}'),
          jsonb_build_object('action', 'create', 'kind', 'swap',
            'shift_id', tests.id('${run}:shift:${ali}'), 'requested_shift_id', tests.id('${run}:shift:${deniz}')),
          gen_random_uuid()) ->> 'case_id';`).split(/\r?\n/).at(-1)!;
      sql(`select public.shift_exchanges_command_service(tests.user('${run}:deniz'), tests.id('${run}'),
          jsonb_build_object('action', 'accept', 'case_id', c.id, 'application_id', a.id, 'expected_revision', c.revision),
          gen_random_uuid())
        from public.shift_exchange_cases c join public.shift_exchange_applications a on a.case_id = c.id
        where c.id = '${caseId}';`);
      const day = sql(`select tests.week(${week}) + 1;`);

      const ayse = await open(browser, "ayse", screen, `/app/schedule/requests?type=swap`);
      const refusal =
        "This swap changed while you were deciding. Close this window, open the request again and decide on the latest version of both shifts.";
      await ayse.route("**/v1/workspaces/*/shift-exchanges", (route) =>
        route.request().method() === "POST"
          ? route.fulfill({
              status: 409,
              contentType: "application/json",
              body: JSON.stringify({ error: refusal, reason: "exchange.test_refusal" }),
            })
          : route.fallback(),
      );
      const when = new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: new Date(`${day}T12:00:00`).getFullYear() === new Date().getFullYear() ? undefined : "numeric",
      }).format(new Date(`${day}T12:00:00`));
      // A table row on a desktop, a card button on a phone.
      await ayse
        .getByRole(screen.name === "phone" ? "button" : "row", { name: new RegExp(`^Ali Person, Swap, ${when}`) })
        .first()
        .click();
      const window = ayse.getByRole("dialog", { name: "Swap request" });
      await window.getByRole("button", { name: "Decline", exact: true }).click();
      const reason = window.getByRole("textbox", { name: /^Reason for Deniz/ });
      await reason.fill("Kitchen is short that day");
      await window.getByRole("button", { name: "Decline swap", exact: true }).click();
      await window.getByRole("button", { name: "Confirm decline", exact: true }).click();
      await bandSays(window, refusal);
      await reachable(reason);
      await reason.click();
      await reason.press("End");
      await reason.pressSequentially(".");
      await expect(reason).toHaveValue("Kitchen is short that day.");
    });

    test("Employees drawer: one field's error grows its row as one, and no room is kept before it", async ({ browser }) => {
      const ayse = await open(browser, "ayse", screen, "/app/employees?mode=create&section=profile");
      const drawer = ayse.locator(".employee-drawer");
      const first = drawer.getByLabel("First name", { exact: true });
      await expect(first).toBeVisible();
      const middle = drawer.getByLabel("Middle name", { exact: true });
      const last = drawer.getByLabel("Last name", { exact: true });

      // The fields after the name row, in both columns when there are two.
      const measure = () =>
        drawer.evaluate((element) => {
          const top = (node: Element | null | undefined) => node?.getBoundingClientRect().top ?? Number.NaN;
          const names = element.querySelector(".employee-name-grid");
          const inputs = [...(names?.querySelectorAll("input") ?? [])].map(top);
          // Every box after the name row, in every column: they all move by one amount.
          const below = [...element.querySelectorAll("input, select, textarea")]
            .filter(
              (box) =>
                // The drawer's body, not its fixed footer.
                box.closest(".employee-profile-sections") !== null &&
                !names?.contains(box) &&
                (names!.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 &&
                box.getBoundingClientRect().height > 0,
            )
            .map(top);
          const notes = element.querySelectorAll(".field-note").length;
          const slots = [...element.ownerDocument.querySelectorAll(".window-alert-slot")].reduce(
            (sum, slot) => sum + slot.getBoundingClientRect().height,
            0,
          );
          return { inputs, below, notes, slots };
        });

      // Nothing said, nothing kept: no note and no slot height, so the fields sit where they would
      // with no message part at all.
      const quiet = await measure();
      expect(quiet.notes).toBe(0);
      expect(quiet.slots).toBe(0);
      expect(quiet.below.length).toBeGreaterThan(0);

      // A Turkish-only letter in the first name: its note shows under First name only.
      await first.fill("Çağla");
      const note = drawer.locator(".employee-name-grid .field-note");
      await expect(note).toHaveCount(1);
      await expect(note).toContainText("English letters only.");
      expect(await first.getAttribute("aria-describedby")).toContain(await note.locator("small").getAttribute("id"));
      const said = await measure();
      const grew = (said.below[0] ?? 0) - (quiet.below[0] ?? 0);
      expect(grew).toBeGreaterThan(0);
      // Every input keeps the line it had with its neighbours; those that shared a top still do.
      for (const [a, b] of [
        [0, 1],
        [1, 2],
        [0, 2],
      ] as const) {
        if (Math.abs(quiet.inputs[a]! - quiet.inputs[b]!) < 1)
          expect(Math.abs(said.inputs[a]! - said.inputs[b]!), `inputs ${a} and ${b} stay level`).toBeLessThan(1);
      }
      expect(Math.abs(said.inputs[0]! - quiet.inputs[0]!)).toBeLessThan(1);
      // The row below moves by one amount under both columns.
      for (const [index, y] of said.below.entries())
        expect(Math.abs(y - quiet.below[index]! - grew), `field ${index} below moves with the row`).toBeLessThan(1);
      await expect(middle).toBeVisible();
      await expect(last).toBeVisible();

      // Gone again, nothing stays behind.
      await first.fill("Cagla");
      await expect(note).toHaveCount(0);
      const after = await measure();
      expect(after.below).toEqual(quiet.below);
      // And taking every message part out moves nothing: the quiet form holds no room for them.
      const without = await drawer.evaluate((element) => {
        const tops = () => [...element.querySelectorAll("input, select, textarea")].map((node) => node.getBoundingClientRect().top);
        const kept = tops();
        for (const node of element.ownerDocument.querySelectorAll(".field-note, .window-alert-slot")) node.remove();
        return { kept, bare: tops() };
      });
      expect(without.bare).toEqual(without.kept);
    });
  });
}
