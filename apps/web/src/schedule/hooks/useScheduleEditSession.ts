import type {
  ScheduleEditAcquireResult,
  ScheduleEditSession,
  ScheduleEditSource,
} from "@newfork/shared/schedule";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  acquireScheduleEditSession,
  discardScheduleEditSession,
  heartbeatScheduleEditSession,
  isEditLeaseExpired,
} from "../schedule-data";
import type { ScheduleMutationContext } from "../lib/scheduleMutationContext";
import { EDIT_IDLE_TIMEOUT_MS, useEditIdleTimer } from "./useEditIdleTimer";

export interface ScheduleLockConflict {
  readonly sessionId?: string;
  readonly holderName: string;
  readonly lastHeartbeat: string;
  readonly expiresAt: string;
  readonly source: ScheduleEditSource;
  readonly draftId: string | null;
}

export interface UseScheduleEditSessionArgs {
  readonly userId: string | undefined;
  readonly workspaceId: string | undefined;
  readonly onError: (message: string) => void;
  /** The edit ended (idle timeout, or its lock went to someone else); the page leaves edit mode. */
  readonly onEnded: () => void;
}

/** The person's Schedule edit session: the lock, its heartbeat and the idle timeout. */
export function useScheduleEditSession({
  userId,
  workspaceId,
  onError,
  onEnded,
}: UseScheduleEditSessionArgs) {
  const [session, setSession] = useState<ScheduleEditSession | null>(null);
  const [conflict, setConflict] = useState<ScheduleLockConflict | null>(null);
  // The page passes fresh callbacks every render; timers read the latest.
  const callbacks = useRef({ onError, onEnded });
  callbacks.current = { onError, onEnded };
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // A context transition must invalidate old saves even if the same session is later resumed.
  const mutationContext = useMemo<ScheduleMutationContext>(() => ({
    userId, workspaceId,
    sessionId: session?.id, revision: session?.revision,
  }), [userId, workspaceId, session?.id, session?.revision]);
  const currentMutationContext = useRef<ScheduleMutationContext | null>(mutationContext);
  currentMutationContext.current = mutationContext;
  useEffect(() => {
    currentMutationContext.current = mutationContext;
    return () => { currentMutationContext.current = null; };
  }, [mutationContext]);

  const lastActivityRef = useRef(Date.now());
  const handleIdleActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);
  const handleIdleTimeout = useCallback(() => {
    if (!workspaceId || !session) return;
    void discardScheduleEditSession(workspaceId, session.id).finally(() => {
      setSession(null);
      callbacks.current.onEnded();
    });
  }, [workspaceId, session]);
  const { secondsRemaining: idleSeconds, keepAlive: keepEditing } = useEditIdleTimer({
    enabled: Boolean(session),
    onActivity: handleIdleActivity,
    onTimeout: handleIdleTimeout,
  });

  const acquireRequestRef = useRef<symbol | null>(null);
  /** Takes (or resumes) the edit lock; null when the answer is stale or failed. */
  const acquire = useCallback(
    async (
      weekStart: string,
      source: ScheduleEditSource,
      draftId: string | null,
      locationIds: readonly string[] | null,
    ): Promise<ScheduleEditAcquireResult | null> => {
      if (!workspaceId) return null;
      const requestId = Symbol(
        source === "published"
          ? "schedule-live-edit-acquire"
          : "schedule-edit-acquire",
      );
      acquireRequestRef.current = requestId;
      try {
        const result = await acquireScheduleEditSession(
          workspaceId,
          weekStart,
          source,
          draftId,
          locationIds,
        );
        if (acquireRequestRef.current !== requestId) return null;
        if (result.status === "conflict") {
          setConflict({
            sessionId: result.session_id,
            holderName: result.holder_name,
            lastHeartbeat: result.last_heartbeat,
            expiresAt: result.expires_at,
            source,
            draftId,
          });
          return result;
        }
        setSession(result.session);
        setConflict(null);
        return result;
      } catch (error) {
        if (acquireRequestRef.current === requestId) {
          callbacks.current.onError((error as Error).message);
        }
        return null;
      } finally {
        if (acquireRequestRef.current === requestId) {
          acquireRequestRef.current = null;
        }
      }
    },
    [workspaceId],
  );

  /**
   * D-Y3: a lapsed lock is picked back up by the same person (the server resumes
   * their own edit). Null when it went to someone else or could not be reached.
   */
  const recoverLease = useCallback(async (): Promise<ScheduleEditSession | null> => {
    const current = sessionRef.current;
    if (!current) return null;
    const result = await acquire(
      current.week_start,
      current.source_kind,
      current.source_draft_id,
      current.location_ids,
    );
    if (result?.status === "conflict") {
      setSession(null);
      callbacks.current.onEnded();
      return null;
    }
    return result?.session ?? null;
  }, [acquire]);

  // The lock lives as long as the idle countdown: it may not lapse while
  // Keep editing? still offers to keep the work.
  const sessionId = session?.id;
  useEffect(() => {
    if (!sessionId) return;
    const heartbeat = window.setInterval(() => {
      if (!workspaceId) return;
      if (Date.now() - lastActivityRef.current >= EDIT_IDLE_TIMEOUT_MS) return;
      void heartbeatScheduleEditSession(workspaceId, sessionId)
        .then(setSession)
        .catch((error: Error) => {
          if (isEditLeaseExpired(error)) void recoverLease();
          else callbacks.current.onError(error.message);
        });
    }, 60_000);
    return () => window.clearInterval(heartbeat);
  }, [workspaceId, sessionId, recoverLease]);

  return {
    session,
    setSession,
    mutationContext,
    currentMutationContext,
    conflict,
    setConflict,
    acquire,
    recoverLease,
    idleSeconds,
    keepEditing,
  };
}
