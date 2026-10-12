import { useQuery } from "@tanstack/react-query";

import { getAnnouncements } from "../../communications/communications-data";

/**
 * The posts the Schedule calendar marks (Add to Calendar, EKRAN-08): the same
 * read as Announcements, so the two share one cache. Without announcement.read
 * the calendar has no dots.
 */
export function useScheduleCalendarPosts(workspaceId: string | null, enabled: boolean) {
  const query = useQuery({
    queryKey: ["announcements", workspaceId],
    queryFn: () => getAnnouncements(workspaceId!),
    enabled: Boolean(workspaceId) && enabled,
    retry: false,
    staleTime: 60_000,
  });
  return query.data?.announcements ?? [];
}
