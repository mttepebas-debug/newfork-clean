import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "../fixtures/test";
import { psql } from "../global-setup";
import { signIn } from "../fixtures/world";

// FB-6.7 (Mert 2026-10-03, BL-543): an announcement's row menu says Archive,
// not Delete, because it always archived. Archive opens the announcement with
// a red "Confirm archive" armed; only that second click archives it.

const run: string = JSON.parse(readFileSync(new URL("../.world.json", import.meta.url), "utf8")).run;

function sql(query: string): string {
  return execSync(psql, { input: query, encoding: "utf8" }).trim();
}

test("Archive on an announcement takes two clicks and moves it to Archived", async ({ browser }) => {
  const title = `Patio closed ${Math.random().toString(36).slice(2, 7)}`;
  const archivedAt = () =>
    sql(`select coalesce(archived_at::text, 'active') from public.announcements
         where workspace_id = tests.id('${run}') and title = '${title}';`);

  const zeynep = await (await browser.newContext()).newPage();
  await signIn(zeynep, "zeynep");
  await expect(zeynep).not.toHaveURL(/\/sign-in/);
  await zeynep.goto("/app/announcements");

  // A draft of her own to archive.
  await zeynep.getByRole("button", { name: "New announcement" }).click();
  const editor = zeynep.getByRole("dialog", { name: "Add announcement" });
  await editor.getByLabel("Title").fill(title);
  await editor.getByLabel("Message").fill("The patio stays closed for repairs this week.");
  await editor.getByRole("button", { name: "Save draft" }).click();
  const table = zeynep.getByRole("table", { name: "Announcements" });
  await expect(table.getByText(title, { exact: true })).toBeVisible();
  expect(archivedAt()).toBe("active");

  // First click: the row menu's Archive (no Delete any more) opens the
  // announcement with "Confirm archive" armed; nothing is archived yet.
  await zeynep.getByRole("button", { name: `Actions for ${title}`, exact: true }).click();
  await expect(zeynep.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
  await zeynep.getByRole("button", { name: "Archive", exact: true }).click();
  const confirm = zeynep.getByRole("button", { name: "Confirm archive", exact: true });
  await expect(confirm).toBeVisible();
  expect(archivedAt()).toBe("active");

  // Second click archives it: it leaves the list and waits under Archived.
  await confirm.click();
  await expect.poll(archivedAt).not.toBe("active");
  await expect(table.getByText(title, { exact: true })).toHaveCount(0);
  await zeynep.getByRole("tab", { name: "Archived" }).click();
  await expect(table.getByText(title, { exact: true })).toBeVisible();
});
