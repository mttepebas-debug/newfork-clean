import { defineConfig } from "vitest/config";

// Kept out of tsconfig.json on purpose: `build` emits with tsc from src only.
export default defineConfig({
  test: {
    // Every route test builds the whole Fastify app; the first build in a file
    // takes ~0.7 s alone and several times that when a whole-repo run puts four
    // packages on the same cores (U19). Same bound and reason as apps/web.
    testTimeout: 20000,
    // CI retries a failed test once and lists the ones that passed only on the retry (scripts/vitest-flaky-reporter.mjs).
    ...(process.env.CI ? { retry: 1, reporters: ["default", "../../scripts/vitest-flaky-reporter.mjs"] } : {}),
  },
});
