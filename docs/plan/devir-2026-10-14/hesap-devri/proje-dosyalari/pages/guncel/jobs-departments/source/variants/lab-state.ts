// Which version of Settings → Jobs the lab shows, and whether the decision
// markers are on. Kept per viewer in localStorage when the browser allows it.
import { useSyncExternalStore } from "react";

export type Variant = "original" | "A";
export interface LabState {
  readonly variant: Variant;
  readonly notes: boolean;
  /** The legend line to open and highlight (a marker was clicked). */
  readonly focus: number | null;
  /** Bumped when a variant button asks the page to show its Departments tab. */
  readonly showDepartments: number;
}

const key = "newfork.jobs-lab.v2";
function read(): LabState {
  try {
    const saved = JSON.parse(window.localStorage.getItem(key) ?? "null") as Partial<LabState> | null;
    const variant = saved?.variant && ["original", "A"].includes(saved.variant) ? saved.variant : "A";
    return { variant, notes: saved?.notes ?? true, focus: null, showDepartments: 0 };
  } catch {
    return { variant: "A", notes: true, focus: null, showDepartments: 0 };
  }
}

let state = read();
const listeners = new Set<() => void>();

export function setLab(change: Partial<LabState>): void {
  state = { ...state, ...change };
  try {
    window.localStorage.setItem(key, JSON.stringify({ variant: state.variant, notes: state.notes }));
  } catch {
    // Storage blocked: the choice lasts for this visit.
  }
  listeners.forEach((listener) => listener());
}

export function useLab(): LabState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}
