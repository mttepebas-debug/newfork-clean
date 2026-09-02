import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { ScheduleDraftSummary, ScheduleView } from "@newfork/shared/schedule";

import { draftsKey, scheduleReadKey } from "../schedule-data";

export interface PostSavePreviewArgs {
  readonly previousPreviewDraftId: string | null;
  readonly savedDraftId: string | null | undefined;
  readonly targetDraftId?: string | null;
}

export function getPostSavePreviewDraftId({
  previousPreviewDraftId,
  savedDraftId,
  targetDraftId,
}: PostSavePreviewArgs): string | null {
  return savedDraftId ?? targetDraftId ?? previousPreviewDraftId;
}

export interface DraftsCacheSnapshot {
  readonly drafts: readonly ScheduleDraftSummary[];
}

export function upsertSavedDraft(
  current: DraftsCacheSnapshot | undefined,
  draft: ScheduleDraftSummary,
): DraftsCacheSnapshot {
  return {
    drafts: [draft, ...(current?.drafts ?? []).filter((item) => item.id !== draft.id)],
  };
}

interface PendingOpsCacheSnapshot {
  readonly pending_ops: readonly unknown[];
}

function keyParts(key: QueryKey): readonly unknown[] {
  return Array.isArray(key) ? key : [];
}

function pendingOpsKeyMatchesDraft(
  key: QueryKey,
  workspaceId: string,
  weekStart: string,
  draftId: string | null,
): boolean {
  const parts = keyParts(key);
  if (
    parts[0] !== "schedule-pending-ops" ||
    parts[1] !== workspaceId ||
    parts[2] !== weekStart
  ) {
    return false;
  }
  return parts[3] === draftId || parts[4] === draftId;
}

export function clearPendingOpsCachesForDraft(
  queryClient: QueryClient,
  workspaceId: string,
  weekStart: string,
  draftId: string | null,
): void {
  for (const [key] of queryClient.getQueriesData<PendingOpsCacheSnapshot>({
    queryKey: ["schedule-pending-ops", workspaceId, weekStart],
  })) {
    if (pendingOpsKeyMatchesDraft(key, workspaceId, weekStart, draftId)) {
      queryClient.setQueryData(key, { pending_ops: [] });
    }
  }
}

export function cacheSavedDraftResult({
  queryClient,
  workspaceId,
  weekStart,
  previousDraftId,
  draft,
}: {
  readonly queryClient: QueryClient;
  readonly workspaceId: string;
  readonly weekStart: string;
  readonly previousDraftId: string | null;
  readonly draft: ScheduleDraftSummary;
}): void {
  queryClient.setQueryData(
    draftsKey(workspaceId, weekStart),
    (current: DraftsCacheSnapshot | undefined) => upsertSavedDraft(current, draft),
  );
  clearPendingOpsCachesForDraft(queryClient, workspaceId, weekStart, previousDraftId);
}

export function invalidateScheduleCommitCaches({
  queryClient,
  workspaceId,
  weekStart,
  selectedDate,
  view,
}: {
  readonly queryClient: QueryClient;
  readonly workspaceId: string;
  readonly weekStart: string;
  readonly selectedDate: string;
  readonly view: ScheduleView;
}): void {
  void queryClient.invalidateQueries({
    queryKey: draftsKey(workspaceId, weekStart),
  });
  void queryClient.invalidateQueries({
    queryKey: ["schedule-pending-ops", workspaceId, weekStart],
  });
  void queryClient.invalidateQueries({
    queryKey: scheduleReadKey(workspaceId, selectedDate, view),
  });
}

export interface SaveDraftErrorBody {
  readonly status?: string | null;
  readonly owner_name?: string | null;
  readonly message?: string | null;
  readonly error?: string | null;
  readonly draft_id?: string | null;
}

function asSaveDraftErrorBody(value: unknown): SaveDraftErrorBody | null {
  if (!value || typeof value !== "object") return null;
  return value as SaveDraftErrorBody;
}

function isOverlapConstraintMessage(value: string): boolean {
  return (
    value.includes("shifts_no_employee_overlap_per_draft") ||
    value.includes("shifts_no_employee_overlap_published")
  );
}

export function getSaveDraftFailureMessage(
  value: unknown,
  fallback: string | null = null,
): string | null {
  const body = asSaveDraftErrorBody(value);
  const raw = body?.error ?? body?.message ?? body?.status ?? fallback;
  if (!raw) return null;
  if (body?.status === "stale_baseline" || raw === "stale_baseline") {
    return "The schedule changed while this draft was being saved. Keep editing, review the latest changes, then retry.";
  }
  if (isOverlapConstraintMessage(raw)) {
    return "This draft still has overlapping shifts for the same employee. Adjust or delete the overlap, then save again.";
  }
  return raw;
}

export interface SaveDraftNameConflict {
  readonly draftId: string | null;
  readonly ownerName: string;
}

export function parseSaveDraftNameConflict(
  value: unknown,
): SaveDraftNameConflict | null {
  const body = asSaveDraftErrorBody(value);
  if (body?.status !== "name_owned_by_other") return null;
  return {
    draftId: body.draft_id ?? null,
    ownerName: body.owner_name?.trim() || "another manager",
  };
}
