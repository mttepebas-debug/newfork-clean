import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// The app's own ShiftCard, ScheduleRow, badge measurer and grid shell are swapped for this
// page's copies, which carry the "Yeni" look. Every other file is main's.
const swaps: Record<string, string> = {
  [here("../../src/schedule/components/ShiftCard.tsx")]: here("./overrides/ShiftCard.tsx"),
  [here("../../src/schedule/components/ScheduleRow.tsx")]: here("./overrides/ScheduleRow.tsx"),
  [here("../../src/schedule/hooks/useScheduleBadgeMeasurements.tsx")]: here("./overrides/useScheduleBadgeMeasurements.tsx"),
  [here("../../src/schedule/components/ScheduleGridShell.tsx")]: here("./overrides/ScheduleGridShell.tsx"),
};
function overrides(): Plugin {
  return {
    name: "rk-overrides",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!importer || importer.includes("/overrides/")) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      const swap = resolved && swaps[resolved.id.split("?")[0]!];
      return swap ? { id: swap } : null;
    },
  };
}

export default defineConfig({
  root: here("."),
  envDir: here("."),
  publicDir: here("../../public"),
  plugins: [overrides(), react()],
  define: {
    __ATLAS_SHA__: JSON.stringify(process.env.ATLAS_SHA ?? "dev"),
    __PAGES_SCHEDULE__: "false",
    // The mark drafts page (Mert, 2026-10-13): its tab and pickers.
    __RK_MARKS__: process.env.RK_MARKS === "1" ? "true" : "false",
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
      { find: /^@web\//, replacement: here("../../src") + "/" },
    ],
  },
  server: { port: 5712, strictPort: true, fs: { allow: [here("../../../..")] } },
  build: {
    target: "es2022",
    outDir: here("./dist"),
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
