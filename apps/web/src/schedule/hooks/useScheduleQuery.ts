import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getScheduleReadModel,
  scheduleReadKey,
} from "../schedule-data";
import type { ScheduleReadModel, ScheduleView } from "@newfork/shared/schedule";
import { firstLocationZone, todayIn } from "../../lib/today";

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

/**
 * The page's today, the location's (S-226). The day is asked before its read loads: the zone a loaded read
 * names, else the device's; once it loads, a page whose location is a day ahead asks that day next.
 */
export function useScheduleToday(workspaceId: string | null): string {
  return todayIn(useScheduleZone(workspaceId));
}

/** The zone a loaded read names (its first location's), undefined before any. */
export function useScheduleZone(workspaceId: string | null): string | undefined {
  const locations = useQueryClient()
    .getQueriesData<ScheduleReadModel>({ queryKey: ["schedule-read", workspaceId] })
    .find(([, data]) => data?.locations.length)?.[1]?.locations;
  return locations && firstLocationZone(locations);
}
