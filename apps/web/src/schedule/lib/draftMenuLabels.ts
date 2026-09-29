import type { ScheduleDraftSummary } from "@newfork/shared/schedule";

import { formatShortDateTime } from "./scheduleDateTime";

// The row labels the New Schedule and Save draft menus share (BL-309).
export interface PublishedScheduleSummary {
  readonly source_draft_id?: string | null;
  readonly source_draft_name?: string | null;
  readonly published_at: string;
  readonly published_by_name?: string | null;
}

// The drafts list carries no saver name, so a draft row says its revision.
export function draftMeta(draft: ScheduleDraftSummary): string {
  return `Revision ${draft.revision} • ${formatShortDateTime(draft.updated_at)}`;
}

export function publishedTitle(summary?: PublishedScheduleSummary | null): string {
  const title = summary?.source_draft_name?.trim();
  return title ? title : "Published schedule";
}

export function publishedMeta(summary: PublishedScheduleSummary): string {
  const publishedBy = summary.published_by_name?.trim() || "Unknown";
  return `Published by ${publishedBy} • ${formatShortDateTime(summary.published_at)}`;
}
