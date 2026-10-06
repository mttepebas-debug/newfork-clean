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
} from "../schedule-data";
import type { ScheduleMutationContext } from "../lib/scheduleMutationContext";
import { useEditIdleTimer } from "./useEditIdleTimer";

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
  /** The idle timeout ended the edit; the page leaves edit mode. */
  readonly onIdleEnded: () => void;
}

/** The person's Schedule edit session: the lock, its heartbeat and the idle timeout. */
export function useScheduleEditSession({
  userId,
  workspaceId,
  onError,
  onIdleEnded,
}: UseScheduleEditSessionArgs) {
  const [session, setSession] = useState<ScheduleEditSession | null>(null);
  const [conflict, setConflict] = useState<ScheduleLockConflict | null>(null);
  // The page passes fresh callbacks every render; timers read the latest.
  const callbacks = useRef({ onError, onIdleEnded });
  callbacks.current = { onError, onIdleEnded };

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
  const sessionId = session?.id;
  useEffect(() => {
    if (!sessionId) return;
    const heartbeat = window.setInterval(() => {
      if (!workspaceId) return;
      if (Date.now() - lastActivityRef.current >= 15 * 60 * 1000) return;
      void heartbeatScheduleEditSession(workspaceId, sessionId)
        .then(setSession)
        .catch((error: Error) => callbacks.current.onError(error.message));
    }, 60_000);
    return () => window.clearInterval(heartbeat);
  }, [workspaceId, sessionId]);

  const handleIdleActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);
  const handleIdleTimeout = useCallback(() => {
    if (!workspaceId || !session) return;
    void discardScheduleEditSession(workspaceId, session.id).finally(() => {
      setSession(null);
      callbacks.current.onIdleEnded();
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

  return {
    session,
    setSession,
    mutationContext,
    currentMutationContext,
    conflict,
    setConflict,
    acquire,
    idleSeconds,
    keepEditing,
  };
}
