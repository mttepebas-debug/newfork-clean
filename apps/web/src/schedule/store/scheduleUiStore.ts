import { useCallback, useState } from "react";

import type { ScheduleEmployeeSortMode } from "../lib/scheduleEmployeeSort";

const scheduleUiStorageKey = "organizer-schedule-ui";

export function usePersistentScheduleEmployeeSortMode(): [
  ScheduleEmployeeSortMode,
  (mode: ScheduleEmployeeSortMode) => void,
] {
  const [mode, setMode] = useState<ScheduleEmployeeSortMode>(() =>
    readStoredScheduleEmployeeSortMode(),
  );

  const updateMode = useCallback((nextMode: ScheduleEmployeeSortMode) => {
    setMode(nextMode);
    writeStoredScheduleEmployeeSortMode(nextMode);
  }, []);

  return [mode, updateMode];
}

export function readStoredScheduleEmployeeSortMode(): ScheduleEmployeeSortMode {
  if (typeof window === "undefined") return "alphabetical";
  try {
    const raw = window.localStorage.getItem(scheduleUiStorageKey);
    if (!raw) return "alphabetical";
    const parsed = JSON.parse(raw) as {
      state?: { employeeSortMode?: unknown };
    };
    return parsed.state?.employeeSortMode === "byJob"
      ? "byJob"
      : "alphabetical";
  } catch {
    return "alphabetical";
  }
}

export function writeStoredScheduleEmployeeSortMode(
  mode: ScheduleEmployeeSortMode,
): void {
  writeStoredScheduleUiState({ employeeSortMode: mode });
}

export type ShiftWindowLayout = "form" | "timeline";

/** The Add / Edit shift window opens in the layout the manager last switched to. */
export function usePersistentShiftWindowLayout(): [
  ShiftWindowLayout,
  (layout: ShiftWindowLayout) => void,
] {
  const [layout, setLayout] = useState<ShiftWindowLayout>(() =>
    readStoredShiftWindowLayout(),
  );

  const updateLayout = useCallback((nextLayout: ShiftWindowLayout) => {
    setLayout(nextLayout);
    writeStoredScheduleUiState({ shiftWindowLayout: nextLayout });
  }, []);

  return [layout, updateLayout];
}

export function readStoredShiftWindowLayout(): ShiftWindowLayout {
  if (typeof window === "undefined") return "form";
  try {
    const raw = window.localStorage.getItem(scheduleUiStorageKey);
    if (!raw) return "form";
    const parsed = JSON.parse(raw) as { state?: { shiftWindowLayout?: unknown } };
    return parsed.state?.shiftWindowLayout === "timeline" ? "timeline" : "form";
  } catch {
    return "form";
  }
}

export function usePersistentScheduleUiBoolean(
  key: string,
  fallback: boolean,
): [boolean, (value: boolean | ((current: boolean) => boolean)) => void] {
  const [value, setValue] = useState(() =>
    readStoredScheduleUiBoolean(key, fallback),
  );

  const updateValue = useCallback(
    (nextValue: boolean | ((current: boolean) => boolean)) => {
      setValue((current) => {
        const resolved =
          typeof nextValue === "function" ? nextValue(current) : nextValue;
        writeStoredScheduleUiState({ [key]: resolved });
        return resolved;
      });
    },
    [key],
  );

  return [value, updateValue];
}

export function readStoredScheduleUiBoolean(
  key: string,
  fallback: boolean,
): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(scheduleUiStorageKey);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
    const value = parsed.state?.[key];
    return typeof value === "boolean" ? value : fallback;
  } catch {
    return fallback;
  }
}

export function writeStoredScheduleUiState(
  nextState: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(scheduleUiStorageKey);
    const parsed = raw
      ? (JSON.parse(raw) as {
          state?: Record<string, unknown>;
          version?: unknown;
        })
      : {};
    window.localStorage.setItem(
      scheduleUiStorageKey,
      JSON.stringify({
        ...parsed,
        state: {
          ...(parsed.state ?? {}),
          ...nextState,
        },
      }),
    );
  } catch {
    window.localStorage.setItem(
      scheduleUiStorageKey,
      JSON.stringify({ state: nextState }),
    );
  }
}
