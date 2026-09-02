import type {
  ScheduleEditableShift,
  ScheduleEditSession,
  ScheduleShiftMutationInput,
  ScheduleView,
} from "@newfork/shared/schedule";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";

import {
  createScheduleShift,
  deleteScheduleShift,
  pendingOpsKey,
  scheduleReadKey,
  updateScheduleShift,
} from "../schedule-data";

const RECENT_WRITE_TTL_MS = 5_000;

export interface UpdateShiftMutationInput {
  readonly id: string;
  readonly body: ScheduleShiftMutationInput;
  readonly expectedShiftRevision: number;
}

export interface UseShiftMutationOptions {
  readonly workspaceId?: string | null;
  readonly orgId?: string | null;
  readonly weekStart: string;
  readonly selectedDate?: string;
  readonly view?: ScheduleView | "daily" | "weekly";
  readonly session: ScheduleEditSession | null;
  readonly onSessionChange?: (session: ScheduleEditSession) => void;
  readonly onError?: (error: Error) => void;
}

function normalizeScheduleView(view: ScheduleView | "daily" | "weekly"): ScheduleView {
  if (view === "daily") return "day";
  if (view === "weekly") return "week";
  return view;
}

export function useShiftMutations({
  workspaceId,
  orgId,
  weekStart,
  selectedDate = weekStart,
  view = "weekly",
  session,
  onSessionChange,
  onError,
}: UseShiftMutationOptions) {
  const resolvedWorkspaceId = workspaceId ?? orgId ?? null;
  const queryClient = useQueryClient();
  const recents = useRef<Map<string, number>>(new Map());

  function requireSession(): {
    readonly workspaceId: string;
    readonly session: ScheduleEditSession;
  } {
    if (!resolvedWorkspaceId || !session) {
      throw new Error("Schedule edit lock is not ready");
    }
    return { workspaceId: resolvedWorkspaceId, session };
  }

  function invalidateScheduleState(nextSession: ScheduleEditSession): void {
    if (!resolvedWorkspaceId) return;
    void queryClient.invalidateQueries({
      queryKey: scheduleReadKey(
        resolvedWorkspaceId,
        selectedDate,
        normalizeScheduleView(view),
      ),
    });
    void queryClient.invalidateQueries({
      queryKey: pendingOpsKey(
        resolvedWorkspaceId,
        weekStart,
        null,
        nextSession.source_draft_id,
      ),
    });
  }

  function storeSession(nextSession: ScheduleEditSession): ScheduleEditSession {
    onSessionChange?.(nextSession);
    invalidateScheduleState(nextSession);
    return nextSession;
  }

  function showError(error: unknown): void {
    const caught = error instanceof Error ? error : new Error(String(error));
    onError?.(caught);
  }

  function markRecentWrite(shiftId: string): void {
    recents.current.set(shiftId, Date.now());
    window.setTimeout(() => recents.current.delete(shiftId), RECENT_WRITE_TTL_MS);
  }

  function isRecentWrite(shiftId: string): boolean {
    const writtenAt = recents.current.get(shiftId);
    return Boolean(writtenAt && Date.now() - writtenAt < RECENT_WRITE_TTL_MS);
  }

  const create = useMutation<
    ScheduleEditSession,
    unknown,
    ScheduleShiftMutationInput
  >({
    mutationFn: (body) => {
      const ready = requireSession();
      return createScheduleShift(ready.workspaceId, ready.session, body);
    },
    onSuccess: (nextSession) => {
      const latestShift = nextSession.shifts.at(-1);
      if (latestShift) markRecentWrite(latestShift.id);
      storeSession(nextSession);
    },
    onError: showError,
  });

  const update = useMutation<
    ScheduleEditSession,
    unknown,
    UpdateShiftMutationInput
  >({
    mutationFn: ({ id, body, expectedShiftRevision }) => {
      const ready = requireSession();
      return updateScheduleShift(
        ready.workspaceId,
        ready.session,
        id,
        expectedShiftRevision,
        body,
      );
    },
    onSuccess: (nextSession, vars) => {
      markRecentWrite(vars.id);
      storeSession(nextSession);
    },
    onError: showError,
  });

  const remove = useMutation<ScheduleEditSession, unknown, ScheduleEditableShift>({
    mutationFn: (shift) => {
      const ready = requireSession();
      return deleteScheduleShift(
        ready.workspaceId,
        ready.session,
        shift.id,
        shift.revision,
      );
    },
    onSuccess: (nextSession, shift) => {
      markRecentWrite(shift.id);
      storeSession(nextSession);
    },
    onError: showError,
  });

  const bulkDelete = useMutation<
    ScheduleEditSession,
    unknown,
    readonly ScheduleEditableShift[]
  >({
    mutationFn: async (shifts) => {
      let current = requireSession().session;
      const workspace = requireSession().workspaceId;
      for (const shift of shifts) {
        current = await deleteScheduleShift(
          workspace,
          current,
          shift.id,
          shift.revision,
        );
      }
      return current;
    },
    onSuccess: (nextSession, shifts) => {
      shifts.forEach((shift) => markRecentWrite(shift.id));
      storeSession(nextSession);
    },
    onError: showError,
  });

  return {
    create,
    update,
    remove,
    bulkDelete,
    isRecentWrite,
    markRecentWrite,
  };
}
