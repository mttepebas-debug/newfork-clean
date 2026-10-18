import { Ban, ChevronDown, Eye, EyeOff, Lock, MapPin, MessageSquareText, Pencil, RotateCw, Sparkles, Users } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";

import {
  canPublish,
  lineupCardState,
  lineupNoteCount,
  lineupShiftSpan,
  phoneLineupShift,
  type LineupLocation,
  type LineupRow,
  type LineupShift,
} from "../schedule/lineup";
import { lineupCommandMessage, useLineupCommand } from "../schedule/lineup-data";
import { LineupPublishButton, publishedAt } from "../schedule/LineupPublishWindow";
import { LineupReadPhone } from "../schedule/LineupReadList";
import { dockPlace } from "../schedule/lineup-wheel";
import { LineupDayPicker, LineupLocationSelect, LineupShiftTabs } from "../schedule/lineup-wheel-view";
import { formatTime, type ScheduleTimeFormat } from "../schedule/lib/scheduleDateTime";
import { ConfirmDialog } from "../shell/ConfirmDialog";
import { LoadingOutline, Skeleton } from "../shell/LoadState";
import { useTabSwipe } from "../shell/useTabSwipe";
import "./lineup-phone.css";

// The phone Lineup for owner, admin and manager (KARARLAR Lineup, Mert 2026-10-17: E · Çark tarih, D1–D3; card 1,
// the Read rules, Publish only when there is something to publish, Edit window A): only the page header stays
// fixed (Mert 2026-10-17 ~8 AM); under it the date and location, the day wheel, the shift tabs, the lineup card
// (place, day, Live or Draft, Edit; Shift · People · Hours; Team · Notes · Read inside) and the team all scroll.
// Publish waits at the bottom over the bar while the shift on screen has a draft; it opens the Publish window as
// a sheet.

export interface PhonePublish {
  readonly waiting: number;
  readonly anyPublished: boolean;
  readonly open: boolean;
  readonly onToggle: () => void;
  /** The Publish window, drawn as a sheet while open. */
  readonly window: ReactNode;
}

const SEGS = ["team", "notes", "read"] as const;
type Seg = (typeof SEGS)[number];

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
  workspaceId,
  date,
  dateLabel,
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
  readonly workspaceId: string | null;
  readonly date: string;
  /** The day on the card: "Tue, Oct 13". */
  readonly dateLabel: string;
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
  /** HH:MM on the location's clock when the day is today there. */
  readonly now: string | null;
  readonly timeFormat: ScheduleTimeFormat;
  /** Publishing, and taking a lineup back to draft (Edit), for someone who may. */
  readonly publish: PhonePublish | null;
}) {
  const [picked, setSeg] = useState<Seg>("team");
  // Folded cards, by location and shift (Mert 2026-10-17 ~9:10 AM: a tap on a card folds that place's list).
  const [shut, setShut] = useState<ReadonlySet<string>>(() => new Set());

  const ready = !loading && !error && location && !location.closed;
  const shift = ready ? phoneLineupShift(location.shifts, chosen, now) : null;
  const live = Boolean(shift?.publish.published);
  // Read is off until the lineup is published (Mert 2026-10-17 ~12:30 PM): a draft shows Team or Notes.
  const seg: Seg = picked === "read" && !live ? "team" : picked;
  const foldKey = shift && location ? `${location.id}:${shift.key}` : "";
  const open = Boolean(shift) && !shut.has(foldKey);
  // A swipe sideways moves between Team, Notes and Read (KARARLAR §1.5); the day wheel and the shift tabs keep
  // their own, so a swipe never changes the shift (it is chosen by its tab).
  const swipe = useTabSwipe({ tabs: live ? SEGS : SEGS.slice(0, 2), active: seg, enabled: open, onSelect: setSeg });
  const fold = () =>
    setShut((current) => {
      const next = new Set(current);
      if (next.has(foldKey)) next.delete(foldKey);
      else next.add(foldKey);
      return next;
    });
  // Publish only while this shift, at this place, has a draft that can go out (Mert 2026-10-17 ~1:40 PM); an open
  // sheet stays until it is closed.
  const dock = publish && (publish.open || (shift && canPublish(shift))) ? publish : null;
  const joined = open && seg === "team" && shift?.count === 0;

  return (
    <section className="lineup-page list-page lineup-phone-page" aria-labelledby="lineup-title" ref={swipe.root}>
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
      ) : shift && location ? (
        <>
          {location.shortHours?.opens && location.shortHours.closes ? (
            <p className="lineup-short lineup-phone-short" role="note">
              Short hours today: open {range(location.shortHours.opens, location.shortHours.closes, timeFormat)} (
              {location.shortHours.title}).
            </p>
          ) : null}
          <LineupCard
            location={location}
            shift={shift}
            dateLabel={dateLabel}
            now={now}
            timeFormat={timeFormat}
            open={open}
            joined={joined}
            onFold={fold}
            edit={publish ? { workspaceId, date } : null}
            cardRef={swipe.tabs}
          >
            <Segments shift={shift} seg={seg} onSeg={setSeg} />
          </LineupCard>
        </>
      ) : null}
      {loading || (shift && !open) ? null : (
        <div
          className="lineup-phone-pane"
          {...(shift ? { role: "tabpanel", id: "lineup-phone-panel", "aria-labelledby": `lineup-phone-seg-${seg}` } : {})}
        >
          {error ? (
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
            <TeamPane location={location} shift={shift} timeFormat={timeFormat} />
          )}
        </div>
      )}
      {/* Room under the last row for the Publish dock (44 px + 10 px) and a little air. */}
      <div className="lineup-phone-end" aria-hidden />
      {dock ? <PublishDock publish={dock} /> : null}
    </section>
  );
}

/**
 * The lineup card (card 1, "boarding pass"; Mert 2026-10-17 ~11:45 AM, ~12:30 PM, ~1:10 PM): the place and day on
 * the left, Live or Draft with Edit over when it went out on the right, the chevron; a torn edge; Shift · People ·
 * Hours; Team · Notes · Read inside. A tap anywhere on it but its tabs folds it to its header.
 */
function LineupCard({
  location,
  shift,
  dateLabel,
  now,
  timeFormat,
  open,
  joined,
  onFold,
  edit,
  cardRef,
  children,
}: {
  readonly location: LineupLocation;
  readonly shift: LineupShift;
  readonly dateLabel: string;
  readonly now: string | null;
  readonly timeFormat: ScheduleTimeFormat;
  readonly open: boolean;
  /** An empty shift's box hangs off it (Mert 2026-10-17 ~2 PM). */
  readonly joined: boolean;
  readonly onFold: () => void;
  /** Taking the lineup back to draft, for someone who may publish. */
  readonly edit: { readonly workspaceId: string | null; readonly date: string } | null;
  readonly cardRef: Ref<HTMLElement>;
  readonly children: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const { live, started } = lineupCardState(shift, now);
  const span = lineupShiftSpan(shift);
  const style = { "--lineup-shift": shift.color ?? "var(--theme-border-strong)" } as CSSProperties;
  // On the location's clock, the one the started lock reads.
  const at = publishedAt(shift.publish.sharedAt, timeFormat, location.timezone);
  // After Edit has taken the lineup back, its button goes off: focus waits on the chevron instead.
  const foldButton = useRef<HTMLButtonElement | null>(null);
  const [backToFold, setBackToFold] = useState(0);
  useEffect(() => {
    if (backToFold) foldButton.current?.focus();
  }, [backToFold]);
  const tap = (event: ReactMouseEvent<HTMLElement>) => {
    const target = event.target as Element;
    // Only a tap on the card itself: not its buttons or tabs, nor the Edit window (a portal, its events bubble here).
    if (!event.currentTarget.contains(target) || target.closest("button, a, [role='tablist']")) return;
    onFold();
  };
  return (
    <section
      ref={cardRef}
      className={`lineup-card${open ? " is-open" : ""}${joined ? " is-joined" : ""}`}
      style={style}
      aria-label={`${location.name}, ${shift.name}`}
      onClick={tap}
    >
      <div className="lineup-card-head">
        <p className="lineup-card-loc">
          <MapPin aria-hidden />
          <span>{location.name}</span>
        </p>
        <p className="lineup-card-date">{dateLabel}</p>
        <div className="lineup-card-state">
          <p className={`lineup-card-status ${live ? "is-live" : "is-draft"}`}>
            <i aria-hidden />
            {live ? "Live" : "Draft"}
          </p>
          {edit ? (
            <button
              type="button"
              className="lineup-card-edit"
              disabled={!live || started}
              title={started ? "This shift has started" : live ? undefined : "Publish first"}
              onClick={() => setEditing(true)}
            >
              {started ? <Lock aria-hidden /> : <Pencil aria-hidden />}
              Edit
            </button>
          ) : null}
        </div>
        <p className={`lineup-card-at${live ? "" : " is-off"}`}>
          {live ? `Published at ${at}` : started ? "Not published" : "Not published yet"}
        </p>
        <button
          type="button"
          ref={foldButton}
          className="lineup-card-fold"
          aria-expanded={open}
          aria-controls={open ? "lineup-phone-panel" : undefined}
          aria-label={open ? "Hide list" : "Show list"}
          onClick={onFold}
        >
          <ChevronDown aria-hidden />
        </button>
      </div>
      {open ? (
        <>
          <div className="lineup-card-perf" aria-hidden />
          <dl className="lineup-card-facts">
            <div>
              <dt>Shift</dt>
              <dd>
                <i aria-hidden />
                {shift.name}
              </dd>
            </div>
            <div>
              <dt>People</dt>
              <dd>{shift.count}</dd>
            </div>
            <div>
              <dt>Hours</dt>
              <dd>{span ? range(span.firstIn, span.lastOut, timeFormat) : "—"}</dd>
            </div>
          </dl>
          <div className="lineup-card-band">{children}</div>
        </>
      ) : null}
      {editing && edit ? (
        <EditLineup
          workspaceId={edit.workspaceId}
          date={edit.date}
          location={location}
          shift={shift}
          at={at}
          onClose={() => setEditing(false)}
          onDone={() => {
            setEditing(false);
            setBackToFold((count) => count + 1);
          }}
        />
      ) : null}
    </section>
  );
}

/**
 * Edit window A (Mert 2026-10-17 ~1:15 PM): what Edit does, in two lines, before the lineup goes back to draft. The
 * words follow today's rule: a republished lineup asks everyone again (the changed-only rule is BL-1135).
 */
function EditLineup({
  workspaceId,
  date,
  location,
  shift,
  at,
  onClose,
  onDone,
}: {
  readonly workspaceId: string | null;
  readonly date: string;
  readonly location: LineupLocation;
  readonly shift: LineupShift;
  readonly at: string;
  readonly onClose: () => void;
  /** The lineup is back in draft. */
  readonly onDone: () => void;
}) {
  const command = useLineupCommand(workspaceId, date);
  const [refused, setRefused] = useState<string | null>(null);
  return (
    <ConfirmDialog
      open
      title={`Edit ${shift.name} lineup?`}
      description={`${location.name} · Published at ${at}`}
      confirmLabel="Edit"
      busy={command.isPending}
      onCancel={onClose}
      onConfirm={() =>
        command.mutate(
          { kind: "unpublish", lineups: [shift.publish.target] },
          { onSuccess: onDone, onError: (reason) => setRefused(lineupCommandMessage(reason)) },
        )
      }
    >
      <ul className="lineup-edit-points">
        <li>
          <span className="lineup-edit-icon" aria-hidden>
            <EyeOff />
          </span>
          <span className="lineup-edit-text">
            <b>Back to draft</b>
            <span>Staff don't see it until you publish again.</span>
          </span>
        </li>
        <li>
          <span className="lineup-edit-icon" aria-hidden>
            <RotateCw />
          </span>
          <span className="lineup-edit-text">
            <b>Everyone gets the new version</b>
            <span>When you publish again, everyone sees the new version; their earlier read doesn't carry over.</span>
          </span>
        </li>
      </ul>
      {refused ? (
        <p className="form-error" role="alert">
          {refused}
        </p>
      ) : null}
    </ConfirmDialog>
  );
}

/** Team · Notes · Read inside the card. Read is off until the lineup is published; then it carries its count. */
function Segments({
  shift,
  seg,
  onSeg,
}: {
  readonly shift: LineupShift;
  readonly seg: Seg;
  readonly onSeg: (seg: Seg) => void;
}) {
  const { publish } = shift;
  const notes = lineupNoteCount(publish.notes);
  const items: [Seg, string, string, boolean][] = [
    ["team", "Team", String(shift.count), true],
    ["notes", "Notes", notes ? String(notes) : "", true],
    ["read", "Read", publish.published && publish.askAck ? `${publish.acknowledged}/${publish.withApp}` : "", publish.published],
  ];
  const on = items.filter(([, , , enabled]) => enabled);
  const keys = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const at = on.findIndex(([key]) => key === seg);
    const next = on[(at + (event.key === "ArrowRight" ? 1 : on.length - 1)) % on.length]![0];
    onSeg(next);
    document.getElementById(`lineup-phone-seg-${next}`)?.focus();
  };
  return (
    <div className="lineup-phone-segs" role="tablist" aria-label="Lineup" onKeyDown={keys}>
      {items.map(([key, label, count, enabled]) => (
        <button
          key={key}
          id={`lineup-phone-seg-${key}`}
          type="button"
          role="tab"
          aria-selected={seg === key}
          aria-controls="lineup-phone-panel"
          tabIndex={seg === key ? 0 : -1}
          disabled={!enabled}
          title={enabled ? undefined : "After you publish"}
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
function TeamPane({
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
        <OneLine text={`No one is scheduled for ${shift.name} at ${location.name}`} />
      </div>
    );
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

/** One line: the type steps down from 16 px to 13 px before it would wrap, then it ends in "…" (its title has it all). */
function OneLine({ text }: { readonly text: string }) {
  const ref = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.fontSize = "";
    for (let size = 16; size > 13 && element.scrollWidth > element.clientWidth; size -= 0.5)
      element.style.fontSize = `${size - 0.5}px`;
  }, [text]);
  return (
    <b ref={ref} title={text}>
      {text}
    </b>
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
  ["specials", "Specials", Sparkles],
  ["n86", "86s", Ban],
  ["shift_notes", "Shift notes", MessageSquareText],
] as const;

/** The notes card (Mert 2026-10-17 ~11:30 AM): one white card, a section per note; nothing here edits them. */
function NotesPane({ shift }: { readonly shift: LineupShift }) {
  const filled = NOTES.filter(([key]) => shift.publish.notes[key].trim());
  return (
    <section className="lineup-notes" aria-label="Notes">
      {filled.length ? (
        filled.map(([key, label, Icon]) => (
          <div className={`lineup-note is-${key}`} key={key}>
            <h3>
              <Icon aria-hidden />
              {label}
            </h3>
            <p>{shift.publish.notes[key]}</p>
          </div>
        ))
      ) : (
        <p className="lineup-note-none">No notes yet.</p>
      )}
    </section>
  );
}

/** Who read the lineup staff see: one bar on the first heading, then Read, Not read yet and No app. */
function ReadPane({ shift, timeFormat }: { readonly shift: LineupShift; readonly timeFormat: ScheduleTimeFormat }) {
  if (!shift.publish.askAck)
    return (
      <div className="lineup-phone-calm">
        <Eye size={26} aria-hidden />
        <b>Acknowledgement is off</b>
        <span>Staff were notified without being asked to acknowledge.</span>
      </div>
    );
  return <LineupReadPhone shift={shift} timeFormat={timeFormat} />;
}

function PhoneLineupOutline() {
  return (
    <LoadingOutline label="Loading lineups" className="lineup-phone lineup-phone-outline">
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
