// Stands in for apps/web/src/schedule/export-v2/usePreviewSource on the test page.
// The page shows a saved draft only when it is in this week's draft list; a
// template the New Schedule window lays on the grid is added to that list here
// (for the grid's read only), so the page's own preview shows it unchanged.
import type { ScheduleDraftSummary } from "@newfork/shared/schedule";
import { useMemo } from "react";
import { usePreviewSource as original } from "../../../src/schedule/export-v2/usePreviewSource";
import { templateNames } from "./template-store";

const NOBODY = "00000000-0000-4000-8000-000000000000";

export function usePreviewSource(args: Parameters<typeof original>[0]): ReturnType<typeof original> {
  const templates = templateNames.use();
  const template = args.activeDraftId ? templates.get(args.activeDraftId) : undefined;
  const week = args.model?.week_start;
  const drafts = useMemo((): readonly ScheduleDraftSummary[] | undefined => {
    if (!args.drafts || !template || !args.activeDraftId || !args.workspaceId || !week) return args.drafts;
    return [...args.drafts, {
      id: args.activeDraftId, workspace_id: args.workspaceId, week_start: week, name: template.name,
      revision: template.revision, created_by: NOBODY, updated_by: NOBODY,
      created_at: template.updated_at, updated_at: template.updated_at,
    }];
  }, [args.drafts, args.activeDraftId, args.workspaceId, template, week]);
  return original({ ...args, drafts });
}
