import { usePhoneWidth } from "../lib/usePhoneWidth";
import { ZoneNote } from "../shell/ZoneNote";
import type {
  HomeLayoutInput,
  HomeSectionId,
  ManagerHomeLocation,
  OwnerSetupChecklistItemId,
  WorkspaceDashboard,
  WorkspaceTodo,
} from "@newfork/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  CalendarCheck,
  CalendarDays,
  CalendarOff,
  CalendarX,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleCheck,
  CircleX,
  Eye,
  EyeOff,
  MapPin,
  Settings2,
  TriangleAlert,
  UserPlus,
} from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { can } from "../auth/can";
import { safeAppActionUrl } from "../communications/action-url";
import {
  createWorkspaceTodo,
  getManagerHome,
  getOwnerSetupChecklistProgress,
  getWorkspaceDashboard,
  markOwnerSetupChecklistItem,
  resolveWorkspaceTodo,
  saveWorkspaceLayout,
} from "../communications/communications-data";

import { getExchanges } from "../employee-hub/shift-exchanges/exchange-data";
import { HomeSection } from "../employee-hub/HomeSection";
import { HomeNoticeDeck } from "../employee-hub/HomeNoticeDeck";
import { useHomeScroll } from "../employee-hub/home-motion";
import { daySlot } from "../employee-hub/home-model";
import { ago } from "../employee-hub/home-data";
import { NotificationBell } from "../notifications/NotificationViews";

import { isNoAccess } from "../lib/no-access";
import { requestErrorText } from "../lib/request-error";
import { NoAccessState } from "../shell/NoAccessState";
import { LoadError, LoadingOutline, RefreshError, Skeleton } from "../shell/LoadState";
import { noAccessHomePath } from "../auth/resolveLanding";
import { membershipClass } from "../auth/access";
import {
  HOME_SECTIONS,
  cardsInPairs,
  comingLines,
  groupNeeds,
  homeNeeds,
  homeSubline,
  hourBars,
  hourNow,
  locationBadge,
  managerOnFloor,
  needsAt,
  onNow,
  moveLocation,
  openToday,
  updateLines,
  type HomeLine,
  type ManagerNeed,
} from "./manager-home-model";
import { validZone } from "../lib/today";
import "../employee-hub/employee-dashboard.css";
import "../employee-hub/home-daylight.css";
import "./manager-home.css";

const managerHomeKey = (workspaceId: string) => ["workspace-dashboard", workspaceId, "home"];

/**
 * The managers' Home (Owner, Admin, Manager): Daylight "C · Locations first"
 * (Mert 2026-10-19, KARARLAR S-210). The employee's Home greeting and sky
 * (S-163, S-180), then a card per location with who is on the floor now and
 * the day hour by hour; a card or a chip narrows the whole page to that
 * location; "Needs you" is grouped by location, with whoever works without a
 * required document on top (S-206). Customize still moves and hides the
 * sections, saved as before (S-210 (a)).
 */
export function WorkspacePage() {
  const { context } = useAuth();
  const client = useQueryClient();
  const phone = usePhoneWidth();
  // Home paints after its outline: the scroll motion starts when its root is on the page,
  // not at the first render (a plain ref would leave the greeting, the bar's pill and the
  // sections' rise still).
  const [rootElement, setRootElement] = useState<HTMLDivElement | null>(null);
  const root = useMemo(() => ({ current: rootElement }), [rootElement]);
  const far = useHomeScroll(root);
  const [customizing, setCustomizing] = useState(false);
  const [draft, setDraft] = useState<HomeLayoutInput | null>(null);
  const [chosen, setChosen] = useState("all");
  const [headElement, setHeadElement] = useState<HTMLDivElement | null>(null);
  const [now, setNow] = useState(() => new Date());
  const workspaceId = context?.workspace.id ?? "";
  const query = useQuery({
    queryKey: ["workspace-dashboard", workspaceId],
    queryFn: () => getWorkspaceDashboard(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const home = useQuery({
    queryKey: managerHomeKey(workspaceId),
    queryFn: () => getManagerHome(workspaceId),
    enabled: Boolean(workspaceId),
    refetchInterval: 5 * 60_000,
  });
  // The setup checklist sits above the sections: it is read beside the
  // dashboard and the outline stays until both have answered, so the page
  // never jumps down when it paints (CI run 39023052297: 405 px on a phone).
  const ownerRole =
    (context ? membershipClass(context.membership) : undefined) === "owner" || (context ? membershipClass(context.membership) : undefined) === "admin";
  const checklist = useQuery({
    queryKey: ownerSetupChecklistKey(workspaceId),
    queryFn: () => getOwnerSetupChecklistProgress(workspaceId),
    enabled: Boolean(workspaceId && ownerRole),
  });
  const exchanges = useQuery({
    queryKey: ["shift-exchanges", workspaceId, context?.userId, true],
    queryFn: () => getExchanges(workspaceId, true),
    enabled: Boolean(workspaceId && can(context, "exchange.read")),
    refetchInterval: 60_000,
  });
  const saveMutation = useMutation({
    mutationFn: (layout: HomeLayoutInput) => saveWorkspaceLayout(workspaceId, layout),
    onSuccess: async () => {
      // The Home read is under the dashboard's key: both are read again.
      await client.invalidateQueries({ queryKey: ["workspace-dashboard", workspaceId] });
      setDraft(null);
      setCustomizing(false);
    },
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // "Today" is each location's own day (BL-804): read again at the first
  // location midnight instead of keeping yesterday's counts on an open page.
  // A device clock ahead of the server gets the old day back at its own
  // midnight; every read re-arms, so it asks again in 30 seconds.
  const todayEndsAt = query.data?.today_ends_at ?? null;
  const readAt = query.dataUpdatedAt;
  useEffect(() => {
    if (!todayEndsAt) return;
    const wait = Date.parse(todayEndsAt) - Date.now();
    const timer = window.setTimeout(() => {
      void client.invalidateQueries({ queryKey: ["workspace-dashboard", workspaceId] });
    }, wait > 0 ? wait : 30_000);
    return () => window.clearTimeout(timer);
  }, [client, readAt, todayEndsAt, workspaceId]);

  // The API's "no" gets the one no-access card, never its raw sentence.
  if (isNoAccess(query.error) || isNoAccess(home.error))
    return <NoAccessState homeHref={noAccessHomePath(context, "/app/workspace")} />;
  // Only the first answer holds the outline: a later read of the checklist
  // (its own Try again) does not take the whole page back to the outline.
  if (query.isLoading || home.isLoading || (checklist.isPending && checklist.isFetching && !checklist.isFetchedAfterMount))
    return <HomeOutline />;
  if (!query.data) {
    return (
      <section className="manager-home-page is-plain">
        <LoadError
          title="We couldn't load Home"
          detail="Today's numbers didn't load. Nothing was changed."
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      </section>
    );
  }
  const model = query.data;
  const day = home.data ?? null;
  // The Home read holds the person's layout (S-220); without it, every section in its first place.
  const saved: HomeLayoutInput = {
    widget_order: day?.layout.widget_order ?? (Object.keys(HOME_SECTIONS) as HomeSectionId[]),
    hidden_widget_ids: day?.layout.hidden_widget_ids ?? [],
    location_order: (day?.locations ?? []).map((item) => item.id),
  };
  const layout = draft ?? saved;
  const hidden = new Set(layout.hidden_widget_ids);
  const move = (id: HomeSectionId, offset: number) => {
    const index = layout.widget_order.indexOf(id);
    const target = index + offset;
    if (target < 0 || target >= layout.widget_order.length) return;
    const order = [...layout.widget_order];
    [order[index], order[target]] = [order[target]!, order[index]!];
    setDraft({ ...layout, widget_order: order });
  };
  const moveCard = (id: string, offset: number) => setDraft({ ...layout, location_order: moveLocation(layout.location_order, id, offset) });
  const toggle = (id: HomeSectionId) =>
    setDraft({
      ...layout,
      hidden_widget_ids: hidden.has(id) ? layout.hidden_widget_ids.filter((item) => item !== id) : [...layout.hidden_widget_ids, id],
    });

  // The cards in the person's own order; while Customize is open, in the order being made.
  const rank = new Map(layout.location_order.map((id, index) => [id, index]));
  const locations = [...(day?.locations ?? [])].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
  const multi = locations.length > 1;
  // The page narrows to one location while its cards are on the page (a state, not a setting).
  const selected = multi && !hidden.has("operations") && locations.some((item) => item.id === chosen) ? chosen : "all";
  // A failed check with nothing cached is unknown, not zero (the Requests page's rule).
  const casesUnknown = exchanges.isError && !exchanges.data;
  const needs = day ? homeNeeds(day, exchanges.data?.cases ?? [], phone) : [];
  const shownNeeds = selected === "all" ? needs : needsAt(needs, selected);
  // The day is the location's (S-226): the one the page is narrowed to, else the first.
  const zone = validZone((locations.find((item) => item.id === selected) ?? locations[0])?.timezone);
  const minute = clockMinutes(now, zone);
  const people = locations.reduce((sum, item) => sum + onNow(item, now), 0);
  const firstName = model.display_name.trim().split(/\s+/)[0] ?? "";
  const pill = (
    <button
      type="button"
      className={`dl-pill${far ? " is-shown" : ""}`}
      tabIndex={far ? 0 : -1}
      aria-hidden={!far}
      data-bar-shown={far ? "" : undefined}
      onClick={() => root.current?.closest(".app-main")?.scrollTo({ top: 0, behavior: "smooth" })}
    >
      <i className="dl-pulse is-on" />
      <b>{people}</b> on now{needs.length ? <> · <b>{needs.length}</b> need you</> : null}
    </button>
  );
  const phoneSlot = typeof document === "undefined" ? null : document.getElementById("mm-top-mid");
  const startCustomizing = () => {
    setCustomizing(true);
    // The button is at the end of the page; Customize starts at its top.
    headElement?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };
  const allHidden = !customizing && layout.widget_order.every((id) => hidden.has(id));
  const shown = layout.widget_order.filter((id) => !hidden.has(id));
  const setupAfter = shown.includes("pending_requests") ? "pending_requests" : shown[shown.length - 1];

  const inView = (ids: readonly string[]) => selected === "all" || ids.includes(selected);
  const pairs = cardsInPairs(locations.length);
  const parts: Record<HomeSectionId, () => ReactNode> = {
    operations: () => (
      <HomeSection name="locs" bare>
        {home.isError && !day ? (
          <LoadError
            inset
            level={3}
            title="We couldn't load your locations"
            detail="Today's numbers didn't load. Nothing was changed."
            retrying={home.isFetching}
            onRetry={() => void home.refetch()}
          />
        ) : !locations.length ? (
          <p className="dl-empty mh-none">No locations to show yet.</p>
        ) : (
          <>
            <div className={`mh-locs${multi ? "" : " is-one"}`} data-own-drag="">
              {locations.map((item, index) => (
                <LocationCard
                  key={item.id}
                  location={item}
                  now={now}
                  needs={needs}
                  pair={pairs[index]}
                  pressed={multi ? selected === item.id : undefined}
                  onPick={multi && !customizing ? () => setChosen(selected === item.id ? "all" : item.id) : undefined}
                  // S-220 (1): in Customize the cards are ordered among themselves.
                  order={
                    customizing && multi
                      ? { first: index === 0, last: index === locations.length - 1, onMove: (offset) => moveCard(item.id, offset) }
                      : undefined
                  }
                />
              ))}
            </div>
            {multi && !customizing ? (
              <div className="mh-filter" role="group" aria-label="Location">
                {[{ id: "all", name: "All locations" }, ...locations].map((item) => (
                  <button type="button" key={item.id} aria-pressed={selected === item.id} onClick={() => setChosen(item.id)}>
                    {item.name}
                  </button>
                ))}
              </div>
            ) : null}
          </>
        )}
      </HomeSection>
    ),
    pending_requests: () => (
      <HomeSection name="needs" title="Needs you" count={shownNeeds.length} warn={shownNeeds.some((need) => need.urgent)}>
        <NeedsList
          needs={shownNeeds}
          groups={selected === "all" && multi ? groupNeeds(shownNeeds, locations) : null}
          casesUnknown={casesUnknown}
        />
      </HomeSection>
    ),
    quick_actions: () => {
      const one = locations.find((item) => item.id === selected);
      return (
        <HomeSection
          name="week"
          title={one ? `Next 7 days · ${one.name}` : "Next 7 days"}
          bare
          link={
            <Link className="dl-lnk" to={phone ? "/app/schedule/lineup" : "/app/schedule"}>
              {phone ? "Lineup" : "Full schedule"} <ChevronRight size={16} />
            </Link>
          }
        >
          <WeekStrip locations={one ? [one] : locations} phone={phone} />
        </HomeSection>
      );
    },
    open_shifts: () => {
      const open = locations
        .filter((item) => selected === "all" || item.id === selected)
        .flatMap((item) => item.open_shifts.map((shift) => ({ ...shift, location: item })))
        .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
        .slice(0, 12);
      return (
        <HomeSection
          name="open"
          title="Open shifts"
          count={open.length}
          link={
            <Link className="dl-lnk" to={phone ? "/app/schedule/lineup" : "/app/schedule"} aria-label="All open shifts">
              All <ChevronRight size={16} />
            </Link>
          }
        >
          {open.length ? (
            <div className="dl-open" role="list" data-own-drag="">
              {open.map((shift) => (
                <Link
                  role="listitem"
                  className="dl-oc"
                  key={`${shift.location.id}:${shift.starts_at}:${shift.job_name}`}
                  to={phone ? "/app/schedule/lineup" : `/app/schedule?date=${shift.date}`}
                >
                  <span className="dl-oc-d">{relativeDay(shift.date, shift.location.today)}</span>
                  <b>
                    {clock(shift.starts_at, shift.location.timezone)} – {clock(shift.ends_at, shift.location.timezone)}
                  </b>
                  <span>
                    {shift.location.name} · {shift.job_name}
                  </span>
                  <em>{phone ? "See in Lineup" : "Fill in Schedule"}</em>
                </Link>
              ))}
            </div>
          ) : (
            <p className="dl-empty">No open shifts right now.</p>
          )}
        </HomeSection>
      );
    },
    updates: () => (
      <HomeSection name="updates" title="Updates">
        <HomeLines lines={updateLines((day?.updates ?? []).filter((item) => inView(item.location_ids)), locations)} empty="Nothing new in the last 7 days." />
      </HomeSection>
    ),
    coming_up: () => (
      <HomeSection name="coming" title="Coming up">
        <HomeLines
          lines={comingLines((day?.coming_up ?? []).filter((item) => inView(item.location_ids)), locations)}
          empty="Nothing in the next 14 days."
          dated
        />
      </HomeSection>
    ),
    announcements: () => (
      <HomeSection
        name="notices"
        title="From your team"
        link={
          <Link className="dl-lnk" to="/app/announcements" aria-label="View all announcements">
            All <ChevronRight size={16} />
          </Link>
        }
      >
        {model.announcements.length ? (
          <HomeNoticeDeck
            notices={model.announcements.map((item) => ({
              id: item.id,
              title: item.title,
              body: item.body,
              author: item.author_name,
              when: item.published_at ? ago(item.published_at, now) : "",
              ack: null,
            }))}
          />
        ) : (
          <p className="dl-empty">No active announcements.</p>
        )}
      </HomeSection>
    ),
    todos: () => (
      <HomeSection name="todos" title="Todos">
        <TodoWidget todos={model.todos} workspaceId={workspaceId} />
      </HomeSection>
    ),
  };

  return (
    <section className="manager-home-page" aria-labelledby="manager-home-title">
      <div className={`eh-dashboard dl-home mh-home${far ? " is-far" : ""}`} data-slot={daySlot(minute)} ref={setRootElement}>
        <div className="dl-sky" aria-hidden />
        {phoneSlot ? createPortal(pill, phoneSlot) : null}
        <div className="eh-context-bar">
          <div className="dl-desk-pill">{pill}</div>
          <div className="eh-context-actions">
            {can(context, "notifications.read_own") ? <NotificationBell workspaceId={workspaceId} className="eh-icon-button" /> : null}
            <Link className="eh-icon-button" to="/account/profile" aria-label="Your profile">
              <span className="eh-avatar">{firstName.slice(0, 1)}</span>
            </Link>
          </div>
        </div>
        <div className="dl-body mh-body">
          {query.error ? (
            <RefreshError
              message="Home didn't refresh. These are the last numbers that loaded."
              retrying={query.isFetching}
              onRetry={() => void query.refetch()}
            />
          ) : home.error && day ? (
            <RefreshError
              message="Your locations didn't refresh. These are the last numbers that loaded."
              retrying={home.isFetching}
              onRetry={() => void home.refetch()}
            />
          ) : null}
          <section className="dl-hero" aria-label="Your day">
            <p className="dl-date">
              {new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: zone }).format(now)}
            </p>
            {locations.length ? <ZoneNote zone={zone} now={now} /> : null}
            <h1
              className="dl-greet"
              id="manager-home-title"
              style={{ "--ch": `${greetingAt(minute)}, ${firstName}.`.length } as CSSProperties}
            >
              <span>{greetingAt(minute)},</span> <span className="dl-nm">{firstName}.</span>
            </h1>
            {day ? <p className="dl-sub">{homeSubline(people, locations, needs.length)}</p> : null}
          </section>
          <div className={`mh-head${customizing ? " is-customizing" : ""}`} ref={setHeadElement}>
            <h2>{customizing ? "Customize Home" : hidden.has("operations") ? "Your Home" : multi ? "Your locations" : "Your location"}</h2>
            {customizing ? (
              <span className="mh-tools">
                <button
                  className="nf-button secondary-button"
                  type="button"
                  onClick={() => {
                    setDraft(null);
                    setCustomizing(false);
                  }}
                >
                  Cancel
                </button>
                <button className="nf-button" type="button" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate(layout)}>
                  {saveMutation.isPending ? "Saving..." : "Save layout"}
                </button>
              </span>
            ) : null}
          </div>
          {customizing ? (
            <p className="mh-note">
              {multi ? "Move your locations and the sections of your Home, or hide a section, then save." : "Move or hide the sections of your Home, then save."}{" "}
              Only you see this layout.
            </p>
          ) : null}
          {saveMutation.error ? (
            <p className="workspace-error" role="alert">
              {requestErrorText(saveMutation.error)}
            </p>
          ) : null}
          {allHidden ? <p className="workspace-empty mh-allhidden">Every card is hidden. Use Customize to show them again.</p> : null}
          {allHidden && ownerRole && context ? <OwnerSetupChecklist workspaceId={context.workspace.id} /> : null}
          <div className="dl-secs mh-secs">
            {layout.widget_order.map((id, index) => {
              const off = hidden.has(id);
              if (off && !customizing) return null;
              // The owner's setup list follows "Needs you" (variant C's "Finish setting up"); it is not arranged.
              if (!customizing)
                return (
                  <div key={id}>
                    {parts[id]()}
                    {id === setupAfter && ownerRole && context ? <OwnerSetupChecklist workspaceId={context.workspace.id} /> : null}
                  </div>
                );
              const label = HOME_SECTIONS[id];
              return (
                <div className={`mh-cz${off ? " is-hidden" : ""}`} key={id}>
                  <div className="mh-cz-bar">
                    <b>{label}</b>
                    <span className="mh-cz-ctl">
                      <button className="icon-button" type="button" aria-label={`Move ${label} up`} disabled={index === 0} onClick={() => move(id, -1)}>
                        <ArrowUp size={15} aria-hidden />
                      </button>
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={`Move ${label} down`}
                        disabled={index === layout.widget_order.length - 1}
                        onClick={() => move(id, 1)}
                      >
                        <ArrowDown size={15} aria-hidden />
                      </button>
                      <button className="icon-button" type="button" aria-label={`${off ? "Show" : "Hide"} ${label}`} onClick={() => toggle(id)}>
                        {off ? <Eye size={15} aria-hidden /> : <EyeOff size={15} aria-hidden />}
                      </button>
                    </span>
                  </div>
                  {/* BL-813: a hidden section in Customize is a preview, not a form.
                      One wrapper either way, so Hide / Show keeps what was typed. */}
                  <div className={`mh-cz-prev${id === "operations" && multi && !off ? " is-whole" : ""}`} inert={off}>
                    {parts[id]()}
                  </div>
                </div>
              );
            })}
          </div>
          <footer className="dl-end">
            <span className="dl-end-i">
              <Check size={20} />
            </span>
            <p>That’s everything for now</p>
            <small>Pull down at the top to refresh</small>
            {/* S-220 (2): small and out of the way, at the end of the page. */}
            {!customizing && day ? (
              <button className="mh-customize" type="button" onClick={startCustomizing}>
                <Settings2 size={14} aria-hidden /> Customize Home
              </button>
            ) : null}
          </footer>
        </div>
      </div>
    </section>
  );
}

/** Minutes after midnight on the wall clock of `zone`. */
function clockMinutes(now: Date, zone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return value("hour") * 60 + value("minute");
}
function greetingAt(minute: number) {
  return minute < 5 * 60 ? "Up late" : minute < 12 * 60 ? "Good morning" : minute < 18 * 60 ? "Good afternoon" : "Good evening";
}
const clock = (iso: string, zone: string) =>
  new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: zone }).format(new Date(iso));
const nextDate = (date: string, days = 1) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
const relativeDay = (date: string, today: string) =>
  date === today
    ? "Today"
    : date === nextDate(today)
      ? "Tomorrow"
      : new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

function LocationCard({
  location,
  now,
  needs,
  pair,
  pressed,
  onPick,
  order,
}: {
  location: ManagerHomeLocation;
  now: Date;
  needs: readonly ManagerNeed[];
  /** In a row of two (S-220 (3)). */
  pair?: boolean;
  /** Undefined with one location: there is nothing to narrow to. */
  pressed?: boolean;
  onPick?: () => void;
  /** Customize: the card moves a place earlier or later among the cards. */
  order?: { first: boolean; last: boolean; onMove: (offset: number) => void };
}) {
  const bars = hourBars(location);
  const top = Math.max(1, ...bars.map((bar) => bar.count));
  const current = hourNow(location, now);
  const badge = locationBadge(location, needs);
  const manager = managerOnFloor(location, now);
  const open = openToday(location);
  const body = (
    <>
      <span className="mh-loc-h">
        <MapPin size={16} aria-hidden />
        <b>{location.name}</b>
        {order ? (
          <span className="mh-loc-move">
            <button className="icon-button" type="button" aria-label={`Move ${location.name} left`} disabled={order.first} onClick={() => order.onMove(-1)}>
              <ArrowLeft size={15} aria-hidden />
            </button>
            <button className="icon-button" type="button" aria-label={`Move ${location.name} right`} disabled={order.last} onClick={() => order.onMove(1)}>
              <ArrowRight size={15} aria-hidden />
            </button>
          </span>
        ) : (
          <span className={`mh-badge is-${badge.tone}`} aria-label={badge.label}>
            {badge.tone === "danger" ? <TriangleAlert size={13} aria-hidden /> : badge.tone === "ok" ? <Check size={13} aria-hidden /> : null}
            {badge.text}
          </span>
        )}
      </span>
      <span className="mh-loc-n">
        {onNow(location, now)}
        <small>on now · {location.week[0]?.shifts ?? 0} today</small>
      </span>
      <span className="mh-hours" aria-hidden>
        <span className="mh-bars">
          {bars.map((bar, index) => (
            <i
              key={index}
              className={`${bar.count ? "" : "is-zero"}${bar.gap ? " is-gap" : ""}${index === current ? " is-now" : ""}`}
              style={{ "--h": (bar.count / top).toFixed(3) } as CSSProperties}
            />
          ))}
        </span>
        <span className="mh-axis">
          <span>6 AM</span>
          <span>Noon</span>
          <span>6 PM</span>
          <span>Midnight</span>
        </span>
      </span>
      <span className="mh-loc-f">
        {manager ? <span>{manager} on the floor</span> : null}
        {open ? <span className="is-open">{open} open today</span> : null}
      </span>
      <span className="mh-loc-wk" aria-hidden>
        {location.week.map((item) => (
          <i key={item.date} className={!item.published ? "is-draft" : item.open ? "is-open" : ""} />
        ))}
      </span>
    </>
  );
  const shape = `mh-loc${pair ? " is-pair" : ""}`;
  if (!onPick) return <div className={shape}>{body}</div>;
  return (
    <button
      type="button"
      className={`${shape}${pressed ? " is-sel" : ""}`}
      aria-pressed={pressed}
      aria-label={`${location.name}: ${onNow(location, now)} on now. ${badge.label}. Show only ${location.name}`}
      onClick={onPick}
    >
      {body}
    </button>
  );
}

const LINE_ICONS: Record<HomeLine["icon"], ReactNode> = {
  published: <CalendarCheck size={18} aria-hidden />,
  approved: <CircleCheck size={18} aria-hidden />,
  declined: <CircleX size={18} aria-hidden />,
  joined: <UserPlus size={18} aria-hidden />,
  closed: <CalendarX size={18} aria-hidden />,
  off: <CalendarOff size={18} aria-hidden />,
  draft: <CalendarDays size={18} aria-hidden />,
};

/** Updates and Coming up (S-225): a line each, Coming up's on a date tile. */
function HomeLines({ lines, empty, dated }: { lines: readonly HomeLine[]; empty: string; dated?: boolean }) {
  if (!lines.length) return <p className="dl-empty">{empty}</p>;
  return (
    <ul className="dl-rows">
      {lines.slice(0, 5).map((line) => (
        <li key={line.id}>
          <div className="dl-row">
            {dated ? (
              <span className={`mh-tile is-${line.icon}`} aria-hidden>
                <small>{line.month}</small>
                <b>{line.day}</b>
              </span>
            ) : (
              <span className={`dl-ri mh-ri-${line.icon}`}>{LINE_ICONS[line.icon]}</span>
            )}
            <span className="dl-rt">
              <b>{line.title}</b>
              <small>{line.detail}</small>
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function NeedsList({
  needs,
  groups,
  casesUnknown,
}: {
  needs: readonly ManagerNeed[];
  groups: ReturnType<typeof groupNeeds> | null;
  casesUnknown: boolean;
}) {
  const unknown = casesUnknown ? <p className="dl-empty mh-unknown">Shift changes couldn't be checked.</p> : null;
  if (!needs.length)
    return (
      <>
        <div className="dl-calm">
          <CircleCheck size={34} />
          <div>
            <b>You’re all caught up</b>
            <span>Nothing needs your answer right now.</span>
          </div>
        </div>
        {unknown}
      </>
    );
  return (
    <>
      <ul className="dl-rows">
        {groups
          ? groups.map((group) => [
              <li className="mh-grp" key={`g:${group.id}`}>
                {group.name}
              </li>,
              ...group.needs.map((need) => <NeedRow key={need.id} need={need} />),
            ])
          : needs.map((need) => <NeedRow key={need.id} need={need} />)}
      </ul>
      {unknown}
    </>
  );
}

function NeedRow({ need }: { need: ManagerNeed }) {
  const icon =
    need.kind === "docs" ? <TriangleAlert size={20} /> : need.kind === "timeoff" ? <CalendarX size={20} /> : need.kind === "swap" ? <ArrowLeftRight size={20} /> : <CalendarDays size={20} />;
  const body = (
    <>
      <span className={`dl-ri mh-ri-${need.kind}`}>{icon}</span>
      <span className="dl-rt">
        <b>{need.title}</b>
        {need.detail ? <small>{need.detail}</small> : null}
        <em>{need.cta}</em>
      </span>
      {need.href ? <ChevronRight size={18} /> : null}
    </>
  );
  return (
    <li>
      {need.href ? (
        <Link className={`dl-row${need.urgent ? " is-urgent" : ""}`} to={need.href}>
          {body}
        </Link>
      ) : (
        <div className="dl-row">{body}</div>
      )}
    </li>
  );
}

function WeekStrip({ locations, phone }: { locations: readonly ManagerHomeLocation[]; phone: boolean }) {
  const first = locations[0];
  if (!first) return <p className="dl-empty">No locations to show yet.</p>;
  const days = first.week.map((item, index) => ({
    date: item.date,
    shifts: locations.reduce((sum, place) => sum + (place.week[index]?.shifts ?? 0), 0),
    open: locations.reduce((sum, place) => sum + (place.week[index]?.open ?? 0), 0),
    draft: locations.some((place) => place.week[index] && !place.week[index]!.published),
  }));
  const top = Math.max(1, ...days.map((item) => item.shifts));
  return (
    <div className="dl-wk mh-wk" role="group" aria-label="Next 7 days">
      {days.map((item) => {
        const when = new Date(`${item.date}T12:00:00Z`);
        const weekday = when.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
        const long = when.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
        return (
          <Link
            key={item.date}
            className={`dl-wk-d${item.date === first.today ? " is-today" : ""}${item.shifts ? " has" : ""}${item.open ? " has-open" : ""}${item.draft ? " is-draft" : ""}`}
            style={{ "--h": (item.shifts / top).toFixed(3) } as CSSProperties}
            to={phone ? "/app/schedule/lineup" : `/app/schedule?date=${item.date}`}
            aria-label={`${long}: ${item.shifts} shifts, ${item.open} open${item.draft ? ", not published" : ""}`}
          >
            <span className="dl-wk-n">{weekday}</span>
            <span className="dl-wk-num">{when.getUTCDate()}</span>
            <span className="dl-wk-bar" aria-hidden />
            <span className="dl-wk-s">{item.draft && !item.shifts ? "Draft" : item.open ? `${item.open} open` : item.shifts}</span>
          </Link>
        );
      })}
    </div>
  );
}

type ChecklistItem = {
  readonly id: OwnerSetupChecklistItemId;
  readonly label: string;
  readonly to: string | null;
  readonly required: boolean;
};

const ownerSetupChecklistItems: readonly ChecklistItem[] = [
  {
    id: "app_tour",
    label: "App tour",
    to: null,
    required: true,
  },
  {
    id: "scheduling_preferences",
    label: "Set scheduling preferences",
    to: "/app/settings/scheduling?checklist=setup",
    required: true,
  },
  {
    id: "employees",
    label: "Employees",
    to: "/app/employees",
    required: false,
  },
  {
    id: "documents",
    label: "Documents",
    to: "/app/settings/documents",
    required: false,
  },
  {
    id: "schedule",
    label: "First schedule view",
    to: "/app/schedule",
    required: false,
  },
  {
    id: "billing",
    label: "Billing",
    to: "/account/workspaces?checklist=billing",
    required: false,
  },
];

const ownerSetupChecklistKey = (workspaceId: string) => ["owner-setup-checklist", workspaceId];

function OwnerSetupChecklist({
  workspaceId,
}: {
  readonly workspaceId: string;
}) {
  const phone = usePhoneWidth();
  const queryClient = useQueryClient();
  const queryKey = ownerSetupChecklistKey(workspaceId);
  const progressQuery = useQuery({
    queryKey,
    queryFn: () => getOwnerSetupChecklistProgress(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const markMutation = useMutation({
    mutationFn: (id: OwnerSetupChecklistItemId) =>
      markOwnerSetupChecklistItem(workspaceId, id),
    onSuccess: async (progress) => {
      queryClient.setQueryData(queryKey, progress);
      await queryClient.invalidateQueries({ queryKey });
    },
  });
  if (progressQuery.isPending || progressQuery.data?.closed_at) return null;
  const unread = progressQuery.error && !progressQuery.data;

  const visited = new Set(progressQuery.data?.completed_item_ids ?? []);
  const markVisited = (id: OwnerSetupChecklistItemId) => {
    if (!visited.has(id)) markMutation.mutate(id);
  };
  const requiredCount = ownerSetupChecklistItems.filter(
    (item) => item.required,
  ).length;
  const requiredVisitedCount = ownerSetupChecklistItems.filter(
    (item) => item.required && visited.has(item.id),
  ).length;

  return (
    <section className="owner-setup-checklist" aria-labelledby="setup-title">
      <header>
        <div>
          <h2 id="setup-title">Setup checklist</h2>
          {unread ? null : <p>{requiredVisitedCount} of {requiredCount} required visits complete</p>}
        </div>
      </header>
      {unread ? (
        <LoadError
          inset
          level={3}
          title="We couldn't load the setup checklist"
          detail="Your visits didn't load. Nothing was changed."
          retrying={progressQuery.isFetching}
          onRetry={() => void progressQuery.refetch()}
        />
      ) : progressQuery.error ? (
        <RefreshError
          message="The setup checklist didn't refresh. These are the last visits that loaded."
          retrying={progressQuery.isFetching}
          onRetry={() => void progressQuery.refetch()}
        />
      ) : null}
      {markMutation.error ? (
        <p className="workspace-error" role="alert">
          Setup checklist progress could not be saved.
        </p>
      ) : null}
      {unread ? null : <div className="owner-setup-checklist-list">
        {/* KARARLAR "Schedule telefonda tamamen kapalı": a phone is not sent to Schedule. */}
        {ownerSetupChecklistItems.filter((item) => !(phone && item.to === "/app/schedule")).map((item) => {
          const done = visited.has(item.id);
          const content = (
            <>
              <span className="owner-setup-checklist-status" data-done={done}>
                {done ? <CheckCircle2 size={15} aria-hidden /> : null}
              </span>
              <span>
                <strong>{item.label}</strong>
                <small>{item.required ? "Required visit" : "Optional visit"}</small>
              </span>
              <ArrowRight size={15} aria-hidden />
            </>
          );
          return item.to ? (
            <Link
              className="owner-setup-checklist-item"
              key={item.id}
              to={item.to}
              onClick={() => markVisited(item.id)}
            >
              {content}
            </Link>
          ) : (
            <button
              className="owner-setup-checklist-item"
              key={item.id}
              type="button"
              onClick={() => markVisited(item.id)}
            >
              {content}
            </button>
          );
        })}
      </div>}
    </section>
  );
}

function TodoWidget({
  todos,
  workspaceId,
}: {
  todos: WorkspaceDashboard["todos"];
  workspaceId: string;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const createMutation = useMutation({
    mutationFn: (nextTitle: string) =>
      createWorkspaceTodo(workspaceId, {
        title: nextTitle,
        body: "",
        employee_id: null,
        due_at: null,
      }),
    onSuccess: async () => {
      setTitle("");
      await queryClient.invalidateQueries({ queryKey: ["workspace-dashboard"] });
    },
  });
  const resolveMutation = useMutation({
    mutationFn: (todoId: string) => resolveWorkspaceTodo(workspaceId, todoId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workspace-dashboard"] });
    },
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim() || createMutation.isPending) return;
    createMutation.mutate(title);
  };

  return (
    <div className="workspace-todos">
      <form className="workspace-todo-form" onSubmit={submit}>
        <input
          aria-label="New todo"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Add a todo"
          maxLength={160}
        />
        <button
          className="nf-button secondary"
          type="submit"
          disabled={!title.trim() || createMutation.isPending}
        >
          Add
        </button>
      </form>
      {createMutation.error || resolveMutation.error ? (
        <p className="workspace-error" role="alert">
          Todo update could not be saved.
        </p>
      ) : null}
      {todos.length ? (
        <div className="workspace-feed">
          {todos.map((item) => (
            <TodoPreview
              item={item}
              key={item.id}
              onResolve={(todoId) => resolveMutation.mutate(todoId)}
              resolving={resolveMutation.isPending}
            />
          ))}
        </div>
      ) : (
        <p className="workspace-empty">No open todos</p>
      )}
    </div>
  );
}

function TodoPreview({
  item,
  onResolve,
  resolving,
}: {
  item: WorkspaceTodo;
  onResolve: (todoId: string) => void;
  resolving: boolean;
}) {
  // BL-666 (2): the due date sits next to whose it is, not instead of it.
  const detail = [item.body, item.due_at ? dueLabel(item.due_at) : ""]
    .filter(Boolean)
    .join(" · ");
  const content = (
    <>
      <CheckCircle2 size={16} aria-hidden />
      <span>
        <strong>{item.title}</strong>
        <small>{detail}</small>
      </span>
    </>
  );
  const actionUrl = safeAppActionUrl(item.action_url);
  // BL-666 (4): only a row that goes somewhere carries the arrow.
  if (actionUrl) {
    return (
      <Link to={actionUrl}>
        {content}
        <ArrowRight size={15} aria-hidden />
      </Link>
    );
  }
  if (!item.system_generated) {
    return (
      <div className="workspace-todo-row">
        <div>{content}</div>
        <button
          className="icon-button"
          type="button"
          aria-label={`Resolve ${item.title}`}
          disabled={resolving}
          onClick={() => onResolve(item.id)}
        >
          <Check size={15} aria-hidden />
        </button>
      </div>
    );
  }
  return <div>{content}</div>;
}

/** Home in grey while it loads: the greeting, the location cards and a section, at their real place. */
function HomeOutline() {
  return (
    <section className="manager-home-page">
      <div className="eh-dashboard dl-home mh-home" data-slot="afternoon">
        <div className="dl-body mh-body">
          <LoadingOutline label="Loading Home">
            <div className="dl-hero">
              <Skeleton width="30%" height={14} />
              <Skeleton width="60%" height={36} />
              <Skeleton width="50%" height={16} />
            </div>
            <div className="mh-locs">
              {[0, 1, 2].map((card) => (
                <div className="mh-loc" key={card}>
                  <Skeleton width="50%" />
                  <Skeleton width="30%" height={28} />
                  <Skeleton width="90%" height={46} />
                </div>
              ))}
            </div>
          </LoadingOutline>
        </div>
      </div>
    </section>
  );
}

/** BL-1013: a due time still ahead reads "Due in 2h"; one gone by, "Due 2h ago". */
export function dueLabel(iso: string, now = Date.now()) {
  const ahead = Date.parse(iso) - now;
  return ahead > 0 ? `Due in ${elapsed(ahead)}` : `Due ${elapsed(-ahead)} ago`;
}
function elapsed(ms: number) {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes || 1}m`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;
}
export default WorkspacePage;
