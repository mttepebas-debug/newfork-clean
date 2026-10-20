import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import type { Browser, Locator, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { password, psql } from "../global-setup";
import { lastLine, ownJob, tag } from "../fixtures/documents";
import { draftName, roundLabel, roundWeek, signIn, type Person } from "../fixtures/world";

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
  // The way a browser brings a control into view on focus: its scroller's scroll padding counts.
  await control.evaluate((element) => element.scrollIntoView({ block: "nearest" }));
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
        // The desktop Lineup, F (Mert 2026-10-19): Kadikoy's ticket, its team in the list under it.
        await ayse.getByRole("combobox", { name: "Location" }).selectOption({ label: "Kadikoy" });
        await expect(ayse.getByRole("region", { name: /^Kadikoy, / })).toBeVisible();
        await expect(ayse.getByRole("tabpanel")).toContainText("Emre Person");
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
      // TAKAS-RELEASE: a swap row is one sentence; the day it ends tells this week's apart.
      const expires = sql(`select to_char(expires_at at time zone 'Europe/Istanbul', 'Mon FMDD') from public.shift_exchange_cases where id = '${caseId}';`);
      await ayse
        .getByRole(screen.name === "phone" ? "button" : "row", { name: /^Shift swap: Ali Person and Deniz Person want to swap/ })
        .filter({ hasText: `${expires},` })
        .first()
        .click();
      const window = ayse.getByRole("dialog", { name: "Swap request" });
      await window.getByRole("button", { name: "Decline", exact: true }).click();
      const reason = window.getByRole("textbox", { name: /^Reason for Deniz/ });
      await reason.fill("Kitchen is short that day");
      await shot(ayse, `swap-decline-${screen.name}-hidden`);
      await window.getByRole("button", { name: "Decline swap", exact: true }).click();
      await window.getByRole("button", { name: "Confirm decline", exact: true }).click();
      await bandSays(window, refusal);
      await shot(ayse, `swap-decline-${screen.name}-shown`);
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

    test("Settings → Schedule rules → Availability: the band is on screen and Discard and reload works", async ({ browser }) => {
      const page = await open(browser, "zeynep", screen, "/app/settings/scheduling");
      const refusal = "These availability settings couldn't be saved right now. Discard your changes and load the latest settings.";
      await page.route("**/weekly/settings", (route) =>
        route.request().method() === "POST"
          ? route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: refusal, reason: "weekly.test_refusal" }) })
          : route.fallback(),
      );
      const section = page.getByRole("region", { name: "Availability settings" });
      const required = section.getByRole("switch", { name: "Availability required during onboarding" });
      const was = await required.isChecked();
      // By keyboard, the same on a desktop and a phone.
      await required.focus();
      await required.press("Space");
      await expect(required).toBeChecked({ checked: !was });
      await section.getByRole("button", { name: "Save", exact: true }).click();
      const band = section.locator(".window-alert[role='alert']");
      await expect(band).toContainText(refusal);
      const cut = await band.evaluate((element) => element.scrollHeight > element.clientHeight + 1);
      expect(cut, "the band says all of it").toBe(false);
      // It hangs from its own footer, right above Save, not from the page.
      const footer = section.locator(".weekly-preferences-footer");
      await footer.scrollIntoViewIfNeeded();
      const [bandBox, footerBox] = [await band.boundingBox(), await footer.boundingBox()];
      expect(Math.abs(bandBox!.y + bandBox!.height - footerBox!.y)).toBeLessThan(1.5);
      await expect(band).toBeInViewport();
      await shot(page, `weekly-settings-${screen.name}-shown`);
      const reload = band.getByRole("button", { name: "Discard and reload" });
      await reachable(reload);
      await reload.click();
      await expect(band).toHaveCount(0);
      await expect(required).toBeChecked({ checked: was });
    });

    test("Account → Profile → Your avatar → Upload photo → Crop profile photo: Vertical position stays reachable under the window's error", async ({ browser }) => {
      const page = await open(browser, "ayse", screen, "/account/profile");
      // The browser can't make the cropped picture: the window says so in its band.
      await page.evaluate(() => {
        HTMLCanvasElement.prototype.toBlob = function (callback) {
          callback(null);
        };
      });
      // AVATAR-IKON: the photo is chosen in the avatar window, its first tile.
      await page.getByRole("button", { name: /^(Add|Change) avatar$/ }).click();
      const avatar = page.getByRole("dialog", { name: "Your avatar" });
      const chooser = page.waitForEvent("filechooser");
      await avatar.getByRole("button", { name: "Upload photo" }).click();
      await (await chooser).setFiles({ name: "me.png", mimeType: "image/png", buffer: pixel });
      const window = page.getByRole("dialog", { name: "Crop profile photo" });
      await expect(window).toBeVisible();
      await window.getByRole("button", { name: "Use photo" }).click();
      await bandSays(window, "Photo could not be cropped");
      await shot(page, `avatar-crop-${screen.name}-shown`);
      const vertical = window.getByRole("slider", { name: "Vertical position" });
      await reachable(vertical);
      await vertical.focus();
      await vertical.press("ArrowUp");
      await expect(vertical).toHaveValue("51");
    });

    test("Shift Hub → Cancel this swap request: the reason stays reachable under the window's error", async ({ browser }) => {
      const week = roundWeek(700 + screen.week);
      const ali = roundLabel(`ali-k-hub-fieldmsg-${screen.name}`);
      const deniz = roundLabel(`deniz-b-hub-fieldmsg-${screen.name}`);
      const caseId = sql(`
        select tests.publish_week('${run}', ${week}, '[
          {"label": "${ali}", "person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"},
          {"label": "${deniz}", "person": "deniz", "loc": "B", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"}
        ]');
        select public.shift_exchanges_command_service(tests.user('${run}:ali'), tests.id('${run}'),
          jsonb_build_object('action', 'create', 'kind', 'swap',
            'shift_id', tests.id('${run}:shift:${ali}'), 'requested_shift_id', tests.id('${run}:shift:${deniz}')),
          gen_random_uuid()) ->> 'case_id';`).split(/\r?\n/).at(-1)!;
      const day = sql(`select tests.week(${week}) + 1;`);
      const page = await open(browser, "ali", screen, `/app/employee-hub/shift-hub?hub_view=requests&from=${day}&to=${day}&case=${caseId}`);
      const refusal =
        "This swap request changed while you were writing. Close this window and open the request again to see where it stands now.";
      await page.route("**/v1/workspaces/*/shift-exchanges", (route) =>
        route.request().method() === "POST"
          ? route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: refusal, reason: "exchange.test_refusal" }) })
          : route.fallback(),
      );
      await page.getByRole("button", { name: "Cancel swap request" }).click();
      const window = page.getByRole("dialog", { name: "Cancel this swap request" });
      const reason = window.getByRole("textbox", { name: "Reason shared with affected employees" });
      await reason.fill("I found someone to cover it");
      await shot(page, `shift-hub-cancel-${screen.name}-hidden`);
      await window.getByRole("button", { name: "Cancel request", exact: true }).click();
      await window.getByRole("button", { name: "Confirm cancel", exact: true }).click();
      await bandSays(window, refusal);
      await shot(page, `shift-hub-cancel-${screen.name}-shown`);
      await reachable(reason);
      await reason.click();
      await reason.press("End");
      await reason.pressSequentially(".");
      await expect(reason).toHaveValue("I found someone to cover it.");
    });

    test("Employee onboarding → emergency contact: Email (optional) stays reachable under the step's error", async ({ browser }) => {
      const key = `fm${tag()}`;
      const firstName = `Fm${tag()}`;
      const name = `${firstName} Invitee`;
      const jobId = ownJob(key, `Barista ${key}`);
      sql(`
        select public.create_employee_command_service(
          tests.user('${run}:owner'), tests.id('${run}'), gen_random_uuid(),
          jsonb_build_object(
            'first_name', '${firstName}', 'middle_name', '', 'last_name', 'Invitee', 'preferred_name', '',
            'invitation_email', '', 'start_date', '', 'internal_note', '',
            'location_ids', jsonb_build_array(tests.id('${run}:K')),
            'primary_location_id', tests.id('${run}:K'),
            'job_ids', jsonb_build_array('${jobId}'::uuid),
            'primary_job_id', '${jobId}'::uuid,
            'is_remote', false, 'is_excluded_from_schedule', false, 'expected_revision', null),
          null);`);
      const email = lastLine(sql(`select tests.new_user('${run}:${key}', '${name}'); select tests.password('${run}:${key}', '${password}');`));
      const ayse = await open(browser, "ayse", screens[0], "/app/employees");
      await ayse.getByRole("row", { name: new RegExp(name) }).getByText(name, { exact: true }).click();
      const drawer = ayse.getByRole("dialog", { name });
      await drawer.getByLabel("E-mail").fill(email);
      // Tur 4 B: Invite opens Access; the employee app is ticked there.
      await drawer.getByRole("button", { name: "Invite", exact: true }).click();
      await drawer.getByLabel("Employee app").check();
      await drawer.getByRole("button", { name: "Invite", exact: true }).click();
      const link = await drawer.getByRole("link", { name: "Open acceptance link" }).getAttribute("href");

      const invitee = await (await browser.newContext(screen.options)).newPage();
      await invitee.goto(link!);
      await invitee.getByRole("button", { name: "I already have an account", exact: true }).click();
      await invitee.getByLabel("Email").fill(email);
      await invitee.getByLabel("Password").fill(password);
      await invitee.getByRole("button", { name: "Sign in", exact: true }).click();
      await invitee.getByRole("button", { name: "Accept invitation", exact: true }).click();
      await invitee.getByRole("button", { name: "Start onboarding", exact: true }).click();
      await invitee.getByRole("button", { name: "Begin" }).click();
      await expect(invitee.getByRole("heading", { name: "Your details" })).toBeVisible();
      await invitee.getByLabel("Legal first name", { exact: true }).fill(firstName);
      await invitee.getByLabel("Legal last name", { exact: true }).fill("Invitee");
      await invitee.getByLabel("Phone", { exact: true }).fill(`415555${Math.floor(1000 + Math.random() * 8999)}`);
      await invitee.getByLabel("Date of birth", { exact: true }).fill("1996-04-12");
      await invitee.getByLabel("Street address", { exact: true }).fill("12 Moda Cd");
      await invitee.getByLabel("City", { exact: true }).fill("Istanbul");
      await invitee.getByLabel("State", { exact: true }).fill("Istanbul");
      await invitee.getByLabel("ZIP code", { exact: true }).fill("34710");
      await invitee.getByRole("button", { name: "Continue" }).click();
      await expect(invitee.getByRole("heading", { name: "Who we call in an emergency" })).toBeVisible();
      await invitee.getByLabel("Full name", { exact: true }).fill("Deniz Contact");
      await invitee.getByLabel("Relationship", { exact: true }).selectOption("Friend");
      await invitee.getByLabel("Phone", { exact: true }).fill("4155550100");
      const refusal = "Your details changed in another tab. Reload this page to see the latest version, then save again.";
      await invitee.route("**/me/**profile*", (route) =>
        route.request().method() === "PATCH"
          ? route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: refusal, reason: "onboarding.test_refusal" }) })
          : route.fallback(),
      );
      await invitee.getByRole("button", { name: "Save and continue" }).click();
      await bandSays(invitee.locator("body"), refusal);
      const optional = invitee.getByLabel("Email (optional)");
      await reachable(optional);
      await optional.fill("deniz@example.com");
      await expect(optional).toHaveValue("deniz@example.com");
    });
  });
}

// A plain 8×8 green PNG, made here so the spec carries no binary.
const pixel = (() => {
  const crc = (bytes: Buffer) => {
    let c = ~0;
    for (const byte of bytes) {
      c ^= byte;
      for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(8, 0);
  header.writeUInt32BE(8, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const rows = Buffer.concat(Array.from({ length: 8 }, () => Buffer.from([0, ...Array.from({ length: 8 }, () => [40, 120, 80]).flat()])));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
})();

/** Pictures for the report, only when asked for (UI_FIELDMSG_SHOTS=1); a normal run takes none. */
async function shot(page: Page, name: string) {
  if (!process.env.UI_FIELDMSG_SHOTS) return;
  await page.screenshot({ path: fileURLToPath(new URL(`../../artifacts/ui-fieldmsg-2/${name}.png`, import.meta.url)) });
}

test("New Schedule → Templates → Save template: Remove employee names stays reachable under the window's error", async ({
  browser,
}) => {
  const week = roundWeek(710);
  sql(`
    select tests.publish_week('${run}', ${week}, '[
      {"label": "${roundLabel("window-fieldmsg")}", "person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"}
    ]');`);
  const monday = sql(`select tests.week(${week});`);
  const plan = draftName("Fieldmsg plan");
  const page = await open(browser, "ayse", screens[0], `/app/schedule?date=${monday}`);
  await page.getByRole("button", { name: /^Draft selector:/ }).click();
  const windowRoot = page.getByRole("dialog", { name: /^Schedules for / });
  await windowRoot.getByRole("button", { name: "Edit live schedule", exact: true }).click();
  await expect(page).toHaveURL(/mode=edit/);
  await page.getByRole("button", { name: /^(?:Save draft|Publish)$/ }).click();
  await page.getByLabel("Draft name").fill(plan);
  await page.getByRole("button", { name: "Save As", exact: true }).click();
  await expect(page).not.toHaveURL(/mode=edit/);

  const refusal = "A template with this name was saved a moment ago. Choose another name, or open Templates to use the one already there.";
  await page.route("**/schedule/templates", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: refusal, reason: "template.test_refusal" }) })
      : route.fallback(),
  );
  await page.getByRole("button", { name: /^Draft selector:/ }).click();
  await windowRoot.getByRole("tab", { name: /^Templates/ }).click();
  await windowRoot.getByRole("button", { name: "Save template", exact: true }).click();
  const form = windowRoot.getByRole("region", { name: "Save a draft as a template" });
  await form.getByLabel("Draft").selectOption({ label: plan });
  await form.getByLabel("Template name").fill(draftName("Fieldmsg week"));
  await form.getByRole("button", { name: "Save template", exact: true }).click();
  await bandSays(windowRoot, refusal);
  await shot(page, "templates-desktop-shown");
  const strip = form.getByRole("checkbox", { name: "Remove employee names (save as open shifts)" });
  await reachable(strip);
  await strip.click();
  await expect(strip).toBeChecked();
});
