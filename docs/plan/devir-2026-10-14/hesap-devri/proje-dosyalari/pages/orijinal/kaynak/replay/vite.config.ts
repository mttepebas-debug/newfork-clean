import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: here("."),
  envDir: here("."),
  publicDir: here("../../public"),
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^react-router$/, replacement: here("./router-shim.tsx") },
      { find: /^react-router-real$/, replacement: here("../../../../node_modules/.pnpm/react-router@7.18.2_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/react-router/dist/production/index.mjs") },
      { find: /^@supabase\/supabase-js$/, replacement: here("./supabase-shim.ts") },
      { find: /^@supabase\/supabase-js-real$/, replacement: here("../../../../node_modules/.pnpm/@supabase+supabase-js@2.112.3/node_modules/@supabase/supabase-js/dist/index.mjs") },
      { find: /^@newfork\/ui$/, replacement: here("../../../../packages/ui/src/index.ts") },
    ],
  },
  server: { port: 5702, strictPort: true, fs: { allow: [here("../../../..")] } },
  build: {
    target: "es2022",
    outDir: here("./dist"),
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
