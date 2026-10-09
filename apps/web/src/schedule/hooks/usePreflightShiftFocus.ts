import { useEffect } from "react";

export function usePreflightShiftFocus(shiftId: string | null, ready: boolean, finish: (value: null) => void) {
  useEffect(() => {
    if (!shiftId || !ready) return;
    let target: HTMLElement | null = null;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const frame = window.requestAnimationFrame(() => {
      target = document.querySelector<HTMLElement>(`[data-shift-id="${CSS.escape(shiftId)}"]`);
      if (!target) return;
      target.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center", inline: "center" });
      target.classList.add("schedule-preflight-target");
      target.focus({ preventScroll: true });
      timeout = setTimeout(() => finish(null), 1800);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (timeout) clearTimeout(timeout);
      target?.classList.remove("schedule-preflight-target");
    };
  }, [shiftId, ready, finish]);
}
