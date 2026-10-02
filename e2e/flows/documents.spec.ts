import { expect, test } from "@playwright/test";
import { emailOf, signIn } from "../fixtures/world";
import {
  approveAs,
  assignedTo,
  deadlinePassed,
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
// review queue (D5).
//
// Every test makes its own job and people, so what it publishes reaches only
// them. Left out until Mert answers (FB-6.6 S2): whether a fellow manager sees
// a card still waiting for review.

test("an admin's draft reaches nobody; published, it lands on the people its job targets", async ({ page }) => {
  const key = `doc${tag()}`;
  const job = `Barista ${key}`;
  const title = `Food handler card ${key}`;
  ownJob(key, job);
  const twoPlaces = personWithPassword(`${key}-ali`, "employee", ["K", "B"], key);
  const kadikoy = personWithPassword(`${key}-emp`, "employee", ["K"], key);

  // Settings > Documents: Zeynep writes it for that job and saves a draft.
  await signIn(page, "zeynep");
  await page.goto("/app/settings/documents");
  await page.getByRole("button", { name: "Add document type" }).click();
  const editor = page.getByRole("form", { name: "Add document type" });
  await editor.getByLabel("Name", { exact: true }).fill(title);
  await editor.getByLabel("Requirement", { exact: true }).selectOption("required");
  await editor.getByText("All Jobs", { exact: true }).click();
  await editor.getByRole("checkbox", { name: job, exact: true }).click();
  await page.keyboard.press("Escape");
  await editor.getByRole("button", { name: "Next", exact: true }).click();
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor).toHaveCount(0);
  const row = page.getByRole("row", { name: new RegExp(title) });
  await expect(row.getByText("Draft", { exact: true })).toBeVisible();

  const documentId = lastLine(
    sql(`select id from public.document_types where workspace_id = tests.id('${run}') and title = '${title}';`),
  );
  expect(assignedTo(documentId)).toEqual([]);

  // Published, it reaches the two people on the job and nobody else.
  await page.getByRole("button", { name: `Actions for ${title}` }).click();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  const publish = page.getByRole("dialog", { name: `Publish ${title}` });
  await publish.getByLabel("Reason").fill("Every barista hands in the card");
  await publish.getByRole("button", { name: "Confirm publish", exact: true }).click();
  await expect(publish).toHaveCount(0);
  await expect(row.getByText("Published", { exact: true })).toBeVisible();
  await expect.poll(() => assignedTo(documentId)).toEqual([twoPlaces, kadikoy].sort());
});

test("a two-location employee's card is seen by both managers, and one approval settles it", async ({ browser }) => {
  const key = `doc${tag()}`;
  const title = `Food handler card ${key}`;
  const jobId = ownJob(key, `Barista ${key}`);
  const ali = personWithPassword(`${key}-ali`, "employee", ["K", "B"], key);
  const documentId = publishedDocument(title, [jobId]);

  const holder = await (await browser.newContext()).newPage();
  await signInAs(holder, ali);
  await sendOwnDocument(holder, title);

  // Employees > Documents: Ayse (Kadikoy) and Mehmet (Besiktas) both have it.
  const rowFor = async (manager: "ayse" | "mehmet") => {
    const page = await (await browser.newContext()).newPage();
    await signIn(page, manager);
    await page.goto("/app/employees/documents");
    await page.getByLabel("Search employee documents").fill(`${key}-ali`);
    return {
      page,
      row: page.getByRole("table", { name: "Employee documents" }).getByRole("row", { name: new RegExp(title) }),
    };
  };
  const ayse = await rowFor("ayse");
  await expect(ayse.row.getByText("Needs review", { exact: true })).toBeVisible();
  const mehmet = await rowFor("mehmet");
  await expect(mehmet.row.getByText("Needs review", { exact: true })).toBeVisible();

  // Mehmet approves; that one decision is the card's, at both locations.
  await mehmet.row.click();
  const review = mehmet.page.getByRole("dialog", { name: title });
  await review.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(review.getByRole("status")).toHaveText("Decision saved");
  expect(standing(documentId, ali)).toBe("completed accepted");
  await ayse.page.reload();
  await ayse.page.getByLabel("Search employee documents").fill(`${key}-ali`);
  await expect(ayse.row.getByText("Completed", { exact: true })).toBeVisible();
});

test("a manager approves neither their own card nor a fellow manager's; an admin does", async ({ browser }) => {
  const key = `doc${tag()}`;
  const title = `Food handler card ${key}`;
  const jobId = ownJob(key, `Barista ${key}`);
  const first = personWithPassword(`${key}-m1`, "manager", ["K"], key);
  const second = personWithPassword(`${key}-m2`, "manager", ["K"], key);
  const documentId = publishedDocument(title, [jobId]);
  for (const manager of [first, second]) {
    const page = await (await browser.newContext()).newPage();
    await signInAs(page, manager);
    await sendOwnDocument(page, title);
  }

  // Nobody approves their own; managers of one rank don't approve each
  // other's, whoever manages the location (D1).
  expect(await approveAs(first, documentId, first)).toBe(403);
  expect(await approveAs(second, documentId, first)).toBe(403);
  expect(await approveAs(emailOf("ayse"), documentId, first)).toBe(403);
  expect(standing(documentId, first)).toBe("awaiting_review pending_review");

  // One rank up, the same request goes through.
  expect(await approveAs(emailOf("zeynep"), documentId, first)).toBe(200);
  expect(standing(documentId, first)).toBe("completed accepted");
});

test("an overdue card restricts the person until it is approved, and an overdue manager approves nobody", async ({
  browser,
}) => {
  const key = `doc${tag()}`;
  const title = `Food handler card ${key}`;
  const jobId = ownJob(key, `Barista ${key}`);
  const late = personWithPassword(`${key}-late`, "employee", ["K"], key);
  const hande = personWithPassword(`${key}-hande`, "manager", ["K"], key);
  const documentId = publishedDocument(title, [jobId]);
  deadlinePassed(documentId, late);
  deadlinePassed(documentId, hande);

  // The workspace sends the late person to the one thing still missing.
  const page = await (await browser.newContext()).newPage();
  await signInAs(page, late);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/account\/documents/);
  await expect(
    page.getByText(`Workspace access is restricted until these requests are resolved: ${title}.`),
  ).toBeVisible();
  await sendOwnDocument(page, title);

  // Hande's own card is overdue: she reviews nobody until hers is in (D3).
  expect(await approveAs(hande, documentId, late)).toBe(403);
  expect(standing(documentId, late)).toBe("awaiting_review pending_review");

  // Ayse approves it and the workspace opens again.
  expect(await approveAs(emailOf("ayse"), documentId, late)).toBe(200);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/app\/employee-hub/);
});

test("the owner sends their own card when they choose; it goes on file, never to a review queue", async ({ page }) => {
  const key = `doc${tag()}`;
  const title = `Owner food handler card ${key}`;
  const owner = ownerWithPassword();
  // For the Owner job under Management: the owner is the only one holding it.
  const ownerJob = lastLine(sql(`select tests.id('${run}:job:owner');`));
  const documentId = publishedDocument(title, [ownerJob]);
  expect(assignedTo(documentId)).toEqual([owner]);

  // Account > Documents: the owner is never asked, but may send it (D5).
  await signInAs(page, owner);
  await sendOwnDocument(page, title);
  expect(standing(documentId, owner)).toBe("completed accepted");
});
