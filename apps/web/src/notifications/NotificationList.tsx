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
import { Fragment, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { resolveTimeInputFormat, type TimeFormat } from "../schedule/timeInput";
import { LinesOutline, LoadError } from "../shell/LoadState";
import { arrivalLabel, arrivalTitle, emptyTitle, isNewNotice, resolvedLine, rowLook, type TileIcon } from "./notification-model";
import { useMarkNotificationsRead, useMarkNotificationsSeen, useNotificationCounts, useNotificationFeed } from "./notifications-data";
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

/** The clock the list's times read from; it ticks once a minute while the list is open. */
function useMinuteClock(fixed: Date | undefined): Date {
  const [now, setNow] = useState(() => fixed ?? new Date());
  useEffect(() => {
    if (fixed) return;
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, [fixed]);
  return fixed ?? now;
}

/**
 * The list itself, newest first: what came since the list was last opened under New, the rest under
 * Earlier (S-247 (2)). Showing the list marks it seen; a row stays where it is while the list is open.
 * A row opens its link and reads it; an open request also offers Review.
 */
export function NotificationList({
  workspaceId,
  viewerId,
  filter,
  panelId,
  wide = false,
  onNavigate,
  now: fixedNow,
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
  const { mutate: markSeen } = useMarkNotificationsSeen(workspaceId);
  const navigate = useNavigate();
  const viewAddress = useViewAddress();
  const { account } = useAuth();
  const timeFormat = resolveTimeInputFormat(account?.timeFormat, "12h");
  const now = useMinuteClock(fixedNow);
  const labelledBy = `${panelId}-tab-${filter}`;
  // What this opening of the list showed as new; it stays New after the core marks it seen.
  const [fresh] = useState(() => new Set<string>());
  const items = feed.data?.pages.flatMap((page) => page.items) ?? [];
  const unseen = items
    .filter((item) => !item.seen_at && !fresh.has(item.id))
    .map((item) => item.id)
    .join(",");
  useEffect(() => {
    if (!unseen) return;
    const ids = unseen.split(",");
    for (const id of ids) fresh.add(id);
    markSeen(ids);
  }, [unseen, fresh, markSeen]);

  if (feed.isPending)
    return (
      <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="ni-state">
        <LinesOutline label="Loading notifications" lines={4} />
      </div>
    );
  if (feed.isError && !feed.data)
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

  // A failed refresh keeps the rows already on screen (with retry:false one miss would wipe them).
  const refreshFailed = feed.isError ? (
    <p className="ni-refresh-error">
      Couldn't refresh.{" "}
      <button type="button" className="ni-link" disabled={feed.isRefetching} onClick={() => void feed.refetch()}>
        Retry
      </button>
    </p>
  ) : null;

  if (!items.length)
    return (
      <div id={panelId} role="tabpanel" aria-labelledby={labelledBy}>
        {refreshFailed}
        <div className="ni-empty">
          <BellOff size={22} aria-hidden />
          <strong>{emptyTitle(filter)}</strong>
          <span>New updates will show up here.</span>
        </div>
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

  const newOnes = items.filter((item) => isNewNotice(item, fresh));
  const earlier = items.filter((item) => !isNewNotice(item, fresh));
  // Stable keys: a notice arriving while the list is open adds New above Earlier without remounting the rows
  // (a focused row keeps its focus).
  const sections = newOnes.length
    ? [
        { key: "new", heading: "New", rows: newOnes },
        { key: "earlier", heading: "Earlier", rows: earlier },
      ]
    : [{ key: "earlier", heading: null, rows: earlier }];
  return (
    <div id={panelId} role="tabpanel" aria-labelledby={labelledBy}>
      {refreshFailed}
      <ul className="ni-list" aria-label="Notifications">
        {sections.map((section) =>
          section.rows.length ? (
            <Fragment key={section.key}>
              {section.heading ? (
                <li className="ni-group" aria-hidden>
                  {section.heading}
                </li>
              ) : null}
              {section.rows.map((item) => (
                <NotificationRow
                  key={item.id}
                  item={item}
                  viewerId={viewerId}
                  wide={wide}
                  now={now}
                  timeFormat={timeFormat}
                  onOpen={() => open(item)}
                  onRead={() => read.mutate({ ids: [item.id] })}
                />
              ))}
            </Fragment>
          ) : null,
        )}
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
  timeFormat,
  onOpen,
  onRead,
}: {
  readonly item: NotificationItem;
  readonly viewerId: string | undefined;
  readonly wide: boolean;
  readonly now: Date;
  readonly timeFormat: TimeFormat;
  readonly onOpen: () => void;
  readonly onRead: () => void;
}) {
  const look = rowLook(item);
  const Icon = icons[look.icon];
  const unread = !item.read_at;
  const open = item.needs_action && !item.resolved_at;
  const resolved = resolvedLine(item, viewerId, now, timeFormat);
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
        {/* The title's button covers the whole row (S-247): a tap anywhere on it opens the notice. */}
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
          {look.label} ·{" "}
          <time dateTime={item.created_at} title={arrivalTitle(item.created_at, timeFormat)}>
            {arrivalLabel(item.created_at, now, timeFormat)}
          </time>
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
