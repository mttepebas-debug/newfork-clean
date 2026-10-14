import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: here("."),
  envDir: here("."),
  publicDir: here("../../public"),
  plugins: [react()],
  define: {
    __ATLAS_SHA__: JSON.stringify(process.env.ATLAS_SHA ?? "dev"),
    __PAGES_SCHEDULE__: JSON.stringify(Boolean(process.env.PAGES_SCHEDULE)),
    __ATLAS_BUILT__: JSON.stringify(process.env.ATLAS_BUILT ?? new Date().toISOString().slice(0, 10)),
  },
  resolve: {
    alias: [
      { find: /^react-router$/, replacement: here("./router-shim.tsx") },
      { find: /^react-router-real$/, replacement: here("../../../../node_modules/.pnpm/react-router@7.18.2_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/react-router/dist/production/index.mjs") },
      { find: /^@newfork\/ui$/, replacement: here("../../../../packages/ui/src/index.ts") },
      { find: /^@supabase\/supabase-js$/, replacement: here("./mock/fake-supabase.ts") },
      // PAGES: Schedule (3.0–3.2) has its own build (PAGES_SCHEDULE=1) with
      // its export libraries (pdf.js, exceljs); the other screens leave it out.
      ...(process.env.PAGES_SCHEDULE ? [] : [{ find: /^\.\/views\/(SchedulePage|ScheduleTemplatesPage)$/, replacement: here("./mock/schedule-page-stub.tsx") }]),
    ],
  },
  server: { port: 5711, strictPort: true, fs: { allow: [here("../../../..")] } },
  build: {
    target: "es2022",
    // PAGES_DIST lets two builds run side by side (one folder each).
    outDir: process.env.PAGES_DIST ?? here("./dist"),
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
