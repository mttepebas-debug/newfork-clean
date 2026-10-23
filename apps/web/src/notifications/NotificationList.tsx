import type { NotificationFilter, NotificationItem } from "@newfork/shared";
import {
  BellOff,
  Building2,
  CalendarDays,
  CalendarOff,
  Check,
  CircleCheck,
  ClipboardCheck,
  FileText,
  Megaphone,
  Repeat2,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Fragment, useRef, type KeyboardEvent } from "react";
import { useNavigate } from "react-router";
import { LinesOutline, LoadError } from "../shell/LoadState";
import {
  dayGroup,
  emptyTitle,
  relativeTime,
  resolutionLabel,
  rowLook,
  type TileIcon,
} from "./notification-model";
import { useMarkNotificationsRead, useNotificationCounts, useNotificationFeed } from "./notifications-data";
import "./notifications.css";
import { useViewAddress } from "../shell/view-address";

const icons: Record<TileIcon, LucideIcon> = {
  clipboard: ClipboardCheck,
  calendar: CalendarDays,
  swap: Repeat2,
  "time-off": CalendarOff,
  users: Users,
  file: FileText,
  megaphone: Megaphone,
  shield: ShieldCheck,
  building: Building2,
};

const tabs: readonly { readonly key: NotificationFilter; readonly label: string }[] = [
  { key: "all", label: "All" },
  { key: "needs_action", label: "Needs action" },
  { key: "unread", label: "Unread" },
];

/** All · Needs action · Unread, with their counts; arrow keys move between them. */
export function NotificationTabs({
  workspaceId,
  filter,
  onChange,
  panelId,
}: {
  readonly workspaceId: string;
  readonly filter: NotificationFilter;
  readonly onChange: (filter: NotificationFilter) => void;
  readonly panelId: string;
}) {
  const counts = useNotificationCounts(workspaceId).data;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + tabs.length) % tabs.length;
    onChange(tabs[next]!.key);
    refs.current[next]?.focus();
  };
  return (
    <div className="ni-tabs" role="tablist" aria-label="Show">
      {tabs.map((tab, index) => {
        const count = tab.key === "needs_action" ? counts?.needs_action_count : tab.key === "unread" ? counts?.unread_count : 0;
        const selected = tab.key === filter;
        return (
          <button
            key={tab.key}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`${panelId}-tab-${tab.key}`}
            aria-selected={selected}
            aria-label={count ? `${tab.label}, ${count}` : tab.label}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.key)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {tab.label}
            {count ? (
              <span className={tab.key === "needs_action" ? "ni-count" : "ni-count is-muted"} aria-hidden>
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The list itself, newest first, grouped by day. A row's title opens its link
 * and reads it; an open time off request decides inline; another open request
 * opens with Review.
 */
export function NotificationList({
  workspaceId,
  viewerId,
  filter,
  panelId,
  wide = false,
  onNavigate,
  now = new Date(),
}: {
  readonly workspaceId: string;
  readonly viewerId: string | undefined;
  readonly filter: NotificationFilter;
  readonly panelId: string;
  readonly wide?: boolean;
  /** Called after a row sends the person somewhere (the panel closes). */
  readonly onNavigate?: () => void;
  readonly now?: Date;
}) {
  const feed = useNotificationFeed(workspaceId, filter);
  const read = useMarkNotificationsRead(workspaceId);
  const navigate = useNavigate();
  const viewAddress = useViewAddress();
  const labelledBy = `${panelId}-tab-${filter}`;

  if (feed.isPending)
    return (
      <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="ni-state">
        <LinesOutline label="Loading notifications" lines={4} />
      </div>
    );
  if (feed.isError)
    return (
      <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="ni-state">
        <LoadError
          inset
          level={3}
          title="We couldn't load your notifications"
          detail="Nothing was changed."
          onRetry={() => void feed.refetch()}
          retrying={feed.isRefetching}
        />
      </div>
    );

  const items = feed.data.pages.flatMap((page) => page.items);
  if (!items.length)
    return (
      <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="ni-empty">
        <BellOff size={22} aria-hidden />
        <strong>{emptyTitle(filter)}</strong>
        <span>New updates will show up here.</span>
      </div>
    );

  const open = (item: NotificationItem) => {
    if (!item.read_at) read.mutate({ ids: [item.id] });
    if (item.url) {
      onNavigate?.();
      // The notice's address opens in the view on screen (NOTICE-VIEW).
      void navigate(viewAddress(item.url));
    }
  };

  let group = "";
  return (
    <div id={panelId} role="tabpanel" aria-labelledby={labelledBy}>
      <ul className="ni-list" aria-label="Notifications">
        {items.map((item) => {
          const heading = dayGroup(item.created_at, now);
          const startsGroup = heading !== group;
          group = heading;
          return (
            <Fragment key={item.id}>
              {startsGroup ? (
                <li className="ni-group" aria-hidden>
                  {heading}
                </li>
              ) : null}
              <NotificationRow
                item={item}
                viewerId={viewerId}
                wide={wide}
                now={now}
                onOpen={() => open(item)}
                onRead={() => read.mutate({ ids: [item.id] })}
              />
            </Fragment>
          );
        })}
      </ul>
      {feed.hasNextPage ? (
        <div className="ni-more">
          <button
            type="button"
            className="nf-button secondary-button"
            disabled={feed.isFetchingNextPage}
            onClick={() => void feed.fetchNextPage()}
          >
            {feed.isFetchingNextPage ? "Loading..." : "Show older"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function NotificationRow({
  item,
  viewerId,
  wide,
  now,
  onOpen,
  onRead,
}: {
  readonly item: NotificationItem;
  readonly viewerId: string | undefined;
  readonly wide: boolean;
  readonly now: Date;
  readonly onOpen: () => void;
  readonly onRead: () => void;
}) {
  const look = rowLook(item);
  const Icon = icons[look.icon];
  const unread = !item.read_at;
  const open = item.needs_action && !item.resolved_at;
  const resolved = resolutionLabel(item, viewerId);
  const classes = ["ni-row", unread ? "is-unread" : "", item.resolved_at ? "is-resolved" : "", wide ? "is-wide" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <li className={classes}>
      <span className="ni-dot" aria-hidden />
      <span className={`ni-tile ni-${look.tone}`} aria-hidden>
        <Icon size={16} />
      </span>
      <div className="ni-row-text">
        <button type="button" className="ni-row-title" onClick={onOpen} disabled={!item.url && !unread}>
          {unread ? <span className="sr-only">Unread: </span> : null}
          {item.title}
        </button>
        {item.body ? <p className="ni-row-body">{item.body}</p> : null}
        <p className="ni-row-meta">
          {open ? (
            <>
              <span className="ni-need">Needs action</span> ·{" "}
            </>
          ) : null}
          {look.label} · <time dateTime={item.created_at}>{relativeTime(item.created_at, now)}</time>
        </p>
        {resolved ? (
          <span className="ni-chip">
            <Check size={13} aria-hidden />
            {resolved}
          </span>
        ) : null}
        {open && item.url ? (
          <div className="ni-row-actions">
            <button type="button" className="nf-button secondary-button" onClick={onOpen}>
              Review
            </button>
          </div>
        ) : null}
      </div>
      <div className="ni-row-tools">
        {unread ? (
          <button type="button" className="ni-icon" onClick={onRead} aria-label={`Mark as read: ${item.title}`} title="Mark as read">
            <CircleCheck size={16} aria-hidden />
          </button>
        ) : null}
      </div>
    </li>
  );
}
