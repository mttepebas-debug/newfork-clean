import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// The app's own ShiftCard and ScheduleGrid are swapped for this page's copies,
// which carry the variants. Every other file is main's.
const swaps: Record<string, string> = {
  [here("../../src/schedule/components/ShiftCard.tsx")]: here("./overrides/ShiftCard.tsx"),
  [here("../../src/schedule/components/ScheduleGrid.tsx")]: here("./overrides/ScheduleGrid.tsx"),
};
function overrides(): Plugin {
  return {
    name: "vk-overrides",
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
  resolve: {
    alias: [
      { find: /^react-router$/, replacement: here("./router-shim.tsx") },
      { find: /^react-router-real$/, replacement: here("../../../../node_modules/.pnpm/react-router@7.18.2_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/react-router/dist/production/index.mjs") },
      { find: /^@newfork\/ui$/, replacement: here("../../../../packages/ui/src/index.ts") },
      { find: /^@supabase\/supabase-js$/, replacement: here("./mock/fake-supabase.ts") },
      { find: /^\.\.\/employees\/EmployeeDrawer$/, replacement: here("./mock/employee-drawer-stub.tsx") },
      { find: /^@web\//, replacement: here("../../src") + "/" },
    ],
  },
  server: { port: 5701, strictPort: true, fs: { allow: [here("../../../..")] } },
  build: {
    target: "es2022",
    outDir: here("./dist"),
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
