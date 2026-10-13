import { useCallback, useRef, useState } from "react";
import { useLeaveInterception, type Leave } from "../../shell/leave-guard";

/**
 * Mert 2026-10-12: leaving Schedule with unsaved edit work asks first (Keep
 * editing, Discard and leave, Save draft) whichever way the person leaves: a
 * link, the sidebar, Back, switching workspace, signing out; closing or
 * reloading the tab keeps the browser's own warning. Moving between weeks,
 * days and filters stays on the page and is never asked about (KK-164).
 */
export function useScheduleLeaveGuard(unsaved: boolean) {
  const [leaving, setLeaving] = useState<{ readonly go: () => void } | null>(null);
  const bypass = useRef(false);
  const latest = useRef(unsaved);
  latest.current = unsaved;
  // The page's own address: links and Back that stay on it are no departure.
  const [pagePath] = useState(() => window.location.pathname);

  const requestLeave = useCallback<Leave>((navigate) => {
    if (bypass.current || !latest.current) {
      setLeaving(null);
      navigate();
      return;
    }
    setLeaving((current) => current ?? { go: navigate });
  }, []);

  const restoringHistory = useLeaveInterception({
    active: unsaved || leaving !== null,
    requestLeave,
    warnOnUnload: () => latest.current,
    staysOnPage: (url) => url.origin === window.location.origin && url.pathname === pagePath,
    bypass,
  });

  return {
    /** The question is open. */
    open: leaving !== null,
    /** Back is still being put back; the answers that leave wait for it. */
    restoringHistory,
    /** Keep editing: nothing happens. */
    stay: useCallback(() => setLeaving(null), []),
    /**
     * Closes the question and hands back the departure, to run once the work
     * is saved (Save draft). Null when there is none.
     */
    take: useCallback(() => {
      const departure = leaving;
      setLeaving(null);
      return departure?.go ?? null;
    }, [leaving]),
  };
}
