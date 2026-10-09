import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { psql } from "../global-setup";
import { round, roundWeek, signIn, type Person } from "../fixtures/world";

// FB-6.3.8 ("Done when" 5): time off is voted on by location. Somebody who
// works at Kadikoy and Besiktas asks for two days off in Employee Hub. Ayse
// (Kadikoy) approves and one location is still to approve; Mehmet (Besiktas)
// approves last, which opens their published Besiktas shift, so he confirms
// that first. One denial closes a request and its note reaches the employee;
// an admin decides alone; the owner decides alone, and revokes.
//
// Each test files its own person, so a rerun never meets the last run's
// request. The panel's layout waits on a variant choice: nothing here reads it.

const world: { readonly run: string; readonly password: string } = JSON.parse(
  readFileSync(new URL("../.world.json", import.meta.url), "utf8"),
);
const run = world.run;

function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

async function signedIn(browser: Browser, who: Person | { readonly email: string }): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  if (typeof who === "string") await signIn(page, who);
  else {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(who.email);
    await page.getByLabel("Password").fill(world.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  }
  await expect(page).not.toHaveURL(/\/sign-in/);
  return page;
}

/** Somebody at both locations with a sign-in; their Besiktas shift on the
 * leave's first day is published when `shift` is set. */
function personAtBoth(tag: string, shift = false) {
  const label = `${tag}${Math.random().toString(36).slice(2, 7)}`;
  // tests.person names people initcap(label) || ' Person'.
  const name = `${label[0]!.toUpperCase()}${label.slice(1)} Person`;
  // Weeks 1-6 belong to the other specs; each --repeat-each round has its own.
  const week = roundWeek(8 + (shift ? 0 : 1));
  const email = sql(`
    select tests.person('${run}', '${label}', 'employee', array['K', 'B'], array['cook']);
    ${shift ? `select tests.publish_week('${run}', ${week}, '[{"label": "${label}-b", "person": "${label}", "loc": "B", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"}]');` : ""}
    select tests.password('${run}:${label}', '${world.password}');`)
    .split(/\r?\n/)
    .at(-1)!;
  // Tuesday and Wednesday of that week.
  const [start, end] = sql(`select tests.week(${week}) + 1 || ' ' || tests.week(${week}) + 2;`).split(" ") as [
    string,
    string,
  ];
  return { label, name, email, start, end };
}

type Asker = ReturnType<typeof personAtBoth>;

/** Employee Hub -> My availability -> Time Off Requests: two full days. */
async function askForTimeOff(asker: Asker, page: Page, note: string): Promise<string> {
  await page.goto("/app/employee-hub/my-availability?section=time-off");
  const form = page.getByRole("group", { name: "Time off details" });
  await form.getByLabel("Start", { exact: true }).fill(asker.start);
  await form.getByLabel("End", { exact: true }).fill(asker.end);
  await form.getByLabel("Note").fill(note);
  await form.getByRole("button", { name: "Submit request", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Request sent\./ })).toBeVisible();
  return sql(`select id from public.schedule_time_off_requests
    where employee_id = tests.id('${run}:${asker.label}') and request_type = 'time_off';`);
}

const statusOf = (request: string): string =>
  sql(`select status from public.schedule_time_off_requests where id = '${request}';`);

/** The request's row in the employee's own list. */
const ownRequest = (page: Page, note: string) =>
  page.locator(".time-off-request-list > div").filter({ hasText: note });

/** Requests -> Time off with the request's drawer open. */
async function review(page: Page, request: string) {
  await page.goto(`/app/schedule/requests?request=${request}`);
  const drawer = page.getByRole("dialog", { name: "Review request" });
  await expect(drawer).toBeVisible();
  return drawer;
}

test("two locations approve in turn, the last one opens the shift, and the employee sees Approved", async ({
  browser,
}) => {
  const asker = personAtBoth("both", true);
  const note = `Family visit ${round()}`;
  const employee = await signedIn(browser, asker);
  const request = await askForTimeOff(asker, employee, note);
  // Until it closes the employee reads only Pending.
  await expect(ownRequest(employee, note)).toContainText(/Pending/i);

  // Kadikoy's vote alone does not decide it, and asks for no confirmation.
  const ayse = await signedIn(browser, "ayse");
  const ayseDrawer = await review(ayse, request);
  await ayseDrawer.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(ayseDrawer.getByRole("status")).toHaveText("Your approval is saved. 1 location still to approve.");
  expect(statusOf(request)).toBe("pending");

  // Besiktas's vote finishes it and opens the Besiktas shift: confirmed first.
  const mehmet = await signedIn(browser, "mehmet");
  await (await review(mehmet, request)).getByRole("button", { name: "Approve", exact: true }).click();
  const confirm = mehmet.getByRole("alertdialog", { name: "Approve time off?" });
  await expect(confirm).toContainText("1 published shift becomes an open shift.");
  await confirm.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(mehmet.getByText("Time off approved.")).toBeVisible();
  expect(statusOf(request)).toBe("approved");
  expect(
    sql(`select employee_id is null from public.schedule_published_shifts where id = tests.id('${run}:shift:${asker.label}-b');`),
  ).toBe("t");

  await employee.reload();
  await expect(ownRequest(employee, note)).toContainText(/Approved/i);
});

test("one denial closes the request, and the employee reads the note", async ({ browser }) => {
  const asker = personAtBoth("deny");
  const note = `Wedding ${round()}`;
  const employee = await signedIn(browser, asker);
  const request = await askForTimeOff(asker, employee, note);

  // Kadikoy denies; Besiktas never voted, and the request is closed anyway.
  const ayse = await signedIn(browser, "ayse");
  await (await review(ayse, request)).getByRole("button", { name: "Deny", exact: true }).click();
  const confirm = ayse.getByRole("alertdialog", { name: "Deny time off?" });
  await confirm.getByLabel(`Note for ${asker.name} (optional)`).fill("I can approve the first day only");
  await confirm.getByRole("button", { name: "Deny", exact: true }).click();
  await expect(ayse.getByText("Time off denied.")).toBeVisible();
  expect(statusOf(request)).toBe("denied");

  await employee.reload();
  const row = ownRequest(employee, note);
  await expect(row).toContainText(/Denied/i);
  await expect(row).toContainText("Manager note: I can approve the first day only");
});

test("an admin decides alone, and the managers are told", async ({ browser }) => {
  const asker = personAtBoth("admin");
  const note = `Course ${round()}`;
  const request = await askForTimeOff(asker, await signedIn(browser, asker), note);

  const zeynep = await signedIn(browser, "zeynep");
  await (await review(zeynep, request)).getByRole("button", { name: "Approve", exact: true }).click();
  const approve = zeynep.getByRole("alertdialog", { name: "Approve time off?" });
  await expect(approve).toContainText(`Takes effect now. Managers at ${asker.name}'s locations are notified.`);
  await approve.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(zeynep.getByText("Time off approved.")).toBeVisible();
  // Neither Kadikoy nor Besiktas voted: the admin's word closed it.
  expect(statusOf(request)).toBe("approved");
});

test("the owner decides alone, then revokes with a reason", async ({ browser }) => {
  const asker = personAtBoth("solo");
  const note = `Trip ${round()}`;
  const request = await askForTimeOff(asker, await signedIn(browser, asker), note);

  // The world's owner has no sign-in until somebody gives them a password.
  const owner = await signedIn(browser, { email: sql(`select tests.password('${run}:owner', '${world.password}');`) });
  await (await review(owner, request)).getByRole("button", { name: "Approve", exact: true }).click();
  const approve = owner.getByRole("alertdialog", { name: "Approve time off?" });
  await expect(approve).toContainText("Takes effect now.");
  await approve.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(owner.getByText("Time off approved.")).toBeVisible();
  // Neither location voted: the owner's word was enough.
  expect(statusOf(request)).toBe("approved");

  // Approved requests stay in the one list, under the open ones; Revoke wants a reason before it acts.
  await owner.goto("/app/schedule/requests");
  await owner.getByRole("row", { name: new RegExp(asker.name) }).click();
  await owner.getByRole("dialog", { name: "Review request" }).getByRole("button", { name: "Revoke", exact: true }).click();
  const revoke = owner.getByRole("alertdialog", { name: "Revoke time off?" });
  await expect(revoke.getByRole("button", { name: "Revoke", exact: true })).toBeDisabled();
  await revoke.getByLabel("Reason").fill("Inventory week, everyone is needed");
  await revoke.getByRole("button", { name: "Revoke", exact: true }).click();
  await expect(owner.getByText("Time off revoked.")).toBeVisible();
  expect(statusOf(request)).toBe("revoked");
});
