import { useAccountNotificationRealtime } from "../communications/use-account-notification-realtime";
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
import { Fragment, useMemo, useState } from "react";
import { Link, useLocation } from "react-router";
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
import { CatalogPageHeader } from "./CatalogPageHeader";

import { isNoAccess } from "../lib/no-access";
import { NoAccessState } from "../shell/NoAccessState";
import { noAccessHomePath } from "../auth/resolveLanding";
type Category = "all" | NotificationCategory;
type NotificationMutationInput = {
  notification_id: string | null;
  action: "read" | "unread" | "dismiss" | "read_all";
};

export function NotificationsPage() {
  const { context, account } = useAuth();
  const accountOnly = useLocation().pathname === "/account/inbox";
  useAccountNotificationRealtime(accountOnly || !context ? account?.userId ?? context?.userId : undefined);
  const client = useQueryClient();
  const [category, setCategory] = useState<Category>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [expandedNotification, setExpandedNotification] = useState<
    string | null
  >(null);
  const workspaceId = accountOnly ? "" : context?.workspace.id ?? "";
  const query = useInfiniteQuery({
    queryKey: ["notifications", account?.userId ?? context?.userId, workspaceId, category, unreadOnly],
    queryFn: ({ pageParam }) =>
      getNotifications(workspaceId, {
        category: category === "all" ? undefined : category,
        unreadOnly,
        cursor: pageParam ?? undefined,
        limit: 30,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.next_cursor,
    enabled: Boolean(account?.userId ?? context?.userId),
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

  // The API's "no" gets the one no-access card, never its raw sentence.
  if (isNoAccess(query.error))
    return (
      <NoAccessState
        subject="notifications"
        homeHref={noAccessHomePath(context, "/app/notifications")}
      />
    );
  if (query.isLoading)
    return <NotificationState text="Loading notifications..." />;
  if (query.error)
    return <NotificationState text={query.error.message} error />;

  return (
    <section
      className="notifications-page"
      aria-labelledby="notifications-title"
    >
      <CatalogPageHeader
        eyebrow="UPDATES. ALERTS. ACTIONS."
        title="Notifications"
        titleId="notifications-title"
        description={`Review account security alerts${workspaceId ? " and updates for this workspace" : ""}. ${unreadCount ? `${unreadCount} unread.` : "You're all caught up."}`}
        action={
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
        }
      />
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
      <div className="employee-table-wrap notification-table-wrap">
        <table
          className="employee-table notification-table"
          aria-label="Notifications"
        >
          <thead>
            <tr>
              <th className="notification-dot-cell">
                <span className="sr-only">Unread</span>
              </th>
              <th>Notification</th>
              <th className="notification-category-cell">Category</th>
              <th className="notification-received-cell">Received</th>
              <th className="notification-actions-cell">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          {groups.map(([day, items]) => (
            <tbody key={day}>
              <tr className="notification-day-row">
                <th colSpan={5} scope="colgroup">
                  {day}
                </th>
              </tr>
              {items.map((item) => {
                const actionUrl =
                  item.scope === "account"
                    ? "/account/security"
                    : safeAppActionUrl(item.action_url);
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
                  <Fragment key={item.id}>
                    <tr className={item.read_at ? undefined : "unread"}>
                      <td className="notification-dot-cell">
                        <span className="notification-dot" aria-hidden />
                      </td>
                      <td className="notification-main-cell">
                        <strong>{item.title}</strong>
                        <p>{item.safe_preview || item.body}</p>
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
                      </td>
                      <td className="notification-category-cell">
                        {metadataLabel}
                        {item.severity
                          ? ` · ${notificationSeverityDisplay[item.severity]}`
                          : ""}
                      </td>
                      <td className="notification-received-cell">
                        <time dateTime={item.created_at}>
                          {formatTime(item.created_at)}
                        </time>
                      </td>
                      <td className="notification-actions-cell">
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
                      </td>
                    </tr>
                    {expanded && exchangeTarget && (
                      <tr className="notification-detail-row">
                        <td colSpan={5}>
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
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          ))}
        </table>
        {groups.length ? null : (
          <div className="catalog-table-empty">
            <span className="catalog-table-empty-icon" aria-hidden>
              <Bell size={22} />
            </span>
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
