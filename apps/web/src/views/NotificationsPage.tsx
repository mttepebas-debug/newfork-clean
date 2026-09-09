import {
  displayForNotificationCategory,
  displayForNotificationType,
  notificationSeverityDisplay,
  type NotificationCategory,
  type NotificationRecord,
} from "@newfork/shared";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Bell,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Circle,
  ExternalLink,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { safeAppActionUrl } from "../communications/action-url";
import {
  actOnNotification,
  getNotifications,
} from "../communications/communications-data";

import {
  NotificationShiftDetails,
  notificationExchangeTarget,
} from "../communications/NotificationShiftDetails";

type Category = "all" | NotificationCategory;
type NotificationMutationInput = {
  notification_id: string | null;
  action: "read" | "unread" | "dismiss" | "read_all";
};

export function NotificationsPage() {
  const { context } = useAuth();
  const client = useQueryClient();
  const [category, setCategory] = useState<Category>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [expandedNotification, setExpandedNotification] = useState<
    string | null
  >(null);
  const workspaceId = context?.workspace.id ?? "";
  const query = useInfiniteQuery({
    queryKey: ["notifications", workspaceId, category, unreadOnly],
    queryFn: ({ pageParam }) =>
      getNotifications(workspaceId, {
        category: category === "all" ? undefined : category,
        unreadOnly,
        cursor: pageParam ?? undefined,
        limit: 30,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.next_cursor,
    enabled: Boolean(workspaceId),
  });
  const mutation = useMutation({
    mutationFn: (input: NotificationMutationInput) =>
      actOnNotification(workspaceId, input),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["notifications"] }),
        client.invalidateQueries({ queryKey: ["announcements"] }),
        client.invalidateQueries({ queryKey: ["workspace-dashboard"] }),
      ]);
    },
  });
  const notifications = useMemo(
    () => query.data?.pages.flatMap((page) => page.notifications) ?? [],
    [query.data?.pages],
  );
  const groups = useMemo(() => groupByDay(notifications), [notifications]);
  const unreadCount = query.data?.pages[0]?.unread_count ?? 0;

  if (query.isLoading)
    return <NotificationState text="Loading notifications..." />;
  if (query.error)
    return <NotificationState text={query.error.message} error />;

  return (
    <section
      className="notifications-page"
      aria-labelledby="notifications-title"
    >
      <header className="communications-header">
        <div>
          <h1 id="notifications-title">Notifications</h1>
          <span>
            {unreadCount ? `${unreadCount} unread` : "You're all caught up"}
          </span>
        </div>
        <button
          className="nf-button secondary"
          type="button"
          disabled={!unreadCount || mutation.isPending}
          onClick={() =>
            mutation.mutate({ notification_id: null, action: "read_all" })
          }
        >
          <CheckCheck size={16} aria-hidden /> Mark all read
        </button>
      </header>
      <div className="notification-toolbar">
        <div
          className="communication-filters"
          role="tablist"
          aria-label="Notification category"
        >
          {notificationCategories.map((value) => (
            <button
              key={value}
              role="tab"
              aria-selected={category === value}
              onClick={() => setCategory(value)}
            >
              {labelCategory(value)}
            </button>
          ))}
        </div>
        <label className="notification-unread-toggle">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(event) => setUnreadOnly(event.target.checked)}
          />{" "}
          Unread only
        </label>
      </div>
      {mutation.error ? (
        <p className="communication-error" role="alert">
          {mutation.error.message}
        </p>
      ) : null}
      <div className="notification-groups">
        {groups.length ? (
          groups.map(([day, items]) => (
            <section key={day} aria-labelledby={`notification-day-${day}`}>
              <h2 id={`notification-day-${day}`}>{day}</h2>
              <div className="notification-list">
                {items.map((item) => {
                  const actionUrl = safeAppActionUrl(item.action_url);
                  const exchangeTarget = notificationExchangeTarget(item);
                  const expanded = expandedNotification === item.id;
                  const panelId = `notification-shift-${item.id}`;
                  const typeDisplay = displayForNotificationType(item.type_key);
                  const categoryDisplay = displayForNotificationCategory(
                    item.category,
                  );
                  const metadataLabel =
                    typeDisplay?.shortLabel ?? categoryDisplay.label;
                  const itemPending =
                    mutation.isPending &&
                    mutation.variables?.notification_id === item.id;
                  return (
                    <article
                      className={item.read_at ? "" : "unread"}
                      key={item.id}
                    >
                      <span className={`notification-icon ${item.category}`}>
                        <Bell size={17} aria-hidden />
                      </span>
                      <div>
                        <header>
                          <strong>{item.title}</strong>
                          <time dateTime={item.created_at}>
                            {formatTime(item.created_at)}
                          </time>
                        </header>
                        <p>{item.safe_preview || item.body}</p>
                        <small>
                          {metadataLabel}
                          {item.severity
                            ? ` · ${notificationSeverityDisplay[item.severity]}`
                            : ""}
                        </small>
                        {exchangeTarget && (
                          <button
                            type="button"
                            className="notification-shift-toggle"
                            aria-expanded={expanded}
                            aria-controls={expanded ? panelId : undefined}
                            onClick={() =>
                              setExpandedNotification(expanded ? null : item.id)
                            }
                          >
                            {expanded ? (
                              <ChevronUp size={16} aria-hidden />
                            ) : (
                              <ChevronDown size={16} aria-hidden />
                            )}
                            {expanded
                              ? "Hide shift details"
                              : "View shift details"}
                          </button>
                        )}
                      </div>
                      <div className="notification-actions">
                        {actionUrl ? (
                          <Link
                            className="icon-button"
                            aria-label={`${typeDisplay?.actionLabel ?? "Open notification"}: ${item.title}`}
                            to={actionUrl}
                            onClick={() => {
                              if (!item.read_at)
                                mutation.mutate({
                                  notification_id: item.id,
                                  action: "read",
                                });
                            }}
                          >
                            <ExternalLink size={16} aria-hidden />
                          </Link>
                        ) : null}
                        <button
                          className="icon-button"
                          type="button"
                          disabled={itemPending}
                          aria-label={
                            item.read_at
                              ? `Mark ${item.title} unread`
                              : `Mark ${item.title} read`
                          }
                          onClick={() =>
                            mutation.mutate({
                              notification_id: item.id,
                              action: item.read_at ? "unread" : "read",
                            })
                          }
                        >
                          <Circle
                            size={16}
                            fill={item.read_at ? "none" : "currentColor"}
                            aria-hidden
                          />
                        </button>
                        <button
                          className="icon-button"
                          type="button"
                          disabled={itemPending}
                          aria-label={`Dismiss ${item.title}`}
                          onClick={() =>
                            mutation.mutate({
                              notification_id: item.id,
                              action: "dismiss",
                            })
                          }
                        >
                          <Trash2 size={16} aria-hidden />
                        </button>
                      </div>
                      {expanded && exchangeTarget && (
                        <NotificationShiftDetails
                          key={`${workspaceId}:${item.id}`}
                          workspaceId={workspaceId}
                          item={item}
                          panelId={panelId}
                          onNavigate={() => {
                            if (!item.read_at)
                              mutation.mutate({
                                notification_id: item.id,
                                action: "read",
                              });
                          }}
                        />
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          ))
        ) : (
          <div className="notification-empty">
            <Bell size={28} aria-hidden />
            <h2>No notifications</h2>
            <p>Updates matching these filters will appear here.</p>
          </div>
        )}
      </div>
      {query.hasNextPage ? (
        <button
          className="nf-button secondary notification-load-more"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? "Loading..." : "Load more"}
        </button>
      ) : null}
    </section>
  );
}

function groupByDay(
  items: readonly NotificationRecord[],
): [string, NotificationRecord[]][] {
  const groups = new Map<string, NotificationRecord[]>();
  for (const item of items) {
    const date = new Date(item.created_at);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const key =
      date.toDateString() === today.toDateString()
        ? "Today"
        : date.toDateString() === yesterday.toDateString()
          ? "Yesterday"
          : new Intl.DateTimeFormat("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            }).format(date);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return [...groups];
}
function formatTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}
function NotificationState({
  text,
  error = false,
}: {
  text: string;
  error?: boolean;
}) {
  return (
    <section className="communication-state" role={error ? "alert" : "status"}>
      {text}
    </section>
  );
}
export default NotificationsPage;

const notificationCategories: readonly Category[] = [
  "all",
  "schedule",
  "requests",
  "time_tracking",
  "communications",
  "payroll",
  "people",
  "security",
  "system",
];

function labelCategory(value: Category): string {
  if (value === "all") return "All";
  return displayForNotificationCategory(value).label;
}
