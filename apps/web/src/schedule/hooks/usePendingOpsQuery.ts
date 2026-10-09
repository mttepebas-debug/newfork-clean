import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { fetchPendingOps, pendingOpsKey } from "../schedule-data";
import type { PendingOpsCache } from "./optimisticScheduleCache";
import type { ScheduleMode } from "./useScheduleMode";

type PendingOpsResult = PendingOpsCache;

function scopedPreviousPendingOps(
  previous: PendingOpsResult | undefined,
  locationIds: readonly string[],
  weekStart: string,
  draftId: string | null,
): PendingOpsResult | undefined {
  if (!previous) return previous;
  const locationSet = new Set(locationIds);
  return {
    pending_ops: previous.pending_ops.filter(
      (op) =>
        op.week_start === weekStart &&
        locationSet.has(op.location_id) &&
        (op.target_draft_id ?? null) === draftId,
    ),
  };
}

function mergePendingOps(
  fetched: PendingOpsResult | undefined,
  local: PendingOpsResult | undefined,
): PendingOpsResult | undefined {
  if (!local?.pending_ops.length) return fetched;
  if (!fetched) return local;
  const seen = new Set(fetched.pending_ops.map((op) => op.id));
  const merged = [...fetched.pending_ops];
  for (const op of local.pending_ops) {
    if (seen.has(op.id)) continue;
    seen.add(op.id);
    merged.push(op);
  }
  return merged.length === fetched.pending_ops.length
    ? fetched
    : { pending_ops: merged };
}

export function usePendingOpsQuery(
  workspaceId: string | null,
  weekStart: string,
  locationIdOrIds: string | readonly string[] | null,
  mode: ScheduleMode,
  draftId: string | null = null,
) {
  const queryClient = useQueryClient();
  const locationIds = useMemo(
    () =>
      typeof locationIdOrIds === "string"
        ? [locationIdOrIds]
        : [...(locationIdOrIds ?? [])],
    [locationIdOrIds],
  );
  const queryKey =
    locationIds.length === 1
      ? pendingOpsKey(workspaceId, weekStart, locationIds[0]!, draftId)
      : ([
          "schedule-pending-ops",
          workspaceId,
          weekStart,
          draftId,
          ...locationIds,
        ] as const);

  const query = useQuery<PendingOpsResult>({
    queryKey,
    queryFn: async () => {
      if (locationIds.length === 1) {
        return fetchPendingOps(workspaceId!, {
          location_id: locationIds[0]!,
          week_start: weekStart,
          draft_id: draftId,
        });
      }
      return fetchPendingOps(workspaceId!, {
        location_ids: locationIds,
        week_start: weekStart,
        draft_id: draftId,
      });
    },
    enabled: Boolean(workspaceId) && locationIds.length > 0 && mode === "edit",
    staleTime: 2_000,
    placeholderData: (previous) =>
      scopedPreviousPendingOps(previous, locationIds, weekStart, draftId),
  });

  const localDraftPendingOps = queryClient.getQueryData<PendingOpsResult>(
    pendingOpsKey(workspaceId, weekStart, null, draftId),
  );
  const data = useMemo(() => {
    const scopedLocalDraftPendingOps = scopedPreviousPendingOps(
      localDraftPendingOps,
      locationIds,
      weekStart,
      draftId,
    );
    return mergePendingOps(query.data, scopedLocalDraftPendingOps);
  }, [draftId, localDraftPendingOps, locationIds, query.data, weekStart]);

  return { ...query, data };
}
