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
    __ATLAS_BUILT__: JSON.stringify(process.env.ATLAS_BUILT ?? new Date().toISOString().slice(0, 10)),
  },
  resolve: {
    alias: [
      { find: /^react-router$/, replacement: here("./router-shim.tsx") },
      { find: /^react-router-real$/, replacement: here("../../../../node_modules/.pnpm/react-router@7.18.2_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/react-router/dist/production/index.mjs") },
      { find: /^@newfork\/ui$/, replacement: here("../../../../packages/ui/src/index.ts") },
      { find: /^@supabase\/supabase-js$/, replacement: here("./mock/fake-supabase.ts") },
      // Schedule is its own test page; leaving it (and its pdf.js export) out
      // keeps every atlas page smaller.
      // The lab page swaps Settings → Jobs for the Original / V1 switcher.
      { find: /^lab-original-jobs$/, replacement: here("../../src/settings/JobsSettingsPage.tsx") },
      { find: /^\.\/settings\/JobsSettingsPage$/, replacement: here("./variants/JobsLab.tsx") },
      { find: /^\.\/views\/(SchedulePage|ScheduleTemplatesPage)$/, replacement: here("./mock/schedule-page-stub.tsx") },
    ],
  },
  server: { port: 5721, strictPort: true, fs: { allow: [here("../../../..")] } },
  build: {
    target: "es2022",
    outDir: here("./dist"),
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
