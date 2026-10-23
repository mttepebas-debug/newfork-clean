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
import { useLeaveInterception, type Leave } from "../shell/leave-guard";
import { ConfirmDialog } from "../shell/ConfirmDialog";

type DraftState = { dirty: boolean; busy: boolean; onDiscard?: () => void };
type GuardLabels = { saving: string; discard: string; saved: string; unsaved: string };
const availabilityLabels: GuardLabels = {
  saving: "Saving availability", discard: "Discard availability changes?", saved: "Availability saved",
  unsaved: "Your unsaved hours will be lost. Your saved availability stays in place.",
};
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
  const pending = useRef<(() => void) | null>(null);
  const [open, setOpen] = useState(false);
  const bypass = useRef(false);
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

  const restoringHistory = useLeaveInterception({
    active: dirty || busy || open,
    requestLeave,
    warnOnUnload: () => {
      const current = readLatest();
      return current.dirty || current.busy;
    },
    bypass,
  });

  return (
    <ConfirmDialog
      open={open}
      title={busy ? labels.saving : dirty ? labels.discard : labels.saved}
      description={
        busy
          ? "Wait for the result before leaving. Your changes are still being processed."
          : dirty
            ? labels.unsaved
            : "Your changes have been saved. You can continue to the page you selected."
      }
      cancelLabel="Stay here"
      confirmLabel={dirty ? "Discard and leave" : "Continue"}
      destructive={dirty}
      // Not `busy`: Stay and Escape must still work while a save runs.
      confirmDisabled={busy || restoringHistory}
      onCancel={stay}
      onConfirm={() => {
        const current = readLatest();
        if (current.busy || restoringHistory) return;
        const navigate = pending.current;
        pending.current = null;
        if (current.dirty) current.onDiscard?.();
        setOpen(false);
        navigate?.();
      }}
    />
  );
}
