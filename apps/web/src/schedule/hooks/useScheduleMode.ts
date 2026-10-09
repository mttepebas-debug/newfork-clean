import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";

export type ScheduleMode = "preview" | "edit";

function parseMode(value: string | null): ScheduleMode {
  return value === "edit" ? "edit" : "preview";
}

export interface UseScheduleModeResult {
  readonly mode: ScheduleMode;
  readonly isEditMode: boolean;
  readonly activeDraftId: string | null;
  readonly setMode: (mode: ScheduleMode, draftId?: string | null) => void;
  readonly setActiveDraft: (draftId: string | null) => void;
}

interface OptimisticScheduleMode {
  readonly mode: ScheduleMode;
  readonly activeDraftId: string | null;
  readonly fromRouteKey: string;
  readonly toRouteKey: string;
}

function routeKey(mode: ScheduleMode, activeDraftId: string | null): string {
  return `${mode}:${activeDraftId ?? ""}`;
}

function resolveDraftId(
  currentDraftId: string | null,
  nextMode: ScheduleMode,
  draftId: string | null | undefined,
): string | null {
  if (draftId !== undefined) return draftId ? draftId : null;
  return nextMode === "edit" ? currentDraftId : null;
}

export function useScheduleMode(): UseScheduleModeResult {
  const [params, setParams] = useSearchParams();
  const routeMode = parseMode(params.get("mode"));
  const routeDraftId = params.get("draft");
  const currentRouteKey = routeKey(routeMode, routeDraftId);
  const [optimisticMode, setOptimisticMode] =
    useState<OptimisticScheduleMode | null>(null);
  const mode = optimisticMode?.mode ?? routeMode;
  const activeDraftId = optimisticMode ? optimisticMode.activeDraftId : routeDraftId;

  useEffect(() => {
    if (!optimisticMode) return;
    if (
      currentRouteKey === optimisticMode.toRouteKey ||
      currentRouteKey !== optimisticMode.fromRouteKey
    ) {
      setOptimisticMode(null);
    }
  }, [currentRouteKey, optimisticMode]);

  const setMode = useCallback(
    (nextMode: ScheduleMode, draftId?: string | null) => {
      const nextDraftId = resolveDraftId(activeDraftId, nextMode, draftId);
      setOptimisticMode({
        mode: nextMode,
        activeDraftId: nextDraftId,
        fromRouteKey: currentRouteKey,
        toRouteKey: routeKey(nextMode, nextDraftId),
      });
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (nextMode === "edit") next.set("mode", "edit");
          else next.delete("mode");

          if (draftId === undefined) {
            if (nextMode !== "edit") next.delete("draft");
          } else if (draftId) {
            next.set("draft", draftId);
          } else {
            next.delete("draft");
          }
          return next;
        },
        { replace: true },
      );
    },
    [activeDraftId, currentRouteKey, setParams],
  );

  const setActiveDraft = useCallback(
    (draftId: string | null) => {
      setOptimisticMode({
        mode,
        activeDraftId: draftId,
        fromRouteKey: currentRouteKey,
        toRouteKey: routeKey(mode, draftId),
      });
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (draftId) next.set("draft", draftId);
          else next.delete("draft");
          return next;
        },
        { replace: true },
      );
    },
    [currentRouteKey, mode, setParams],
  );

  return {
    mode,
    isEditMode: mode === "edit",
    activeDraftId,
    setMode,
    setActiveDraft,
  };
}
