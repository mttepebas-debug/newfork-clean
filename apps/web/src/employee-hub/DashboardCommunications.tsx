import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { useAuth } from "../auth/AuthContext";
import {
  comingUp,
  isUnderway,
  type TimeFormat,
} from "../communications/announcement-model";
import { getAnnouncements } from "../communications/communications-data";
import { employeeAnnouncementsPath } from "../shell/view-address";
/** One read for both Home cards that show posts. */
export function useHubAnnouncements(workspaceId: string) {
  const { context } = useAuth();
  return useQuery({
    queryKey: ["announcements", workspaceId, context?.userId, "hub-preview"],
    queryFn: () => getAnnouncements(workspaceId),
    refetchInterval: 60_000,
  });
}
/**
 * Coming up: the published posts on Important Dates, soonest first, as
 * "Downtown closed · Thu, Nov 26" for the person's own location (EKRAN-08).
 */
export function ComingUpDates({
  workspaceId,
  myLocationIds,
  timeFormat,
}: {
  workspaceId: string;
  myLocationIds: readonly string[];
  timeFormat: TimeFormat;
}) {
  const query = useHubAnnouncements(workspaceId);
  const dates = (query.data?.announcements ?? [])
    .filter(
      (item) =>
        item.display_status === "published" &&
        item.on_important_dates &&
        item.starts_on,
    )
    .sort((a, b) => a.starts_on!.localeCompare(b.starts_on!))
    .slice(0, 4);
  return dates.map((item) => {
    const { line, sub } = comingUp(item, myLocationIds, timeFormat);
    return (
      <Link
        className="eh-upcoming-row eh-upcoming-date"
        to={`${employeeAnnouncementsPath}/${item.id}`}
        key={item.id}
      >
        <span className="eh-date-tile">
          <small>
            {new Date(`${item.starts_on}T12:00:00Z`).toLocaleDateString(
              "en-US",
              { month: "short", timeZone: "UTC" },
            )}
          </small>
          <strong>{Number(item.starts_on!.slice(-2))}</strong>
        </span>
        <span>
          <strong>{line}</strong>
          <small>
            {sub}
            {isUnderway(item) ? " · today" : ""}
          </small>
        </span>
        <ChevronRight size={17} />
      </Link>
    );
  });
}
