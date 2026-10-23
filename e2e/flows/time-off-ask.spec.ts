import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { psql } from "../global-setup";

// Time off rebuild D2 (KARARLAR S-239, S-242): an employee asks for time off
// from Employee Hub -> My Availability -> Time off, sees it waiting in the list, and withdraws it with two
// clicks. A fresh employee at Kadikoy, so no other spec's time off is in their list; the request is next
// week's Monday to Wednesday, all day, so it has not started whenever the run is.

const world: { readonly run: string; readonly password: string } = JSON.parse(
  readFileSync(new URL("../.world.json", import.meta.url), "utf8"),
);
const sql = (query: string) => execSync(psql, { input: query, encoding: "utf8" }).trim();

function freshEmployee() {
  const label = `toask${Math.random().toString(36).slice(2, 7)}`;
  const email = sql(`
    select tests.person('${world.run}', '${label}', 'employee', array['K'], array['cook']);
    select tests.password('${world.run}:${label}', '${world.password}');`)
    .split(/\r?\n/)
    .at(-1)!;
  return { label, email };
}

async function signInWithFlag(browser: Browser, email: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(world.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
  return page;
}

test("an employee asks for time off, sees it pending and withdraws it with two clicks", async ({ browser }) => {
  const { label, email } = freshEmployee();
  const page = await signInWithFlag(browser, email);
  await page.goto("/app/employee-hub/my-availability?section=time-off");

  const panel = page.getByRole("region", { name: "Time off" });
  await expect(panel.getByText("No time off yet.")).toBeVisible();
  await panel.getByRole("button", { name: "Request time off" }).click();

  const form = page.getByRole("dialog", { name: "Request time off" });
  await form.getByRole("radio", { name: /Vacation/ }).check();
  await form.getByRole("button", { name: "Next week" }).click();
  await form.getByLabel("Last day").fill(
    await form.getByLabel("First day").inputValue().then((monday) => {
      const d = new Date(`${monday}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 2);
      return d.toISOString().slice(0, 10);
    }),
  );
  await form.getByRole("textbox", { name: /Note for your manager/ }).fill("Family visit");
  await form.getByRole("button", { name: "Send request" }).click();
  await expect(form).toBeHidden();

  const row = panel.getByRole("row", { name: /Vacation/ });
  await expect(row).toContainText("3 days");
  await expect(row).toContainText("All day");
  await expect(row).toContainText("Pending");
  expect(
    sql(`select status || ' ' || all_day || ' ' || note from public.time_off_requests
         where employee_id = tests.id('${world.run}:${label}');`),
  ).toBe("pending true Family visit");

  await row.click();
  const detail = page.getByRole("dialog", { name: "Time off" });
  await expect(detail.getByText("Waiting for a manager")).toBeVisible();
  await detail.getByRole("button", { name: "Withdraw", exact: true }).click();
  await detail.getByRole("button", { name: "Confirm withdraw", exact: true }).click();
  await expect(detail).toBeHidden();
  await expect(panel.getByText("No time off yet.")).toBeVisible();
  expect(
    sql(`select status from public.time_off_requests where employee_id = tests.id('${world.run}:${label}');`),
  ).toBe("withdrawn");
});
