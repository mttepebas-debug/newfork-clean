import { useQuery } from "@tanstack/react-query";
import { Megaphone, ChevronRight, ArrowUpRight } from "lucide-react";
import { Link } from "react-router";
import { useAuth } from "../auth/AuthContext";
import {
  announcementCategoryText,
  comingUp,
  isUnderway,
  type TimeFormat,
} from "../communications/announcement-model";
import { getAnnouncements } from "../communications/communications-data";
import { CardHeading } from "./DashboardPrimitives";
import { LinesOutline, LoadError, RefreshError } from "../shell/LoadState";
/** One read for both Home cards that show posts. */
function useHubAnnouncements(workspaceId: string) {
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
        to={`/app/announcements/${item.id}`}
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
export function Announcements({ workspaceId }: { workspaceId: string }) {
  const query = useHubAnnouncements(workspaceId);
  const items =
    query.data?.announcements
      .filter(
        // Past posts move to the Past tab; dated posts show under Coming up (EKRAN-08).
        (item) =>
          item.display_status === "published" && !item.on_important_dates,
      )
      .slice(0, 2) ?? [];
  return (
    <section className="eh-card eh-announcements">
      <CardHeading
        title="Team notices"
        icon={<Megaphone size={18} />}
        to="/app/announcements"
      />
      {query.isError && query.data ? (
        <RefreshError
          message="Team notices didn't refresh. These are the last ones that loaded."
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {query.isError && !query.data ? (
        <LoadError
          inset
          level={3}
          title="We couldn't load team notices"
          detail="Team notices didn't load. Nothing was changed."
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      ) : query.isLoading ? (
        <LinesOutline label="Loading team notices" lines={3} />
      ) : items.length ? (
        items.map((item) => (
          <Link
            className="eh-list-link"
            key={item.id}
            to={`/app/announcements/${item.id}`}
          >
            <span>
              <small className="eh-notice-category">
                {announcementCategoryText(item)}
              </small>
              <strong>{item.title}</strong>
              <small>{item.body}</small>
            </span>
            <ArrowUpRight size={16} />
          </Link>
        ))
      ) : (
        <p className="eh-empty">No new notices. Enjoy a little quiet.</p>
      )}
    </section>
  );
}
