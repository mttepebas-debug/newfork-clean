import { useSyncExternalStore } from "react";

// KK-166: "phone" for the screens a computer is required for (KARARLAR "Schedule telefonda tamamen kapalı").
const PHONE_QUERY = "(max-width: 767px)";

function query(): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(PHONE_QUERY)
    : null;
}

function subscribe(onChange: () => void): () => void {
  const list = query();
  list?.addEventListener("change", onChange);
  return () => list?.removeEventListener("change", onChange);
}

/** Whether the window is phone-wide (below 768 px); follows rotation and resizing. */
export function usePhoneWidth(): boolean {
  return useSyncExternalStore(subscribe, () => query()?.matches ?? false, () => false);
}
