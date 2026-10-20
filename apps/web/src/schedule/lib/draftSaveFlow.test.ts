import { QueryClient } from "@tanstack/react-query";
import type { ScheduleDraftSummary } from "@newfork/shared/schedule";
import { describe, expect, it, vi } from "vitest";

import { draftsKey, pendingOpsKey, scheduleReadKey } from "../schedule-data";
import {
  cacheSavedDraftResult,
  clearPendingOpsCachesForDraft,
  getPostSavePreviewDraftId,
  getSaveDraftFailureMessage,
  invalidateScheduleCommitCaches,
  parseSaveDraftNameConflict,
  removeDraft,
  upsertSavedDraft,
  type DraftsCacheSnapshot,
} from "./draftSaveFlow";

function draft(id: string, updatedAt: string): ScheduleDraftSummary {
  return {
    id,
    workspace_id: "11111111-1111-4111-8111-111111111111",
    week_start: "2026-08-17",
    name: `Draft ${id}`,
    revision: 1,
    created_by: "22222222-2222-4222-8222-222222222222",
    updated_by: "22222222-2222-4222-8222-222222222222",
    created_at: "2026-08-17T12:00:00.000Z",
    updated_at: updatedAt,
  };
}

describe("draftSaveFlow", () => {
  it("resolves the preview draft after saving with reference fallback order", () => {
    expect(
      getPostSavePreviewDraftId({
        previousPreviewDraftId: null,
        savedDraftId: "draft-new",
      }),
    ).toBe("draft-new");
    expect(
      getPostSavePreviewDraftId({
        previousPreviewDraftId: "draft-a",
        savedDraftId: undefined,
        targetDraftId: "draft-b",
      }),
    ).toBe("draft-b");
    expect(
      getPostSavePreviewDraftId({
        previousPreviewDraftId: "draft-a",
        savedDraftId: undefined,
      }),
    ).toBe("draft-a");
  });

  it("upserts the saved draft first in the drafts cache", () => {
    const current: DraftsCacheSnapshot = {
      drafts: [
        draft("draft-old", "2026-08-17T11:00:00.000Z"),
        draft("draft-a", "2026-08-17T10:00:00.000Z"),
      ],
    };

    expect(
      upsertSavedDraft(current, draft("draft-a", "2026-08-17T12:00:00.000Z")),
    ).toEqual({
      drafts: [
        draft("draft-a", "2026-08-17T12:00:00.000Z"),
        draft("draft-old", "2026-08-17T11:00:00.000Z"),
      ],
    });
  });

  it("drops a deleted draft from the cached list and keeps the rest in order (BL-313)", () => {
    const current: DraftsCacheSnapshot = {
      drafts: [
        draft("draft-a", "2026-08-17T12:00:00.000Z"),
        draft("draft-b", "2026-08-17T11:00:00.000Z"),
        draft("draft-c", "2026-08-17T10:00:00.000Z"),
      ],
    };

    expect(removeDraft(current, "draft-b")).toEqual({
      drafts: [
        draft("draft-a", "2026-08-17T12:00:00.000Z"),
        draft("draft-c", "2026-08-17T10:00:00.000Z"),
      ],
    });
    expect(removeDraft(undefined, "draft-b")).toEqual({ drafts: [] });
  });

  it("keeps the live week's facts when a draft is saved or deleted (S18)", () => {
    const published = { shift_count: 12, paid_minutes: 5040, open_shift_count: 0 };
    const current: DraftsCacheSnapshot = { drafts: [draft("draft-a", "2026-08-17T12:00:00.000Z")], published };
    expect(upsertSavedDraft(current, draft("draft-b", "2026-08-17T13:00:00.000Z")).published).toEqual(published);
    expect(removeDraft(current, "draft-a")).toEqual({ drafts: [], published });
  });

  it("clears pending op caches for both single-location and multi-location draft keys", () => {
    const queryClient = new QueryClient();
    const singleKey = pendingOpsKey(
      "workspace",
      "2026-08-17",
      "loc-a",
      "draft-a",
    );
    const multiKey = [
      "schedule-pending-ops",
      "workspace",
      "2026-08-17",
      "draft-a",
      "loc-a",
      "loc-b",
    ] as const;
    const otherKey = pendingOpsKey(
      "workspace",
      "2026-08-17",
      "loc-a",
      "draft-b",
    );
    queryClient.setQueryData(singleKey, { pending_ops: [{ id: "op-1" }] });
    queryClient.setQueryData(multiKey, { pending_ops: [{ id: "op-2" }] });
    queryClient.setQueryData(otherKey, { pending_ops: [{ id: "op-3" }] });

    clearPendingOpsCachesForDraft(
      queryClient,
      "workspace",
      "2026-08-17",
      "draft-a",
    );

    expect(queryClient.getQueryData(singleKey)).toEqual({ pending_ops: [] });
    expect(queryClient.getQueryData(multiKey)).toEqual({ pending_ops: [] });
    expect(queryClient.getQueryData(otherKey)).toEqual({
      pending_ops: [{ id: "op-3" }],
    });
  });

  it("caches the saved draft and clears pending operations for the previous draft", () => {
    const queryClient = new QueryClient();
    const draftKey = draftsKey("workspace", "2026-08-17");
    const pendingKey = pendingOpsKey("workspace", "2026-08-17", null, null);
    queryClient.setQueryData(draftKey, { drafts: [] });
    queryClient.setQueryData(pendingKey, { pending_ops: [{ id: "op-1" }] });

    cacheSavedDraftResult({
      queryClient,
      workspaceId: "workspace",
      weekStart: "2026-08-17",
      previousDraftId: null,
      draft: draft("draft-a", "2026-08-17T12:00:00.000Z"),
    });

    expect(queryClient.getQueryData(draftKey)).toMatchObject({
      drafts: [{ id: "draft-a" }],
    });
    expect(queryClient.getQueryData(pendingKey)).toEqual({ pending_ops: [] });
  });

  it("invalidates schedule commit caches after publish or unpublish", () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    invalidateScheduleCommitCaches({
      queryClient,
      workspaceId: "workspace",
      weekStart: "2026-08-17",
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: draftsKey("workspace", "2026-08-17"),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["schedule-pending-ops", "workspace", "2026-08-17"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["schedule-read", "workspace"],
    });
  });

  // BL-278 (4): the read is cached per date, so a commit must reach every
  // date of the week, not only the one on screen.
  it("marks another cached day of the same week stale after a commit", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(scheduleReadKey("workspace", "2026-08-18", "day"), { shifts: [] });

    invalidateScheduleCommitCaches({
      queryClient,
      workspaceId: "workspace",
      weekStart: "2026-08-17",
    });

    expect(queryClient.getQueryState(scheduleReadKey("workspace", "2026-08-18", "day"))?.isInvalidated).toBe(true);
  });

  it("maps overlap save failures to the reference user-facing message", () => {
    expect(
      getSaveDraftFailureMessage({
        error:
          'conflicting key value violates exclusion constraint "shifts_no_employee_overlap_per_draft"',
      }),
    ).toBe(
      "This draft still has overlapping shifts for the same employee. Adjust or delete the overlap, then save again.",
    );
  });

  it("maps stale draft save failures to a recovery message", () => {
    expect(
      getSaveDraftFailureMessage({
        status: "stale_baseline",
      }),
    ).toBe(
      "The schedule changed while this draft was being saved. Keep editing, review the latest changes, then retry.",
    );
  });

  it("parses reference draft name ownership conflicts", () => {
    expect(
      parseSaveDraftNameConflict({
        status: "name_owned_by_other",
        draft_id: "draft-1",
        owner_name: "Sam Manager",
      }),
    ).toEqual({
      draftId: "draft-1",
      ownerName: "Sam Manager",
    });
    expect(
      parseSaveDraftNameConflict({
        status: "name_owned_by_other",
        owner_name: " ",
      }),
    ).toEqual({
      draftId: null,
      ownerName: "another manager",
    });
    expect(parseSaveDraftNameConflict({ status: "failed" })).toBeNull();
  });
});
