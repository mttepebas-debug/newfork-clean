import type { MyLineup, OtherLineup } from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, CheckCircle2, ChevronDown, Clock, MapPin } from "lucide-react";
import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type JSX, type MouseEvent as ReactMouseEvent, type Ref } from "react";
import { Link, useLocation, useNavigate } from "react-router";

import { todayIn } from "../lib/today";
import { useListPhoneWidth } from "../lib/usePhoneWidth";
import { formatTime, type ScheduleTimeFormat } from "../schedule/lib/scheduleDateTime";
import { LINEUP_BUSY_MS } from "../schedule/lineup";
import { lineupKeys, useAcknowledgeLineup, useMyLineups } from "../schedule/lineup-data";
import { LineupDayPicker, LineupLocationSelect, LineupShiftTabs, type LineupShiftTab } from "../schedule/lineup-wheel-view";
import { LoadError, LoadingOutline, Skeleton } from "../shell/LoadState";
import { LineupArt } from "../lineup-art/LineupArt";
import { getEmployeeScheduleBoard } from "./employee-hub-data";
import "./employee-lineup.css";
import { FieldNote } from "../shell/FieldNote";

// The employee's Lineup (KARARLAR 2026-10-17 "E · Çark tarih seçildi": the employee screen as in E, which is
// C's): the manager's date row (‹ date ›, the location), day wheel and shift tabs, then her own shift as a ticket
// (location, date, in – out, position · label · section), Team · Notes, Acknowledge at the bottom (Mert
// 2026-10-17, ~7–8:30 AM). She sees a lineup only while it is published (PLAN §3); otherwise "isn't published
// yet". A published lineup at her location she is not on opens too, whole, with no ticket and no Acknowledge (Mert
// 2026-10-24). Employee → Schedule → Lineup.

type Row = MyLineup["team"][number];
/** One she is on, or one at her location she is not on (Mert 2026-10-24). */
type AnyLineup = MyLineup | OtherLineup;
const isMine = (lineup: AnyLineup): lineup is MyLineup => "mine" in lineup;
const keyOf = (lineup: AnyLineup) => lineup.shift_type_id ?? "none";

function range(row: { start_time: string; end_time: string }, format: ScheduleTimeFormat): string {
  return `${formatTime(row.start_time, format, "long")} – ${formatTime(row.end_time, format, "long")}`;
}

function longDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Where a page under Schedule opens, on the day the address has. */
export function employeeSchedulePath(page: "schedule" | "schedule/team" | "schedule/lineup", search: string): string {
  const date = new URLSearchParams(search).get("date");
  return `/app/employee-hub/${page}${date ? `?date=${date}` : ""}`;
}

/** The pages under the employee's Schedule (Mert 2026-10-17, "My shifts önce"): My shifts, Team schedule
 *  (the published board, not on a phone) and Lineup. */
export function EmployeeScheduleTabs({ tabsRef }: { readonly tabsRef?: Ref<HTMLElement> }): JSX.Element {
  const location = useLocation();
  const phone = useListPhoneWidth();
  const page = location.pathname.endsWith("/schedule/lineup") ? "schedule/lineup" : location.pathname.endsWith("/schedule/team") ? "schedule/team" : "schedule";
  const tabs: { id: "schedule" | "schedule/team" | "schedule/lineup"; label: string }[] = [
    { id: "schedule", label: "My shifts" },
    ...(phone ? [] : [{ id: "schedule/team" as const, label: "Team schedule" }]),
    { id: "schedule/lineup", label: "Lineup" },
  ];
  return (
    <nav className="employee-schedule-tabs" aria-label="Schedule pages" ref={tabsRef}>
      {tabs.map((tab) => (
        <Link key={tab.id} to={employeeSchedulePath(tab.id, location.search)} aria-current={page === tab.id ? "page" : undefined}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

export function EmployeeLineup({
  workspaceId,
  employeeId,
  date,
  timeFormat,
  zone,
}: {
  readonly workspaceId: string;
  readonly employeeId: string;
  readonly date: string;
  readonly timeFormat: ScheduleTimeFormat;
  // The primary location's zone (S-226).
  readonly zone?: string;
}): JSX.Element {
  const today = todayIn(zone);
  const navigate = useNavigate();
  const query = useMyLineups(workspaceId, date);
  // Her lineups in the day's order (by her own start): the location row lists their locations in it.
  const lineups = [...(query.data?.lineups ?? [])].sort((a, b) => {
    const start = (lineup: typeof a) => lineup.mine.map((row) => row.start_time).sort()[0] ?? "99:99";
    return start(a).localeCompare(start(b));
  });
  // The location picked; null is All locations (Mert 2026-10-17 ~9:10 AM), the default with more than one.
  const [chosenLocation, setChosenLocation] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  // Her published schedule that day (the read her Schedule page makes): the shift types for the tabs, her
  // scheduled times for a changed time on the ticket, and, before a lineup is published, whether she works.
  const board = useQuery({
    queryKey: [...lineupKeys.allMine(workspaceId), "board", date],
    queryFn: () => getEmployeeScheduleBoard(workspaceId, date),
    enabled: Boolean(query.data),
  });
  const ownShifts = (board.data?.shifts ?? [])
    .filter((s) => s.employee_id === employeeId && s.scheduled_date === date)
    .sort((a, b) => (a.start_time < b.start_time ? -1 : a.start_time > b.start_time ? 1 : 0));
  // A day before today where the location is: what wasn't published then never will be (Mert 2026-10-24).
  const past = date < today;
  // Hers first, then the published ones at her locations she is not on, in the read's order (Mert 2026-10-24).
  const published: AnyLineup[] = [...lineups, ...(query.data?.others ?? [])];
  // The location row lists where a lineup is published that day, then where she works (before anything is
  // published, only that).
  const locations = unique([
    ...published.map((item) => item.location),
    ...ownShifts.flatMap((s) => board.data?.locations.filter((item) => item.id === s.location_id) ?? []),
  ]);
  const picked = locations.find((item) => item.id === chosenLocation) ?? null;
  const shown = picked ? [picked] : locations.length > 1 ? locations : locations.slice(0, 1);
  const loading = query.isLoading || board.isLoading;
  // Mert 2026-10-17 (~8:35 AM): every shift type shows as a tab; one with a published lineup can be pressed (hers,
  // called off too, or since 2026-10-24 one she is not on). With All locations a tab stands for that shift at every
  // place shown (~9:10 AM). The types are her schedule read's.
  const here = published.filter((item) => shown.some((place) => place.id === item.location.id));
  const shifts = shiftTabs(board.data?.shift_types ?? [], here, past);
  const open = shifts.filter((item) => item.lineups.length);
  // Her own shift that day at the places shown: its tab opens first when she is on no lineup (Mert 2026-10-24).
  const own = ownShifts.find((s) => shown.some((place) => place.id === s.location_id));
  const ownName = own?.shift_type_id ? board.data?.shift_types.find((t) => t.id === own.shift_type_id)?.name ?? null : null;
  // Which tab opens first (Mert 2026-10-24): one she is on; else her own shift's, published or not; else the first
  // published one.
  const first =
    open.find((item) => item.lineups.some(isMine)) ??
    (own ? shifts.find((item) => item.key === (own.shift_type_id ?? "none")) : undefined) ??
    open[0] ??
    null;
  // A shift she chose stays chosen when she picks one place, published elsewhere that day but not there: that place
  // says it isn't published (Mert 2026-10-24; it pointed to All locations before).
  const elsewhere =
    picked && chosen && !open.some((item) => item.key === chosen) && published.some((item) => keyOf(item) === chosen)
      ? { name: shifts.find((item) => item.key === chosen)?.name ?? published.find((item) => keyOf(item) === chosen)?.shift_type_name ?? null }
      : null;
  const opened = elsewhere ? null : open.find((item) => item.key === chosen) ?? first;
  const current = opened?.lineups.length ? opened : null;
  // The shift a card with nothing published names: the tab, else her own shift's.
  const emptyName = elsewhere ? elsewhere.name : opened?.name ?? ownName;
  const tabs = shifts.length ? (
    <LineupShiftTabs
      shifts={shifts.map(({ lineups: _lineups, ...tab }) => tab)}
      chosen={current?.key ?? null}
      onChoose={setChosen}
    />
  ) : null;

  let body: JSX.Element;
  if (loading) body = <LineupOutline />;
  else if (!query.data)
    body = (
      <LoadError
        title="We couldn't load your lineup"
        detail={`${longDate(date)} didn't load. Nothing was changed.`}
        retrying={query.isFetching}
        onRetry={() => void query.refetch()}
      />
    );
  else if (!current)
    body = (
      <div className="employee-lineup">
        {tabs}
        {/* Mert 2026-10-24: one card for a shift with nothing published, the shift's name when known (the tab, else
            her own shift's); no promise of a notification, since only the people on a lineup are told of it. */}
        <NotPublished name={emptyName} past={past} />
      </div>
    );
  else {
    const many = current.lineups.length > 1;
    body = (
      <div className="employee-lineup">
        {tabs}
        {current.lineups.map((lineup, index) => {
          const scheduled = ownShifts.find(
            (s) => s.location_id === lineup.location.id && (s.shift_type_id ?? null) === lineup.shift_type_id,
          );
          return (
            <Fragment key={lineup.version_id}>
              {/* Between lineups, a line (Mert 2026-10-17 ~11:20 AM). */}
              {index ? <hr className="employee-lineup-sep" /> : null}
              {isMine(lineup) ? (
                <LineupView
                  workspaceId={workspaceId}
                  lineup={lineup}
                  date={date}
                  scheduled={scheduled ? { start_time: scheduled.start_time, end_time: scheduled.end_time } : null}
                  timeFormat={timeFormat}
                  named={many}
                />
              ) : (
                <OtherLineupView lineup={lineup} date={date} today={today} timeFormat={timeFormat} named={many} />
              )}
            </Fragment>
          );
        })}
      </div>
    );
  }

  return (
    <div className="employee-lineup-page">
      <div className="employee-lineup-day">
        <LineupDayPicker
          date={date}
          today={today}
          onDate={(iso) => void navigate({ search: iso === today ? "" : `?date=${iso}` }, { replace: true })}
        >
          <LineupLocationSelect
            loading={loading}
            locations={locations}
            value={picked?.id ?? ""}
            allLabel="All locations"
            onChange={(id) => setChosenLocation(id || null)}
          />
        </LineupDayPicker>
      </div>
      {body}
    </div>
  );
}

type ShiftTabWithLineups = LineupShiftTab & { readonly lineups: readonly AnyLineup[] };

/**
 * The shift tabs at the places shown: every shift type (and a lineup's type the catalog no longer has), by its
 * start, the same start by name. A tab opens on the published lineups of that shift, hers first (called off too);
 * its count is the people on them; the others stay grey and say nothing was published (Mert 2026-10-24).
 */
function shiftTabs(
  types: readonly { id: string; name: string; color: string; default_start_time: string | null }[],
  lineups: readonly AnyLineup[],
  past: boolean,
): ShiftTabWithLineups[] {
  const tabs = new Map<string, { key: string; name: string; color: string | null; start: string; lineups: AnyLineup[] }>();
  for (const type of types)
    tabs.set(type.id, { key: type.id, name: type.name, color: type.color, start: type.default_start_time ?? "99:99", lineups: [] });
  for (const lineup of lineups) {
    const key = keyOf(lineup);
    const known = tabs.get(key);
    if (known) known.lineups.push(lineup);
    else
      tabs.set(key, {
        key,
        name: lineup.shift_type_name ?? "Shift",
        color: lineup.color,
        // Her start on hers; the first start on one she is not on.
        start: (isMine(lineup) ? lineup.mine : lineup.team).map((row) => row.start_time).sort()[0] ?? "99:99",
        lineups: [lineup],
      });
  }
  return [...tabs.values()]
    .sort((a, b) => a.start.slice(0, 5).localeCompare(b.start.slice(0, 5)) || a.name.localeCompare(b.name, "en-US", { sensitivity: "base" }))
    .map(({ start: _start, ...tab }) =>
      tab.lineups.length
        ? { ...tab, count: tab.lineups.reduce((sum, lineup) => sum + lineup.team.filter((row) => !row.called_off).length, 0) }
        : { ...tab, count: 0, disabled: true, title: notPublished(tab.name, past) },
    );
}

/** Nothing published for a shift (Mert 2026-10-24): not yet, or, on a past day, not at all. */
function notPublished(name: string | null, past: boolean): string {
  return past ? `No ${name ? `${name} ` : ""}lineup was published that day` : `The ${name ? `${name} ` : ""}lineup isn't published yet`;
}

/** Each location once, in the order first met. */
function unique<T extends { readonly id: string; readonly name: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => !seen.has(item.id) && Boolean(seen.add(item.id)));
}

function LineupView({
  workspaceId,
  lineup,
  date,
  scheduled,
  timeFormat,
  named,
}: {
  readonly workspaceId: string;
  readonly lineup: MyLineup;
  readonly date: string;
  /** Her times on the published schedule, when she has a shift there. */
  readonly scheduled: { readonly start_time: string; readonly end_time: string } | null;
  readonly timeFormat: ScheduleTimeFormat;
  /** More than one lineup shown (All locations): each names its place. */
  readonly named: boolean;
}): JSX.Element {
  const [tab, setTab] = useState<"team" | "notes">("team");
  const ids = useId();
  // A tap on the ticket folds Team · Notes (Mert 2026-10-17 ~9:10 AM); the ticket and Acknowledge stay.
  const [open, setOpen] = useState(true);
  const acknowledge = useAcknowledgeLineup(workspaceId);
  const [acked, setAcked] = useState(Boolean(lineup.acknowledged_at));
  // Acknowledge works in place (Mert 2026-10-17 ~1:45–1:50 PM): a spinner and "Acknowledging…" for at least
  // LINEUP_BUSY_MS, then "Acknowledged." slides in where the button was; no notice.
  const [working, setWorking] = useState(false);
  const [fresh, setFresh] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  // While it works the button is aria-disabled, not disabled, so it keeps the keyboard's focus (D2); when it goes,
  // focus moves to the ticket's fold rather than falling to the page. In the same commit that removes the button
  // (a layout effect): a passive effect left focus on the page for a moment, and a check then found it there.
  const ackBox = useRef<HTMLDivElement | null>(null);
  const foldButton = useRef<HTMLButtonElement | null>(null);
  const [focusFold, setFocusFold] = useState(false);
  useLayoutEffect(() => {
    if (!focusFold) return;
    foldButton.current?.focus();
    setFocusFold(false);
  }, [focusFold]);
  const ack = () => {
    if (working) return;
    const since = Date.now();
    setWorking(true);
    acknowledge.mutate(lineup.version_id, {
      onSuccess: () => {
        timer.current = window.setTimeout(() => {
          const focused = Boolean(ackBox.current?.contains(document.activeElement));
          setWorking(false);
          setAcked(true);
          setFresh(true);
          if (focused) setFocusFold(true);
        }, Math.max(0, LINEUP_BUSY_MS - (Date.now() - since)));
      },
      onError: () => setWorking(false),
    });
  };
  const fold = (event: ReactMouseEvent<HTMLElement>) => {
    if ((event.target as Element).closest("button, a")) return;
    setOpen(!open);
  };
  const name = lineup.shift_type_name ?? "Shift";
  const me = lineup.mine[0]!;
  const notes = notesOf(lineup);
  const live = lineup.team.filter((row) => !row.called_off);
  const style = { "--lineup-shift": lineup.color ?? "var(--theme-border-strong)" } as CSSProperties;
  // Position · label · section (Mert 2026-10-17 ~8:30 AM), the empty ones left out.
  const detail = [me.job_name, ...me.label_names, me.section_name].filter(Boolean).join(" · ");
  const hm = (time: string) => time.slice(0, 5);
  const was = scheduled && (hm(scheduled.start_time) !== hm(me.start_time) || hm(scheduled.end_time) !== hm(me.end_time)) ? scheduled : null;

  return (
    <section className="employee-lineup-view" style={style} aria-label={`${name} lineup${named ? `, ${lineup.location.name}` : ""}`}>
      {/* The ticket and Team · Notes stay at the top of a phone's list while the team passes under them
          (Mert 2026-10-19 ~06:30 AM, CALISAN-SCROLL; employee-lineup.css). */}
      <div className="employee-lineup-head">
        <div className="employee-lineup-ticket" onClick={fold}>
          <button
            type="button"
            ref={foldButton}
            className="employee-lineup-fold"
            aria-expanded={open}
            aria-controls={open ? `${ids}panel` : undefined}
            aria-label={open ? "Hide team and notes" : "Show team and notes"}
            onClick={() => setOpen(!open)}
          >
            <ChevronDown size={18} aria-hidden />
          </button>
          <div className="employee-lineup-stub">
            <LineupArt
              artKey={me.art_key}
              name={lineup.team.find((row) => row.is_me)?.name ?? ""}
              size={52}
              className="employee-lineup-avatar is-large"
              style={{ "--job": me.job_color ?? "var(--theme-border-strong)" } as CSSProperties}
            />
            <b>{name}</b>
          </div>
          <div className="employee-lineup-ticket-body">
            {me.called_off ? <p className="employee-lineup-called-off">You're called off.</p> : null}
            <p className="employee-lineup-place">
              <MapPin size={15} aria-hidden />
              {lineup.location.name}
            </p>
            <p className="employee-lineup-date">{longDate(date)}</p>
            {was ? (
              <p className="employee-lineup-time is-changed">
                <TimeSwap was={was.start_time} now={me.start_time} format={timeFormat} />
                {" – "}
                <TimeSwap was={was.end_time} now={me.end_time} format={timeFormat} />
                <span className="sr-only">{`${range(me, timeFormat)}, changed today, was ${range(was, timeFormat)}`}</span>
              </p>
            ) : (
              <p className="employee-lineup-time">{range(me, timeFormat)}</p>
            )}
            {detail ? <p className="employee-lineup-detail">{detail}</p> : null}
          </div>
        </div>

        {open ? <TeamNotesTabs ids={ids} name={name} tab={tab} onTab={setTab} people={live.length} notes={notes.length} /> : null}
      </div>

      {open ? <TeamNotesPanel ids={ids} tab={tab} lineup={lineup} timeFormat={timeFormat} /> : null}

      {lineup.ask_ack ? (
        acked ? (
          <p className={`employee-lineup-acked${fresh ? " is-in" : ""}`} role="status">
            <CheckCircle2 size={20} aria-hidden />
            Acknowledged.
          </p>
        ) : (
          <div className="employee-lineup-ack" ref={ackBox}>
            <Button
              className={working ? "is-working" : undefined}
              aria-disabled={working || undefined}
              aria-busy={working || undefined}
              onClick={ack}
            >
              {working ? (
                <>
                  <span className="employee-lineup-spin" aria-hidden />
                  Acknowledging…
                </>
              ) : (
                "Acknowledge"
              )}
            </Button>
            <FieldNote
              id={`employee-lineup-ack-${lineup.version_id}`}
              error={acknowledge.isError && !working ? "It didn't go through. Check your connection, then try again." : null}
            />
          </div>
        )
      ) : null}
    </section>
  );
}

/**
 * A published lineup at her location she is not on (Mert 2026-10-24): Team · Notes as on hers, with no ticket and no
 * Acknowledge (only the people on it are told of it). In the ticket's place, today or a day ahead, one quiet line;
 * on a past day nothing. With more than one shown, it names its place as a ticket would.
 */
function OtherLineupView({
  lineup,
  date,
  today,
  timeFormat,
  named,
}: {
  readonly lineup: OtherLineup;
  readonly date: string;
  readonly today: string;
  readonly timeFormat: ScheduleTimeFormat;
  readonly named: boolean;
}): JSX.Element {
  const [tab, setTab] = useState<"team" | "notes">("team");
  const ids = useId();
  const name = lineup.shift_type_name ?? "Shift";
  const which = lineup.shift_type_name ? `the ${lineup.shift_type_name} lineup` : "this lineup";
  return (
    <section className="employee-lineup-view is-other" aria-label={`${name} lineup${named ? `, ${lineup.location.name}` : ""}`}>
      <div className="employee-lineup-head">
        {named ? (
          <p className="employee-lineup-place">
            <MapPin size={15} aria-hidden />
            {lineup.location.name}
          </p>
        ) : null}
        {date >= today ? <p className="employee-lineup-note">{`You're not on ${which} ${date === today ? "today" : "that day"}`}</p> : null}
        <TeamNotesTabs
          ids={ids}
          name={name}
          tab={tab}
          onTab={setTab}
          people={lineup.team.filter((row) => !row.called_off).length}
          notes={notesOf(lineup).length}
        />
      </div>
      <TeamNotesPanel ids={ids} tab={tab} lineup={lineup} timeFormat={timeFormat} />
    </section>
  );
}

/** A lineup's notes with something in them, in their order. */
function notesOf(lineup: AnyLineup) {
  return ([
    ["Specials", lineup.notes.specials],
    ["86s", lineup.notes.n86],
    ["Shift notes", lineup.notes.shift_notes],
  ] as const).filter(([, text]) => text.trim());
}

/** Team · Notes: ← → move between them, one tab stop (WAI-ARIA tabs). */
function TeamNotesTabs({
  ids,
  name,
  tab,
  onTab,
  people,
  notes,
}: {
  readonly ids: string;
  readonly name: string;
  readonly tab: "team" | "notes";
  readonly onTab: (tab: "team" | "notes") => void;
  readonly people: number;
  readonly notes: number;
}) {
  return (
    <div
      className="employee-lineup-tabs"
      role="tablist"
      aria-label={`${name} lineup`}
      onKeyDown={(event) => {
        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
        event.preventDefault();
        const next = tab === "team" ? "notes" : "team";
        onTab(next);
        document.getElementById(`${ids}${next}-tab`)?.focus();
      }}
    >
      <button type="button" role="tab" id={`${ids}team-tab`} aria-selected={tab === "team"}
        tabIndex={tab === "team" ? 0 : -1} aria-controls={`${ids}panel`} onClick={() => onTab("team")}>
        Team<span>{people}</span>
      </button>
      <button type="button" role="tab" id={`${ids}notes-tab`} aria-selected={tab === "notes"}
        tabIndex={tab === "notes" ? 0 : -1} aria-controls={`${ids}panel`} onClick={() => onTab("notes")}>
        Notes{notes ? <span>{notes}</span> : null}
      </button>
    </div>
  );
}

function TeamNotesPanel({
  ids,
  tab,
  lineup,
  timeFormat,
}: {
  readonly ids: string;
  readonly tab: "team" | "notes";
  readonly lineup: AnyLineup;
  readonly timeFormat: ScheduleTimeFormat;
}) {
  const notes = notesOf(lineup);
  return (
    <div role="tabpanel" id={`${ids}panel`} aria-labelledby={`${ids}${tab}-tab`}>
      {tab === "notes" ? (
        notes.length ? (
          <div className="employee-lineup-notes">
            {notes.map(([title, text]) => (
              <div key={title}>
                <b>{title}</b>
                <p>{text}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="employee-lineup-none">No notes for this shift.</p>
        )
      ) : (
        <Team rows={lineup.team} timeFormat={timeFormat} />
      )}
    </div>
  );
}

/**
 * One end of a changed time (Mert 2026-10-17 ~8:30 AM): the old value is struck through, fades, and the new one
 * is written over it, every 5 s (employee-lineup.css). An end that didn't change is plain. Screen readers get
 * the sentence beside it instead.
 */
function TimeSwap({ was, now, format }: { readonly was: string; readonly now: string; readonly format: ScheduleTimeFormat }) {
  const value = formatTime(now, format, "long");
  if (was.slice(0, 5) === now.slice(0, 5)) return <span aria-hidden>{value}</span>;
  return (
    <span className="employee-lineup-swap" aria-hidden>
      <span className="employee-lineup-old">
        {formatTime(was, format, "long")}
        <i />
      </span>
      <span className="employee-lineup-new">{value}</span>
    </span>
  );
}

function Team({ rows, timeFormat }: { readonly rows: readonly Row[]; readonly timeFormat: ScheduleTimeFormat }) {
  const departments = new Map<string, Map<string, Row[]>>();
  for (const row of rows) {
    const department = departments.get(row.department_name ?? "Other") ?? new Map<string, Row[]>();
    departments.set(row.department_name ?? "Other", department);
    const job = department.get(row.job_name ?? "Job") ?? [];
    department.set(row.job_name ?? "Job", job);
    job.push(row);
  }
  return (
    <>
      {[...departments.entries()].map(([department, jobs]) => (
        <section key={department} className="employee-lineup-department" aria-label={department}>
          <h3>
            {department}
            <span>{[...jobs.values()].reduce((sum, job) => sum + job.length, 0)}</span>
          </h3>
          <div className="employee-lineup-list">
            {[...jobs.entries()].map(([job, people]) => (
              <div key={job}>
                <p className="employee-lineup-job">
                  <i style={{ background: people[0]?.job_color ?? "var(--theme-border-strong)" }} aria-hidden />
                  {job}
                  <span>{people.length}</span>
                </p>
                <ul aria-label={job}>
                  {people.map((row) => (
                    <li key={`${row.employee_id}-${row.start_time}`} className={row.is_me ? "is-me" : undefined}>
                      <LineupArt
                        artKey={row.art_key}
                        name={row.name ?? ""}
                        size={38}
                        className="employee-lineup-avatar"
                        style={{ "--job": row.job_color ?? "var(--theme-border-strong)" } as CSSProperties}
                      />
                      <span className="employee-lineup-mid">
                        <span className="employee-lineup-name">
                          {row.name ?? "Team member"}
                          {/* Mert 2026-10-14: the green row marks her, no "You" on screen; a screen reader still hears it. */}
                          {row.is_me ? <span className="sr-only">(you)</span> : null}
                        </span>
                        <span className="employee-lineup-row-time">
                          {row.called_off ? "Called off" : range(row, timeFormat)}
                        </span>
                      </span>
                      {row.section_name || row.label_names.length ? (
                        <span className="employee-lineup-tags">
                          {row.section_name ? <span className="employee-lineup-section">{row.section_name}</span> : null}
                          {row.label_names.map((label) => (
                            <i key={label} className="employee-lineup-chip">{label}</i>
                          ))}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

/** Nothing published for the shift (Mert 2026-10-24): today or ahead it may still come; on a past day, the title alone. */
function NotPublished({ name, past }: { readonly name: string | null; readonly past: boolean }) {
  return past ? (
    <Calm icon={<CalendarDays size={26} aria-hidden />} title={notPublished(name, true)} />
  ) : (
    <Calm icon={<Clock size={26} aria-hidden />} title={notPublished(name, false)}>
      It shows here once it's published.
    </Calm>
  );
}

function Calm({ icon, title, children }: { readonly icon: JSX.Element; readonly title: string; readonly children?: string }) {
  return (
    <div className="employee-lineup-calm">
      {icon}
      <b>{title}</b>
      {children ? <span>{children}</span> : null}
    </div>
  );
}

function LineupOutline() {
  return (
    <LoadingOutline label="Loading your lineup" className="employee-lineup">
      <Skeleton width="100%" height={112} style={{ borderRadius: 14, marginTop: 12 }} />
      <Skeleton width="100%" height={44} style={{ marginTop: 16 }} />
      {[0, 1, 2].map((index) => (
        <Skeleton key={index} width="100%" height={56} style={{ marginTop: 8, borderRadius: 10 }} />
      ))}
    </LoadingOutline>
  );
}
