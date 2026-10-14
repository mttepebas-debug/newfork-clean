import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/**
 * Two edits to main's SchedulePage, made while building (the file in the repo is
 * untouched): the New Schedule window also gets the page's own Export and
 * Templates openers, so A and B can run those flows from inside the window; and
 * the Publish menu gets the edit session, discard and preview, so a template
 * opened for editing can be saved back. Each edit must match main exactly, or
 * the build stops.
 */
function patchSchedulePage(): Plugin {
  const edits: [string, string][] = [
    [
      `            onSaveAsTemplate={() => {
              setTemplateDraftId(activeDraftId);
              openTemplatesDialog();
            }}`,
      `            onSaveAsTemplate={() => {
              setTemplateDraftId(activeDraftId);
              openTemplatesDialog();
            }}
            stOpenExport={openExportDialog}
            stOpenTemplates={(draftId) => {
              setTemplateDraftId(draftId);
              openTemplatesDialog();
            }}`,
    ],
    [
      `          onSaveAndPublish={saveDraftAndOpenPublish}
        />`,
      `          onSaveAndPublish={saveDraftAndOpenPublish}
          stSessionId={gridEditSession.id}
          stDiscard={discardEditSession}
          stPreview={(draftId: string) => void previewDraftFromMenu(draftId)}
        />`,
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
      // The New Schedule window: main's or a prototype. In A and B the Export panel and the Templates
      // window hand their real props to the prototype instead of drawing themselves.
      { find: /^\.\.\/schedule\/components\/DraftDropdownMenu$/, replacement: here("./variants/new-schedule.tsx") },
      { find: /^\.\/ExportSettingsPanel$/, replacement: here("./variants/export.tsx") },
      { find: /^\.\.\/schedule\/components\/ScheduleTemplateDialogs$/, replacement: here("./variants/templates.tsx") },
      // A template laid on the grid counts as a draft for the page's preview.
      { find: /^\.\.\/schedule\/export-v2\/usePreviewSource$/, replacement: here("./variants/preview-source.ts") },
      // A template opened for editing saves with "Save template" instead of Publish.
      { find: /^\.\.\/schedule\/components\/SaveDraftMenu$/, replacement: here("./variants/save-draft-menu.tsx") },
    ],
  },
  server: { port: 5703, strictPort: true, fs: { allow: [here("../../../..")] } },
  build: {
    target: "es2022",
    outDir: here("./dist"),
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
