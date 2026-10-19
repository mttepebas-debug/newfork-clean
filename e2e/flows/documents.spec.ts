import type { Browser } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { emailOf } from "../fixtures/world";
import {
  approveAs,
  assignedTo,
  deadlinePassed,
  documentManagerRole,
  lastLine,
  ownerWithPassword,
  ownJob,
  personWithPassword,
  publishedDocument,
  run,
  sendOwnDocument,
  signInAs,
  sql,
  standing,
  tag,
} from "../fixtures/documents";

// FOUNDATION-B flow 4 (FB-6.6 A3): an admin writes a document type; as a draft
// it reaches nobody, published it lands on the people its job targets. They
// send it; a manager in scope approves it, never their own or a fellow
// manager's (D1). A two-location employee's card is seen by both managers and
// one approval settles it (D2). An overdue required card restricts the person
// until it is approved, and a manager whose own card is overdue approves
// nobody (D3). The owner may send their own card; it goes on file, never to a
// review queue (D5). A card waiting for review is seen only by who may decide
// it and by its holder; a fellow manager sees it once approved (S2, Mert
// 2026-10-02).
//
// Every test makes its own job and people, so what it publishes reaches only
// them. The managers who decide cards hold a manager role that also reviews
// documents: the built-in Manager role does not.

/** Employees > Documents for one person, searched down to `search`, and the row of `title` in it. */
async function documentsListOf(browser: Browser, email: string, search: string, title: string) {
  const page = await (await browser.newContext()).newPage();
  await signInAs(page, email);
  await page.goto("/app/employees/documents");
  await page.getByLabel("Search employee documents").fill(search);
  return {
    page,
    row: page.getByRole("table", { name: "Employee documents" }).getByRole("row", { name: new RegExp(title) }),
  };
}

test("an admin's draft reaches nobody; published, it lands on the people its job targets", async ({ page }) => {
  const key = `doc${tag()}`;
  const job = `Barista ${key}`;
  const title = `Food handler card ${key}`;
  ownJob(key, job);
  const twoPlaces = personWithPassword(`${key}-ali`, "employee", ["K", "B"], key);
  const kadikoy = personWithPassword(`${key}-emp`, "employee", ["K"], key);

  // Settings > Documents: Zeynep writes it for that job and saves a draft.
  await signInAs(page, emailOf("zeynep"));
  await page.goto("/app/settings/documents");
  // An empty catalog shows a second "New document" in the table; the filter
  // row's comes first.
  await page.getByRole("button", { name: "New document" }).first().click();
  const editor = page.getByRole("form", { name: "Add document type" });
  await editor.getByLabel("Name", { exact: true }).fill(title);
  await editor.getByRole("combobox", { name: "Requirement", exact: true }).selectOption("required");
  await editor.locator("summary", { hasText: "All Jobs" }).click();
  await editor.getByRole("checkbox", { name: job, exact: true }).click();
  await page.keyboard.press("Escape");
  await editor.getByRole("button", { name: "Next", exact: true }).click();
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor).toHaveCount(0);
  const statusOf = () =>
    lastLine(
      sql(`select id || ' ' || publication_status from public.document_types
            where workspace_id = tests.id('${run}') and title = '${title}';`),
    ).split(" ");
  await expect.poll(() => statusOf()[1]).toBe("draft");
  const documentId = statusOf()[0]!;
  expect(assignedTo(documentId)).toEqual([]);

  // Published, it reaches the two people on the job and nobody else.
  await page.getByRole("button", { name: `Actions for ${title}` }).click();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  const publish = page.getByRole("dialog", { name: `Publish ${title}` });
  await publish.getByLabel("Reason").fill("Every barista hands in the card");
  await publish.getByRole("button", { name: "Confirm publish", exact: true }).click();
  await expect(publish).toHaveCount(0);
  await expect.poll(() => statusOf()[1]).toBe("published");
  await expect.poll(() => assignedTo(documentId)).toEqual([twoPlaces, kadikoy].sort());
});

test("a two-location employee's card is seen by both managers, and one approval settles it", async ({ browser }) => {
  const key = `doc${tag()}`;
  const title = `Food handler card ${key}`;
  const jobId = ownJob(key, `Barista ${key}`);
  const role = documentManagerRole(key);
  const kadikoyManager = personWithPassword(`${key}-kmgr`, role, ["K"], "cook");
  const besiktasManager = personWithPassword(`${key}-bmgr`, role, ["B"], "cook");
  const ali = personWithPassword(`${key}-ali`, "employee", ["K", "B"], key);
  const documentId = publishedDocument(title, [jobId]);

  const holder = await (await browser.newContext()).newPage();
  await signInAs(holder, ali);
  await sendOwnDocument(holder, title);

  // Employees > Documents: the Kadikoy and the Besiktas manager both have it.
  const kadikoy = await documentsListOf(browser, kadikoyManager, `${key}-ali`, title);
  await expect(kadikoy.row.getByText("Needs review", { exact: true })).toBeVisible();
  const besiktas = await documentsListOf(browser, besiktasManager, `${key}-ali`, title);
  await expect(besiktas.row.getByText("Needs review", { exact: true })).toBeVisible();

  // Besiktas approves; that one decision is the card's, at both locations.
  await besiktas.row.click();
  const review = besiktas.page.getByRole("dialog", { name: title });
  await review.getByRole("button", { name: "Approve", exact: true }).click();
  await expect.poll(() => standing(documentId, ali)).toBe("completed accepted");
  await kadikoy.page.reload();
  await kadikoy.page.getByLabel("Search employee documents").fill(`${key}-ali`);
  await expect(kadikoy.row.getByText("Completed", { exact: true })).toBeVisible();
});

test("a manager approves neither their own card nor a fellow manager's; an admin does", async ({ browser }) => {
  const key = `doc${tag()}`;
  const title = `Food handler card ${key}`;
  const jobId = ownJob(key, `Barista ${key}`);
  const role = documentManagerRole(key);
  // Two Kadikoy managers who owe the card, a third who doesn't, and an employee.
  const first = personWithPassword(`${key}-m1`, role, ["K"], key);
  const second = personWithPassword(`${key}-m2`, role, ["K"], key);
  const third = personWithPassword(`${key}-m3`, role, ["K"], "cook");
  const employee = personWithPassword(`${key}-emp`, "employee", ["K"], key);
  const documentId = publishedDocument(title, [jobId]);
  for (const holder of [first, second, employee]) {
    const page = await (await browser.newContext()).newPage();
    await signInAs(page, holder);
    await sendOwnDocument(page, title);
  }

  // The third manager decides cards: an employee's goes through.
  expect(await approveAs(third, documentId, employee)).toBe(200);

  // Nobody approves their own; managers of one rank don't approve each
  // other's, whoever manages the location (D1).
  expect(await approveAs(first, documentId, first)).toBe(403);
  expect(await approveAs(second, documentId, first)).toBe(403);
  expect(await approveAs(third, documentId, first)).toBe(403);
  expect(standing(documentId, first)).toBe("awaiting_review pending_review");

  // One rank up, the same request goes through.
  expect(await approveAs(emailOf("zeynep"), documentId, first)).toBe(200);
  expect(standing(documentId, first)).toBe("completed accepted");
});

test("a fellow manager doesn't see a manager's card while it waits for review, only once it is approved", async ({
  browser,
}) => {
  const key = `doc${tag()}`;
  const title = `Food handler card ${key}`;
  const jobId = ownJob(key, `Barista ${key}`);
  const role = documentManagerRole(key);
  // Deniz manages Kadikoy alongside another manager.
  const deniz = personWithPassword(`${key}-deniz`, role, ["K"], key);
  const fellow = personWithPassword(`${key}-kmgr`, role, ["K"], "cook");
  const documentId = publishedDocument(title, [jobId]);
  const holder = await (await browser.newContext()).newPage();
  await signInAs(holder, deniz);
  await sendOwnDocument(holder, title);

  // Employees > Documents: while it waits, the fellow manager has no row for
  // it; Zeynep, who decides it, does.
  const zeynep = await documentsListOf(browser, emailOf("zeynep"), `${key}-deniz`, title);
  await expect(zeynep.row.getByText("Needs review", { exact: true })).toBeVisible();
  const other = await documentsListOf(browser, fellow, `${key}-deniz`, title);
  await expect(other.page.getByText("No documents match these filters.")).toBeVisible();
  await expect(other.row).toHaveCount(0);

  // Zeynep approves it; now the fellow manager sees it like any approved card.
  await zeynep.row.click();
  const review = zeynep.page.getByRole("dialog", { name: title });
  await review.getByRole("button", { name: "Approve", exact: true }).click();
  await expect.poll(() => standing(documentId, deniz)).toBe("completed accepted");
  await other.page.reload();
  await other.page.getByLabel("Search employee documents").fill(`${key}-deniz`);
  await expect(other.row.getByText("Completed", { exact: true })).toBeVisible();
});

test("an overdue card restricts the person until it is approved, and an overdue manager approves nobody", async ({
  browser,
}) => {
  const key = `doc${tag()}`;
  const title = `Food handler card ${key}`;
  const jobId = ownJob(key, `Barista ${key}`);
  const role = documentManagerRole(key);
  const late = personWithPassword(`${key}-late`, "employee", ["K"], key);
  const hande = personWithPassword(`${key}-hande`, role, ["K"], key);
  const reviewer = personWithPassword(`${key}-kmgr`, role, ["K"], "cook");
  const documentId = publishedDocument(title, [jobId]);
  deadlinePassed(documentId, late);
  deadlinePassed(documentId, hande);

  // The workspace sends the late person to the one thing still missing.
  const page = await (await browser.newContext()).newPage();
  await signInAs(page, late);
  await page.goto("/app");
  // Her documents are a page of the employee interface now (MY-DOCUMENTS).
  await expect(page).toHaveURL(/\/app\/employee-hub\/documents/);
  await expect(
    page.getByText(`Workspace access is restricted until these requests are resolved: ${title}.`),
  ).toBeVisible();
  await sendOwnDocument(page, title);

  // Hande's own card is overdue: she reviews nobody until hers is in (D3).
  expect(await approveAs(hande, documentId, late)).toBe(403);
  expect(standing(documentId, late)).toBe("awaiting_review pending_review");

  // A manager whose own papers are in order approves it, and the workspace
  // opens again.
  expect(await approveAs(reviewer, documentId, late)).toBe(200);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/app\/employee-hub/);
});

test("the owner sends their own card when they choose; it goes on file, never to a review queue", async ({ page }) => {
  const key = `doc${tag()}`;
  const title = `Owner food handler card ${key}`;
  const owner = ownerWithPassword();
  // For the Owner job under Management: the owner is the only one holding it.
  const ownerJob = lastLine(sql(`select tests.id('${run}:job:owner');`));
  // A card with a deadline takes its time zone from the holder's primary
  // location. The world's owner works at both locations with neither primary,
  // and nothing in the product makes one primary for an owner (BL-559): set
  // Kadikoy by hand, and hand the world back as built afterwards.
  const kadikoyAsPrimary = (primary: boolean) =>
    sql(`
    update public.employee_location_assignments
    set is_primary = ${primary}
    where employee_id = tests.id('${run}:owner') and location_id = tests.id('${run}:K') and ended_at is null;`);
  kadikoyAsPrimary(true);
  try {
    const documentId = publishedDocument(title, [ownerJob]);
    expect(assignedTo(documentId)).toEqual([owner]);

    // Account > Documents: the owner is never asked, but may send it (D5).
    await signInAs(page, owner);
    await sendOwnDocument(page, title);
    expect(standing(documentId, owner)).toBe("completed accepted");
  } finally {
    kadikoyAsPrimary(false);
  }
});
