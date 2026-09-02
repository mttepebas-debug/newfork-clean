import { useEffect, type RefObject } from "react";

import { isScheduleInteractionSurface } from "../lib/scheduleInteractionTargets";

export function useScheduleGridSelectionClear({
  enabled,
  gridRef,
  onClearSelection,
}: {
  readonly enabled: boolean;
  readonly gridRef: RefObject<HTMLDivElement | null>;
  readonly onClearSelection: () => void;
}): void {
  useEffect(() => {
    if (!enabled) return undefined;
    const clearOutsideGrid = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (isScheduleInteractionSurface(target)) return;
      if (!gridRef.current?.contains(target)) onClearSelection();
    };
    document.addEventListener("pointerdown", clearOutsideGrid);
    return () => document.removeEventListener("pointerdown", clearOutsideGrid);
  }, [enabled, gridRef, onClearSelection]);
}
