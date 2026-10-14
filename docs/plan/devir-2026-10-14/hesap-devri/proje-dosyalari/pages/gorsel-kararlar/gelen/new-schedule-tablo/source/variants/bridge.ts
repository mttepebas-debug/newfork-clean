// Slots through which main's Export panel and Templates window hand their real
// props (state and handlers owned by SchedulePage) to the New Schedule window.
import { useSyncExternalStore, type ComponentProps } from "react";
import type { ScheduleTemplatesDialog } from "../../../src/schedule/components/ScheduleTemplateDialogs";
import type { ExportSettingsPanelProps } from "../../../src/schedule/export-v2/ExportSettingsPanel";

export type TemplatesProps = ComponentProps<typeof ScheduleTemplatesDialog>;

function slot<T>() {
  let value: T | null = null;
  const listeners = new Set<() => void>();
  return {
    set(next: T | null) {
      if (next === value) return;
      value = next;
      listeners.forEach((listener) => listener());
    },
    get: () => value,
    use(): T | null {
      return useSyncExternalStore(
        (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        () => value,
      );
    },
  };
}

export const exportSlot = slot<ExportSettingsPanelProps>();
export const templatesSlot = slot<TemplatesProps>();
