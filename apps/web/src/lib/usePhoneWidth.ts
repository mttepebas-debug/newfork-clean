import { useSyncExternalStore } from "react";

// KK-166: "phone" for the screens a computer is required for (KARARLAR "Schedule telefonda tamamen kapalı").
const PHONE_QUERY = "(max-width: 767px)";
// The list pages' phone layout (views/list-page.css, `max-width: 720px`).
const LIST_PHONE_QUERY = "(max-width: 720px)";

function query(media: string): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(media)
    : null;
}

// One subscribe function per query, so React does not resubscribe on every render.
const subscribers = new Map<string, (onChange: () => void) => () => void>();

function subscriber(media: string) {
  let subscribe = subscribers.get(media);
  if (!subscribe) {
    subscribe = (onChange) => {
      const list = query(media);
      list?.addEventListener("change", onChange);
      return () => list?.removeEventListener("change", onChange);
    };
    subscribers.set(media, subscribe);
  }
  return subscribe;
}

function useMedia(media: string): boolean {
  return useSyncExternalStore(
    subscriber(media),
    () => query(media)?.matches ?? false,
    () => false,
  );
}

/** Whether the window is phone-wide (below 768 px); follows rotation and resizing. */
export function usePhoneWidth(): boolean {
  return useMedia(PHONE_QUERY);
}

/** Whether a list page shows its phone layout (720 px and below). */
export function useListPhoneWidth(): boolean {
  return useMedia(LIST_PHONE_QUERY);
}
