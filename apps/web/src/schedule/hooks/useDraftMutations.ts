import type {
  ScheduleDraftSummary,
  ScheduleEditSession,
  SchedulePublicationOverrideInput,
  SchedulePublicationPreflightAck,
  SchedulePublicationPreview,
  SchedulePublishResult,
  ScheduleUnpublishPreview,
  ScheduleUnpublishResult,
  ScheduleView,
} from "@newfork/shared/schedule";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  deleteScheduleDraft,
  discardScheduleEditSession,
  draftsKey,
  pendingOpsKey,
  publishScheduleDraft,
  saveScheduleDraft,
  scheduleReadKey,
  unpublishSchedule,
} from "../schedule-data";
import {
  clearPendingOpsCachesForDraft,
} from "../lib/draftSaveFlow";

interface UseDraftMutationsArgs {
  readonly workspaceId?: string | null;
  readonly orgId?: string | null;
  readonly weekStart: string;
  readonly selectedDate?: string;
  readonly view?: ScheduleView | "daily" | "weekly";
  readonly locationIds: readonly string[];
  readonly draftId: string | null;
  readonly session?: ScheduleEditSession | null;
}

function normalizeScheduleView(view: ScheduleView | "daily" | "weekly"): ScheduleView {
  if (view === "daily") return "day";
  if (view === "weekly") return "week";
  return view;
}

export function useDraftMutations({
  workspaceId,
  orgId,
  weekStart,
  selectedDate = weekStart,
  view = "weekly",
  locationIds: _locationIds,
  draftId,
  session,
}: UseDraftMutationsArgs) {
  const resolvedWorkspaceId = workspaceId ?? orgId ?? null;
  const queryClient = useQueryClient();

  function requireWorkspace(): string {
    if (!resolvedWorkspaceId) throw new Error("Organization is not ready");
    return resolvedWorkspaceId;
  }

  function requireSession(): ScheduleEditSession {
    if (!session) throw new Error("No active edit lock");
    return session;
  }

  function invalidateDraftState(nextDraftId = draftId): void {
    const workspace = resolvedWorkspaceId;
    if (!workspace) return;
    void queryClient.invalidateQueries({
      queryKey: draftsKey(workspace, weekStart),
      refetchType: "inactive",
    });
    void queryClient.invalidateQueries({
      queryKey: scheduleReadKey(workspace, selectedDate, normalizeScheduleView(view)),
      refetchType: "inactive",
    });
    void queryClient.invalidateQueries({
      queryKey: pendingOpsKey(workspace, weekStart, null, nextDraftId),
      refetchType: "inactive",
    });
  }

  const save = useMutation<
    ScheduleDraftSummary,
    unknown,
    { name: string; force?: boolean; draft?: ScheduleDraftSummary | null }
  >({
    mutationFn: (input) =>
      saveScheduleDraft(
        requireWorkspace(),
        requireSession(),
        input.name,
        input.force ? (input.draft ?? null) : null,
      ),
    onSuccess: (saved) => invalidateDraftState(saved.id),
  });

  const discard = useMutation<void, unknown, void>({
    mutationFn: () =>
      discardScheduleEditSession(requireWorkspace(), requireSession().id),
    onSuccess: () => invalidateDraftState(session?.source_draft_id ?? draftId),
  });

  const remove = useMutation<
    Awaited<ReturnType<typeof deleteScheduleDraft>>,
    unknown,
    string
  >({
    mutationFn: (id) => deleteScheduleDraft(requireWorkspace(), id),
    onSuccess: (result, removedDraftId) =>
      invalidateDraftState(result.draft_id ?? removedDraftId),
  });

  const publish = useMutation<
    SchedulePublishResult,
    unknown,
    {
      preview: SchedulePublicationPreview;
      overrides?: SchedulePublicationOverrideInput[];
      notifyEmployeeIds?: readonly string[];
      preflightAck?: SchedulePublicationPreflightAck;
    }
  >({
    mutationFn: ({ preview, overrides = [], notifyEmployeeIds, preflightAck }) =>
      publishScheduleDraft(
        requireWorkspace(),
        preview,
        overrides,
        notifyEmployeeIds,
        preflightAck,
      ),
    onSuccess: (result, vars) => {
      const workspace = resolvedWorkspaceId;
      if (workspace && result.status === "published") {
        clearPendingOpsCachesForDraft(
          queryClient,
          workspace,
          weekStart,
          vars.preview.draft_id,
        );
      }
      invalidateDraftState(vars.preview.draft_id);
    },
  });

  const unpublish = useMutation<
    ScheduleUnpublishResult,
    unknown,
    ScheduleUnpublishPreview
  >({
    mutationFn: (preview) => unpublishSchedule(requireWorkspace(), preview),
    onSuccess: (_result) => {
      invalidateDraftState(draftId);
    },
  });

  return { save, discard, remove, publish, unpublish };
}
