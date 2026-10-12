import { useQuery } from "@tanstack/react-query";
import { Bell, Megaphone, ChevronRight, ArrowUpRight } from "lucide-react";
import { Link } from "react-router";
import { useAuth } from "../auth/AuthContext";
import {
  getAnnouncements,
  getNotifications,
} from "../communications/communications-data";
import { CardHeading, PanelError } from "./DashboardPrimitives";
function useInbox(workspaceId: string) {
  const { context } = useAuth();
  return useQuery({
    queryKey: ["notifications", workspaceId, context?.userId, "hub-preview"],
    queryFn: () => getNotifications(workspaceId, { limit: 5 }),
    refetchInterval: 60_000,
  });
}
export function NotificationBell({ workspaceId }: { workspaceId: string }) {
  const query = useInbox(workspaceId);
  const count = query.data?.unread_count ?? 0;
  return (
    <Link
      className="eh-icon-button eh-bell"
      to="/app/notifications"
      aria-label={`Notifications${count ? `, ${count} unread` : ""}`}
    >
      <Bell size={20} />
      {count > 0 && <span>{count > 9 ? "9+" : count}</span>}
    </Link>
  );
}
export function RecentChanges({ workspaceId }: { workspaceId: string }) {
  const query = useInbox(workspaceId);
  const visible =
    query.data?.notifications.filter(
      (item) => item.visibility_state === "visible",
    ) ?? [];
  return (
    <section className="eh-card eh-changes">
      <CardHeading
        title="Latest updates"
        icon={<Bell size={18} />}
        to="/app/notifications"
      />
      {query.isError ? (
        <PanelError onRetry={() => void query.refetch()} />
      ) : query.isLoading ? (
        <p className="eh-empty">Loading your updates…</p>
      ) : (
        visible.slice(0, 3).map((item) => (
          <Link
            className="eh-list-link"
            key={item.id}
            to={item.action_url ?? "/app/notifications"}
          >
            <span
              className={`eh-update-dot${item.read_at ? " is-read" : ""}`}
            />
            <span>
              <strong>{item.title}</strong>
              <small>{item.safe_preview || item.body}</small>
            </span>
            <ChevronRight size={15} />
          </Link>
        ))
      )}
      {query.isSuccess && !visible.length && (
        <p className="eh-empty">
          You’re up to date. Schedule changes and request updates will appear
          here.
        </p>
      )}
    </section>
  );
}
export function Announcements({ workspaceId }: { workspaceId: string }) {
  const { context } = useAuth();
  const query = useQuery({
    queryKey: ["announcements", workspaceId, context?.userId, "hub-preview"],
    queryFn: () => getAnnouncements(workspaceId),
    refetchInterval: 60_000,
  });
  const items =
    query.data?.announcements
      .filter(
        // Past posts move to the Past tab (EKRAN-08).
        (item) => item.display_status === "published",
      )
      .slice(0, 2) ?? [];
  return (
    <section className="eh-card eh-announcements">
      <CardHeading
        title="Team notices"
        icon={<Megaphone size={18} />}
        to="/app/announcements"
      />
      {query.isError ? (
        <PanelError onRetry={() => void query.refetch()} />
      ) : query.isLoading ? (
        <p className="eh-empty">Loading notices…</p>
      ) : items.length ? (
        items.map((item) => (
          <Link
            className="eh-list-link"
            key={item.id}
            to={`/app/announcements/${item.id}`}
          >
            <span>
              <small className="eh-notice-category">{item.category}</small>
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
