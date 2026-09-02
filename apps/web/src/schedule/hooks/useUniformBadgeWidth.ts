import type { RefObject } from "react";

import { useUniformScheduleBadgeWidth } from "./useScheduleBadgeMeasurements";

interface UseUniformBadgeWidthArgs {
  readonly shifts: readonly { id: string }[];
  readonly containerRef: RefObject<HTMLElement | null>;
  readonly extraDeps?: readonly unknown[];
}

function createUniformBadgeWidthVersion({
  shifts,
  extraDeps = [],
}: {
  readonly shifts: readonly { id: string }[];
  readonly extraDeps?: readonly unknown[];
}): string {
  return JSON.stringify({
    shifts: shifts.map((shift) => shift.id),
    extraDeps,
  });
}

export function useUniformBadgeWidth({
  shifts,
  containerRef,
  extraDeps = [],
}: UseUniformBadgeWidthArgs): number {
  return useUniformScheduleBadgeWidth({
    containerRef: containerRef as RefObject<HTMLDivElement | null>,
    version: createUniformBadgeWidthVersion({ shifts, extraDeps }),
  });
}
