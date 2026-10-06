// Whether this page animates. The decision is made once, before first paint,
// by the inline script in index.html (MOTION_BOOT_SCRIPT below): it sets
// <html data-animate="on"> unless the visitor prefers reduced motion. CSS
// keys every "before" state off that attribute, so without it (reduced
// motion, no JavaScript, a bundle that never loaded) every scene simply
// shows its finished frame.

export const ANIMATE_ATTR = "data-animate";

/**
 * Runs inline in <head>. If the app has not hydrated within 4 s (slow or
 * failed bundle), it gives up on animation so nothing stays hidden.
 * Keep in sync with the CSP hash in vercel.json (a test checks it).
 */
export const MOTION_BOOT_SCRIPT =
  "(function(){var d=document.documentElement;if(window.matchMedia&&!matchMedia('(prefers-reduced-motion: reduce)').matches){d.setAttribute('data-animate','on');setTimeout(function(){if(!d.hasAttribute('data-hydrated'))d.removeAttribute('data-animate')},4000)}})();";

export function motionAllowed(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.getAttribute(ANIMATE_ATTR) === "on";
}

export function markHydrated(): void {
  document.documentElement.setAttribute("data-hydrated", "");
}

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

/** Follows the OS setting if it changes while the page is open. */
export function watchReducedMotion(): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const query = window.matchMedia(REDUCE_QUERY);
  const sync = () => {
    if (query.matches) document.documentElement.removeAttribute(ANIMATE_ATTR);
    else document.documentElement.setAttribute(ANIMATE_ATTR, "on");
    listeners.forEach((listener) => listener());
  };
  query.addEventListener("change", sync);
  return () => query.removeEventListener("change", sync);
}

const listeners = new Set<() => void>();

export function subscribeMotion(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
