import type { NotificationFilter, NotificationItem } from "@newfork/shared";
import {
  ArrowLeftRight,
  BellOff,
  Building2,
  CalendarCheck,
  CalendarDays,
  CalendarX,
  Check,
  CircleCheck,
  CircleHelp,
  CircleX,
  ClipboardCheck,
  Crown,
  FileText,
  Hand,
  Mail,
  MapPinOff,
  Megaphone,
  Repeat2,
  ShieldCheck,
  TimerOff,
  Undo2,
  UserPen,
  UserPlus,
  Users,
} from "lucide-react";
import { Fragment, useEffect, useId, useRef, useState, type ComponentType, type KeyboardEvent, type MouseEvent } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { resolveTimeInputFormat, type TimeFormat } from "../schedule/timeInput";
import { LinesOutline, LoadError } from "../shell/LoadState";
import { StepsIn } from "../shell/StepsIn";
import { arrivalLabel, arrivalTitle, emptyTitle, isNewNotice, rowLines, rowLook, type TileIcon } from "./notification-model";
import type { SwipeSide } from "./notification-swipe";
import {
  useMarkNotificationsRead,
  useMarkNotificationsSeen,
  useMarkNotificationsUnread,
  useNotificationCounts,
  useNotificationFeed,
} from "./notifications-data";
import { useRowSwipe } from "./useRowSwipe";
import "./notifications.css";
import { useViewAddress } from "../shell/view-address";

const icons: Record<TileIcon, ComponentType<{ size?: number }>> = {
  "time-off": CalendarX,
  swap: ArrowLeftRight,
  pickup: Hand,
  cover: StepsIn,
  asked: CircleHelp,
  exchange: Repeat2,
  approved: CircleCheck,
  declined: CircleX,
  revoked: Undo2,
  expired: TimerOff,
  joined: UserPlus,
  name: UserPen,
  "no-location": MapPinOff,
  owner: Crown,
  published: CalendarCheck,
  calendar: CalendarDays,
  clipboard: ClipboardCheck,
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
 * A row opens its link and reads it; its unread dot reads it; on the phone a row slides to Read, or once read to
 * Unread.
 */
export function NotificationList({
  workspaceId,
  viewerId,
  filter,
  panelId,
  wide = false,
  swipe = false,
  onNavigate,
  now: fixedNow,
}: {
  readonly workspaceId: string;
  readonly viewerId: string | undefined;
  readonly filter: NotificationFilter;
  readonly panelId: string;
  readonly wide?: boolean;
  /** The phone's full-screen list: a row slides either way to show Read, or Unread once read (S-251). */
  readonly swipe?: boolean;
  /** Called after a row sends the person somewhere (the panel closes). */
  readonly onNavigate?: () => void;
  readonly now?: Date;
}) {
  const feed = useNotificationFeed(workspaceId, filter);
  const read = useMarkNotificationsRead(workspaceId);
  const unreadAgain = useMarkNotificationsUnread(workspaceId);
  const { mutate: markSeen } = useMarkNotificationsSeen(workspaceId);
  const navigate = useNavigate();
  const viewAddress = useViewAddress();
  const { account } = useAuth();
  const timeFormat = resolveTimeInputFormat(account?.timeFormat, "12h");
  const now = useMinuteClock(fixedNow);
  const labelledBy = `${panelId}-tab-${filter}`;
  // What this opening of the list showed as new; it stays New after the core marks it seen.
  const [fresh] = useState(() => new Set<string>());
  // The one row left open on Read or Unread (the phone).
  const [slid, setSlid] = useState<{ readonly id: string; readonly side: SwipeSide } | null>(null);
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
    // Focusable for the focus a row's dot leaves behind when nothing else in the list can take it.
    <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} tabIndex={-1}>
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
                  swipe={swipe}
                  readLeaves={filter === "unread"}
                  slid={slid?.id === item.id ? slid.side : null}
                  onSlide={(side) => setSlid(side ? { id: item.id, side } : null)}
                  now={now}
                  timeFormat={timeFormat}
                  onOpen={() => open(item)}
                  onRead={() => read.mutate({ ids: [item.id] })}
                  onUnread={() => unreadAgain.mutate({ ids: [item.id] })}
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

/** Whether a line is cut at its end. */
const isCut = (line: HTMLElement | null) => Boolean(line && line.scrollWidth > line.clientWidth);

/**
 * The dot, Read and Unread leave the row once they act: the focus on them goes to the row's title when the list keeps
 * the row (`stays`) and the title opens something, else to the list; a row the list drops passes it on to the next row
 * that has a button, else to the list.
 */
function keepFocus(row: HTMLElement, stays: boolean) {
  const rows = [...(row.parentElement?.children ?? [])].filter((other): other is HTMLElement => other.classList.contains("ni-row"));
  const at = rows.indexOf(row);
  const next = stays
    ? row.querySelector<HTMLElement>(".ni-row-title:not(:disabled)")
    : [...rows.slice(at + 1), ...rows.slice(0, at).reverse()]
        .map((other) => other.querySelector<HTMLElement>("button.ni-dot, .ni-row-title:not(:disabled)"))
        .find(Boolean);
  (next ?? row.closest<HTMLElement>('[role="tabpanel"]'))?.focus();
}

/**
 * One notice in exactly two one-line lines (S-251, variant A): the title, then the body or how the card
 * closed, with the short arrival time at its right. Both lines stay whole for a screen reader (the second
 * describes the row's button) and on hover when one is cut.
 */
function NotificationRow({
  item,
  viewerId,
  wide,
  swipe,
  readLeaves,
  slid,
  onSlide,
  now,
  timeFormat,
  onOpen,
  onRead,
  onUnread,
}: {
  readonly item: NotificationItem;
  readonly viewerId: string | undefined;
  readonly wide: boolean;
  readonly swipe: boolean;
  /** The list drops the row once it is read (Unread). */
  readonly readLeaves: boolean;
  readonly slid: SwipeSide | null;
  readonly onSlide: (side: SwipeSide | null) => void;
  readonly now: Date;
  readonly timeFormat: TimeFormat;
  readonly onOpen: () => void;
  readonly onRead: () => void;
  readonly onUnread: () => void;
}) {
  const look = rowLook(item);
  const Icon = icons[look.icon];
  const unread = !item.read_at;
  const lines = rowLines(item, viewerId);
  const lineId = useId();
  const first = useRef<HTMLButtonElement>(null);
  const second = useRef<HTMLParagraphElement>(null);
  const [whole, setWhole] = useState<string>();
  // An unread row slides to Read, a read one to Unread (S-251).
  const act = unread ? onRead : onUnread;
  const slide = useRowSwipe({ enabled: swipe, open: slid, onOpen: onSlide, onAct: act });
  const openRow = (event: MouseEvent) => {
    if (!slide.endsDrag(event)) onOpen();
  };
  /** The dot, Read and Unread: the row closes, and the focus they had stays in the list (every list keeps a row made unread). */
  const actHere = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.currentTarget === document.activeElement && slide.row.current)
      keepFocus(slide.row.current, unread ? Boolean(item.url) && !readLeaves : true);
    if (slid) onSlide(null);
    act();
  };
  const classes = [
    "ni-row",
    unread ? "is-unread" : "",
    wide ? "is-wide" : "",
    slide.dragging ? "is-dragging" : "",
    slide.open ? "is-slid" : "",
    slide.full ? "is-full" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <li
      ref={slide.row}
      className={classes}
      {...slide.handlers}
      onPointerEnter={() => setWhole(isCut(first.current) || isCut(second.current) ? [lines.first, lines.second].filter(Boolean).join("\n") : undefined)}
    >
      {slide.side ? (
        <button
          type="button"
          className={`ni-under is-${slide.side}`}
          tabIndex={slide.open ? 0 : -1}
          aria-hidden={slide.open ? undefined : true}
          onClick={actHere}
        >
          {unread ? <Check size={16} aria-hidden /> : <Mail size={16} aria-hidden />}
          <span>{unread ? "Read" : "Unread"}</span>
        </button>
      ) : null}
      <div className="ni-swipe" style={slide.style}>
        {unread ? (
          <button type="button" className="ni-dot" onClick={actHere} aria-label={`Mark as read: ${item.title}`} title="Mark as read" />
        ) : (
          <span className="ni-dot" aria-hidden />
        )}
        <span className={`ni-tile ni-${look.tone}`} aria-hidden>
          <Icon size={16} />
        </span>
        <div className="ni-row-text">
          {/* The title's button covers the whole row (S-247): a tap anywhere on it opens the notice. */}
          <button
            ref={first}
            type="button"
            className="ni-row-title"
            onClick={openRow}
            disabled={!item.url && !unread}
            aria-describedby={lines.second ? lineId : undefined}
            title={whole}
          >
            {unread ? <span className="sr-only">Unread: </span> : null}
            {lines.first}
          </button>
          <div className="ni-row-line">
            <p ref={second} id={lineId} className={lines.closed ? "ni-row-sub is-closed" : "ni-row-sub"}>
              {lines.second}
            </p>
            <time dateTime={item.created_at} title={arrivalTitle(item.created_at, timeFormat)} onClick={openRow}>
              {arrivalLabel(item.created_at, now)}
            </time>
          </div>
        </div>
      </div>
    </li>
  );
}
