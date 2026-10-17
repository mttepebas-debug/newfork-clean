import { Eye, Lock } from "lucide-react";
import {
  useLayoutEffect,
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
import { LineupReadLists } from "../schedule/LineupReadList";
import { dockPlace } from "../schedule/lineup-wheel";
import { LineupDayHead, LineupDayPicker, LineupLocationSelect, LineupShiftTabs } from "../schedule/lineup-wheel-view";
import { formatTime, type ScheduleTimeFormat } from "../schedule/lib/scheduleDateTime";
import { LoadingOutline, Skeleton } from "../shell/LoadState";
import "./lineup-phone.css";

// The phone Lineup for owner, admin and manager (KARARLAR Lineup, Mert 2026-10-17: E · Çark tarih, D1–D3):
// only the page header stays fixed (Mert 2026-10-17 ~8 AM); under it the date and location, the day wheel,
// the shift tabs, the location and date, the summary card, Team · Notes · Read and the team, read-only, all
// scroll. Publish waits at the bottom over the bar; it opens the Publish window as a sheet.

export interface PhonePublish {
  readonly waiting: number;
  readonly anyPublished: boolean;
  readonly open: boolean;
  readonly onToggle: () => void;
  /** The Publish window, drawn as a sheet while open. */
  readonly window: ReactNode;
}

type Seg = "team" | "notes" | "read";

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

  const ready = !loading && !error && location && !location.closed;
  const shift = ready ? phoneLineupShift(location.shifts, chosen, now) : null;

  return (
    <section className="lineup-page list-page lineup-phone-page" aria-labelledby="lineup-title">
      {/* The one fixed piece, at its full size: the shell's frozen top leaves it alone (data-frozen-own). */}
      <div className="lineup-phone-head" data-frozen-own="">
        {header}
      </div>
      <div className="lineup-phone-top">
        <LineupDayPicker date={date} today={today} onDate={onDate}>
          <LineupLocationSelect loading={loading} locations={locations} value={location?.id ?? ""} onChange={onLocation} />
        </LineupDayPicker>
        <div className="lineup-phone-tabs-slot">
          {loading ? (
            <div className="lineup-phone-outline-tabs" aria-hidden>
              <Skeleton width={64} height={12} className="on-page" />
              <Skeleton width={70} height={12} className="on-page" />
              <Skeleton width={56} height={12} className="on-page" />
            </div>
          ) : ready && location.shifts.length ? (
            <LineupShiftTabs shifts={location.shifts} chosen={shift?.key ?? null} onChoose={onShift} />
          ) : null}
        </div>
      </div>

      {loading ? (
        <PhoneLineupOutline />
      ) : shift ? (
        <>
          {/* Mert 2026-10-17 (~7:40 AM): the employee page's location and date head, under the shift tabs. */}
          {location ? <LineupDayHead location={location.name} date={date} shift={shift.name} /> : null}
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

/** Who read the lineup staff see (C's Read tab): the same lists as the desktop's Read panel. */
function ReadPane({ shift, timeFormat }: { readonly shift: LineupShift; readonly timeFormat: ScheduleTimeFormat }) {
  const { publish } = shift;
  if (!publish.published)
    return (
      <Calm icon={<Eye size={26} aria-hidden />} title="No one has seen it yet">
        After you publish, you'll see here who read the lineup and who hasn't.
      </Calm>
    );
  if (!publish.askAck)
    return (
      <Calm icon={<Eye size={26} aria-hidden />} title="Acknowledgement is off">
        Staff were notified without being asked to acknowledge.
      </Calm>
    );
  return <LineupReadLists shift={shift} timeFormat={timeFormat} />;
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
 * Publish, as wide as its words, over the bottom bar, its right edge where More ends (D1, D3). Its window opens as a sheet
 * from the bottom (the window takes focus in and gives it back).
 */
function PublishDock({ publish }: { readonly publish: PhonePublish }) {
  const dock = useRef<HTMLDivElement | null>(null);
  useDockPlace(dock);
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
        <div className="lineup-phone-sheet">
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
    const bar = document.querySelector<HTMLElement>(".phone-bar");
    const place = () => {
      const box = bar?.getBoundingClientRect();
      const shown = bar && box && box.height > 0 ? box : null;
      const more = shown ? (bar!.lastElementChild as HTMLElement | null)?.getBoundingClientRect() ?? null : null;
      const at = dockPlace({
        bar: shown ? { top: shown.top } : null,
        moreRight: more ? more.right : null,
        viewport: { width: window.innerWidth, height: window.innerHeight },
      });
      element.style.right = at.right === null ? "" : `${at.right}px`;
      element.style.bottom = `${at.bottom}px`;
      element.dataset.place = at.right === null ? "corner" : "bar";
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
