import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { psql } from "../global-setup";
import { signIn, tokenOf, type Person } from "../fixtures/world";

// EMP-001 B "Done when" 15 (taken over from FB-6.2 "Done when" 8): a manager
// takes somebody off her own location with Remove in the Employees drawer.
// They stay at their other location and drop off her list. The other
// location's assignment is not hers to end: no button, and the API refuses.
//
// Ayse manages Kadikoy, Mehmet manages Besiktas. The person is made for the
// test: Ali and Deniz, who work both, carry the other specs' shifts.

const run: string = JSON.parse(readFileSync(new URL("../.world.json", import.meta.url), "utf8")).run;

function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

async function openEmployees(browser: Browser, person: Person): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, person);
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto("/app/employees");
  return page;
}

const employeeRow = (page: Page, name: string) => page.getByRole("row", { name: new RegExp(name) });

test("a manager takes somebody off her own location, and they stay at the other one", async ({ browser }) => {
  const label = `both${Math.random().toString(36).slice(2, 7)}`;
  // tests.person names people initcap(label) || ' Person'.
  const name = `${label[0]!.toUpperCase()}${label.slice(1)} Person`;
  const ids: { readonly workspace: string; readonly employee: string; readonly besiktas: string } = JSON.parse(
    sql(`
      select tests.person('${run}', '${label}', 'employee', array['K', 'B'], array['cook']);
      select json_build_object('workspace', tests.id('${run}'), 'employee', tests.id('${run}:${label}'),
        'besiktas', tests.id('${run}:B'))::text;`)
      .split(/\r?\n/)
      .at(-1)!,
  );
  const worksAt = (): string =>
    sql(`select string_agg(l.name, ', ' order by l.name) from public.employee_location_assignments a
         join public.locations l on l.id = a.location_id
         where a.employee_id = '${ids.employee}' and a.ended_at is null;`);

  // Besiktas is not Ayse's to take anybody off: asked directly, the API refuses.
  const refused = await fetch(
    `${process.env.E2E_API_URL}/v1/workspaces/${ids.workspace}/employees/${ids.employee}/locations/${ids.besiktas}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${await tokenOf("ayse")}` } },
  );
  expect(refused.status).toBe(403);
  expect(((await refused.json()) as { reason?: string }).reason).toBe("authz.out_of_scope");
  expect(worksAt()).toBe("Besiktas, Kadikoy");

  // The drawer offers Remove for her own location only.
  const ayse = await openEmployees(browser, "ayse");
  await employeeRow(ayse, name).getByText(name, { exact: true }).click();
  const drawer = ayse.getByRole("dialog", { name });
  await drawer
    .getByRole("navigation", { name: "Employee sections" })
    .getByRole("button", { name: "Employment", exact: true })
    .click();
  const remove = drawer.getByRole("button", { name: "Remove from Kadikoy", exact: true });
  await expect(remove).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Remove from Besiktas", exact: true })).toHaveCount(0);

  // Two clicks: the first arms it, the second confirms.
  await remove.click();
  await drawer.getByRole("button", { name: "Confirm remove from Kadikoy", exact: true }).click();

  // Off her list, while the rest of it is still there.
  await expect(employeeRow(ayse, name)).toHaveCount(0);
  await expect(employeeRow(ayse, "Emre Person")).toBeVisible();
  expect(worksAt()).toBe("Besiktas");

  // Still on the Besiktas manager's list, now with Besiktas as their location.
  const mehmet = await openEmployees(browser, "mehmet");
  await expect(employeeRow(mehmet, name).getByText("Besiktas", { exact: true })).toBeVisible();
});
