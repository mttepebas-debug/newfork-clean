import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  // Tests must not read developer .env files.
  envDir: mode === "test" ? false : undefined,
  plugins: [react()],
  build: {
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
  },
}));
