import { ChevronLeft, ChevronRight, Eye, Lock } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";

import {
  lineupNoteCount,
  lineupPhoneState,
  lineupShiftSpan,
  phoneLineupShift,
  type LineupLocation,
  type LineupRow,
  type LineupShift,
} from "../schedule/lineup";
import { LineupPublishButton, publishedAt } from "../schedule/LineupPublishWindow";
import {
  WHEEL,
  dockPlace,
  foldOffset,
  foldTravel,
  monthEdges,
  wheelCell,
  wheelDateText,
  wheelIndex,
  wheelIso,
} from "../schedule/lineup-wheel";
import { formatTime, type ScheduleTimeFormat } from "../schedule/lib/scheduleDateTime";
import { LoadingOutline, Skeleton } from "../shell/LoadState";
import { mountWheel } from "./lineup-wheel-engine";
import "./lineup-phone.css";

// The phone Lineup for owner, admin and manager (KARARLAR Lineup, Mert 2026-10-17: E · Çark tarih, D1–D3):
// today's top (title, date and location, the day wheel, the shift tabs) stays fixed; under it the summary
// card, Team · Notes · Read and the team, read-only. Scrolling the list folds the top in three steps
// (useFold). Publish waits at the bottom over the bar; it opens the Publish window as a sheet.

export interface PhonePublish {
  readonly waiting: number;
  readonly anyPublished: boolean;
  readonly open: boolean;
  readonly onToggle: () => void;
  /** The Publish window, drawn as a sheet while open. */
  readonly window: ReactNode;
}

type Seg = "team" | "notes" | "read";

/** What the date row asks of the wheel. */
interface WheelControl {
  step(delta: number): void;
  seekIso(iso: string): void;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

function range(start: string, end: string, format: ScheduleTimeFormat): string {
  if (!start || !end) return "";
  return `${formatTime(start, format, "long")} – ${formatTime(end, format, "long")}`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function PhoneLineupPage({
  header,
  date,
  today,
  onDate,
  loading,
  error,
  locations,
  location,
  onLocation,
  chosen,
  onShift,
  now,
  timeFormat,
  publish,
}: {
  readonly header: ReactNode;
  readonly date: string;
  readonly today: string;
  readonly onDate: (iso: string) => void;
  readonly loading: boolean;
  /** The load-error card, when the day didn't load. */
  readonly error: ReactNode | null;
  readonly locations: readonly LineupLocation[];
  readonly location: LineupLocation | null;
  readonly onLocation: (id: string) => void;
  readonly chosen: string;
  readonly onShift: (key: string) => void;
  /** HH:MM when the day is today. */
  readonly now: string | null;
  readonly timeFormat: ScheduleTimeFormat;
  readonly publish: PhonePublish | null;
}) {
  const [seg, setSeg] = useState<Seg>("team");
  const wheel = useRef<WheelControl | null>(null);
  const preview = useRef<((iso: string) => void) | null>(null);
  const top = useRef<HTMLDivElement | null>(null);
  const bar = useRef<HTMLDivElement | null>(null);
  const wheelBox = useRef<HTMLDivElement | null>(null);
  const tabs = useRef<HTMLDivElement | null>(null);
  const pane = useRef<HTMLDivElement | null>(null);

  const ready = !loading && !error && location && !location.closed;
  const shift = ready ? phoneLineupShift(location.shifts, chosen, now) : null;
  useFold({ top, bar, wheel: wheelBox, tabs, pane }, `${loading}:${location?.id}:${shift?.key}:${seg}`);

  return (
    <section className="lineup-page list-page lineup-phone-page" aria-labelledby="lineup-title">
      {/* The page's own fixed top: the shell's frozen-top leaves it alone (data-frozen-own). */}
      <div className="lineup-phone-top" ref={top} data-frozen-own="">
        {header}
        <div className="lineup-toolbar" ref={bar}>
          <div className="lineup-date" role="group" aria-label="Day">
            <button type="button" className="lineup-step" aria-label="Previous day" onClick={() => wheel.current?.step(-1)}>
              <ChevronLeft size={16} aria-hidden />
            </button>
            <WheelDate date={date} today={today} preview={preview} onToday={() => wheel.current?.seekIso(today)} />
            <button type="button" className="lineup-step" aria-label="Next day" onClick={() => wheel.current?.step(1)}>
              <ChevronRight size={16} aria-hidden />
            </button>
          </div>
          {loading ? (
            <Skeleton width="auto" height={34} className="on-page lineup-phone-location" />
          ) : locations.length ? (
            <select
              className="toolbar-filter-select lineup-phone-location"
              value={location?.id ?? ""}
              aria-label="Location"
              onChange={(event) => onLocation(event.target.value)}
            >
              {locations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        <DayWheel
          boxRef={wheelBox}
          date={date}
          today={today}
          engine={wheel}
          onCommit={onDate}
          onMiddle={(iso) => preview.current?.(iso)}
        />
        <div className="lineup-phone-tabs-slot" ref={tabs}>
          {loading ? (
            <div className="lineup-phone-outline-tabs" aria-hidden>
              <Skeleton width={64} height={12} className="on-page" />
              <Skeleton width={70} height={12} className="on-page" />
              <Skeleton width={56} height={12} className="on-page" />
            </div>
          ) : ready && location.shifts.length ? (
            <div className="catalog-toolbar lineup-phone-tabs">
              <div className="catalog-toolbar-status-row">
                <div className="catalog-status-tabs" role="group" aria-label="Shifts">
                  {location.shifts.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className={item.key === shift?.key ? "active" : ""}
                      aria-pressed={item.key === shift?.key}
                      aria-label={`${item.name}, ${item.count ? plural(item.count, "person", "people") : "no one"}`}
                      onClick={() => onShift(item.key)}
                    >
                      <i style={{ background: item.color ?? "var(--theme-border-strong)" }} aria-hidden />
                      {item.name}
                      {item.count ? <strong>{item.count}</strong> : null}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {loading ? (
        <PhoneLineupOutline />
      ) : shift ? (
        <>
          {location?.shortHours?.opens && location.shortHours.closes ? (
            <p className="lineup-short lineup-phone-short" role="note">
              Short hours today: open {range(location.shortHours.opens, location.shortHours.closes, timeFormat)} (
              {location.shortHours.title}).
            </p>
          ) : null}
          <PhoneSummary shift={shift} now={now} timeFormat={timeFormat} />
          <Segments shift={shift} seg={seg} onSeg={setSeg} />
        </>
      ) : null}
      <div
        className="lineup-phone-pane"
        ref={pane}
        {...(shift && !loading ? { role: "tabpanel", id: "lineup-phone-panel", "aria-labelledby": `lineup-phone-seg-${seg}` } : {})}
      >
        {loading ? null : error ? (
          error
        ) : !location ? (
          <p className="lineup-phone-empty">No locations to show.</p>
        ) : location.closed ? (
          <p className="lineup-phone-empty">Closed today · {location.closed.title}</p>
        ) : !shift ? (
          <p className="lineup-phone-empty">No shifts this day.</p>
        ) : seg === "notes" ? (
          <NotesPane shift={shift} />
        ) : seg === "read" ? (
          <ReadPane shift={shift} timeFormat={timeFormat} />
        ) : (
          <TeamPane shift={shift} timeFormat={timeFormat} />
        )}
      </div>
      {/* Room under the last row for the Publish dock (44 px + 10 px) and a little air. */}
      <div className="lineup-phone-end" aria-hidden />
      {publish ? <PublishDock publish={publish} /> : null}
    </section>
  );
}

/** The date button over the wheel: the middle day as it spins, amber away from today; a tap brings today back. */
function WheelDate({
  date,
  today,
  preview,
  onToday,
}: {
  readonly date: string;
  readonly today: string;
  readonly preview: RefObject<((iso: string) => void) | null>;
  readonly onToday: () => void;
}) {
  const [shown, setShown] = useState(date);
  useEffect(() => {
    preview.current = setShown;
    return () => {
      preview.current = null;
    };
  }, [preview]);
  useEffect(() => setShown(date), [date]);
  const other = shown !== today;
  return (
    <button
      type="button"
      className="lineup-date-label"
      data-other-day={other ? "true" : undefined}
      title={other ? "Back to today" : undefined}
      onClick={onToday}
    >
      {wheelDateText(shown, today)}
    </button>
  );
}

/**
 * The day wheel: every day ±span around its anchor as a button, rendered once; the engine moves them. It stops
 * on a day → `onCommit`; a new date from outside (a link, the date button) turns it there.
 */
function DayWheel({
  boxRef,
  date,
  today,
  engine,
  onCommit,
  onMiddle,
}: {
  readonly boxRef: RefObject<HTMLDivElement | null>;
  readonly date: string;
  readonly today: string;
  readonly engine: RefObject<WheelControl | null>;
  readonly onCommit: (iso: string) => void;
  readonly onMiddle: (iso: string) => void;
}) {
  const span = WHEEL.span;
  // The wheel counts from today; a day near its end re-anchors it there.
  const [anchor, setAnchor] = useState(today);
  const far = Math.abs(wheelIndex(anchor, date)) > span - 30;
  useEffect(() => {
    if (far) setAnchor(date);
  }, [far, date]);
  const track = useRef<HTMLDivElement | null>(null);
  const seekRef = useRef<((iso: string) => void) | null>(null);
  const latest = useRef({ date, onCommit, onMiddle });
  latest.current = { date, onCommit, onMiddle };

  const cells = useMemo(
    () =>
      Array.from({ length: 2 * span + 1 }, (_, offset) => {
        const index = offset - span;
        const iso = wheelIso(anchor, index);
        const cell = wheelCell(iso);
        return (
          <button
            key={iso}
            type="button"
            className={`lineup-wheel-day${iso === today ? " is-today" : ""}${cell.first ? " is-first" : ""}`}
            data-i={index}
            tabIndex={-1}
            aria-label={cell.label}
            aria-pressed={false}
          >
            <span className="lineup-wheel-in">
              <span className="lineup-wheel-top">{cell.top}</span>
              <b>{cell.day}</b>
            </span>
          </button>
        );
      }),
    [anchor, today, span],
  );

  useLayoutEffect(() => {
    const box = boxRef.current;
    const strip = track.current;
    if (!box || !strip) return;
    const mounted = mountWheel(box, strip, {
      start: wheelIndex(anchor, latest.current.date),
      span,
      edges: monthEdges(anchor, span),
      onStill: (index) => {
        const iso = wheelIso(anchor, index);
        if (iso !== latest.current.date) latest.current.onCommit(iso);
      },
      onMiddle: (index) => latest.current.onMiddle(wheelIso(anchor, index)),
    });
    const control: WheelControl = { step: mounted.step, seekIso: (iso) => mounted.seek(wheelIndex(anchor, iso)) };
    engine.current = control;
    seekRef.current = control.seekIso;
    return () => {
      mounted.destroy();
      if (engine.current === control) engine.current = null;
      seekRef.current = null;
    };
  }, [anchor, cells, span, boxRef, engine]);

  // A date from outside: turn the wheel there (it stops on it, so nothing is committed twice).
  useEffect(() => {
    seekRef.current?.(date);
  }, [date]);

  return (
    <div className="lineup-wheel" role="group" aria-label="Day. Swipe or use the arrow keys." ref={boxRef}>
      <div className="lineup-wheel-track" ref={track} style={{ "--lineup-wheel-days": 2 * span + 1 } as CSSProperties}>
        {cells}
      </div>
    </div>
  );
}

/** Today's summary card; its status line says where the lineup stands. Nothing on it edits. */
function PhoneSummary({
  shift,
  now,
  timeFormat,
}: {
  readonly shift: LineupShift;
  readonly now: string | null;
  readonly timeFormat: ScheduleTimeFormat;
}) {
  const span = lineupShiftSpan(shift);
  const state = lineupPhoneState(shift, now);
  const time = (value: string) => formatTime(value, timeFormat, "long");
  const style = { "--lineup-shift": shift.color ?? "var(--theme-border-strong)" } as CSSProperties;
  return (
    <section className="lineup-phone-summary" style={style} aria-label={shift.name}>
      <h2>{shift.name}</h2>
      <p className={`lineup-phone-status is-${state}`}>
        {state === "started" ? <Lock size={13} aria-hidden /> : <i aria-hidden />}
        {state === "published"
          ? `Published ${publishedAt(shift.publish.sharedAt, timeFormat)}`
          : state === "started"
            ? "Started · read-only"
            : state === "draft"
              ? "Draft · staff can't see it"
              : "No one yet"}
      </p>
      <div className="lineup-phone-kpis">
        <div>
          <strong>{shift.count}</strong>
          <span>On the floor</span>
        </div>
        <div>
          <strong>{span ? time(span.firstIn) : "—"}</strong>
          <span>First in</span>
        </div>
        <div>
          <strong>{span ? time(span.lastOut) : "—"}</strong>
          <span>Last out</span>
        </div>
      </div>
    </section>
  );
}

/** Team · Notes · Read (C's tabs). Read carries its count once the lineup is out and staff were asked. */
function Segments({ shift, seg, onSeg }: { readonly shift: LineupShift; readonly seg: Seg; readonly onSeg: (seg: Seg) => void }) {
  const { publish } = shift;
  const notes = lineupNoteCount(publish.notes);
  const items: [Seg, string, string][] = [
    ["team", "Team", String(shift.count)],
    ["notes", "Notes", notes ? String(notes) : ""],
    ["read", "Read", publish.published && publish.askAck ? `${publish.acknowledged}/${publish.withApp}` : ""],
  ];
  const keys = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const at = items.findIndex(([key]) => key === seg);
    const next = items[(at + (event.key === "ArrowRight" ? 1 : items.length - 1)) % items.length]![0];
    onSeg(next);
    document.getElementById(`lineup-phone-seg-${next}`)?.focus();
  };
  return (
    <div className="lineup-phone-segs" role="tablist" aria-label="Lineup" onKeyDown={keys}>
      {items.map(([key, label, count]) => (
        <button
          key={key}
          id={`lineup-phone-seg-${key}`}
          type="button"
          role="tab"
          aria-selected={seg === key}
          aria-controls="lineup-phone-panel"
          tabIndex={seg === key ? 0 : -1}
          onClick={() => onSeg(key)}
        >
          {label}
          {count ? (
            <>
              {" "}
              <span>{count}</span>
            </>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/** C's list: department, then job (dot, name, count), then people. Read-only: a row opens nothing. */
function TeamPane({ shift, timeFormat }: { readonly shift: LineupShift; readonly timeFormat: ScheduleTimeFormat }) {
  if (!shift.count) return <p className="lineup-phone-empty">No one is scheduled for {shift.name}.</p>;
  return (
    <>
      {shift.departments.map((department) => {
        const count = department.jobs.reduce((sum, job) => sum + job.rows.length, 0);
        return (
          <section className="lineup-phone-dept" key={department.id ?? "other"} aria-label={department.name}>
            <h3>
              {department.name}
              <span>{count}</span>
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
                      <PersonRow key={row.shiftId} row={row} timeFormat={timeFormat} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}

function PersonRow({ row, timeFormat }: { readonly row: LineupRow; readonly timeFormat: ScheduleTimeFormat }) {
  const chips = [...row.labels.map((label) => ({ label, warn: false })), ...(row.lineupOnly ? [{ label: "Lineup only", warn: true }] : [])];
  return (
    <li className="lineup-phone-row">
      {/* No job icons yet: the person's initials. */}
      <span className="lineup-phone-avatar" aria-hidden>
        {initials(row.name)}
      </span>
      <span className="lineup-phone-mid">
        <span className="lineup-phone-name">{row.name}</span>
        <span className="lineup-phone-time">
          {range(row.startTime, row.endTime, timeFormat)}
          {row.changed.length ? (
            <i className="lineup-phone-changed" role="img" aria-label="Changed in this lineup only" title="Changed in this lineup only. The Schedule doesn't change." />
          ) : null}
        </span>
      </span>
      {row.sectionName || chips.length ? (
        <span className="lineup-phone-right">
          {row.sectionName ? <span className="lineup-phone-section">{row.sectionName}</span> : null}
          {chips.length ? (
            <span className="lineup-phone-chips">
              {chips.map((chip) => (
                <i key={chip.label} className={`lineup-phone-chip${chip.warn ? " is-warn" : ""}`}>
                  {chip.label}
                </i>
              ))}
            </span>
          ) : null}
        </span>
      ) : null}
    </li>
  );
}

const NOTES = [
  ["specials", "Specials"],
  ["n86", "86s"],
  ["shift_notes", "Shift notes"],
] as const;

/** B's note block, read-only. */
function NotesPane({ shift }: { readonly shift: LineupShift }) {
  const filled = NOTES.filter(([key]) => shift.publish.notes[key].trim());
  if (!filled.length) return <p className="lineup-phone-none">No notes for this shift.</p>;
  return (
    <div className="lineup-phone-notes">
      {filled.map(([key, label]) => (
        <p key={key}>
          <b>{label}</b>
          <span>{shift.publish.notes[key]}</span>
        </p>
      ))}
    </div>
  );
}

/** How many read the lineup staff see (C's Read tab). Who read it comes with a per-person read. */
function ReadPane({ shift, timeFormat }: { readonly shift: LineupShift; readonly timeFormat: ScheduleTimeFormat }) {
  const { publish } = shift;
  if (!publish.published)
    return (
      <Calm icon={<Eye size={26} aria-hidden />} title="No one has seen it yet">
        After you publish, you'll see here how many read the lineup.
      </Calm>
    );
  if (!publish.askAck)
    return (
      <Calm icon={<Eye size={26} aria-hidden />} title="Acknowledgement is off">
        Staff were notified without being asked to acknowledge.
      </Calm>
    );
  const percent = publish.withApp ? Math.round((publish.acknowledged / publish.withApp) * 100) : 0;
  const noApp = Math.max(0, publish.people - publish.withApp);
  return (
    <div className="lineup-phone-read">
      <div>
        <b>{publish.acknowledged}</b>
        <span>of {publish.withApp} read</span>
      </div>
      <i className="lineup-phone-progress" role="img" aria-label={`${percent}% read`}>
        <i style={{ width: `${percent}%` }} />
      </i>
      <p>Published {publishedAt(publish.sharedAt, timeFormat)}. People who open the app later see it too.</p>
      {noApp ? <p>No app · {noApp === 1 ? "1 person isn't" : `${noApp} people aren't`} counted.</p> : null}
    </div>
  );
}

function Calm({ icon, title, children }: { readonly icon: ReactNode; readonly title: string; readonly children: ReactNode }) {
  return (
    <div className="lineup-phone-calm">
      {icon}
      <b>{title}</b>
      <span>{children}</span>
    </div>
  );
}

function PhoneLineupOutline() {
  return (
    <LoadingOutline label="Loading lineups" className="lineup-phone lineup-phone-outline">
      <div className="lineup-phone-summary">
        <Skeleton width={90} height={16} />
        <Skeleton width={150} />
        <div className="lineup-phone-kpis">
          {[0, 1, 2].map((index) => (
            <div key={index}>
              <Skeleton width={48} height={16} />
              <Skeleton width={64} height={9} />
            </div>
          ))}
        </div>
      </div>
      <div className="lineup-phone-list">
        {[0, 1, 2, 3].map((index) => (
          <div className="lineup-phone-row" key={index}>
            <Skeleton width={38} height={38} className="lineup-phone-outline-avatar" />
            <span className="lineup-phone-mid">
              <Skeleton width={`${60 - index * 6}%`} height={12} />
              <Skeleton width="44%" />
            </span>
          </div>
        ))}
      </div>
    </LoadingOutline>
  );
}

/**
 * Publish, as wide as its words, over the bottom bar where More begins (D1, D3). Its window opens as a sheet
 * from the bottom; focus goes into it and comes back to the button when it closes.
 */
function PublishDock({ publish }: { readonly publish: PhonePublish }) {
  const dock = useRef<HTMLDivElement | null>(null);
  const sheet = useRef<HTMLDivElement | null>(null);
  const wasOpen = useRef(publish.open);
  useDockPlace(dock);
  useEffect(() => {
    if (publish.open && !wasOpen.current) sheet.current?.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
    if (!publish.open && wasOpen.current) dock.current?.querySelector<HTMLElement>("button")?.focus();
    wasOpen.current = publish.open;
  }, [publish.open]);
  return (
    <>
      <div className="lineup-phone-dock" ref={dock}>
        <LineupPublishButton
          waiting={publish.waiting}
          anyPublished={publish.anyPublished}
          open={publish.open}
          onToggle={publish.onToggle}
          className="lineup-phone-publish"
        />
      </div>
      {publish.open ? (
        <div className="lineup-phone-sheet" ref={sheet}>
          <div className="lineup-phone-scrim" aria-hidden />
          {publish.window}
        </div>
      ) : null}
    </>
  );
}

function useDockPlace(ref: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const bar = document.querySelector<HTMLElement>(".mm-bar");
    const place = () => {
      const box = bar?.getBoundingClientRect();
      const shown = bar && box && box.height > 0 ? box : null;
      const more = shown ? (bar!.lastElementChild as HTMLElement | null)?.getBoundingClientRect() ?? null : null;
      const at = dockPlace({
        bar: shown ? { top: shown.top } : null,
        moreLeft: more ? more.left : null,
        viewport: { width: window.innerWidth, height: window.innerHeight },
      });
      element.style.left = at.left === null ? "" : `${at.left}px`;
      element.style.bottom = `${at.bottom}px`;
      element.dataset.place = at.left === null ? "corner" : "bar";
    };
    place();
    const watched = typeof ResizeObserver === "function" ? new ResizeObserver(place) : null;
    if (bar) watched?.observe(bar);
    window.addEventListener("resize", place);
    return () => {
      watched?.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [ref]);
}

/** The scrolling area the page sits in (the app's main area). */
function scroller(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) return node;
  }
  return null;
}

/**
 * The top's fold (Mert 2026-10-17; mockup v-e.js collapse()). Scrolling the list up: (1) the summary card and
 * Team · Notes · Read slide under the shift tabs until the list meets them; (2) the date row slides up behind
 * the header's line, the wheel and the tabs rise with it until the wheel sits 4 px under the line; (3) only
 * the list moves. A function of the scroll position; the top keeps its height in the page (given back as
 * margin), so nothing jumps.
 */
function useFold(
  refs: {
    readonly top: RefObject<HTMLDivElement | null>;
    readonly bar: RefObject<HTMLDivElement | null>;
    readonly wheel: RefObject<HTMLDivElement | null>;
    readonly tabs: RefObject<HTMLDivElement | null>;
    readonly pane: RefObject<HTMLDivElement | null>;
  },
  version: string,
) {
  const measureRef = useRef<() => void>(() => undefined);
  useLayoutEffect(() => {
    const top = refs.top.current;
    const pane = refs.pane.current;
    const bar = refs.bar.current;
    const wheel = refs.wheel.current;
    const head = top?.querySelector<HTMLElement>(".catalog-page-header");
    if (!top || !pane || !bar || !wheel || !head) return;
    const area = scroller(top);
    if (!area) return;
    const moving = [bar, wheel, refs.tabs.current].filter((element): element is HTMLDivElement => Boolean(element));
    let height = 0;
    let start = 0;
    let travel = 0;
    let frame = 0;

    const measure = () => {
      top.style.height = "";
      top.style.marginBottom = "";
      for (const element of moving) element.style.transform = "";
      const scrolled = area.scrollTop;
      const box = area.getBoundingClientRect();
      height = top.offsetHeight;
      start = Math.max(0, pane.getBoundingClientRect().top - box.top - area.clientTop + scrolled - height);
      travel = foldTravel({ wheelTop: wheel.getBoundingClientRect().top, headerBottom: head.getBoundingClientRect().bottom });
    };
    const apply = () => {
      frame = 0;
      if (!top.isConnected) return;
      // Open: read the sizes again (fonts and rows change them).
      if (!top.style.height) measure();
      const fold = foldOffset(area.scrollTop, start, travel);
      top.style.height = fold ? `${height - fold}px` : "";
      top.style.marginBottom = fold ? `${fold}px` : "";
      for (const element of moving) element.style.transform = fold ? `translateY(${-fold}px)` : "";
      top.classList.toggle("is-folding", fold > 0);
    };
    const again = () => {
      if (!top.isConnected) return;
      const scrolled = area.scrollTop;
      measure();
      area.scrollTop = scrolled;
      apply();
    };
    measureRef.current = again;
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    // The fold does the page's arithmetic itself: the browser's scroll anchoring must not nudge it.
    const anchoring = area.style.overflowAnchor;
    area.style.overflowAnchor = "none";
    // The top hides what passes under it with the area's own background.
    top.style.setProperty("--lineup-phone-bg", getComputedStyle(area).backgroundColor);
    measure();
    apply();
    area.addEventListener("scroll", onScroll, { passive: true });
    const watched = typeof ResizeObserver === "function" ? new ResizeObserver(again) : null;
    watched?.observe(area);
    watched?.observe(pane);
    void document.fonts?.ready.then(again);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      area.removeEventListener("scroll", onScroll);
      watched?.disconnect();
      area.style.overflowAnchor = anchoring;
      top.style.height = "";
      top.style.marginBottom = "";
      for (const element of moving) element.style.transform = "";
    };
  }, [refs.top, refs.bar, refs.wheel, refs.tabs, refs.pane]);
  // New content (a day, a shift, a tab): measure again.
  useLayoutEffect(() => measureRef.current(), [version]);
}
