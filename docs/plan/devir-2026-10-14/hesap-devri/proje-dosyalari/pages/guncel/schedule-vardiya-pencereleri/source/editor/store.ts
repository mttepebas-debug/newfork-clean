// What the "Test page" menu has chosen for the shift windows (items 11–14).
// "main" is always the original from main, so every variant sits next to it.
// Choices are remembered per browser.
import { useSyncExternalStore } from "react";

export type WindowVariant = "main" | "1" | "2" | "3" | "4" | "5";
export type CellMark = "main" | "pulse" | "spotlight" | "trace";
export type TimeEntry = "main" | "range" | "smart";
export type ClockFormat = "12h" | "24h";

export const windowVariantNames: Record<WindowVariant, string> = {
  main: "Original (main)",
  "1": "1 · Compact card",
  "2": "2 · Side panel",
  "3": "3 · Keyboard first",
  "4": "4 · Day timeline",
  "5": "5 · Grows from the cell",
};
export const cellMarkNames: Record<CellMark, string> = {
  main: "Original (main)",
  pulse: "A · Soft pulse",
  spotlight: "B · Spotlight",
  trace: "C · Moving outline",
};
export const timeEntryNames: Record<TimeEntry, string> = {
  main: "Original (main)",
  range: "A · One box (9-5)",
  smart: "B · Two boxes + list",
};
export const clockFormatNames: Record<ClockFormat, string> = {
  "12h": "12-hour (9:00 AM)",
  "24h": "24-hour (09:00)",
};

interface Choices {
  edit: WindowVariant;
  add: WindowVariant;
  addUnassigned: WindowVariant;
  cellMark: CellMark;
  timeEntry: TimeEntry;
  clock: ClockFormat;
}
export type ChoiceKey = keyof Choices;

const KEY = "newfork.scheduleTest.shiftWindows";
const defaults: Choices = { edit: "main", add: "main", addUnassigned: "main", cellMark: "main", timeEntry: "main", clock: "12h" };
const listeners = new Set<() => void>();
let current: Choices = (() => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Partial<Choices>;
    return { ...defaults, ...saved };
  } catch {
    return { ...defaults };
  }
})();

export function getChoices(): Choices {
  return current;
}

export function setChoice<K extends ChoiceKey>(key: K, value: Choices[K]): void {
  current = { ...current, [key]: value };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Storage blocked: the choice lasts for this tab.
  }
  listeners.forEach((listener) => listener());
}

export function useChoices(): Choices {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getChoices,
  );
}
