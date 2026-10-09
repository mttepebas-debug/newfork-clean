import { test as base } from "@playwright/test";

export { expect } from "@playwright/test";

// BL-990: specs sign their people in with browser.newContext(), on the
// worker's one browser (workers: 1). Playwright closes only the `context` it
// made itself, so every other page stayed open and kept polling the API; by
// the end of a CI run a hundred of them slowed the time off specs past their
// timeout. Every spec takes `test` from here, and each test closes what it opened.
export const test = base.extend<{ closeOpenedContexts: void }>({
  closeOpenedContexts: [
    async ({ browser }, use) => {
      const before = new Set(browser.contexts());
      await use();
      await Promise.all(
        browser
          .contexts()
          .filter((context) => !before.has(context))
          .map((context) => context.close()),
      );
    },
    { auto: true },
  ],
});
