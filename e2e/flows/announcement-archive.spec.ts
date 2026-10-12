import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "../fixtures/test";
import { psql } from "../global-setup";
import { signIn } from "../fixtures/world";

// FB-6.7 (Mert 2026-10-03, BL-543) and EKRAN-08: an announcement is archived,
// never deleted. In the drawer, Archive arms a red "Archive it?"; only that
// second click archives it, and it waits under the Archived tab.

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
  await zeynep.getByRole("button", { name: "New", exact: true }).click();
  const editor = zeynep.getByRole("dialog", { name: "New announcement" });
  await editor.getByLabel("Title", { exact: true }).fill(title);
  await editor.getByLabel("Message", { exact: true }).fill("The patio stays closed for repairs this week.");
  await editor.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(editor).toHaveCount(0);
  const active = zeynep.getByRole("table", { name: "Active announcements" });
  await expect(active.getByText(title, { exact: true })).toBeVisible();
  expect(archivedAt()).toBe("active");

  // First click: the drawer's Archive arms "Archive it?"; nothing is
  // archived yet, and there is no Delete.
  await active.getByText(title, { exact: true }).click();
  const drawer = zeynep.getByRole("dialog", { name: title });
  await expect(drawer.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
  await drawer.getByRole("button", { name: "Archive", exact: true }).click();
  const confirm = drawer.getByRole("button", { name: "Archive it?", exact: true });
  await expect(confirm).toBeVisible();
  expect(archivedAt()).toBe("active");

  // Second click archives it: it leaves the list and waits under Archived.
  await confirm.click();
  await expect.poll(archivedAt).not.toBe("active");
  await expect(drawer).toHaveCount(0);
  await expect(active.getByText(title, { exact: true })).toHaveCount(0);
  await zeynep.getByRole("tab", { name: "Archived", exact: true }).click();
  await expect(
    zeynep.getByRole("table", { name: "Archived announcements" }).getByText(title, { exact: true }),
  ).toBeVisible();
});
