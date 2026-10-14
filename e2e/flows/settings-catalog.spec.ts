import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { psql } from "../global-setup";

// Settings > Locations and Settings > Jobs, as the owner.
// - Locations A (Mert 2026-10-07): Active / Archived tabs instead of a "Show
//   archived" box, a green "New location" at the end of the filter row.
// - BL-595: Archive in a row's menu takes two clicks (red "Confirm archive");
//   Restore takes one.
// - Jobs V1 (Mert 2026-10-07): the drawer says "N employees assigned", has a
//   "Details" group, a "Not assigned" filter and a "Save" button.
// - Jobs decision 6 (Mert 2026-10-13): archiving a department takes its active
//   jobs with it; a job restored while its department is archived comes back
//   under No department; a department restored comes back with no jobs.
//
// The workspace is this file's own: archiving a location of the shared world
// would take it off every later spec's grid.

const world: { readonly password: string } = JSON.parse(
  readFileSync(new URL("../.world.json", import.meta.url), "utf8"),
);

function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

let w: string;
let ownerEmail: string;

// Building a world is setup, not the test (BL-763): its own budget, not the 60 s.
test.beforeAll(() => {
  test.setTimeout(180_000);
  w = `setcat${Date.now()}`;
  ownerEmail = sql(`
    select tests.world('${w}');
    select tests.person('${w}', 'ada', 'employee', array['K'], array['cook']);
    select tests.person('${w}', 'bo', 'employee', array['K'], array['server']);
    select tests.password('${w}:owner', '${world.password}');`)
    .split(/\r?\n/)
    .at(-1)!;
});

async function openAsOwner(browser: Browser, path: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByLabel("Password").fill(world.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto(path);
  return page;
}

const archivedAt = (key: string) =>
  sql(`select coalesce(archived_at::text, 'active') from public.locations where id = tests.id('${w}:${key}');`);

test("Locations: Active and Archived tabs, New location, Archive in two clicks and Restore in one", async ({
  browser,
}) => {
  const owner = await openAsOwner(browser, "/app/settings/locations");
  const tabs = owner.getByRole("tablist", { name: "Location status" });
  const row = (name: string) => owner.locator(".location-catalog-row[data-archived]").filter({ hasText: name });

  // Active is the first tab and lists both locations.
  await expect(tabs.getByRole("tab", { name: "Active", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(row("Kadikoy")).toHaveCount(1);
  await expect(row("Besiktas")).toHaveCount(1);
  // The old "Show archived" box and the header's "Add location" are gone.
  await expect(owner.getByLabel("Show archived")).toHaveCount(0);
  await expect(owner.getByRole("button", { name: "Add location", exact: true })).toHaveCount(0);

  // Archived lists only archived locations: none yet.
  await tabs.getByRole("tab", { name: "Archived", exact: true }).click();
  await expect(owner.getByRole("heading", { name: "No archived locations", exact: true })).toBeVisible();
  await expect(row("Kadikoy")).toHaveCount(0);
  await tabs.getByRole("tab", { name: "Active", exact: true }).click();

  // "New location" opens the editor drawer with the same name.
  await owner.getByRole("button", { name: "New location", exact: true }).click();
  const editor = owner.getByRole("form", { name: "New location", exact: true });
  await expect(editor.getByRole("heading", { name: "New location", exact: true })).toBeVisible();
  await editor.getByRole("button", { name: "Close location editor", exact: true }).click();
  await expect(editor).toHaveCount(0);

  // BL-595: the first click only arms the red button; nothing is archived yet.
  await owner.getByRole("button", { name: "Actions for Besiktas", exact: true }).click();
  await owner.getByRole("button", { name: "Archive", exact: true }).click();
  const confirm = owner.getByRole("button", { name: "Confirm archive", exact: true });
  await expect(confirm).toBeVisible();
  expect(archivedAt("B")).toBe("active");
  // The second click archives: Besiktas leaves Active for Archived.
  await confirm.click();
  await expect.poll(() => archivedAt("B")).not.toBe("active");
  await expect(row("Besiktas")).toHaveCount(0);
  await expect(row("Kadikoy")).toHaveCount(1);
  await tabs.getByRole("tab", { name: "Archived", exact: true }).click();
  await expect(row("Besiktas")).toHaveCount(1);
  await expect(row("Kadikoy")).toHaveCount(0);

  // Restore is one click.
  await owner.getByRole("button", { name: "Actions for Besiktas", exact: true }).click();
  await owner.getByRole("button", { name: "Restore", exact: true }).click();
  await expect.poll(() => archivedAt("B")).toBe("active");
  await expect(owner.getByRole("heading", { name: "No archived locations", exact: true })).toBeVisible();
  await tabs.getByRole("tab", { name: "Active", exact: true }).click();
  await expect(row("Besiktas")).toHaveCount(1);
});

test("Jobs: the drawer counts who is assigned, filters Not assigned, and saves with Save", async ({ browser }) => {
  const owner = await openAsOwner(browser, "/app/settings/jobs");
  const cooks = () =>
    sql(`select count(*) from public.employee_job_assignments
         where job_id = tests.id('${w}:job:cook') and ended_at is null;`);
  expect(cooks()).toBe("1");

  await owner.getByRole("rowgroup", { name: "Kitchen", exact: true }).getByRole("button", { name: "Cook", exact: true }).click();
  const drawer = owner.getByRole("dialog", { name: "Edit job: Cook", exact: true });
  await expect(drawer).toContainText("1 employee assigned");
  await expect(drawer.locator("legend", { hasText: "Details" })).toBeVisible();
  await expect(drawer.getByText("Check to assign. Uncheck to remove.")).toHaveCount(0);

  // "Not assigned" (was "Unassigned") shows only who is not on the job.
  await drawer.getByRole("button", { name: "Not assigned", exact: true }).click();
  await expect(drawer.getByRole("checkbox", { name: "Assign Bo Person", exact: true })).toBeVisible();
  await expect(drawer.getByRole("checkbox", { name: "Assign Ada Person", exact: true })).toHaveCount(0);

  // "Save" (was "Save changes") writes the assignment.
  await drawer.getByRole("checkbox", { name: "Assign Bo Person", exact: true }).check();
  await expect(drawer.getByRole("button", { name: "Save changes", exact: true })).toHaveCount(0);
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(drawer.getByText(/^Job saved/)).toBeVisible();
  await expect(drawer).toContainText("2 employees assigned");
  await expect.poll(cooks).toBe("2");
});

test("Jobs: a department goes to the archive with its jobs, and each comes back on its own", async ({ browser }) => {
  // A department of this test's own, so the drawer test's Kitchen stays as it is.
  sql(`select public.create_department_with_jobs_service(tests.user('${w}:owner'), tests.id('${w}'),
         '{"name": "Bar", "color": "#3C7A68"}'::jsonb,
         '[{"name": "Bartender", "color": "#D39A36"}, {"name": "Barback", "color": "#4478A8"}]'::jsonb);`);
  // "archived", or "active <department>" ("active none" for No department).
  const state = (name: string) =>
    sql(`select case when j.archived_at is not null then 'archived' else 'active ' || coalesce(d.name, 'none') end
         from public.jobs j left join public.departments d on d.id = j.department_id
         where j.workspace_id = tests.id('${w}') and j.name = '${name}';`);
  const bar = () =>
    sql(`select case when archived_at is null then 'active' else 'archived' end from public.departments
         where workspace_id = tests.id('${w}') and name = 'Bar';`);
  const owner = await openAsOwner(browser, "/app/settings/jobs");
  const tabs = owner.getByRole("tablist", { name: "Jobs and departments" });
  const group = owner.getByRole("rowgroup", { name: "Bar", exact: true });

  // The menu says what Archive takes with it; two clicks archive the department.
  await group.getByRole("button", { name: "Actions for Bar", exact: true }).click();
  await expect(group.getByText("Its 2 jobs will be archived too.")).toBeVisible();
  await group.getByRole("button", { name: "Archive Bar", exact: true }).click();
  await group.getByRole("button", { name: "Confirm archive Bar", exact: true }).click();
  await expect.poll(bar).toBe("archived");
  expect(state("Bartender")).toBe("archived");
  expect(state("Barback")).toBe("archived");
  await expect(group).toHaveCount(0);

  // Archived lists the department and its jobs in two groups.
  await tabs.getByRole("tab", { name: "Archived", exact: true }).click();
  const departments = owner.getByRole("rowgroup", { name: "Archived departments", exact: true });
  const jobs = owner.getByRole("rowgroup", { name: "Archived jobs", exact: true });
  await expect(departments.getByRole("button", { name: "Bar", exact: true })).toBeVisible();
  await expect(jobs.getByRole("button", { name: "Bartender", exact: true })).toBeVisible();

  // Bartender, restored while Bar is archived, comes back under No department.
  await jobs.getByRole("button", { name: "Restore Bartender", exact: true }).click();
  await expect.poll(() => state("Bartender")).toBe("active none");
  // Bar, restored, comes back with no jobs: Barback stays archived.
  await departments.getByRole("button", { name: "Restore Bar", exact: true }).click();
  await expect.poll(bar).toBe("active");
  expect(state("Barback")).toBe("archived");
  // Barback, restored now that Bar is active, goes back under Bar.
  await jobs.getByRole("button", { name: "Restore Barback", exact: true }).click();
  await expect.poll(() => state("Barback")).toBe("active Bar");

  await tabs.getByRole("tab", { name: "Jobs", exact: true }).click();
  await expect(group.getByRole("button", { name: "Barback", exact: true })).toBeVisible();
  await expect(owner.getByRole("rowgroup", { name: "No department", exact: true }).getByRole("button", { name: "Bartender", exact: true })).toBeVisible();
});
