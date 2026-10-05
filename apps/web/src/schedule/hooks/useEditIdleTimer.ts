import { useCallback, useEffect, useRef, useState } from "react";

export const EDIT_IDLE_WARNING_MS = 15 * 60 * 1000;
export const EDIT_IDLE_TIMEOUT_MS = 20 * 60 * 1000;
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

export interface UseEditIdleTimerArgs {
  readonly enabled: boolean;
  readonly onActivity?: () => void;
  readonly onWarning?: () => void;
  readonly onTimeout: () => void;
  readonly warningMs?: number;
  readonly timeoutMs?: number;
}

export interface EditIdleTimer {
  readonly secondsRemaining: number | null;
  /** Re-arms the timer; the only way to close an open warning. */
  readonly keepAlive: () => void;
}

export function useEditIdleTimer({
  enabled,
  onActivity,
  onWarning,
  onTimeout,
  warningMs = EDIT_IDLE_WARNING_MS,
  timeoutMs = EDIT_IDLE_TIMEOUT_MS,
}: UseEditIdleTimerArgs): EditIdleTimer {
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const armRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (!enabled) {
      armRef.current = () => undefined;
      setSecondsRemaining(null);
      return undefined;
    }

    let lastActivityAt = Date.now();
    let warningShown = false;
    let warningTimer: number | null = null;
    let timeoutTimer: number | null = null;
    let countdownTimer: number | null = null;

    function clearTimers(): void {
      if (warningTimer !== null) window.clearTimeout(warningTimer);
      if (timeoutTimer !== null) window.clearTimeout(timeoutTimer);
      if (countdownTimer !== null) window.clearInterval(countdownTimer);
      warningTimer = null;
      timeoutTimer = null;
      countdownTimer = null;
    }

    function updateCountdown(): void {
      const elapsed = Date.now() - lastActivityAt;
      const remaining = Math.max(0, Math.ceil((timeoutMs - elapsed) / 1000));
      setSecondsRemaining(remaining);
    }

    function showWarning(): void {
      warningShown = true;
      updateCountdown();
      onWarning?.();
      countdownTimer = window.setInterval(updateCountdown, 1000);
    }

    function arm(): void {
      clearTimers();
      warningShown = false;
      lastActivityAt = Date.now();
      setSecondsRemaining(null);
      onActivity?.();
      warningTimer = window.setTimeout(showWarning, warningMs);
      timeoutTimer = window.setTimeout(() => {
        setSecondsRemaining(0);
        onTimeout();
      }, timeoutMs);
    }

    // While the warning shows, page activity does not re-arm: a press on the
    // warning's own SAVE would otherwise close it before the click lands (BL-607).
    function onPageActivity(): void {
      if (!warningShown) arm();
    }

    armRef.current = arm;
    arm();
    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, onPageActivity, { passive: true });
    }

    return () => {
      clearTimers();
      armRef.current = () => undefined;
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, onPageActivity);
      }
    };
  }, [enabled, onActivity, onTimeout, onWarning, timeoutMs, warningMs]);

  const keepAlive = useCallback(() => armRef.current(), []);

  return { secondsRemaining, keepAlive };
}
