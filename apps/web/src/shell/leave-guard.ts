import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { registerEmployeeHistoryGuard } from "../employees/employee-history-guard";

// One way to leave a page that holds unsaved work, whatever the page: a link,
// Back or Forward, a navigation the app makes in code (sign out, switching
// workspace) and closing or reloading the tab all ask the page first.
export type Leave = (navigate: () => void) => void;

const applicationGuards = new Set<Leave>();

/** Runs a navigation made in code past every page that holds unsaved work. */
export function requestAppNavigation(navigate: () => void) {
  const guards = [...applicationGuards];
  const next = (index: number) => index < guards.length ? guards[index]!(() => next(index + 1)) : navigate();
  next(0);
}

type Interception = {
  /** Unsaved work is on the page (or its question is open): departures are asked about. */
  readonly active: boolean;
  /** Asks the person; calls navigate if they go. */
  readonly requestLeave: Leave;
  /** Read when the tab closes or reloads: true keeps the browser's own warning. */
  readonly warnOnUnload: () => boolean;
  /**
   * A link or Back that stays on this page is no departure. Without it a link
   * to the same address stays and every Back or Forward leaves.
   */
  readonly staysOnPage?: (url: URL) => boolean;
  /** Set once the person chose to go: what follows is no longer asked about. */
  readonly bypass: MutableRefObject<boolean>;
};

/** Returns whether Back is being put back while the question is open. */
export function useLeaveInterception({ active, requestLeave, warnOnUnload, staysOnPage, bypass }: Interception): boolean {
  const [restoringHistory, setRestoringHistory] = useState(false);
  const latest = useRef({ requestLeave, warnOnUnload, staysOnPage });
  latest.current = { requestLeave, warnOnUnload, staysOnPage };

  useEffect(() => {
    if (!active) return;
    const guarded: Leave = navigate => latest.current.requestLeave(() => { bypass.current = true; navigate(); });
    applicationGuards.add(guarded);
    return () => { applicationGuards.delete(guarded); };
  }, [active, bypass]);

  useEffect(() => {
    if (!active) {
      bypass.current = false;
      return;
    }
    const index = Number(window.history.state?.idx ?? 0);
    let restoring = false;
    const pop = (event: PopStateEvent) => {
      if (bypass.current) return;
      if (restoring) {
        restoring = false;
        setRestoringHistory(false);
        event.stopImmediatePropagation();
        return;
      }
      const nextIndex = Number(event.state?.idx ?? index);
      const delta = nextIndex - index;
      if (!delta) return;
      // The browser already shows the address Back went to.
      if (latest.current.staysOnPage?.(new URL(window.location.href))) return;
      // This registered listener runs before BrowserRouter. Restore the entry
      // first so declining navigation cannot unmount or reset the work.
      event.stopImmediatePropagation();
      restoring = true;
      setRestoringHistory(true);
      window.history.go(-delta);
      latest.current.requestLeave(() => {
        bypass.current = true;
        window.history.go(delta);
      });
    };
    const follow = (event: MouseEvent) => {
      if (
        bypass.current ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = (
        event.target as Element | null
      )?.closest<HTMLAnchorElement>("a[href]");
      if (
        !anchor ||
        anchor.hasAttribute("download") ||
        (anchor.target && anchor.target !== "_self")
      )
        return;
      const url = new URL(anchor.href, window.location.href);
      if (!["http:", "https:"].includes(url.protocol)) return;
      const stays = latest.current.staysOnPage ?? ((target: URL) =>
        target.origin === window.location.origin &&
        target.pathname === window.location.pathname &&
        target.search === window.location.search);
      if (stays(url)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      requestAppNavigation(() => {
        bypass.current = true;
        // The same link again, now let through, so the app's router takes it.
        if (anchor.isConnected) anchor.click();
        else window.location.assign(url.href);
      });
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (bypass.current || !latest.current.warnOnUnload()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const unregister = registerEmployeeHistoryGuard(pop);
    document.addEventListener("click", follow, true);
    window.addEventListener("beforeunload", unload);
    return () => {
      unregister();
      document.removeEventListener("click", follow, true);
      window.removeEventListener("beforeunload", unload);
    };
  }, [active, bypass]);

  return restoringHistory;
}
