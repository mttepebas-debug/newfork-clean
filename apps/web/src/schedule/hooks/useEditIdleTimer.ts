import { useEffect, useState } from "react";

const DEFAULT_WARNING_MS = 15 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

export interface UseEditIdleTimerArgs {
  readonly enabled: boolean;
  readonly onActivity?: () => void;
  readonly onWarning?: () => void;
  readonly onTimeout: () => void;
  readonly warningMs?: number;
  readonly timeoutMs?: number;
}

export function useEditIdleTimer({
  enabled,
  onActivity,
  onWarning,
  onTimeout,
  warningMs = DEFAULT_WARNING_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: UseEditIdleTimerArgs): number | null {
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setSecondsRemaining(null);
      return undefined;
    }

    let lastActivityAt = Date.now();
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
      updateCountdown();
      onWarning?.();
      countdownTimer = window.setInterval(updateCountdown, 1000);
    }

    function arm(): void {
      clearTimers();
      lastActivityAt = Date.now();
      setSecondsRemaining(null);
      onActivity?.();
      warningTimer = window.setTimeout(showWarning, warningMs);
      timeoutTimer = window.setTimeout(() => {
        setSecondsRemaining(0);
        onTimeout();
      }, timeoutMs);
    }

    arm();
    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, arm, { passive: true });
    }

    return () => {
      clearTimers();
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, arm);
      }
    };
  }, [enabled, onActivity, onTimeout, onWarning, timeoutMs, warningMs]);

  return secondsRemaining;
}
