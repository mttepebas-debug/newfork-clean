import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useMemo,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { registerEmployeeHistoryGuard } from "../employees/employee-history-guard";
import "./availability-navigation.css";

type DraftState = { dirty: boolean; busy: boolean; onDiscard?: () => void };
type GuardLabels = { saving: string; discard: string; saved: string; unsaved: string };
const availabilityLabels: GuardLabels = {
  saving: "Saving availability", discard: "Discard availability changes?", saved: "Availability saved",
  unsaved: "Your unsaved hours and review details will be lost. Your saved availability stays in place.",
};
export const timeOffNavigationLabels: GuardLabels = {
  saving: "Saving time off", discard: "Discard time off changes?", saved: "Time off saved",
  unsaved: "Your unsent request and review details will be lost. Approved leave and published assignments stay in place.",
};
type Leave = (navigate: () => void) => void;
const applicationGuards = new Set<Leave>();
export function requestAvailabilityNavigation(navigate: () => void) {
  const guards = [...applicationGuards];
  const next = (index: number) => index < guards.length ? guards[index]!(() => next(index + 1)) : navigate();
  next(0);
}
const DraftScope = createContext<{
  register: (id: string, state: DraftState) => () => void;
  requestLeave: Leave;
} | null>(null);

// One departure decision covers every form on My Availability, including
// several cancellation drafts. Discard is atomic across the mounted forms.
export function AvailabilityDraftScope({ children, labels }: { children: ReactNode; labels?: GuardLabels }) {
  const [drafts, setDrafts] = useState(new Map<string, DraftState>());
  const liveDrafts = useRef(new Map<string, DraftState>());
  const navigationRef: AvailabilityNavigationRef = useRef(null);
  const register = useCallback((id: string, state: DraftState) => {
    liveDrafts.current.set(id,state);
    setDrafts(current => new Map(current).set(id, state));
    return () => {
      liveDrafts.current.delete(id);
      setDrafts(current => { const next = new Map(current); next.delete(id); return next; });
    };
  }, []);
  const readState = useCallback(() => {
    const current = [...liveDrafts.current.values()];
    return {dirty:current.some(state=>state.dirty),busy:current.some(state=>state.busy),
      onDiscard:()=>current.forEach(state=>{if (state.dirty) state.onDiscard?.();})};
  }, []);
  const requestLeave = useCallback<Leave>(navigate => leaveAvailability(navigationRef, navigate), []);
  const scope = useMemo(() => ({register, requestLeave}), [register, requestLeave]);
  const states = [...drafts.values()];
  const dialog = useStandaloneAvailabilityGuard({
    dirty: states.some(state => state.dirty), busy: states.some(state => state.busy), navigationRef, readState,
    onDiscard: () => states.forEach(state => { if (state.dirty) state.onDiscard?.(); }),
    labels: labels ?? { saving:"Saving availability or time off", discard:"Discard availability and time off changes?", saved:"Changes saved",
      unsaved:"All unsaved availability, time off and leave cancellation drafts on this page will be lost. Saved availability, approved leave and published assignments stay in place." },
  });
  return <DraftScope.Provider value={scope}>{children}{dialog}</DraftScope.Provider>;
}

export type AvailabilityNavigationRef = RefObject<{
  requestLeave: (navigate: () => void) => void;
} | null>;

export function leaveAvailability(
  ref: AvailabilityNavigationRef,
  navigate: () => void,
) {
  if (ref.current) ref.current.requestLeave(navigate);
  else navigate();
}

// The panel owns its draft; hosts supply this ref for actions that change local
// state or call navigate() without following an anchor (drawer tabs/onboarding).
type NavigationOptions = DraftState & { navigationRef?: AvailabilityNavigationRef; labels?: GuardLabels; readState?: () => DraftState };
export function useAvailabilityNavigationGuard(options: NavigationOptions) {
  const scope = useContext(DraftScope);
  const id = useId();
  const latest = useRef(options);
  latest.current = options;
  const discard = useCallback(() => latest.current.onDiscard?.(), []);
  useEffect(() => scope?.register(id, {dirty:options.dirty,busy:options.busy,onDiscard:discard}), [scope,id,options.dirty,options.busy,discard]);
  useEffect(() => {
    if (!scope || !options.navigationRef) return;
    const ref = options.navigationRef;
    const guard = {requestLeave:scope.requestLeave};
    ref.current = guard;
    return () => { if (ref.current === guard) ref.current = null; };
  }, [scope,options.navigationRef]);
  const dialog = useStandaloneAvailabilityGuard({ ...options,
    dirty:scope ? false : options.dirty, busy:scope ? false : options.busy,
    navigationRef:scope ? undefined : options.navigationRef,
  });
  return scope ? null : dialog;
}

function useStandaloneAvailabilityGuard({
  dirty,
  busy,
  navigationRef,
  onDiscard,
  labels = availabilityLabels,
  readState,
}: NavigationOptions) {
  const latest = useRef({ dirty, busy, onDiscard, readState });
  latest.current = { dirty, busy, onDiscard, readState };
  // A child can unmount on save before its scope's queued state update renders.
  // Read the live registry for actions so the old busy state cannot intercept
  // the very next click or keep a completed form's departure pending.
  const readLatest = useCallback(() => latest.current.readState?.() ?? latest.current, []);
  const bypass = useRef(false);
  const pending = useRef<(() => void) | null>(null);
  const [open, setOpen] = useState(false);
  const [restoringHistory, setRestoringHistory] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const requestLeave = useCallback((navigate: () => void) => {
    const current = readLatest();
    if (bypass.current || (!current.dirty && !current.busy)) {
      pending.current = null;
      setOpen(false);
      navigate();
      return;
    }
    if (pending.current) return;
    pending.current = navigate;
    setOpen(true);
  }, [readLatest]);
  const stay = useCallback(() => {
    pending.current = null;
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!navigationRef) return;
    const guard = { requestLeave };
    navigationRef.current = guard;
    return () => {
      if (navigationRef.current === guard) navigationRef.current = null;
    };
  }, [navigationRef, requestLeave]);

  const active = dirty || busy || open;
  useEffect(() => {
    if (!active) return;
    const guarded: Leave = navigate => requestLeave(() => { bypass.current = true; navigate(); });
    applicationGuards.add(guarded);
    return () => { applicationGuards.delete(guarded); };
  }, [active,requestLeave]);
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
      // This registered listener runs before BrowserRouter. Restore the entry
      // first so declining navigation cannot unmount or reset the draft.
      event.stopImmediatePropagation();
      restoring = true;
      setRestoringHistory(true);
      window.history.go(-delta);
      requestLeave(() => {
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
      if (
        !["http:", "https:"].includes(url.protocol) ||
        (url.origin === window.location.origin &&
          url.pathname === window.location.pathname &&
          url.search === window.location.search)
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      requestAvailabilityNavigation(() => {
        bypass.current = true;
        window.location.assign(url.href);
      });
    };
    const unload = (event: BeforeUnloadEvent) => {
      const current = readLatest();
      if (bypass.current || (!current.dirty && !current.busy))
        return;
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
  }, [active, requestLeave, readLatest]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        stay();
      } else if (event.key === "Tab") {
        const buttons = Array.from(
          dialog.current?.querySelectorAll<HTMLButtonElement>(
            "button:not(:disabled)",
          ) ?? [],
        );
        const first = buttons[0];
        const last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    const focus = (event: FocusEvent) => {
      if (!dialog.current?.contains(event.target as Node)) {
        dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    };
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("focusin", focus);
    return () => {
      document.removeEventListener("keydown", keydown, true);
      document.removeEventListener("focusin", focus);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open, stay]);

  return open
    ? createPortal(
        <div className="availability-navigation-backdrop">
          <div
            ref={dialog}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            className="availability-navigation-dialog"
          >
            <h2 id={titleId}>
              {busy
                ? labels.saving
                : dirty
                  ? labels.discard
                  : labels.saved}
            </h2>
            <p id={descriptionId}>
              {busy
                ? "Wait for the result before leaving. Your changes are still being processed."
                : dirty
                  ? labels.unsaved
                  : "Your changes have been saved. You can continue to the page you selected."}
            </p>
            <div className="availability-actions">
              <button type="button" onClick={stay}>
                Stay here
              </button>
              <button
                type="button"
                disabled={busy || restoringHistory}
                onClick={() => {
                  const current = readLatest();
                  if (current.busy || restoringHistory) return;
                  const navigate = pending.current;
                  pending.current = null;
                  if (current.dirty) current.onDiscard?.();
                  setOpen(false);
                  navigate?.();
                }}
              >
                {dirty ? "Discard and leave" : "Continue"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;
}
