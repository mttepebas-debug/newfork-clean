import { expect, test, type Browser, type Page, type Request } from "../fixtures/test";
import { draftName, round, signIn, type Person } from "../fixtures/world";

// EKRAN-01 DB-2: a schedule change goes live to its own location's channel
// only. Ayse (Kadikoy manager) saves a draft; Zeynep, who reads Kadikoy, sees
// her draft list refresh by itself, while Mehmet (Besiktas only) hears nothing.

async function openSchedule(browser: Browser, person: Person): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, person);
  await expect(page).toHaveURL(/\/app\/workspace/);
  await page.goto(`/app/schedule?date=${roundDate()}`);
  await expect(page.getByRole("button", { name: /^Draft selector:/ })).toBeVisible();
  return page;
}

// A week of its own per --repeat-each round (BL-203); clear of the weeks
// schedule-locks.spec.ts edits.
function roundDate(): string {
  const day = new Date();
  day.setDate(day.getDate() + 7 * (40 + round()));
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
}

const isDraftList = (request: Request) =>
  request.method() === "GET" && /\/schedule\/drafts\?/.test(request.url());

test("a Kadikoy save refreshes a Kadikoy reader's screen and not Besiktas's", async ({ browser }) => {
  const zeynep = await openSchedule(browser, "zeynep");
  const mehmet = await openSchedule(browser, "mehmet");
  const ayse = await openSchedule(browser, "ayse");
  // Every screen has joined its channels before the change is made.
  await zeynep.waitForTimeout(2_000);

  const mehmetRefreshes: Request[] = [];
  mehmet.on("request", (request) => {
    if (isDraftList(request)) mehmetRefreshes.push(request);
  });
  const zeynepRefresh = zeynep.waitForRequest(isDraftList, { timeout: 15_000 });

  await ayse.getByRole("button", { name: "Draft selector: New Schedule", exact: true }).click();
  await ayse.getByRole("button", { name: "New Schedule (blank)", exact: true }).click();
  await expect(ayse).toHaveURL(/mode=edit/);
  await ayse.getByRole("button", { name: /^(?:Save draft|Publish)$/ }).click();
  await ayse.getByLabel("Draft name").fill(draftName("Ayse live"));
  await ayse.getByRole("button", { name: "Save As", exact: true }).click();
  await expect(ayse).not.toHaveURL(/mode=edit/);

  // Zeynep's screen refetched with no click of hers.
  await zeynepRefresh;
  // The same message would have reached Mehmet by now; give it a margin.
  await mehmet.waitForTimeout(3_000);
  expect(mehmetRefreshes).toHaveLength(0);
});
