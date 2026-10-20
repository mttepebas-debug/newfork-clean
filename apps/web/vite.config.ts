import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  // Tests must not read developer .env files.
  envDir: mode === "test" ? false : undefined,
  plugins: [react()],
  build: {
    // Maps only for the hosted build, which uploads them to Sentry and then
    // deletes them (scripts/sentry-sourcemaps.mjs); "hidden" leaves no
    // sourceMappingURL comment pointing at a file that will not be there.
    sourcemap: process.env.SENTRY_AUTH_TOKEN ? "hidden" : false,
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router"],
          "query-vendor": ["@tanstack/react-query"],
          "supabase-vendor": ["@supabase/supabase-js"],
        },
      },
    },
  },
  server: {
    port: 5555,
  },
  test: {
    environment: "jsdom",
    globals: true,
    // Whole-repo runs put four packages on the same cores, and these are
    // jsdom-rendered pages waiting on queries: at the 5s default a different
    // handful timed out on every run while each passed alone. The timeout is
    // about how long a slow machine may take, not about what the test asserts.
    testTimeout: 20000,
    // CI retries a failed test once and lists the ones that passed only on the retry (scripts/vitest-flaky-reporter.mjs).
    ...(process.env.CI ? { retry: 1, reporters: ["default", "../../scripts/vitest-flaky-reporter.mjs"] } : {}),
  },
}));
