import type { ScheduleView } from "@newfork/shared/schedule";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { supabaseClient } from "../../lib/supabase";
import { draftsKey, scheduleReadKey } from "../schedule-data";

type ScheduleInvalidationTarget =
  | "published_shifts"
  | "draft_shifts"
  | "pending_ops"
  | "drafts"
  | "edit_lock"
  | "lineups"
  | "employee_my_schedule";

export interface ScheduleInvalidationPayload {
  readonly kind: "schedule_invalidation";
  readonly workspace_id?: string;
  readonly org_id?: string;
  readonly actor_user_id?: string;
  readonly week_start?: string;
  readonly location_ids?: readonly string[];
  readonly draft_id?: string | null;
  readonly targets: readonly ScheduleInvalidationTarget[];
  readonly changed_shift_ids?: readonly string[];
}

interface UseScheduleRealtimeOptions {
  readonly workspaceId: string | null | undefined;
  readonly weekStart: string;
  readonly selectedDate: string;
  readonly view: ScheduleView;
  readonly locationIds: readonly string[];
  readonly activeDraftId?: string | null;
}

export function useScheduleRealtime({
  workspaceId,
  weekStart,
  selectedDate,
  view,
  locationIds,
  activeDraftId = null,
}: UseScheduleRealtimeOptions) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const client = supabaseClient;
    if (!workspaceId || !client) return undefined;

    // Private: only people who can read this workspace's schedule may join.
    const channel = client
      .channel(`schedule:invalidation:${workspaceId}`, { config: { private: true } })
      .on("broadcast", { event: "schedule_invalidation" }, (event) => {
        const payload = event.payload;
        if (!isScheduleInvalidationPayload(payload)) return;
        if (!workspaceMatches(payload, workspaceId)) return;
        if (!weekMatches(payload, weekStart)) return;
        if (!locationsMatch(payload.location_ids, locationIds)) return;

        if (
          payload.targets.includes("published_shifts") ||
          draftTargetMatches(payload, activeDraftId)
        ) {
          void queryClient.invalidateQueries({
            queryKey: scheduleReadKey(workspaceId, selectedDate, view),
          });
        }

        if (payload.targets.includes("pending_ops")) {
          void queryClient.invalidateQueries({
            queryKey: ["schedule-pending-ops", workspaceId, weekStart],
          });
        }

        if (payload.targets.includes("drafts")) {
          void queryClient.invalidateQueries({
            queryKey: draftsKey(workspaceId, weekStart),
          });
        }

        if (payload.targets.includes("lineups")) {
          void queryClient.invalidateQueries({ queryKey: ["lineup"] });
        }

        if (payload.targets.includes("employee_my_schedule")) {
          void queryClient.invalidateQueries({
            queryKey: ["employee-hub", workspaceId],
          });
        }
      })
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [
    activeDraftId,
    locationIds,
    queryClient,
    selectedDate,
    view,
    weekStart,
    workspaceId,
  ]);
}

export function isScheduleInvalidationPayload(
  value: unknown,
): value is ScheduleInvalidationPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<ScheduleInvalidationPayload>;
  return (
    payload.kind === "schedule_invalidation" &&
    Array.isArray(payload.targets) &&
    payload.targets.every(isScheduleInvalidationTarget) &&
    (payload.workspace_id === undefined ||
      typeof payload.workspace_id === "string") &&
    (payload.org_id === undefined || typeof payload.org_id === "string") &&
    (payload.week_start === undefined || typeof payload.week_start === "string") &&
    (payload.draft_id === undefined ||
      payload.draft_id === null ||
      typeof payload.draft_id === "string") &&
    (payload.location_ids === undefined ||
      (Array.isArray(payload.location_ids) &&
        payload.location_ids.every((id) => typeof id === "string"))) &&
    (payload.changed_shift_ids === undefined ||
      (Array.isArray(payload.changed_shift_ids) &&
        payload.changed_shift_ids.every((id) => typeof id === "string")))
  );
}

function isScheduleInvalidationTarget(
  value: unknown,
): value is ScheduleInvalidationTarget {
  return (
    value === "published_shifts" ||
    value === "draft_shifts" ||
    value === "pending_ops" ||
    value === "drafts" ||
    value === "edit_lock" ||
    value === "lineups" ||
    value === "employee_my_schedule"
  );
}

function workspaceMatches(
  payload: ScheduleInvalidationPayload,
  workspaceId: string,
) {
  const payloadWorkspaceId = payload.workspace_id ?? payload.org_id;
  return !payloadWorkspaceId || payloadWorkspaceId === workspaceId;
}

function weekMatches(payload: ScheduleInvalidationPayload, weekStart: string) {
  return !payload.week_start || payload.week_start === weekStart;
}

function locationsMatch(
  payloadLocationIds: readonly string[] | undefined,
  currentLocationIds: readonly string[],
) {
  if (!payloadLocationIds?.length || !currentLocationIds.length) return true;
  const current = new Set(currentLocationIds);
  return payloadLocationIds.some((id) => current.has(id));
}

function draftTargetMatches(
  payload: ScheduleInvalidationPayload,
  activeDraftId: string | null,
) {
  if (!payload.targets.includes("draft_shifts")) return false;
  if (!payload.draft_id || !activeDraftId) return true;
  return payload.draft_id === activeDraftId;
}
