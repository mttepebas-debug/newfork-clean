import type {
  ScheduleDraftSummary,
  ScheduleEditSession,
  ScheduleView,
} from "@newfork/shared/schedule";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  discardScheduleEditSession,
  draftsKey,
  pendingOpsKey,
  saveScheduleDraft,
  scheduleEditLockKey,
  scheduleReadKey,
} from "../schedule-data";

export type SaveEditSessionResult =
  | { readonly status: "saved"; readonly draft: ScheduleDraftSummary }
  | { readonly status: "empty" };

export type DiscardEditSessionResult = {
  readonly status: "discarded";
};

interface UseEditSessionActionsArgs {
  readonly workspaceId?: string | null;
  readonly orgId?: string | null;
  readonly weekStart: string;
  readonly selectedDate?: string;
  readonly view?: ScheduleView | "daily" | "weekly";
  readonly session?: ScheduleEditSession | null;
  readonly draft?: ScheduleDraftSummary | null;
  readonly onSaved?: (result: SaveEditSessionResult) => void;
  readonly onDiscarded?: (result: DiscardEditSessionResult) => void;
}

function normalizeScheduleView(view: ScheduleView | "daily" | "weekly"): ScheduleView {
  if (view === "daily") return "day";
  if (view === "weekly") return "week";
  return view;
}

export function useEditSessionActions({
  workspaceId,
  orgId,
  weekStart,
  selectedDate = weekStart,
  view = "weekly",
  session,
  draft = null,
  onSaved,
  onDiscarded,
}: UseEditSessionActionsArgs) {
  const resolvedWorkspaceId = workspaceId ?? orgId ?? null;
  const queryClient = useQueryClient();

  function requireSession(): {
    readonly workspaceId: string;
    readonly session: ScheduleEditSession;
  } {
    if (!resolvedWorkspaceId || !session) {
      throw new Error("Schedule edit lock is not ready");
    }
    return { workspaceId: resolvedWorkspaceId, session };
  }

  function invalidateScheduleEditState(activeDraftId = draft?.id ?? null): void {
    if (!resolvedWorkspaceId) return;
    void queryClient.invalidateQueries({
      queryKey: scheduleReadKey(
        resolvedWorkspaceId,
        selectedDate,
        normalizeScheduleView(view),
      ),
    });
    void queryClient.invalidateQueries({
      queryKey: draftsKey(resolvedWorkspaceId, weekStart),
    });
    void queryClient.invalidateQueries({
      queryKey: pendingOpsKey(resolvedWorkspaceId, weekStart, null, activeDraftId),
    });
    void queryClient.invalidateQueries({
      queryKey: scheduleEditLockKey(resolvedWorkspaceId, weekStart, activeDraftId),
    });
  }

  const save = useMutation<
    SaveEditSessionResult,
    unknown,
    { name?: string; force?: boolean; draft?: ScheduleDraftSummary | null } | void
  >({
    mutationFn: async (input) => {
      const ready = requireSession();
      const targetDraft = input?.draft ?? draft;
      const saved = await saveScheduleDraft(
        ready.workspaceId,
        ready.session,
        input?.name ?? targetDraft?.name ?? "Untitled",
        input?.force ? targetDraft : draft,
      );
      return { status: "saved", draft: saved };
    },
    onSuccess: (result) => {
      invalidateScheduleEditState(
        result.status === "saved" ? result.draft.id : draft?.id ?? null,
      );
      onSaved?.(result);
    },
  });

  const discard = useMutation<DiscardEditSessionResult, unknown, void>({
    mutationFn: async () => {
      const ready = requireSession();
      await discardScheduleEditSession(ready.workspaceId, ready.session.id);
      return { status: "discarded" };
    },
    onSuccess: (result) => {
      invalidateScheduleEditState(session?.source_draft_id ?? draft?.id ?? null);
      onDiscarded?.(result);
    },
  });

  return { save, discard };
}
