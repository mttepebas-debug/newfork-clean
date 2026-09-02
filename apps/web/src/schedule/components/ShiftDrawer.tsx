import { X } from "lucide-react";
import { useEffect, useState, type JSX, type ReactNode } from "react";

import type { DrawerEvent, DrawerState } from "../state/drawerMachine";
import { StaleBlockedView } from "./drawer/StaleBlockedView";
import { VanishedView } from "./drawer/VanishedView";

interface ShiftDrawerProps {
  readonly state: DrawerState;
  readonly title?: string;
  readonly dispatch: (event: DrawerEvent) => void;
  readonly renderForm?: (
    state: Extract<DrawerState, { mode: "create" | "edit" }>,
  ) => ReactNode;
  readonly onReload: () => void;
}

function isDirtyDrawerState(state: DrawerState): boolean {
  return (
    state.kind === "open-dirty" ||
    state.kind === "saving" ||
    state.kind === "error" ||
    state.kind === "conflict-block"
  );
}

function titleForDrawerState(state: DrawerState): string {
  if (state.kind === "shift-vanished") return "Shift removed";
  if (state.kind === "stale-blocked") return "Shift updated elsewhere";
  if ("mode" in state)
    return state.mode === "create" ? "Add shift" : "Edit shift";
  return "Shift";
}

function isFormDrawerState(
  state: DrawerState,
): state is Extract<DrawerState, { mode: "create" | "edit" }> {
  return (
    state.kind === "open-clean" ||
    state.kind === "open-dirty" ||
    state.kind === "saving" ||
    state.kind === "error" ||
    state.kind === "conflict-block" ||
    state.kind === "saved"
  );
}

export function ShiftDrawer({
  state,
  title,
  dispatch,
  renderForm,
  onReload,
}: ShiftDrawerProps): JSX.Element | null {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const open = state.kind !== "closed";

  useEffect(() => {
    if (!open) {
      setConfirmDiscard(false);
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (isDirtyDrawerState(state)) {
        setConfirmDiscard(true);
        return;
      }
      dispatch({ type: "CLOSE" });
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [dispatch, open, state]);

  if (!open) return null;
  const requestClose = () => {
    if (isDirtyDrawerState(state)) {
      setConfirmDiscard(true);
      return;
    }
    dispatch({ type: "CLOSE" });
  };

  const discard = () => {
    setConfirmDiscard(false);
    dispatch({ type: "DISCARD" });
  };

  return (
    <div className="schedule-shift-drawer-layer" role="presentation">
      <button
        type="button"
        className="schedule-shift-drawer-backdrop"
        aria-label="Close shift drawer"
        onClick={requestClose}
      />
      <aside
        className="schedule-shift-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-shift-drawer-title"
        data-shift-drawer-state={state.kind}
      >
        <header>
          <div>
            <h2 id="schedule-shift-drawer-title">
              {title ?? titleForDrawerState(state)}
            </h2>
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close drawer"
          >
            <X size={16} aria-hidden />
          </button>
        </header>
        <div className="schedule-shift-drawer-body">
          {state.kind === "opening" ? (
            <div className="schedule-shift-drawer-status">Loading...</div>
          ) : null}
          {isFormDrawerState(state)
            ? (renderForm?.(state) ?? (
                <div className="schedule-shift-drawer-status">
                  Shift form unavailable.
                </div>
              ))
            : null}
          {state.kind === "shift-vanished" ? (
            <VanishedView state={state} dispatch={dispatch} />
          ) : null}
          {state.kind === "stale-blocked" ? (
            <StaleBlockedView
              state={state}
              dispatch={dispatch}
              onReload={onReload}
            />
          ) : null}
        </div>
        {confirmDiscard ? (
          <div
            className="schedule-shift-drawer-discard"
            role="alertdialog"
            aria-label="Discard unsaved changes?"
          >
            <strong>Discard unsaved changes?</strong>
            <div>
              <button type="button" onClick={() => setConfirmDiscard(false)}>
                Keep editing
              </button>
              <button type="button" className="danger" onClick={discard}>
                Discard
              </button>
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
