import { useQuery } from "@tanstack/react-query";

import { draftsKey, listScheduleDrafts } from "../schedule-data";

interface UseScheduleDraftsOptions {
  readonly enabled?: boolean;
}

export function useScheduleDrafts(
  workspaceId: string | null,
  weekStart: string,
  options: UseScheduleDraftsOptions = {},
) {
  const enabled = options.enabled ?? true;
  return useQuery({
    queryKey: draftsKey(workspaceId, weekStart),
    queryFn: () => listScheduleDrafts(workspaceId!, weekStart),
    enabled: enabled && Boolean(workspaceId),
    staleTime: 5_000,
  });
}
