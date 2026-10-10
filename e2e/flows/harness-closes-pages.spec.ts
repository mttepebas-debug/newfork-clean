import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "../fixtures/test";

// BL-990: specs open their people's pages with browser.newContext() on the
// worker's one browser (workers: 1). Left open, every page went on polling the
// API, and by the end of a run a hundred of them slowed the last specs past
// their timeout. A test starts with no page left over from the one before.

test("a test opens a page of its own", async ({ browser }) => {
  await (await browser.newContext()).newPage();
  expect(browser.contexts()).toHaveLength(1);
});

test("the next test starts with none left over", async ({ browser }) => {
  expect(browser.contexts()).toHaveLength(0);
});

// Only `test` from fixtures/test closes those pages; a spec that takes it
// straight from @playwright/test would quietly bring the pile back.
test("every spec takes test from fixtures/test", () => {
  const dir = new URL("./", import.meta.url);
  const raw = readdirSync(dir)
    .filter((file) => file.endsWith(".spec.ts"))
    .filter((file) => /import\s*\{[^}]*\btest\b[^}]*\}\s*from\s*"@playwright\/test"/.test(readFileSync(new URL(file, dir), "utf8")));
  expect(raw).toEqual([]);
});
