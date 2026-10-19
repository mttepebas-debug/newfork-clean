import { ChevronLeft, ChevronRight, Users } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import {
  lineupHoursChange,
  phoneLineupKey,
  phoneShiftTabs,
  type LineupLocation,
  type LineupRow,
  type LineupShift,
} from "../schedule/lineup";
import { LineupDayPicker, LineupLocationSelect, LineupShiftTabs } from "../schedule/lineup-wheel-view";
import { formatTime, type ScheduleTimeFormat } from "../schedule/lib/scheduleDateTime";
import { LoadingOutline, Skeleton } from "../shell/LoadState";
import { LineupCard, NotesPane, ReadPane, Segments, type Seg } from "./LineupPhone";
import { LineupPersonCircle } from "./LineupPersonCircle";
import "./lineup-desktop.css";

// The desktop Lineup, F (Mert 2026-10-19 ~2:45 AM, "f harika"; mockup yapim/masaustu/desk.js): the phone's day
// picker over the page (the date and location, a 15-day wheel, the shift tabs), then one location's ticket in the
// middle between two arrows as tall as it (none with one location), Team · Notes · Read in its foot. Only the list
// under the ticket scrolls. The team is one list under column headings: person, position, label, in – out, section,
// each heading centred on its column's content and Section the last column, by the list's right edge (Mert
// 2026-10-19 ~5:30 AM). Read-only (LINEUP-EDIT W1); editing in the row (and its Call off column) comes with W2.

function range(start: string, end: string, format: ScheduleTimeFormat): string {
  if (!start || !end) return "";
  return `${formatTime(start, format, "long")} – ${formatTime(end, format, "long")}`;
}

/** "1 h 30 min", "45 min", "2 h". */
function span(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours ? `${hours} h` : "", rest ? `${rest} min` : ""].filter(Boolean).join(" ");
}

export function DesktopLineupPage({
  header,
  workspaceId,
  date,
  dateLabel,
  today,
  onDate,
  loading,
  error,
  locations,
  locationId,
  onLocation,
  chosen,
  onShift,
  nowAt,
  timeFormat,
  canEdit,
  held,
  waiting,
}: {
  readonly header: ReactNode;
  readonly workspaceId: string | null;
  readonly date: string;
  /** The day on the ticket: "Tue, Oct 13". */
  readonly dateLabel: string;
  readonly today: string;
  readonly onDate: (iso: string) => void;
  readonly loading: boolean;
  /** The load-error card, when the day didn't load. */
  readonly error: ReactNode | null;
  readonly locations: readonly LineupLocation[];
  /** The location picked; "" is All locations (one location: that one). */
  readonly locationId: string;
  readonly onLocation: (id: string) => void;
  readonly chosen: string;
  readonly onShift: (key: string) => void;
  /** HH:MM on a location's clock when the day is today there: its lock reads it. */
  readonly nowAt: (location: LineupLocation) => string | null;
  readonly timeFormat: ScheduleTimeFormat;
  /** May take a published lineup back to draft (the ticket's Edit). */
  readonly canEdit: boolean;
  /** The Publish window is open over the page: a lineup that goes out lights up once it closes. */
  readonly held: boolean;
  /** The Publish window is publishing: the day waits. */
  readonly waiting: boolean;
}) {
  // The ticket shown when All locations has more than one: the arrows move it (Mert 2026-10-19 ~2:10 AM).
  const [at, setAt] = useState("");
  // Each location and shift keeps its own tab.
  const [segs, setSegs] = useState<Readonly<Record<string, Seg>>>({});
  const picked = locations.find((item) => item.id === locationId) ?? null;
  const shown = picked ? [picked] : locations.length > 1 ? locations : locations.slice(0, 1);
  const ready = !loading && !error;
  const open = ready ? shown.filter((item) => !item.closed) : [];
  const key = ready ? phoneLineupKey(open, chosen, nowAt) : null;
  const tabs = phoneShiftTabs(open);
  const lineups = open.flatMap((location) => {
    const shift = location.shifts.find((item) => item.key === key);
    return shift ? [{ location, shift }] : [];
  });
  const index = Math.max(0, lineups.findIndex(({ location }) => location.id === at));
  const current = lineups[index] ?? null;
  const many = lineups.length > 1;
  const closed = shown.filter((item) => item.closed);

  let body: ReactNode;
  if (loading) body = <DesktopLineupOutline />;
  else if (error) body = <div className="lineup-desk-scroll">{error}</div>;
  else if (!locations.length) body = <p className="lineup-desk-empty">No locations to show.</p>;
  else if (!current)
    body = (
      <p className="lineup-desk-empty">
        {closed.length
          ? closed.map((item) => (
              <span key={item.id}>
                {item.name} · Closed today · {item.closed!.title}
              </span>
            ))
          : "No shifts this day."}
      </p>
    );
  else {
    const segKey = `${current.location.id}:${current.shift.key}`;
    body = (
      <DesktopLineup
        key={segKey}
        location={current.location}
        shift={current.shift}
        dateLabel={dateLabel}
        now={nowAt(current.location)}
        timeFormat={timeFormat}
        edit={canEdit ? { workspaceId, date } : null}
        held={held}
        day={date}
        seg={segs[segKey] ?? "team"}
        onSeg={(seg) => setSegs((now) => ({ ...now, [segKey]: seg }))}
        previous={many ? (lineups[index - 1]?.location ?? null) : undefined}
        next={many ? (lineups[index + 1]?.location ?? null) : undefined}
        onMove={(location) => setAt(location.id)}
      />
    );
  }

  return (
    <section className="lineup-page list-page lineup-desk-page" aria-labelledby="lineup-title">
      {header}
      <div className="lineup-desk-top">
        <LineupDayPicker date={date} today={today} onDate={onDate} days={15} waiting={waiting}>
          <LineupLocationSelect
            loading={loading}
            locations={locations}
            value={picked?.id ?? ""}
            allLabel="All locations"
            onChange={onLocation}
          />
        </LineupDayPicker>
        {loading ? (
          <div className="lineup-phone-outline-tabs" aria-hidden>
            <Skeleton width={64} height={12} className="on-page" />
            <Skeleton width={70} height={12} className="on-page" />
            <Skeleton width={56} height={12} className="on-page" />
          </div>
        ) : tabs.length ? (
          <LineupShiftTabs shifts={tabs} chosen={key} onChoose={onShift} />
        ) : null}
      </div>
      {body}
    </section>
  );
}

/** One location's lineup: its ticket between the arrows, and under it the chosen tab's content, which scrolls. */
function DesktopLineup({
  location,
  shift,
  dateLabel,
  now,
  timeFormat,
  edit,
  held,
  day,
  seg: picked,
  onSeg,
  previous,
  next,
  onMove,
}: {
  readonly location: LineupLocation;
  readonly shift: LineupShift;
  readonly dateLabel: string;
  readonly now: string | null;
  readonly timeFormat: ScheduleTimeFormat;
  readonly edit: { readonly workspaceId: string | null; readonly date: string } | null;
  readonly held: boolean;
  readonly day: string;
  readonly seg: Seg;
  readonly onSeg: (seg: Seg) => void;
  /** With more than one location: the one before and after (null at an end); undefined with one location. */
  readonly previous: LineupLocation | null | undefined;
  readonly next: LineupLocation | null | undefined;
  readonly onMove: (location: LineupLocation) => void;
}) {
  const ids = useId();
  const panel = `${ids}panel`;
  // Read is off until the lineup is published, as on the phone.
  const seg: Seg = picked === "read" && !shift.publish.published ? "team" : picked;
  const arrows = previous !== undefined;
  // Another tab starts at its top (the mockup's resetDetail), not where the last one was scrolled.
  const list = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (list.current) list.current.scrollTop = 0;
  }, [seg]);
  return (
    <div className="lineup-desk">
      <div className={`lineup-desk-ticket${arrows ? "" : " is-one"}`}>
        {arrows ? <MoveArrow to={previous ?? null} back onMove={onMove} /> : null}
        <LineupCard
          location={location}
          shift={shift}
          dateLabel={dateLabel}
          now={now}
          timeFormat={timeFormat}
          open
          joined={false}
          edit={edit}
          held={held}
          day={day}
          panel={panel}
        >
          <Segments shift={shift} seg={seg} onSeg={onSeg} ids={ids} panel={panel} />
        </LineupCard>
        {arrows ? <MoveArrow to={next ?? null} onMove={onMove} /> : null}
      </div>
      <div className="lineup-desk-scroll" ref={list} role="tabpanel" id={panel} aria-labelledby={`${ids}seg-${seg}`}>
        {location.shortHours?.opens && location.shortHours.closes ? (
          <p className="lineup-short" role="note">
            Short hours today: open {range(location.shortHours.opens, location.shortHours.closes, timeFormat)} (
            {location.shortHours.title}).
          </p>
        ) : null}
        {seg === "notes" ? (
          <NotesPane shift={shift} />
        ) : seg === "read" ? (
          <ReadPane shift={shift} timeFormat={timeFormat} timezone={location.timezone} />
        ) : (
          <DesktopTeam location={location} shift={shift} timeFormat={timeFormat} />
        )}
      </div>
    </div>
  );
}

/** A big arrow as tall as the ticket; off where there is nowhere to go. */
function MoveArrow({
  to,
  back = false,
  onMove,
}: {
  readonly to: LineupLocation | null;
  readonly back?: boolean;
  readonly onMove: (location: LineupLocation) => void;
}) {
  const Icon = back ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      className="lineup-desk-arrow"
      disabled={!to}
      aria-label={to ? `${back ? "Previous" : "Next"} location: ${to.name}` : back ? "No previous location" : "No next location"}
      title={to?.name}
      onClick={() => to && onMove(to)}
    >
      <Icon aria-hidden />
    </button>
  );
}

/** The team as one list under column headings (F, Mert 2026-10-19 ~2:40 AM): department, job, then people. */
function DesktopTeam({
  location,
  shift,
  timeFormat,
}: {
  readonly location: LineupLocation;
  readonly shift: LineupShift;
  readonly timeFormat: ScheduleTimeFormat;
}) {
  if (!shift.count)
    return (
      <div className="lineup-phone-noone">
        <Users aria-hidden />
        <b>
          No one is scheduled for {shift.name} at {location.name}
        </b>
      </div>
    );
  return (
    <>
      <div className="lineup-desk-cols" aria-hidden>
        <span />
        <span>Employee</span>
        <span>Position</span>
        <span>Label</span>
        <span>In – Out</span>
        <span>Section</span>
      </div>
      {shift.departments.map((department) => (
        <section className="lineup-phone-dept" key={department.id ?? "other"} aria-label={department.name}>
          <h3>
            {department.name}
            <span>{department.jobs.reduce((sum, job) => sum + job.rows.length, 0)}</span>
          </h3>
          <div className="lineup-phone-list">
            {department.jobs.map((job) => (
              <div className="lineup-phone-job" key={job.id}>
                <p>
                  <i style={{ background: job.color ?? "var(--theme-border-strong)" }} aria-hidden />
                  {job.name}
                  <span>{job.rows.length}</span>
                </p>
                <ul aria-label={job.name}>
                  {job.rows.map((row) => (
                    <DesktopRow key={row.shiftId} row={row} timeFormat={timeFormat} />
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

function DesktopRow({ row, timeFormat }: { readonly row: LineupRow; readonly timeFormat: ScheduleTimeFormat }) {
  return (
    <li className="lineup-phone-row lineup-desk-row">
      <LineupPersonCircle name={row.name} />
      <span className="lineup-desk-name">
        <span className="lineup-phone-name">{row.name}</span>
        {row.lineupOnly ? <i className="lineup-phone-chip is-warn">Lineup only</i> : null}
      </span>
      <span className="lineup-desk-cell">{row.jobName}</span>
      <span className="lineup-desk-cell">{row.labels.join(", ") || <None label="No label" />}</span>
      <span className="lineup-desk-cell lineup-desk-time">
        <span className="lineup-desk-hours">
          {range(row.startTime, row.endTime, timeFormat)}
          {row.changed.length ? (
            <i
              className="lineup-phone-changed"
              role="img"
              aria-label="Changed in this lineup only"
              title="Changed in this lineup only. The Schedule doesn't change."
            />
          ) : null}
        </span>
        <HoursChange row={row} timeFormat={timeFormat} />
      </span>
      <span className="lineup-desk-cell">{row.sectionName || <None label="No section" />}</span>
    </li>
  );
}

/** Under In – Out, managers only: red "+1 h 30 min" when the shift is longer than the Schedule's, green "−1 h" when
 * shorter, nothing when the total is the same (S-178 Ek 2). */
function HoursChange({ row, timeFormat }: { readonly row: LineupRow; readonly timeFormat: ScheduleTimeFormat }) {
  const change = lineupHoursChange(row);
  if (!change || !row.scheduleStartTime || !row.scheduleEndTime) return null;
  const longer = change > 0;
  const said = `${longer ? "+" : "\u2212"}${span(Math.abs(change))}`;
  return (
    <em
      className={`lineup-desk-change ${longer ? "is-longer" : "is-shorter"}`}
      title={`Schedule ${range(row.scheduleStartTime, row.scheduleEndTime, timeFormat)}`}
      aria-label={`${span(Math.abs(change))} ${longer ? "longer" : "shorter"} than the Schedule`}
    >
      {said}
    </em>
  );
}

function None({ label }: { readonly label: string }) {
  return (
    <span className="lineup-desk-none" aria-label={label}>
      —
    </span>
  );
}

/** The loading outline: the ticket and a few rows at their real sizes. */
function DesktopLineupOutline() {
  return (
    <LoadingOutline label="Loading lineups" className="lineup-desk lineup-desk-outline">
      <div className="lineup-desk-ticket is-one">
        <div className="lineup-card is-open">
          <div className="lineup-card-head">
            <Skeleton width={120} height={14} className="lineup-card-loc" />
            <Skeleton width={84} height={10} className="lineup-card-date" />
            <Skeleton width={90} height={12} className="lineup-card-state" />
            <Skeleton width={110} height={10} className="lineup-card-at" />
          </div>
          <div className="lineup-card-perf" />
          <div className="lineup-card-facts">
            {[48, 30, 120].map((width) => (
              <div key={width}>
                <Skeleton width={40} height={9} />
                <Skeleton width={width} height={14} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="lineup-desk-scroll">
        <div className="lineup-phone-list">
          {[0, 1, 2, 3].map((row) => (
            <div className="lineup-phone-row lineup-desk-row" key={row}>
              <Skeleton width={38} height={38} className="lineup-phone-outline-avatar" />
              <Skeleton width={`${60 - row * 6}%`} height={12} />
              <Skeleton width="60%" />
              <Skeleton width="40%" />
              <Skeleton width="80%" />
              <Skeleton width="50%" />
            </div>
          ))}
        </div>
      </div>
    </LoadingOutline>
  );
}
