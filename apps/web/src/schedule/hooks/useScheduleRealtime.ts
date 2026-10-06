import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { supabaseClient } from "../../lib/supabase";
import { draftsKey, scheduleReadScopeKey } from "../schedule-data";

type ScheduleInvalidationTarget =
  | "published_shifts"
  | "draft_shifts"
  | "pending_ops"
  | "drafts"
  | "edit_lock"
  | "employee_my_schedule";

export interface ScheduleInvalidationPayload {
  readonly kind: "schedule_invalidation";
  readonly workspace_id?: string;
  readonly org_id?: string;
  readonly week_start?: string;
  readonly location_ids?: readonly string[];
  readonly targets: readonly ScheduleInvalidationTarget[];
  readonly changed_shift_ids?: readonly string[];
}

interface UseScheduleRealtimeOptions {
  readonly workspaceId: string | null | undefined;
  readonly weekStart: string;
  readonly locationIds: readonly string[];
  // ponytail: ignored since DB-2 (payloads name no draft); SchedulePage drops it in W-1b.
  readonly activeDraftId?: string | null;
}

export function useScheduleRealtime({
  workspaceId,
  weekStart,
  locationIds,
}: UseScheduleRealtimeOptions) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const client = supabaseClient;
    if (!workspaceId || !client) return undefined;

    // DB-2: one private channel per shown location; only that location's
    // schedule readers may join it.
    const channels = [...new Set(locationIds)].map((locationId) => client
      .channel(`schedule:invalidation:${workspaceId}:${locationId}`, { config: { private: true } })
      .on("broadcast", { event: "schedule_invalidation" }, (event) => {
        const payload = event.payload;
        if (!isScheduleInvalidationPayload(payload)) return;
        if (!workspaceMatches(payload, workspaceId)) return;
        if (!weekMatches(payload, weekStart)) return;
        if (!locationsMatch(payload.location_ids, locationIds)) return;

        // A draft change names no draft: any draft change at a shown
        // location refreshes the open schedule.
        if (
          payload.targets.includes("published_shifts") ||
          payload.targets.includes("draft_shifts")
        ) {
          void queryClient.invalidateQueries({
            queryKey: scheduleReadScopeKey(workspaceId ?? null),
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

        if (payload.targets.includes("employee_my_schedule")) {
          void queryClient.invalidateQueries({
            queryKey: ["employee-hub", workspaceId],
          });
        }
      })
      .subscribe());

    return () => {
      for (const channel of channels) void client.removeChannel(channel);
    };
  }, [
    locationIds,
    queryClient,
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
