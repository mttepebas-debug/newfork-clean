import type { ScheduleReadModel, ScheduleView } from "@newfork/shared/schedule";
import type { QueryClient } from "@tanstack/react-query";

import {
  draftsKey,
  pendingOpsKey,
  scheduleReadKey,
  scheduleReferenceKey,
} from "./schedule-data";

type QueryRefetchType = "active" | "inactive" | "all" | "none";

export function invalidateScheduleReference(
  queryClient: QueryClient,
  workspaceId: string,
  refetchType: QueryRefetchType = "active",
): void {
  void queryClient.invalidateQueries({
    queryKey: scheduleReferenceKey(workspaceId),
    refetchType,
  });
}

export function invalidateDailyLineups(
  queryClient: QueryClient,
  workspaceId: string,
  refetchType: QueryRefetchType = "all",
): void {
  void queryClient.invalidateQueries({
    queryKey: ["schedule-lineups", workspaceId],
    refetchType,
  });
}

export function updateScheduleReferenceCaches(
  queryClient: QueryClient,
  workspaceId: string,
  update: (current: ScheduleReadModel) => ScheduleReadModel,
): void {
  queryClient.setQueriesData<ScheduleReadModel | undefined>(
    { queryKey: scheduleReferenceKey(workspaceId) },
    (current) => (current ? update(current) : current),
  );
  queryClient.setQueriesData<ScheduleReadModel | undefined>(
    { queryKey: ["schedule-read", workspaceId] },
    (current) => (current ? update(current) : current),
  );
}

export function getScheduleReference(
  queryClient: QueryClient,
  workspaceId: string | null,
): ScheduleReadModel | undefined {
  if (!workspaceId) return undefined;
  return queryClient
    .getQueriesData<ScheduleReadModel>({
      queryKey: scheduleReferenceKey(workspaceId),
    })
    .find(([, data]) => Boolean(data))?.[1];
}

export function invalidateScheduleCommitCaches({
  queryClient,
  workspaceId,
  weekStart,
  selectedDate,
  view,
}: {
  readonly queryClient: QueryClient;
  readonly workspaceId: string;
  readonly weekStart: string;
  readonly selectedDate: string;
  readonly view: ScheduleView;
}): void {
  void queryClient.invalidateQueries({
    queryKey: draftsKey(workspaceId, weekStart),
  });
  void queryClient.invalidateQueries({
    queryKey: pendingOpsKey(workspaceId, weekStart),
  });
  void queryClient.invalidateQueries({
    queryKey: scheduleReadKey(workspaceId, selectedDate, view),
  });
}
