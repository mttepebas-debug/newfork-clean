import type {
  ScheduleEditAcquireResult,
  ScheduleEditSession,
  ScheduleEditSource,
} from "@newfork/shared/schedule";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  acquireScheduleEditSession,
  autosaveScheduleEditSession,
  discardScheduleEditSession,
  heartbeatScheduleEditSession,
  isEditLeaseExpired,
  isEditSessionClosed,
  isScheduleAccessRefused,
} from "../schedule-data";
import type { ScheduleMutationContext } from "../lib/scheduleMutationContext";
import { EDIT_IDLE_TIMEOUT_MS, useEditIdleTimer } from "./useEditIdleTimer";
import { requestErrorText, ScreenError } from "../../lib/request-error";

export const EDIT_NOT_RECONNECTED =
  "Your edit could not be reconnected. Check your connection and try again.";

const EDIT_REFUSED = "You can no longer edit this schedule, so your edit closed.";
export const EDIT_ENDED_AWAY = "Your edit ended while you were away. Open the schedule again to keep editing.";

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
  /** S1: the idle countdown ended and the work was kept as this draft. */
  readonly onAutoSaved?: (draftName: string) => void;
  /** D-O9: opening put a lapsed edit's unsaved work into this draft. */
  readonly onRecovered?: (draftName: string) => void;
}

/** The person's Schedule edit session: the lock, its heartbeat and the idle timeout. */
export function useScheduleEditSession({
  userId,
  workspaceId,
  onError,
  onEnded,
  onAutoSaved,
  onRecovered,
}: UseScheduleEditSessionArgs) {
  const [session, setSession] = useState<ScheduleEditSession | null>(null);
  const [conflict, setConflict] = useState<ScheduleLockConflict | null>(null);
  // The page passes fresh callbacks every render; timers read the latest.
  const callbacks = useRef({ onError, onEnded, onAutoSaved, onRecovered });
  callbacks.current = { onError, onEnded, onAutoSaved, onRecovered };
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
  // Reads the session through the ref: a heartbeat's fresh copy must not re-arm the idle timer.
  // S1: the work is kept as an "Auto-save" draft, never thrown away.
  const handleIdleTimeout = useCallback(() => {
    const current = sessionRef.current;
    if (!workspaceId || !current) return;
    void autosaveScheduleEditSession(workspaceId, current.id)
      .then((result) => {
        if (result.status === "saved") callbacks.current.onAutoSaved?.(result.draft_name);
      })
      .catch((error: Error) => callbacks.current.onError(
        isScheduleAccessRefused(error) ? EDIT_REFUSED : requestErrorText(error),
      ))
      .finally(() => {
        setSession(null);
        callbacks.current.onEnded();
      });
  }, [workspaceId]);
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
        if (result.status === "acquired_after_recovery" && result.recovered_draft_name) {
          callbacks.current.onRecovered?.(result.recovered_draft_name);
        }
        return result;
      } catch (error) {
        if (acquireRequestRef.current === requestId) {
          // DB-1a: an unknown or no longer reachable draft gets the core's refusal.
          callbacks.current.onError(
            source === "draft" && isScheduleAccessRefused(error)
              ? "This draft is no longer available to you."
              : requestErrorText(error),
          );
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
   * D-Y3: a lapsed lock is picked back up by the same person: the server resumes
   * their own open edit. Anything else (someone else holds it, or the server
   * opened a new edit because the old one was closed) ends this edit rather
   * than passing a different session off as the same work. Null when not resumed.
   */
  const recoverLease = useCallback(async (): Promise<ScheduleEditSession | null> => {
    const current = sessionRef.current;
    if (!workspaceId || !current) return null;
    let result: ScheduleEditAcquireResult;
    try {
      result = await acquireScheduleEditSession(
        workspaceId,
        current.week_start,
        current.source_kind,
        current.source_draft_id,
        current.location_ids,
      );
    } catch {
      return null;
    }
    if (sessionRef.current?.id !== current.id) return null;
    if (result.status === "resumed" && result.session.id === current.id) {
      setSession(result.session);
      return result.session;
    }
    if (result.status === "conflict") {
      setConflict({
        sessionId: result.session_id,
        holderName: result.holder_name,
        lastHeartbeat: result.last_heartbeat,
        expiresAt: result.expires_at,
        source: current.source_kind,
        draftId: current.source_draft_id,
      });
    } else {
      void discardScheduleEditSession(workspaceId, result.session.id).catch(() => undefined);
      callbacks.current.onError(EDIT_ENDED_AWAY);
    }
    setSession(null);
    callbacks.current.onEnded();
    return null;
  }, [workspaceId]);

  /**
   * EKRAN-01 B3: an edit closed elsewhere (saved, discarded, or set aside when
   * the same person opened another) ends here. Opening it again would set the
   * other edit aside in turn, so it is never "recovered".
   */
  const endClosedEdit = useCallback(() => {
    setSession(null);
    callbacks.current.onEnded();
  }, []);

  /**
   * Runs a change; if its lock lapsed, picks the edit back up and tries once
   * more. A second lapse reads as a plain sentence, never the raw lock text.
   */
  const runWithLease = useCallback(async <T,>(action: () => Promise<T>): Promise<T> => {
    try {
      return await action();
    } catch (error) {
      if (isEditSessionClosed(error)) {
        endClosedEdit();
        throw new ScreenError(EDIT_ENDED_AWAY);
      }
      if (!isEditLeaseExpired(error) || !(await recoverLease())) throw error;
    }
    try {
      return await action();
    } catch (error) {
      if (isEditLeaseExpired(error)) throw new ScreenError(EDIT_NOT_RECONNECTED);
      if (isEditSessionClosed(error)) {
        endClosedEdit();
        throw new ScreenError(EDIT_ENDED_AWAY);
      }
      throw error;
    }
  }, [recoverLease, endClosedEdit]);

  // The lock lives as long as the idle countdown: it may not lapse while
  // Keep editing? still offers to keep the work.
  const sessionId = session?.id;
  useEffect(() => {
    if (!sessionId) return;
    const heartbeat = window.setInterval(() => {
      if (!workspaceId) return;
      if (Date.now() - lastActivityRef.current >= EDIT_IDLE_TIMEOUT_MS) return;
      void heartbeatScheduleEditSession(workspaceId, sessionId)
        .then((next) => {
          // An answer arriving after the edit ended (Discard, Save) does not bring it back.
          if (sessionRef.current?.id === sessionId) setSession(next);
        })
        .catch((error: Error) => {
          if (sessionRef.current?.id !== sessionId) return;
          if (isEditLeaseExpired(error)) void recoverLease();
          else if (isEditSessionClosed(error)) {
            callbacks.current.onError(EDIT_ENDED_AWAY);
            endClosedEdit();
          } else if (isScheduleAccessRefused(error)) {
            // DB-1a: the person's scope shrank; the edit cannot go on.
            callbacks.current.onError(EDIT_REFUSED);
            setSession(null);
            callbacks.current.onEnded();
          } else callbacks.current.onError(requestErrorText(error));
        });
    }, 60_000);
    return () => window.clearInterval(heartbeat);
  }, [workspaceId, sessionId, recoverLease, endClosedEdit]);

  return {
    session,
    setSession,
    mutationContext,
    currentMutationContext,
    conflict,
    setConflict,
    acquire,
    recoverLease,
    runWithLease,
    endClosedEdit,
    idleSeconds,
    keepEditing,
  };
}
