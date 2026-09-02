import type {
  ScheduleEditAcquireResult,
  ScheduleEditSession,
  ScheduleEditSource,
} from "@newfork/shared/schedule";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  acquireScheduleEditSession,
  discardScheduleEditSession,
  draftsKey,
  heartbeatScheduleEditSession,
  pendingOpsKey,
  scheduleEditLockKey,
  takeoverScheduleEditSession,
} from "../schedule-data";

const HEARTBEAT_MS = 30_000;

export interface UseEditLockArgs {
  readonly workspaceId?: string | null;
  readonly orgId?: string | null;
  readonly weekStart: string;
  readonly locationId?: string | null;
  readonly draftId?: string | null;
  readonly mode?: "preview" | "edit";
  readonly sourceKind?: ScheduleEditSource;
}

export interface UseEditLockResult {
  readonly lock: ScheduleEditAcquireResult | null;
  readonly session: ScheduleEditSession | null;
  readonly isHolder: boolean;
  readonly acquire: ReturnType<
    typeof useMutation<ScheduleEditAcquireResult, unknown, void>
  >;
  readonly acquireForDraft: (
    draftId: string | null,
  ) => Promise<ScheduleEditAcquireResult>;
  readonly heartbeat: ReturnType<
    typeof useMutation<ScheduleEditSession, unknown, void>
  >;
  readonly release: ReturnType<typeof useMutation<void, unknown, void>>;
  readonly takeover: ReturnType<
    typeof useMutation<ScheduleEditAcquireResult, unknown, void>
  >;
}

function sourceForDraft(
  sourceKind: ScheduleEditSource | undefined,
  draftId: string | null,
): ScheduleEditSource {
  if (sourceKind) return sourceKind;
  return draftId ? "draft" : "published";
}

export function useEditLock({
  workspaceId,
  orgId,
  weekStart,
  draftId = null,
  mode = "preview",
  sourceKind,
}: UseEditLockArgs): UseEditLockResult {
  const resolvedWorkspaceId = workspaceId ?? orgId ?? null;
  const queryClient = useQueryClient();
  const [lock, setLock] = useState<ScheduleEditAcquireResult | null>(null);
  const [session, setSession] = useState<ScheduleEditSession | null>(null);
  const sessionRef = useRef<ScheduleEditSession | null>(null);
  sessionRef.current = session;

  const activeSourceKind = useMemo(
    () => sourceForDraft(sourceKind, draftId),
    [draftId, sourceKind],
  );

  function requireWorkspace(): string {
    if (!resolvedWorkspaceId)
      throw new Error("Schedule edit scope is not ready");
    return resolvedWorkspaceId;
  }

  function storeAcquireResult(
    result: ScheduleEditAcquireResult,
  ): ScheduleEditAcquireResult {
    setLock(result);
    if (result.status !== "conflict") {
      setSession(result.session);
      invalidateEditState(result.session.source_draft_id);
    }
    return result;
  }

  function invalidateEditState(activeDraftId = draftId): void {
    if (!resolvedWorkspaceId) return;
    void queryClient.invalidateQueries({
      queryKey: scheduleEditLockKey(
        resolvedWorkspaceId,
        weekStart,
        activeDraftId,
      ),
    });
    void queryClient.invalidateQueries({
      queryKey: pendingOpsKey(
        resolvedWorkspaceId,
        weekStart,
        null,
        activeDraftId,
      ),
    });
    void queryClient.invalidateQueries({
      queryKey: draftsKey(resolvedWorkspaceId, weekStart),
    });
  }

  const acquire = useMutation<ScheduleEditAcquireResult, unknown, void>({
    mutationFn: () =>
      acquireScheduleEditSession(
        requireWorkspace(),
        weekStart,
        activeSourceKind,
        draftId,
      ),
    onSuccess: storeAcquireResult,
  });

  async function acquireForDraft(
    targetDraftId: string | null,
  ): Promise<ScheduleEditAcquireResult> {
    const result = await acquireScheduleEditSession(
      requireWorkspace(),
      weekStart,
      sourceForDraft(undefined, targetDraftId),
      targetDraftId,
    );
    return storeAcquireResult(result);
  }

  const heartbeat = useMutation<ScheduleEditSession, unknown, void>({
    mutationFn: () => {
      const current = sessionRef.current;
      if (!current) throw new Error("Schedule edit lock is not ready");
      return heartbeatScheduleEditSession(requireWorkspace(), current.id);
    },
    onSuccess: (nextSession) => {
      setSession(nextSession);
      setLock({ status: "resumed", session: nextSession });
    },
  });

  const release = useMutation<void, unknown, void>({
    mutationFn: async () => {
      const current = sessionRef.current;
      if (!current) throw new Error("Schedule edit lock is not ready");
      await discardScheduleEditSession(requireWorkspace(), current.id);
    },
    onSuccess: () => {
      const releasedDraftId = sessionRef.current?.source_draft_id ?? draftId;
      setLock(null);
      setSession(null);
      invalidateEditState(releasedDraftId);
    },
  });

  const takeover = useMutation<ScheduleEditAcquireResult, unknown, void>({
    mutationFn: () => {
      const conflictSessionId =
        lock?.status === "conflict" ? (lock.session_id ?? null) : null;
      const currentSessionId = sessionRef.current?.id ?? conflictSessionId;
      if (!currentSessionId) throw new Error("Schedule edit lock is not ready");
      return takeoverScheduleEditSession(requireWorkspace(), currentSessionId);
    },
    onSuccess: storeAcquireResult,
  });

  const isHolder = mode === "edit" && Boolean(session);

  useEffect(() => {
    if (!isHolder) return undefined;
    const timer = window.setInterval(() => heartbeat.mutate(), HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [heartbeat, isHolder]);

  useEffect(
    () => () => {
      const current = sessionRef.current;
      if (!resolvedWorkspaceId || !current) return;
      void discardScheduleEditSession(resolvedWorkspaceId, current.id);
    },
    [resolvedWorkspaceId],
  );

  return {
    lock,
    session,
    isHolder,
    acquire,
    acquireForDraft,
    heartbeat,
    release,
    takeover,
  };
}
