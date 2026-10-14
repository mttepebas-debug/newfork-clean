import { test as base } from "@playwright/test";

export { expect } from "@playwright/test";
export type { Browser, Locator, Page, Request } from "@playwright/test";

// BL-990: `browser` lives as long as the worker, so a context a spec opened with
// browser.newContext() outlived its test: one CI run piled up ~57 signed-in pages,
// each polling and refetching on every realtime signal, and in the runner's 10 GB
// Linux VM the last specs ran in swap. Every spec takes `test` from here; the
// contexts a test opens close when it ends (their traces are kept as before).
export const test = base.extend<{ closeOwnContexts: void }>({
  closeOwnContexts: [
    async ({ browser }, use) => {
      const before = new Set(browser.contexts());
      await use();
      await Promise.all(browser.contexts().filter((context) => !before.has(context)).map((context) => context.close()));
    },
    { auto: true },
  ],
});
