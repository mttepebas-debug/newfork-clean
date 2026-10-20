import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    // CI retries a failed test once and lists the ones that passed only on the retry (scripts/vitest-flaky-reporter.mjs).
    ...(process.env.CI ? { retry: 1, reporters: ["default", "../../scripts/vitest-flaky-reporter.mjs"] } : {}),
  },
});
