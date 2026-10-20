import { execSync } from "node:child_process";
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { psql } from "../global-setup";

// AVATAR-IKON slice 4 (Mert 2026-10-20 "Evet, başla"): the Lineup draws each person's drawing in her circle. Eli
// chose a drawing as her avatar: it comes first. Ida is a cook: one of Cook's icons. Sam uploaded a photo: the
// photo never reaches the Lineup, a Server icon does. The manager and the employee see the same drawing, and once
// the lineup is published it stays, even after Cook's icons change and the lineup goes out again.
//
// A workspace of its own: the shared world's jobs and avatars stay as other specs expect them.

const password = "drawings-pass-2026";

function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

async function signInAs(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
}

async function open(browser: Browser, email: string, path: string, phone = false): Promise<Page> {
  const context = await browser.newContext(
    phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : {},
  );
  const page = await context.newPage();
  await signInAs(page, email);
  await page.goto(path);
  return page;
}

/** The drawing a person's row draws in the manager's Lineup. */
async function drawnFor(page: Page, name: string): Promise<string | null> {
  const row = page.getByRole("listitem").filter({ hasText: name }).first();
  const art = row.locator(".lineup-phone-avatar[data-art-key]");
  await expect(art).toHaveCount(1);
  return art.getAttribute("data-art-key");
}

test("each Lineup row draws the person's drawing: her own first, else her job's; never her photo", async ({ browser }) => {
  test.setTimeout(180_000);
  const w = `drw${Date.now()}`;
  const printed = sql(`
    select tests.world('${w}');
    select tests.person('${w}', 'eli', 'employee', array['K'], array['cook']);
    select tests.person('${w}', 'ida', 'employee', array['K'], array['cook']);
    select tests.person('${w}', 'sam', 'employee', array['K'], array['server']);
    update public.jobs set lineup_icons = array(select a.key from app_private.lineup_art a where a.kind <> 'team' order by a.no limit 2)
    where id = tests.id('${w}:job:cook');
    update public.jobs set lineup_icons = array(select a.key from app_private.lineup_art a where a.kind <> 'team' order by a.no limit 3 offset 2)
    where id = tests.id('${w}:job:server');
    insert into public.shift_types (id, workspace_id, name, color, default_start_time, default_end_time)
    values (tests.remember('${w}:type:lunch', gen_random_uuid()), tests.id('${w}'), 'Lunch', '#1F9D74', '09:00', '15:00');
    select tests.publish_week('${w}', 0, '[
      {"label": "eli", "person": "eli", "loc": "K", "job": "cook", "day": 0, "start": "09:00", "end": "15:00"},
      {"label": "ida", "person": "ida", "loc": "K", "job": "cook", "day": 0, "start": "09:00", "end": "15:00"},
      {"label": "sam", "person": "sam", "loc": "K", "job": "server", "day": 0, "start": "09:00", "end": "15:00"}
    ]');
    update public.schedule_published_shifts set shift_type_id = tests.id('${w}:type:lunch') where workspace_id = tests.id('${w}');
    insert into public.member_avatars (membership_id, workspace_id, art_key)
    select m.id, m.workspace_id, (select a.key from app_private.lineup_art a where a.kind <> 'team' order by a.no limit 1 offset 10)
    from public.workspace_memberships m join public.employee_profiles e on e.user_id = m.user_id
    where m.workspace_id = tests.id('${w}') and e.id = tests.id('${w}:eli');
    insert into public.member_avatars (membership_id, workspace_id, photo_path)
    select m.id, m.workspace_id, m.workspace_id || '/' || m.id || '/' || gen_random_uuid() || '.jpg'
    from public.workspace_memberships m join public.employee_profiles e on e.user_id = m.user_id
    where m.workspace_id = tests.id('${w}') and e.id = tests.id('${w}:sam');
    select tests.password('${w}:owner', '${password}');
    select tests.password('${w}:ida', '${password}');
    select a.key from app_private.lineup_art a where a.kind <> 'team' order by a.no limit 1 offset 10;
    select array_to_string(lineup_icons, ',') from public.jobs where id = tests.id('${w}:job:cook');
    select array_to_string(lineup_icons, ',') from public.jobs where id = tests.id('${w}:job:server');
    select tests.week(0);
  `).split(/\r?\n/);
  const [eliOwn, cookIcons, serverIcons, day] = printed.slice(-4) as [string, string, string, string];
  const [owner, ida] = printed.filter((line) => line.includes("@")).slice(-2) as [string, string];
  const share = (kind: "share" | "unpublish") =>
    sql(`select public.lineup_command_service(tests.user('${w}:owner'), tests.id('${w}'), gen_random_uuid(), '${kind}',
      jsonb_build_object('lineups', jsonb_build_array(jsonb_build_object('location_id', tests.id('${w}:K'),
        'service_date', '${day}', 'shift_type_id', tests.id('${w}:type:lunch'))), 'ask_ack', true)) ->> 'kind';`);

  // The manager's desktop Lineup, a draft.
  const manager = await open(browser, owner, `/app/schedule/lineup?date=${day}`);
  await manager.getByRole("combobox", { name: "Location" }).selectOption({ label: "Kadikoy" });
  await expect(manager.getByRole("tabpanel")).toContainText("Ida Person");
  expect(await drawnFor(manager, "Eli Person")).toBe(eliOwn);
  const idas = await drawnFor(manager, "Ida Person");
  expect(cookIcons.split(",")).toContain(idas);
  expect(serverIcons.split(",")).toContain(await drawnFor(manager, "Sam Person"));
  await expect(manager.getByRole("listitem").filter({ hasText: "Sam Person" }).locator("img")).toHaveCount(0);

  // Published, then taken back, Cook's icons changed and published again: Ida keeps hers.
  expect(share("share")).toBe("share");
  expect(share("unpublish")).toBe("unpublish");
  sql(`update public.jobs set lineup_icons = array(select a.key from app_private.lineup_art a where a.kind <> 'team'
       order by a.no limit 2 offset 5) where id = tests.id('${w}:job:cook');`);
  expect(share("share")).toBe("share");
  await manager.reload();
  await manager.getByRole("combobox", { name: "Location" }).selectOption({ label: "Kadikoy" });
  await expect(manager.getByRole("tabpanel")).toContainText("Ida Person");
  expect(await drawnFor(manager, "Ida Person")).toBe(idas);

  // The manager's phone shows the same.
  const managerPhone = await open(browser, owner, `/app/schedule/lineup?date=${day}`, true);
  await managerPhone.getByRole("combobox", { name: "Location" }).selectOption({ label: "Kadikoy" });
  await expect(managerPhone.getByRole("list", { name: "Cook" })).toContainText("Ida Person");
  expect(await drawnFor(managerPhone, "Ida Person")).toBe(idas);
  if (process.env.LINEUP_DRAWINGS_SHOTS)
    await managerPhone.screenshot({ path: "artifacts/avatar-ikon-4/lineup-manager-390.png", fullPage: false });

  // Ida on her phone: her own ticket and the team draw what the manager sees; Sam's photo is nowhere.
  const employee = await open(browser, ida, `/app/employee-hub/schedule/lineup?date=${day}`, true);
  const stub = employee.locator(".employee-lineup-avatar.is-large");
  await expect(stub).toHaveAttribute("data-art-key", idas!);
  const team = employee.getByRole("list", { name: "Cook" });
  await expect(team.getByRole("listitem").filter({ hasText: "Eli Person" }).locator("[data-art-key]")).toHaveAttribute("data-art-key", eliOwn);
  await expect(employee.getByRole("list", { name: "Server" }).locator("img")).toHaveCount(0);
  await expect(employee.getByRole("list", { name: "Server" }).locator("[data-art-key]")).toHaveCount(1);
  if (process.env.LINEUP_DRAWINGS_SHOTS)
    await employee.screenshot({ path: "artifacts/avatar-ikon-4/lineup-employee-390.png", fullPage: false });
});
