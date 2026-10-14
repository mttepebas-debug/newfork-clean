import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/**
 * Two small edits to main's SchedulePage, made while building (the file in the
 * repo is untouched): the "Review default hours" button and an optional notice
 * above the grid come from the item 9 prototypes. Each edit must match main
 * exactly, or the build stops.
 */
function patchSchedulePage(): Plugin {
  const edits: [string, string][] = [
    [
      'import { DefaultHoursReviewDialog } from "../schedule/components/DefaultHoursReviewDialog";',
      `import { DefaultHoursReviewDialog } from "../schedule/components/DefaultHoursReviewDialog";\nimport { StDefaultHoursButton, StDefaultHoursNotice } from "${here("./variants/default-hours.tsx")}";`,
    ],
    [
      `          {gates.edit ? (
            <button type="button" onClick={() => setDefaultHoursOpen(true)}>
              Review default hours
            </button>
          ) : null}`,
      `          {gates.edit && context ? (
            <StDefaultHoursButton session={gridEditSession} model={model} workspaceId={context.workspace.id}
              onOpen={() => setDefaultHoursOpen(true)} onApplied={(result) => setSession(result)} />
          ) : null}`,
    ],
    [
      `      <ScheduleGrid
        model={sortedModel}`,
      `      {gridEditSession && gates.edit ? (
        <StDefaultHoursNotice session={gridEditSession} model={model} onOpen={() => setDefaultHoursOpen(true)} />
      ) : null}
      <ScheduleGrid
        model={sortedModel}`,
    ],
  ];
  return {
    name: "patch-schedule-page",
    enforce: "pre",
    transform(code, id) {
      if (!id.endsWith("/src/views/SchedulePage.tsx")) return null;
      let next = code;
      for (const [from, to] of edits) {
        if (!next.includes(from)) throw new Error(`SchedulePage patch did not match:\n${from}`);
        next = next.replace(from, to);
      }
      return next;
    },
  };
}

export default defineConfig({
  root: here("."),
  envDir: here("."),
  publicDir: here("../../public"),
  plugins: [patchSchedulePage(), react()],
  resolve: {
    alias: [
      { find: /^react-router$/, replacement: here("./router-shim.tsx") },
      { find: /^react-router-real$/, replacement: here("../../../../node_modules/.pnpm/react-router@7.18.2_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/react-router/dist/production/index.mjs") },
      { find: /^@newfork\/ui$/, replacement: here("../../../../packages/ui/src/index.ts") },
      { find: /^@supabase\/supabase-js$/, replacement: here("./mock/fake-supabase.ts") },
      { find: /^\.\.\/employees\/EmployeeDrawer$/, replacement: here("./mock/employee-drawer-stub.tsx") },
      // Items 2, 5, 7, 8, 9: main's component or a prototype, whichever the "Test page" menu has chosen.
      { find: /^\.\.\/schedule\/components\/DraftDropdownMenu$/, replacement: here("./variants/new-schedule.tsx") },
      { find: /^\.\/ExportSettingsPanel$/, replacement: here("./variants/export.tsx") },
      { find: /^\.\.\/schedule\/components\/ScheduleTopBar$/, replacement: here("./variants/ScheduleTopBar.tsx") },
      { find: /^\.\.\/schedule\/components\/UnpublishScheduleDialog$/, replacement: here("./variants/unpublish.tsx") },
      { find: /^\.\.\/schedule\/components\/DefaultHoursReviewDialog$/, replacement: here("./variants/default-hours.tsx") },
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
