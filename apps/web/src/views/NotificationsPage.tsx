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
import { Bell, Check, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
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
import { ListOutline, LoadError } from "../shell/LoadState";
import { NoAccessState } from "../shell/NoAccessState";
import { noAccessHomePath } from "../auth/resolveLanding";
import { onTabListKeyDown } from "../lib/tab-list-keys";
type Category = "all" | NotificationCategory;
type ReadTab = "unread" | "read";
type NotificationMutationInput = {
  notification_id: string | null;
  action: "read" | "unread" | "dismiss";
};

export function NotificationsPage() {
  const { context, account } = useAuth();
  const accountOnly = useLocation().pathname === "/account/inbox";
  useAccountNotificationRealtime(accountOnly || !context ? account?.userId ?? context?.userId : undefined);
  const client = useQueryClient();
  const [category, setCategory] = useState<Category>("all");
  const [tab, setTab] = useState<ReadTab>("unread");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [expandedNotification, setExpandedNotification] = useState<
    string | null
  >(null);
  const workspaceId = accountOnly ? "" : context?.workspace.id ?? "";
  const userId = account?.userId ?? context?.userId;
  // One list per tab; both load so each tab label carries its count.
  const inbox = (readState: ReadTab) => ({
    queryKey: ["notifications", userId, workspaceId, category, readState],
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      getNotifications(workspaceId, {
        category: category === "all" ? undefined : category,
        readState,
        cursor: pageParam ?? undefined,
        limit: 30,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (page: { next_cursor: string | null }) =>
      page.next_cursor,
    enabled: Boolean(userId),
  });
  const unreadQuery = useInfiniteQuery(inbox("unread"));
  const readQuery = useInfiniteQuery(inbox("read"));
  const query = tab === "unread" ? unreadQuery : readQuery;
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
  // No bulk action in the API: one call per selected row.
  const bulkMutation = useMutation({
    mutationFn: (ids: readonly string[]) =>
      Promise.all(
        ids.map((id) =>
          actOnNotification(workspaceId, {
            notification_id: id,
            action: tab === "unread" ? "read" : "unread",
          }),
        ),
      ),
    onSettled: async () => {
      setSelected(new Set());
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
  const unreadCount =
    unreadQuery.data?.pages[0]?.unread_count ??
    readQuery.data?.pages[0]?.unread_count ??
    0;
  const readLoaded =
    readQuery.data?.pages.reduce(
      (sum, page) => sum + page.notifications.length,
      0,
    ) ?? 0;
  // ponytail: the API sends no read total; past the loaded pages show "N+".
  const readCountLabel = `${readLoaded}${readQuery.hasNextPage ? "+" : ""}`;
  const visibleIds = notifications.map((item) => item.id);
  const selectedVisible = visibleIds.filter((id) => selected.has(id));
  const allSelected =
    visibleIds.length > 0 && selectedVisible.length === visibleIds.length;
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const switchTab = (next: ReadTab) => {
    setTab(next);
    setSelected(new Set());
  };

  // The API's "no" gets the one no-access card, never its raw sentence.
  if (isNoAccess(query.error))
    return (
      <NoAccessState
        homeHref={noAccessHomePath(context, "/app/notifications")}
      />
    );
  const busy = mutation.isPending || bulkMutation.isPending;
  const errorMessage = mutation.error?.message ?? bulkMutation.error?.message;
  return (
    <section
      className="notifications-page list-page"
      aria-labelledby="notifications-title"
    >
      <CatalogPageHeader
        eyebrow="UPDATES. ALERTS. ACTIONS."
        title="Notifications"
        titleId="notifications-title"
        description={`Review account security alerts${workspaceId ? " and updates for this workspace" : ""}. ${unreadCount ? `${unreadCount} unread.` : "You're all caught up."}`}
      />
      <div className="catalog-toolbar">
        <div className="catalog-toolbar-status-row">
          <div
            className="catalog-status-tabs"
            role="tablist"
            onKeyDown={onTabListKeyDown}
            aria-label="Read state"
          >
            {(
              [
                ["unread", `Unread (${unreadCount})`],
                ["read", `Read (${readCountLabel})`],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                tabIndex={tab === value ? 0 : -1}
                className={tab === value ? "active" : ""}
                onClick={() => switchTab(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="catalog-toolbar-filter-row">
          <select
            className="toolbar-filter-select"
            aria-label="Notification category"
            value={category}
            onChange={(event) => {
              setCategory(event.target.value as Category);
              setSelected(new Set());
            }}
          >
            {notificationCategories.map((value) => (
              <option key={value} value={value}>
                {labelCategory(value)}
              </option>
            ))}
          </select>
          <span className="notification-selected-count" aria-live="polite">
            {selectedVisible.length} selected
          </span>
          <button
            type="button"
            className="list-add-button"
            disabled={!selectedVisible.length || busy}
            onClick={() => bulkMutation.mutate(selectedVisible)}
          >
            <Check size={14} aria-hidden />
            {tab === "unread" ? "Mark as read" : "Mark as unread"}
          </button>
        </div>
      </div>
      {errorMessage ? (
        <p className="communication-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
      <div className="employee-table-wrap notification-table-wrap">
        <table
          className="employee-table notification-table"
          aria-label="Notifications"
        >
          <thead>
            <tr>
              <th className="notification-select-cell">
                <input
                  type="checkbox"
                  aria-label="Select all shown notifications"
                  checked={allSelected}
                  disabled={!visibleIds.length || busy}
                  onChange={() =>
                    setSelected(allSelected ? new Set() : new Set(visibleIds))
                  }
                />
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
                const isSelected = selected.has(item.id);
                const markRead = () => {
                  if (!item.read_at)
                    mutation.mutate({
                      notification_id: item.id,
                      action: "read",
                    });
                };
                return (
                  <Fragment key={item.id}>
                    <tr
                      className={item.read_at ? undefined : "unread"}
                      data-selected={isSelected}
                    >
                      <td className="notification-select-cell">
                        <input
                          type="checkbox"
                          aria-label={`Select ${item.title}`}
                          checked={isSelected}
                          disabled={busy}
                          onChange={() => toggle(item.id)}
                        />
                      </td>
                      <td className="notification-main-cell">
                        {actionUrl ? (
                          <Link
                            className="notification-title-link"
                            to={actionUrl}
                            title={typeDisplay?.actionLabel ?? "Open notification"}
                            onClick={markRead}
                          >
                            <strong>{item.title}</strong>
                          </Link>
                        ) : (
                          <strong>{item.title}</strong>
                        )}
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
                        <button
                          className="icon-button notification-delete"
                          type="button"
                          disabled={itemPending || busy}
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
                            onNavigate={markRead}
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
        {query.isLoading ? (
          <ListOutline label="Loading notifications" rows={6} columns={4} inset />
        ) : query.error ? (
          <LoadError
            inset
            title="We couldn't load notifications"
            detail="Your notifications didn't load. Nothing was changed."
            retrying={query.isFetching}
            onRetry={() => void query.refetch()}
          />
        ) : groups.length ? null : (
          <div className="catalog-table-empty">
            <span className="catalog-table-empty-icon" aria-hidden>
              <Bell size={22} />
            </span>
            <h2>
              {tab === "unread"
                ? "No unread notifications"
                : "No read notifications"}
            </h2>
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
  if (value === "all") return "All categories";
  return displayForNotificationCategory(value).label;
}
