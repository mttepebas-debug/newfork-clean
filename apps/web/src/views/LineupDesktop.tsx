import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Settings, Users } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import {
  lineupCopyText,
  lineupEditable,
  lineupHoursChange,
  phoneLineupKey,
  phoneShiftTabs,
  type LineupLocation,
  type LineupRow,
  type LineupShift,
} from "../schedule/lineup";
import { wheelIso } from "../schedule/lineup-wheel";
import { DayCalendar, LineupDayPicker, LineupShiftTabs, useDayCalendar } from "../schedule/lineup-wheel-view";
import { formatTime, type ScheduleTimeFormat } from "../schedule/lib/scheduleDateTime";
import { Skeleton } from "../shell/LoadState";
import {
  CopyTextButton,
  EditableRowCells,
  EditNotesButton,
  NotesEditor,
  SectionsWindow,
  type LineupEditing,
} from "./LineupDesktopEdit";
import {
  AddStaffButton,
  CallOffCell,
  OutGroups,
  ReplaceName,
  StaffWindow,
  teamDepartments,
  type StaffPlace,
} from "./LineupDesktopStaff";
import { LineupCard, NotesPane, ReadPane, Segments, type Seg } from "./LineupPhone";
import { LineupPersonCircle } from "./LineupPersonCircle";
import "./lineup-desktop.css";

// The desktop Lineup, F (Mert 2026-10-19 ~2:45 AM, "f harika"; mockup yapim/masaustu/desk.js): the phone's day
// picker over the page (one line: the date and location, a narrow wheel, the shift tabs), then one location's ticket in the
// middle between two arrows as tall as it (none with one location), Team · Notes · Read in its foot. Only the list
// under the ticket scrolls. The team is one list under column headings: person, position, label, in – out, section,
// each heading centred on its column's content and Section the last column, by the list's right edge (Mert
// 2026-10-19 ~5:30 AM). On a draft that hasn't started a manager changes the rows in place, the location's sections
// (the gear by SECTION) and the notes (LINEUP-EDIT W2a), and calls people off, adds them and replaces them (W3a);
// called off and replaced people sit at the foot of the list.

// Folded, the ticket is one line so more of the list shows (Mert 2026-10-21); this device remembers it. Storage that
// is not there (a private window) leaves it open and never throws.
const foldedKey = "newfork.lineup.ticketFolded";

function readFolded(): boolean {
  try {
    return window.localStorage.getItem(foldedKey) === "1";
  } catch {
    return false;
  }
}

function writeFolded(folded: boolean) {
  try {
    if (folded) window.localStorage.setItem(foldedKey, "1");
    else window.localStorage.removeItem(foldedKey);
  } catch {
    // Nothing kept: the next visit opens it, never wrongly.
  }
}

function range(start: string, end: string, format: ScheduleTimeFormat): string {
  if (!start || !end) return "";
  return `${formatTime(start, format, "long")} – ${formatTime(end, format, "long")}`;
}

/**
 * The page holds still and only the list scrolls, so a wheel turned anywhere on the page (the heading, the day, the
 * ticket, the margins) scrolls the list (Mert 2026-10-21). The list itself, the day wheel (it spins the days), a
 * window over the page and a sideways turn keep their own.
 */
function useWheelScrollsList(page: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const area = page.current?.closest<HTMLElement>(".app-main") ?? page.current;
    if (!area) return;
    const onWheel = (event: WheelEvent) => {
      const list = page.current?.querySelector<HTMLElement>(".lineup-desk-scroll");
      const target = event.target as Element | null;
      if (!list || !target || event.defaultPrevented || event.ctrlKey) return;
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      if (list.contains(target) || target.closest(".lineup-wheel, [role='dialog'], .lineup-edit-layer")) return;
      const step = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? list.clientHeight : 1;
      event.preventDefault();
      list.scrollTop += event.deltaY * step;
    };
    area.addEventListener("wheel", onWheel, { passive: false });
    return () => area.removeEventListener("wheel", onWheel);
  }, [page]);
}

/**
 * The days the narrow wheel between the location and the shift tabs shows: as many 48 px days as fit in it, an odd
 * number so the day sits in the middle, 3 to 7 (Mert 2026-10-21: the tabs never scroll for it).
 */
function useWheelDays(box: RefObject<HTMLDivElement | null>): number {
  const [days, setDays] = useState(7);
  useLayoutEffect(() => {
    const wheel = box.current;
    if (!wheel || typeof ResizeObserver !== "function") return;
    const fit = () => {
      const count = Math.max(3, Math.min(7, Math.floor(wheel.clientWidth / 48)));
      setDays(count % 2 ? count : count - 1);
    };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(wheel);
    return () => watch.disconnect();
  }, [box]);
  return days;
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
  editing,
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
  /** Changing a draft's rows, sections and notes, for someone who may (null: read only). */
  readonly editing: LineupEditing | null;
  /** The Publish window is open over the page: a lineup that goes out lights up once it closes. */
  readonly held: boolean;
  /** The Publish window is publishing: the day waits. */
  readonly waiting: boolean;
}) {
  // The ticket shown when All locations has more than one: the arrows move it (Mert 2026-10-19 ~2:10 AM).
  const [at, setAt] = useState("");
  // Each location and shift keeps its own tab.
  const [segs, setSegs] = useState<Readonly<Record<string, Seg>>>({});
  const [folded, setFolded] = useState(readFolded);
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
  const page = useRef<HTMLElement | null>(null);
  useWheelScrollsList(page);
  const wheelBox = useRef<HTMLDivElement | null>(null);
  const days = useWheelDays(wheelBox);

  let body: ReactNode;
  if (loading)
    body = <DesktopLineupOutline day={<TicketDay label={dateLabel} date={date} today={today} waiting={waiting} onPick={onDate} />} />;
  else if (error) body = <div className="lineup-desk-scroll">{error}</div>;
  else if (!locations.length) body = <p className="lineup-desk-empty">No locations to show.</p>;
  else if (!current)
    body = (
      <div className="lineup-desk-empty">
        {/* No ticket, so the day sits here: the page has no other ‹ day › (Mert 2026-10-21). */}
        <TicketDay label={dateLabel} date={date} today={today} waiting={waiting} onPick={onDate} />
        <p>
          {closed.length
            ? closed.map((item) => (
                <span key={item.id}>
                  {item.name} · Closed today · {item.closed!.title}
                </span>
              ))
            : "No shifts this day."}
        </p>
        {/* Nor a place menu: one location picked, the way back to all of them. */}
        {picked && locations.length > 1 ? (
          <button type="button" className="lineup-desk-all" onClick={() => onLocation("")}>
            Show all locations
          </button>
        ) : null}
      </div>
    );
  else {
    const segKey = `${current.location.id}:${current.shift.key}`;
    // The ticket's place is a menu of the places, the page's only one (Mert 2026-10-21): on all locations a place with
    // this shift is the ticket the arrows reach; any other is picked as the page's location (its day says why, and
    // offers all of them again).
    const goTo = (id: string) => {
      if (!picked && lineups.some(({ location }) => location.id === id)) setAt(id);
      else onLocation(id);
    };
    body = (
      <DesktopLineup
        key={segKey}
        location={current.location}
        shift={current.shift}
        dateLabel={dateLabel}
        now={nowAt(current.location)}
        timeFormat={timeFormat}
        edit={canEdit ? { workspaceId, date } : null}
        editing={editing}
        held={held}
        day={date}
        seg={segs[segKey] ?? "team"}
        onSeg={(seg) => setSegs((now) => ({ ...now, [segKey]: seg }))}
        previous={many ? (lineups[index - 1]?.location ?? null) : undefined}
        next={many ? (lineups[index + 1]?.location ?? null) : undefined}
        onMove={(location) => setAt(location.id)}
        folded={folded}
        onFold={() => {
          writeFolded(!folded);
          setFolded(!folded);
        }}
        placePicker={
          locations.length > 1 ? (
            <TicketPlace locations={locations} value={current.location.id} all={Boolean(picked)} onChange={goTo} />
          ) : null
        }
        dayPicker={<TicketDay label={dateLabel} date={date} today={today} waiting={waiting} onPick={onDate} />}
      />
    );
  }

  return (
    <section ref={page} className="lineup-page list-page lineup-desk-page" aria-labelledby="lineup-title">
      {header}
      {/* One line (Mert 2026-10-21): a narrow wheel and the shift tabs; the day and the place are on the ticket. */}
      <div className="lineup-desk-top">
        <LineupDayPicker
          date={date}
          today={today}
          onDate={onDate}
          waiting={waiting}
          days={days}
          wheelRef={wheelBox}
          bar={false}
        />
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
  editing,
  held,
  day,
  seg: picked,
  onSeg,
  previous,
  next,
  onMove,
  folded,
  onFold,
  placePicker,
  dayPicker,
}: {
  readonly location: LineupLocation;
  readonly shift: LineupShift;
  readonly dateLabel: string;
  readonly now: string | null;
  readonly timeFormat: ScheduleTimeFormat;
  readonly edit: { readonly workspaceId: string | null; readonly date: string } | null;
  readonly editing: LineupEditing | null;
  readonly held: boolean;
  readonly day: string;
  readonly seg: Seg;
  readonly onSeg: (seg: Seg) => void;
  /** With more than one location: the one before and after (null at an end); undefined with one location. */
  readonly previous: LineupLocation | null | undefined;
  readonly next: LineupLocation | null | undefined;
  readonly onMove: (location: LineupLocation) => void;
  readonly folded: boolean;
  readonly onFold: () => void;
  readonly placePicker: ReactNode;
  readonly dayPicker: ReactNode;
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
  // A draft that hasn't started changes in place (the server locks the rest).
  const changing = editing && lineupEditable(shift, now) ? editing : null;
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [staff, setStaff] = useState<StaffPlace | null>(null);
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
          open={!folded}
          onFold={onFold}
          keepTabs
          factsInHead
          placePicker={placePicker}
          dayPicker={dayPicker}
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
      <div className={`lineup-desk-scroll${changing ? " is-edit" : ""}`} ref={list} role="tabpanel" id={panel} aria-labelledby={`${ids}seg-${seg}`}>
        {location.shortHours?.opens && location.shortHours.closes ? (
          <p className="lineup-short" role="note">
            Short hours today: open {range(location.shortHours.opens, location.shortHours.closes, timeFormat)} (
            {location.shortHours.title}).
          </p>
        ) : null}
        {seg === "notes" ? (
          changing && notesOpen ? (
            <NotesEditor editing={changing} shift={shift} onDone={() => setNotesOpen(false)} />
          ) : (
            <>
              {changing ? <EditNotesButton onEdit={() => setNotesOpen(true)} /> : null}
              <NotesPane shift={shift} />
            </>
          )
        ) : seg === "read" ? (
          <ReadPane
            shift={shift}
            timeFormat={timeFormat}
            timezone={location.timezone}
            copy={<CopyTextButton text={() => lineupCopyText(location, shift, dateLabel, timeFormat)} />}
          />
        ) : (
          <DesktopTeam
            location={location}
            shift={shift}
            timeFormat={timeFormat}
            editing={changing}
            onManageSections={() => setSectionsOpen(true)}
            onStaff={setStaff}
          />
        )}
      </div>
      {changing && sectionsOpen ? (
        <SectionsWindow editing={changing} location={location} onClose={() => setSectionsOpen(false)} />
      ) : null}
      {changing && staff ? (
        <StaffWindow
          editing={changing}
          location={location}
          shift={shift}
          place={staff}
          timeFormat={timeFormat}
          onClose={() => setStaff(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * The ticket's place: its name, a menu of the places to go to (Mert 2026-10-21). The name is the text the ticket
 * shows, at its own width; the browser's own menu lies over it, unseen, and opens from a click on it.
 */
function TicketPlace({
  locations,
  value,
  all,
  onChange,
}: {
  readonly locations: readonly LineupLocation[];
  readonly value: string;
  /** One location is picked: the menu starts with All locations, the way back to every ticket. */
  readonly all: boolean;
  readonly onChange: (id: string) => void;
}) {
  return (
    <span className="lineup-card-place">
      <span aria-hidden>{locations.find((location) => location.id === value)?.name}</span>
      <ChevronDown aria-hidden />
      <select aria-label="Go to location" value={value} onChange={(event) => onChange(event.target.value)}>
        {all ? <option value="">All locations</option> : null}
        {locations.map((location) => (
          <option key={location.id} value={location.id}>
            {location.name}
          </option>
        ))}
      </select>
    </span>
  );
}

/**
 * The ticket's day, the page's only date control (Mert 2026-10-21, from the date row it replaces): ‹ › step a day;
 * the day is amber away from today and a click on it brings today back; on today it opens the calendar under it,
 * and a day picked there is the page's day. While the Publish window publishes the day waits.
 */
function TicketDay({
  label,
  date,
  today,
  waiting,
  onPick,
}: {
  readonly label: string;
  readonly date: string;
  readonly today: string;
  readonly waiting: boolean;
  readonly onPick: (iso: string) => void;
}) {
  const calendar = useDayCalendar();
  const other = date !== today;
  const go = (iso: string) => {
    if (!waiting) onPick(iso);
  };
  return (
    <span className="lineup-card-day" role="group" aria-label="Day">
      <button
        type="button"
        className="lineup-card-step"
        aria-label="Previous day"
        aria-disabled={waiting || undefined}
        onClick={() => go(wheelIso(date, -1))}
      >
        <ChevronLeft aria-hidden />
      </button>
      <span className="lineup-date-pick" ref={calendar.box}>
        <button
          type="button"
          className="lineup-card-day-label"
          data-other-day={other ? "true" : undefined}
          aria-disabled={waiting || undefined}
          aria-haspopup={other ? undefined : "dialog"}
          aria-expanded={other ? undefined : calendar.open}
          title={other ? "Back to today" : "Pick a day"}
          onClick={() => {
            if (other) go(today);
            else if (!waiting) calendar.setOpen((open) => !open);
          }}
        >
          <CalendarDays aria-hidden />
          {label}
        </button>
        {calendar.open ? (
          <DayCalendar date={date} today={today} onPick={go} onClose={() => calendar.setOpen(false)} />
        ) : null}
      </span>
      <button
        type="button"
        className="lineup-card-step"
        aria-label="Next day"
        aria-disabled={waiting || undefined}
        onClick={() => go(wheelIso(date, 1))}
      >
        <ChevronRight aria-hidden />
      </button>
    </span>
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
  editing,
  onManageSections,
  onStaff,
}: {
  readonly location: LineupLocation;
  readonly shift: LineupShift;
  readonly timeFormat: ScheduleTimeFormat;
  /** The rows change in place (a draft that hasn't started). */
  readonly editing: LineupEditing | null;
  readonly onManageSections: () => void;
  readonly onStaff: (place: StaffPlace) => void;
}) {
  const departments = teamDepartments(shift, editing);
  const out = shift.out.calledOff.length + shift.out.replaced.length;
  if (!shift.count && !out && !(editing && departments.length))
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
      {departments.map((department, at) => (
        <section className="lineup-phone-dept" key={department.id ?? "other"} aria-label={department.name}>
          {/* The column headings sit on each department's line, pinned while its people scroll (Mert 2026-10-21):
              the department's name where the people are, then position, label, in – out, section. */}
          <h3 className="lineup-desk-dept">
            <span className="lineup-desk-dept-name">
              {department.name}
              <span>{department.jobs.reduce((sum, job) => sum + job.rows.length, 0)}</span>
            </span>
            <span className="lineup-desk-col" aria-hidden>
              Position
            </span>
            <span className="lineup-desk-col" aria-hidden>
              Label
            </span>
            <span className="lineup-desk-col" aria-hidden>
              In – Out
            </span>
            <span className="lineup-desk-col">
              <span className="lineup-desk-col-lab">
                <span aria-hidden>Section</span>
                {/* The Sections window (S-178 ek 3): from the gear by SECTION, on the first department only. */}
                {editing && at === 0 ? (
                  <button
                    type="button"
                    className="lineup-edit-gear"
                    aria-label="Manage sections"
                    title="Manage sections"
                    aria-haspopup="dialog"
                    onClick={onManageSections}
                  >
                    <Settings size={15} aria-hidden />
                  </button>
                ) : null}
              </span>
            </span>
            {editing ? (
              <span className="lineup-desk-dept-add">
                {department.id ? (
                  <AddStaffButton
                    department={department.name}
                    onAdd={() => onStaff({ kind: "add", department: { id: department.id!, name: department.name } })}
                  />
                ) : null}
              </span>
            ) : null}
          </h3>
          <div className="lineup-phone-list">
            {department.jobs.length ? null : <p className="lineup-staff-none">No one in {department.name} yet.</p>}
            {department.jobs.map((job) => (
              <div className="lineup-phone-job" key={job.id}>
                <p>
                  <i style={{ background: job.color ?? "var(--theme-border-strong)" }} aria-hidden />
                  {job.name}
                  <span>{job.rows.length}</span>
                </p>
                <ul aria-label={job.name}>
                  {job.rows.map((row) => (
                    <DesktopRow
                      key={row.shiftId}
                      row={row}
                      location={location}
                      shift={shift}
                      timeFormat={timeFormat}
                      editing={editing}
                      onManageSections={onManageSections}
                      onReplace={() => onStaff({ kind: "replace", row })}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ))}
      <OutGroups location={location} shift={shift} timeFormat={timeFormat} editing={editing} />
    </>
  );
}

function DesktopRow({
  row,
  location,
  shift,
  timeFormat,
  editing,
  onManageSections,
  onReplace,
}: {
  readonly row: LineupRow;
  readonly location: LineupLocation;
  readonly shift: LineupShift;
  readonly timeFormat: ScheduleTimeFormat;
  readonly editing: LineupEditing | null;
  readonly onManageSections: () => void;
  readonly onReplace: () => void;
}) {
  const person = (
    <>
      <LineupPersonCircle name={row.name} artKey={row.artKey} />
      <span className="lineup-desk-name">
        {editing ? <ReplaceName row={row} onReplace={onReplace} /> : <span className="lineup-phone-name">{row.name}</span>}
        {row.lineupOnly ? <i className="lineup-phone-chip is-warn">Lineup only</i> : null}
      </span>
    </>
  );
  if (editing)
    return (
      <li className="lineup-phone-row lineup-desk-row is-edit">
        {person}
        <EditableRowCells
          row={row}
          location={location}
          shift={shift}
          editing={editing}
          timeFormat={timeFormat}
          onManageSections={onManageSections}
          dot={<ChangedDot row={row} />}
        >
          <HoursChange row={row} timeFormat={timeFormat} />
        </EditableRowCells>
        <CallOffCell row={row} shift={shift} editing={editing} />
      </li>
    );
  return (
    <li className="lineup-phone-row lineup-desk-row">
      {person}
      <span className="lineup-desk-cell">{row.jobName}</span>
      <span className="lineup-desk-cell">{row.labels.join(", ") || <None label="No label" />}</span>
      <span className="lineup-desk-cell lineup-desk-time">
        <span className="lineup-desk-hours">
          {range(row.startTime, row.endTime, timeFormat)}
          <ChangedDot row={row} />
        </span>
        <HoursChange row={row} timeFormat={timeFormat} />
      </span>
      <span className="lineup-desk-cell">{row.sectionName || <None label="No section" />}</span>
    </li>
  );
}

/** The orange dot (S-178 madde 3): the lineup changed this row against the Schedule. Managers only. */
export function ChangedDot({ row }: { readonly row: LineupRow }) {
  if (!row.changed.length) return null;
  return (
    <i
      className="lineup-phone-changed"
      role="img"
      aria-label="Changed in this lineup only"
      title="Changed in this lineup only. The Schedule doesn't change."
    />
  );
}

/** Under In – Out, managers only: red "+1 h 30 min" when the shift is longer than the Schedule's, green "−1 h" when
 * shorter, nothing when the total is the same (S-178 Ek 2). */
export function HoursChange({ row, timeFormat }: { readonly row: LineupRow; readonly timeFormat: ScheduleTimeFormat }) {
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

/**
 * The loading outline: the ticket and a few rows at their real sizes, grey and unheard (a screen reader hears
 * "Loading lineups" once). The ticket's ‹ day › is the real one, so the day keeps stepping while the next one
 * loads: it is the page's only date control (Mert 2026-10-21).
 */
function DesktopLineupOutline({ day }: { readonly day: ReactNode }) {
  return (
    <div className="nf-loading lineup-desk lineup-desk-outline">
      <span className="sr-only" role="status">
        Loading lineups
      </span>
      <div className="lineup-desk-ticket is-one">
        <div className="lineup-card is-open">
          <div className="lineup-card-head">
            <Skeleton width={120} height={14} className="lineup-card-loc" />
            <div className="lineup-card-date">{day}</div>
            <div className="lineup-card-facts" aria-hidden>
              {[48, 30, 120].map((width) => (
                <div key={width}>
                  <Skeleton width={40} height={9} />
                  <Skeleton width={width} height={14} />
                </div>
              ))}
            </div>
            <Skeleton width={90} height={12} className="lineup-card-state" />
            <Skeleton width={110} height={10} className="lineup-card-at" />
          </div>
        </div>
      </div>
      <div className="lineup-desk-scroll" aria-hidden>
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
    </div>
  );
}
