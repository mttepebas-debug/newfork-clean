import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "../fixtures/test";

// BL-990: `browser` lives as long as the worker, so a context a test opens with
// browser.newContext() outlived it. In one run ~57 signed-in pages piled up, each
// polling and refetching on every realtime signal; in CI's 10 GB Linux VM the
// suite's last specs then ran in swap. A test's own contexts close when it ends.

test("a context a test opens", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.setContent("<p>open</p>");
  expect(browser.contexts()).toHaveLength(1);
});

test("is closed once that test ends", async ({ browser }) => {
  expect(browser.contexts()).toHaveLength(0);
});

test("every spec takes test from fixtures/test, which closes them", () => {
  const dir = new URL("./", import.meta.url);
  const raw = readdirSync(dir)
    .filter((file) => file.endsWith(".spec.ts"))
    .filter((file) => /import\s*\{[^}]*\btest\b[^}]*\}\s*from\s*"@playwright\/test"/.test(readFileSync(new URL(file, dir), "utf8")));
  expect(raw).toEqual([]);
});
