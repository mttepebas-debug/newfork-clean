import { useQuery } from "@tanstack/react-query";

import {
  getScheduleReadModel,
  scheduleReadKey,
} from "../schedule-data";
import type { ScheduleView } from "@newfork/shared/schedule";

interface UseScheduleQueryOptions {
  readonly enabled?: boolean;
}

export function useScheduleQuery(
  workspaceId: string | null,
  selectedDate: string,
  view: ScheduleView,
  options: UseScheduleQueryOptions = {},
) {
  const enabled = options.enabled ?? true;
  return useQuery({
    queryKey: scheduleReadKey(workspaceId, selectedDate, view),
    queryFn: () => getScheduleReadModel(workspaceId!, selectedDate, view),
    enabled: enabled && Boolean(workspaceId),
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[1] === workspaceId ? previousData : undefined,
    staleTime: 30_000,
  });
}
