import { Ban, ChevronDown, Eye, Lock, MapPin, MessageSquareText, Pencil, Settings, Sparkles, Users } from "lucide-react";
import {
  Fragment,
  useEffect,
  useId,
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
  lineupCopyText,
  lineupEditable,
  lineupNoteCount,
  lineupShiftSpan,
  phoneLineupKey,
  phoneShiftTabs,
  type LineupLocation,
  type LineupRow,
  type LineupShift,
} from "../schedule/lineup";
import {
  LineupEditWindow,
  LineupPublishButton,
  lockedWhy,
  publishedAt,
  useGoneOutLight,
} from "../schedule/LineupPublishWindow";
import { LineupReadPhone } from "../schedule/LineupReadList";
import { dockPlace } from "../schedule/lineup-wheel";
import { LineupDayPicker, LineupLocationSelect, LineupShiftTabs } from "../schedule/lineup-wheel-view";
import { formatTime, type ScheduleTimeFormat } from "../schedule/lib/scheduleDateTime";
import { LoadingOutline, Skeleton } from "../shell/LoadState";
import { useTabSwipe } from "../shell/useTabSwipe";
import { CopyTextButton, EditNotesButton, NotesEditor, SectionsWindow, type LineupEditing } from "./LineupDesktopEdit";
import { AddStaffButton, OutGroups, StaffWindow, teamDepartments, type StaffPlace } from "./LineupDesktopStaff";
import { LineupPersonCircle } from "./LineupPersonCircle";
import { PersonSheet } from "./LineupPhoneStaff";
import "./lineup-phone.css";

// The phone Lineup for owner, admin and manager (KARARLAR Lineup, Mert 2026-10-17: E · Çark tarih, D1–D3; card 1,
// the Read rules, Publish only when there is something to publish, Edit window A): only the page header stays
// fixed (Mert 2026-10-17 ~8 AM); under it the date and location, the day wheel, the shift tabs, the lineup card
// (place, day, Live or Draft, Edit; Shift · People · Hours; Team · Notes · Read inside) and the team all scroll.
// Publish waits at the bottom over the bar while the shift on screen has a draft; it opens the Publish window as
// a sheet. On a draft that hasn't started, a manager taps a row for its person panel (Replace…, Call off) and adds
// staff from a department's heading (LINEUP-EDIT W3b); the panel changes the row's fields, the ticket's gear opens
// Sections, Notes has Edit notes and Read Copy as text (W2b).

export interface PhonePublish {
  readonly waiting: number;
  readonly anyPublished: boolean;
  readonly open: boolean;
  /** It has just published: the dock stays and says "Published" (notice A), then goes if nothing is left. */
  readonly published: boolean;
  /** The sheet is publishing: the floating Publish waits. */
  readonly busy: boolean;
  /** The lineups that went out last, "<location id>:<shift key>": focus goes to the first one's card. */
  readonly sent: readonly string[];
  readonly onToggle: () => void;
  /** The Publish window, drawn as a sheet while open. */
  readonly window: ReactNode;
}

export const SEGS = ["team", "notes", "read"] as const;
export type Seg = (typeof SEGS)[number];

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
  locationId,
  onLocation,
  chosen,
  onShift,
  nowAt,
  timeFormat,
  publish,
  editing = null,
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
  /** The location picked; "" is All locations (one location: that one). */
  readonly locationId: string;
  readonly onLocation: (id: string) => void;
  readonly chosen: string;
  readonly onShift: (key: string) => void;
  /** HH:MM on a location's clock when the day is today there: its lock reads it. */
  readonly nowAt: (location: LineupLocation) => string | null;
  readonly timeFormat: ScheduleTimeFormat;
  /** Publishing, and taking a lineup back to draft (Edit), for someone who may. */
  readonly publish: PhonePublish | null;
  /** Changing a draft that hasn't started, for someone who may change the day's lineups. */
  readonly editing?: LineupEditing | null;
}) {
  // Folded cards, by location and shift (Mert 2026-10-17 ~9:10 AM: a tap on a card folds that place's list).
  const [shut, setShut] = useState<ReadonlySet<string>>(() => new Set());

  // All locations (Mert 2026-10-17 ~9:10 AM): with more than one, the list starts with it and it is the default;
  // every location shown has its own card and list, one under the other.
  const picked = locations.find((item) => item.id === locationId) ?? null;
  const shown = picked ? [picked] : locations.length > 1 ? locations : locations.slice(0, 1);
  const ready = !loading && !error;
  const open = ready ? shown.filter((item) => !item.closed) : [];
  const key = ready ? phoneLineupKey(open, chosen, nowAt) : null;
  const tabs = phoneShiftTabs(open);
  type Block = { readonly location: LineupLocation; readonly shift: LineupShift | null };
  const blocks: Block[] = ready
    ? shown.flatMap((location): Block[] => {
        if (location.closed) return [{ location, shift: null }];
        const shift = location.shifts.find((item) => item.key === key);
        return shift ? [{ location, shift }] : [];
      })
    : [];
  const foldKeyOf = (location: LineupLocation, shift: LineupShift | null) => (shift ? `${location.id}:${shift.key}` : location.id);
  const fold = (foldKey: string) =>
    setShut((current) => {
      const next = new Set(current);
      if (next.has(foldKey)) next.delete(foldKey);
      else next.add(foldKey);
      return next;
    });
  // Publish only while the shift on screen, at a location shown, has a draft that can go out (Mert 2026-10-17
  // ~1:40 PM); an open sheet stays until it is closed.
  const dock =
    publish && (publish.open || publish.published || blocks.some(({ shift }) => shift && canPublish(shift))) ? publish : null;
  // Publish goes once nothing is left to publish on screen: focus that was on it moves to the Edit of the card just
  // published (by its key), else that card's chevron, never to the page.
  const dockHadFocus = useRef(false);
  const docked = Boolean(dock);
  const sent = publish?.sent ?? [];
  const target = blocks.find(({ location, shift }) => shift && sent.includes(foldKeyOf(location, shift)));
  const targetKey = target?.shift ? foldKeyOf(target.location, target.shift) : null;
  const focusTarget = useRef(targetKey);
  focusTarget.current = targetKey;
  // In the same commit that takes Publish away (a layout effect, not a passive one): focus is never left on the page in
  // between, for a screen reader or a check that runs the moment the dock goes (BL-1158).
  useLayoutEffect(() => {
    if (docked || !dockHadFocus.current) return;
    dockHadFocus.current = false;
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    const cards = [...document.querySelectorAll<HTMLElement>("[data-lineup-card]")];
    const card = cards.find((element) => element.dataset.lineupCard === focusTarget.current) ?? cards[0];
    card?.querySelector<HTMLElement>(".lineup-card-edit:not(:disabled), .lineup-card-fold")?.focus();
  }, [docked]);
  const many = blocks.length > 1;

  return (
    <section className="lineup-page list-page lineup-phone-page" aria-labelledby="lineup-title">
      {/* The one fixed piece, at its full size: the shell's frozen top leaves it alone (data-frozen-own). */}
      <div className="lineup-phone-head" data-frozen-own="">
        {header}
      </div>
      <div className="lineup-phone-top">
        <LineupDayPicker date={date} today={today} onDate={onDate}>
          <LineupLocationSelect
            loading={loading}
            locations={locations}
            value={picked?.id ?? ""}
            allLabel="All locations"
            onChange={onLocation}
          />
        </LineupDayPicker>
        <div className="lineup-phone-tabs-slot">
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
      </div>

      {loading ? (
        <PhoneLineupOutline />
      ) : error ? (
        <div className="lineup-phone-pane">{error}</div>
      ) : !locations.length ? (
        <p className="lineup-phone-empty">No locations to show.</p>
      ) : !blocks.length ? (
        <p className="lineup-phone-empty">No shifts this day.</p>
      ) : (
        blocks.map(({ location, shift }, index) => {
          const previous = blocks[index - 1];
          // A line only where an open lineup's list ends and the next card begins (Mert 2026-10-17 ~11:20 AM);
          // folded cards simply stack.
          const line = Boolean(previous && !shut.has(foldKeyOf(previous.location, previous.shift)));
          return (
            <Fragment key={location.id}>
              {line ? <hr className="lineup-phone-sep" /> : null}
              {shift ? (
                <LocationLineup
                  location={location}
                  shift={shift}
                  dateLabel={dateLabel}
                  now={nowAt(location)}
                  timeFormat={timeFormat}
                  open={!shut.has(foldKeyOf(location, shift))}
                  onFold={() => fold(foldKeyOf(location, shift))}
                  edit={publish ? { workspaceId, date } : null}
                  held={Boolean(publish?.open)}
                  day={date}
                  stacked={Boolean(previous) && !line}
                  editing={editing}
                />
              ) : (
                <p className="lineup-phone-empty">
                  {many ? `${location.name} · ` : ""}Closed today · {location.closed!.title}
                </p>
              )}
            </Fragment>
          );
        })
      )}
      {/* Room under the last row: while Publish shows, what it covers (44 px, 10 px over the bar) and a little air,
          so the last row clears it once scrolled (lineup-phone.css); otherwise only the air. */}
      <div className={`lineup-phone-end${dock ? " has-dock" : ""}`} aria-hidden />
      {dock ? <PublishDock publish={dock} onFocusChange={(on) => (dockHadFocus.current = on)} /> : null}
    </section>
  );
}

/**
 * One location's lineup on the phone: its short hours, its card (Team · Notes · Read inside) and its pane. Each
 * location keeps its own tab; a sideways swipe on it moves between that location's tabs (KARARLAR §1.5), never
 * the shift (it is chosen by its tab).
 */
function LocationLineup({
  location,
  shift,
  dateLabel,
  now,
  timeFormat,
  open,
  onFold,
  edit,
  held,
  day,
  stacked,
  editing,
}: {
  readonly location: LineupLocation;
  readonly shift: LineupShift;
  readonly dateLabel: string;
  readonly now: string | null;
  readonly timeFormat: ScheduleTimeFormat;
  readonly open: boolean;
  readonly onFold: () => void;
  readonly edit: { readonly workspaceId: string | null; readonly date: string } | null;
  /** The Publish sheet is open over it. */
  readonly held: boolean;
  /** The day shown: a lineup lights up once per day it goes out on. */
  readonly day: string;
  /** Right under a folded card: a small gap, no line. */
  readonly stacked: boolean;
  readonly editing: LineupEditing | null;
}) {
  const [picked, setSeg] = useState<Seg>("team");
  const ids = useId();
  const live = shift.publish.published;
  // Read is off until the lineup is published (Mert 2026-10-17 ~12:30 PM): a draft shows Team or Notes.
  const seg: Seg = picked === "read" && !live ? "team" : picked;
  const swipe = useTabSwipe({ tabs: live ? SEGS : SEGS.slice(0, 2), active: seg, enabled: open, onSelect: setSeg, scope: "self" });
  // A draft that hasn't started changes in place (the server locks the rest), as on the desktop.
  const changing = editing && lineupEditable(shift, now) ? editing : null;
  // The person panel's row, by its key: the panel reads her as the day has her now (a change moves her row).
  const [personKey, setPersonKey] = useState<string | null>(null);
  const person = personKey ? findRow(shift, personKey) : null;
  const setPerson = (row: LineupRow | null) => setPersonKey(row?.shiftId ?? null);
  const [staff, setStaff] = useState<StaffPlace | null>(null);
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const joined = open && seg === "team" && teamEmpty(shift, changing);
  const panel = `${ids}panel`;
  return (
    <div className={`lineup-phone-block${stacked ? " is-stacked" : ""}`} ref={swipe.root}>
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
        onFold={onFold}
        edit={edit}
        held={held}
        day={day}
        panel={panel}
        cardRef={swipe.tabs}
        onSections={changing ? () => setSectionsOpen(true) : undefined}
      >
        <Segments shift={shift} seg={seg} onSeg={setSeg} ids={ids} panel={panel} />
      </LineupCard>
      {open ? (
        <div className="lineup-phone-pane" role="tabpanel" id={panel} aria-labelledby={`${ids}seg-${seg}`}>
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
              copy={editing ? <CopyTextButton text={() => lineupCopyText(location, shift, dateLabel, timeFormat)} /> : undefined}
            />
          ) : (
            <TeamPane location={location} shift={shift} timeFormat={timeFormat} editing={changing} onPerson={setPerson} onStaff={setStaff} />
          )}
        </div>
      ) : null}
      {changing && person ? (
        <PersonSheet
          row={person}
          location={location}
          shift={shift}
          editing={changing}
          timeFormat={timeFormat}
          onReplace={() => {
            setPerson(null);
            setStaff({ kind: "replace", row: person });
          }}
          onManageSections={() => setSectionsOpen(true)}
          onClose={() => setPerson(null)}
        />
      ) : null}
      {changing && sectionsOpen ? <SectionsWindow editing={changing} location={location} onClose={() => setSectionsOpen(false)} sheet /> : null}
      {changing && staff ? (
        <StaffWindow
          editing={changing}
          location={location}
          shift={shift}
          place={staff}
          timeFormat={timeFormat}
          onClose={() => setStaff(null)}
          sheet
        />
      ) : null}
    </div>
  );
}

/** A row of the lineup's team by its key, or null once it has left the team (called off, replaced). */
function findRow(shift: LineupShift, key: string): LineupRow | null {
  for (const department of shift.departments)
    for (const job of department.jobs) for (const row of job.rows) if (row.shiftId === key) return row;
  return null;
}

/** Nothing to list: no one on the lineup or out of it, and no department to add staff to. */
function teamEmpty(shift: LineupShift, editing: LineupEditing | null): boolean {
  const out = shift.out.calledOff.length + shift.out.replaced.length;
  return !shift.count && !out && !(editing && editing.catalog.departments.length);
}

/**
 * The lineup card (card 1, "boarding pass"; Mert 2026-10-17 ~11:45 AM, ~12:30 PM, ~1:10 PM): the place and day on
 * the left, Live or Draft with Edit over when it went out on the right, the chevron; a torn edge; Shift · People ·
 * Hours; Team · Notes · Read inside. A tap anywhere on it but its tabs folds it to its header. The desktop's ticket
 * (F, Mert 2026-10-19) is the same card; folded it is one line that keeps the tabs (`keepTabs`, 2026-10-21), and a
 * click on an empty spot of it folds and opens it like its chevron (Mert 2026-10-21).
 */
export function LineupCard({
  location,
  shift,
  dateLabel,
  now,
  timeFormat,
  open,
  joined,
  onFold,
  keepTabs = false,
  factsInHead = false,
  edit,
  held,
  day,
  panel,
  cardRef,
  onSections,
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
  /** Folding it to its header: a tap anywhere on it but its buttons and tabs, or its chevron. */
  readonly onFold?: () => void;
  /** The desktop's ticket: folded, it keeps its tabs on one line with its header (Mert 2026-10-21). */
  readonly keepTabs?: boolean;
  /** The desktop's ticket: open, Shift · People · Hours sit on its header's line, with no line of their own under the
   * torn edge (Mert 2026-10-21). */
  readonly factsInHead?: boolean;
  /** Taking the lineup back to draft, for someone who may publish. */
  readonly edit: { readonly workspaceId: string | null; readonly date: string } | null;
  /** The Publish sheet is open over it: a lineup that goes out lights up once it closes. */
  readonly held: boolean;
  /** The day shown: a lineup lights up once per day it goes out on. */
  readonly day: string;
  /** The id of the pane the card's tabs and chevron control. */
  readonly panel: string;
  readonly cardRef?: Ref<HTMLElement>;
  /** The phone's Sections window, from a gear beside Edit on a draft that can change (the design's secBtn). */
  readonly onSections?: () => void;
  readonly children: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const { live, started } = lineupCardState(shift, now);
  // Notice A (Mert 2026-10-17 ~1:15 PM): no notice. Edit has taken it back: the card's Draft lights up once; it has
  // gone out (Publish, or anyone's publish while the card is on screen): Live and "Published at" light up once.
  const [flash, setFlash] = useState(false);
  const [out, unlight] = useGoneOutLight(`${day}:${location.id}:${shift.key}`, live, held);
  const lit = flash || out ? " is-flash" : "";
  const span = lineupShiftSpan(shift);
  const style = { "--lineup-shift": shift.color ?? "var(--theme-border-strong)" } as CSSProperties;
  // On the location's clock, the one the started lock reads.
  const at = publishedAt(shift.publish.sharedAt, timeFormat, location.timezone);
  // After Edit has taken the lineup back, its button goes off: focus waits on the chevron instead (on the desktop's
  // ticket, which has none, on its tab).
  const foldButton = useRef<HTMLButtonElement | null>(null);
  const tabs = useRef<HTMLDivElement | null>(null);
  const [backToFold, setBackToFold] = useState(0);
  useEffect(() => {
    if (backToFold)
      (foldButton.current ?? tabs.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]'))?.focus();
  }, [backToFold]);
  const facts = (
    <dl className="lineup-card-facts">
      <div>
        <dt>Shift</dt>
        <dd>
          <i aria-hidden />
          <span>{shift.name}</span>
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
  );
  const tap = (event: ReactMouseEvent<HTMLElement>) => {
    const target = event.target as Element;
    // Only a tap on the card itself: not its buttons or tabs, nor the Edit window (a portal, its events bubble here).
    if (!event.currentTarget.contains(target) || target.closest("button, a, [role='tablist']")) return;
    onFold?.();
  };
  return (
    <section
      ref={cardRef}
      className={`lineup-card${open ? " is-open" : ""}${joined ? " is-joined" : ""}`}
      data-lineup-card={`${location.id}:${shift.key}`}
      style={style}
      aria-label={`${location.name}, ${shift.name}`}
      onClick={onFold ? tap : undefined}
    >
      <div className="lineup-card-head">
        <p className="lineup-card-loc">
          <MapPin aria-hidden />
          <span>{location.name}</span>
        </p>
        <p className="lineup-card-date">{dateLabel}</p>
        {open && factsInHead ? facts : null}
        <div className="lineup-card-state">
          <p className={`lineup-card-status ${live ? "is-live" : "is-draft"}${lit}`} onAnimationEnd={() => {
              setFlash(false);
              unlight();
            }}>
            <i aria-hidden />
            {live ? "Live" : "Draft"}
          </p>
          {edit ? (
            <button
              type="button"
              className="lineup-card-edit"
              disabled={!live || started}
              title={started ? lockedWhy(shift) : live ? undefined : "Publish first"}
              onClick={() => setEditing(true)}
            >
              {started ? <Lock aria-hidden /> : <Pencil aria-hidden />}
              Edit
            </button>
          ) : null}
          {onSections ? (
            <button
              type="button"
              className="lineup-card-edit lineup-card-sections"
              aria-haspopup="dialog"
              aria-label="Sections"
              title="Sections"
              onClick={onSections}
            >
              <Settings aria-hidden />
            </button>
          ) : null}
        </div>
        <p className={`lineup-card-at${live ? "" : " is-off"}${lit}`}>
          {live ? `Published at ${at}` : started ? "Not published" : "Not published yet"}
        </p>
        {onFold ? (
          <button
            type="button"
            ref={foldButton}
            className="lineup-card-fold"
            aria-expanded={open}
            aria-controls={keepTabs ? undefined : open ? panel : undefined}
            aria-label={keepTabs ? (open ? "Hide details" : "Show details") : open ? "Hide list" : "Show list"}
            onClick={onFold}
          >
            <ChevronDown aria-hidden />
          </button>
        ) : null}
      </div>
      {open ? (
        <>
          <div className="lineup-card-perf" aria-hidden />
          {factsInHead ? null : facts}
        </>
      ) : null}
      {open || keepTabs ? (
        <div className="lineup-card-band" ref={tabs}>
          {children}
        </div>
      ) : null}
      {editing && edit ? (
        <LineupEditWindow
          workspaceId={edit.workspaceId}
          date={edit.date}
          location={location}
          shift={shift}
          at={at}
          onClose={() => setEditing(false)}
          onDone={() => {
            setEditing(false);
            setFlash(true);
            setBackToFold((count) => count + 1);
          }}
        />
      ) : null}
    </section>
  );
}

/** Team · Notes · Read inside the card. Read is off until the lineup is published; then it carries its count. */
export function Segments({
  shift,
  seg,
  onSeg,
  ids,
  panel,
}: {
  readonly shift: LineupShift;
  readonly seg: Seg;
  readonly onSeg: (seg: Seg) => void;
  /** The location's own id prefix: every location shown has its tabs. */
  readonly ids: string;
  readonly panel: string;
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
    document.getElementById(`${ids}seg-${next}`)?.focus();
  };
  return (
    <div className="lineup-phone-segs" role="tablist" aria-label="Lineup" onKeyDown={keys}>
      {items.map(([key, label, count, enabled]) => (
        <button
          key={key}
          id={`${ids}seg-${key}`}
          type="button"
          role="tab"
          aria-selected={seg === key}
          aria-controls={panel}
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

/**
 * C's list: department, then job (dot, name, count), then people, and the people out at the foot. Read-only, a row
 * opens nothing; on a draft that hasn't started, a tap opens its person panel and each department adds staff.
 */
function TeamPane({
  location,
  shift,
  timeFormat,
  editing,
  onPerson,
  onStaff,
}: {
  readonly location: LineupLocation;
  readonly shift: LineupShift;
  readonly timeFormat: ScheduleTimeFormat;
  readonly editing: LineupEditing | null;
  readonly onPerson: (row: LineupRow) => void;
  readonly onStaff: (place: StaffPlace) => void;
}) {
  if (teamEmpty(shift, editing))
    return (
      <div className="lineup-phone-noone">
        <Users aria-hidden />
        <OneLine text={`No one is scheduled for ${shift.name} at ${location.name}`} />
      </div>
    );
  return (
    <>
      {teamDepartments(shift, editing).map((department) => {
        const count = department.jobs.reduce((sum, job) => sum + job.rows.length, 0);
        return (
          <section className="lineup-phone-dept" key={department.id ?? "other"} aria-label={department.name}>
            <h3>
              {department.name}
              <span>{count}</span>
              {editing && department.id ? (
                <AddStaffButton
                  department={department.name}
                  onAdd={() => onStaff({ kind: "add", department: { id: department.id!, name: department.name } })}
                />
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
                      <PersonRow key={row.shiftId} row={row} timeFormat={timeFormat} onTap={editing ? () => onPerson(row) : undefined} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        );
      })}
      <OutGroups location={location} shift={shift} timeFormat={timeFormat} editing={editing} phone />
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

function PersonRow({
  row,
  timeFormat,
  onTap,
}: {
  readonly row: LineupRow;
  readonly timeFormat: ScheduleTimeFormat;
  /** Opens the person panel (a draft that hasn't started): the whole row is its button. */
  readonly onTap?: () => void;
}) {
  const chips = [...row.labels.map((label) => ({ label, warn: false })), ...(row.lineupOnly ? [{ label: "Lineup only", warn: true }] : [])];
  return (
    <li className={`lineup-phone-row${onTap ? " is-tap" : ""}`}>
      {onTap ? (
        <button
          type="button"
          className="lineup-phone-tap"
          aria-haspopup="dialog"
          aria-label={`Change ${row.name}`}
          onClick={(event) => {
            // A tap doesn't focus a button on iOS: it holds the focus, so the panel gives it back here.
            event.currentTarget.focus();
            onTap();
          }}
        />
      ) : null}
      <LineupPersonCircle name={row.name} artKey={row.artKey} />
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
export function NotesPane({ shift }: { readonly shift: LineupShift }) {
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
export function ReadPane({
  shift,
  timeFormat,
  timezone,
  copy,
}: {
  readonly shift: LineupShift;
  readonly timeFormat: ScheduleTimeFormat;
  /** The location's: read times are its clock's, as "Published at" is. */
  readonly timezone: string;
  /** Copy as text, on the No app heading (the desktop's, LINEUP-EDIT W2a). */
  readonly copy?: ReactNode;
}) {
  if (!shift.publish.askAck)
    return (
      <div className="lineup-phone-calm">
        <Eye size={26} aria-hidden />
        <b>Acknowledgement is off</b>
        <span>Staff were notified without being asked to acknowledge.</span>
      </div>
    );
  return <LineupReadPhone shift={shift} timeFormat={timeFormat} timezone={timezone} noAppAction={copy} />;
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
function PublishDock({
  publish,
  onFocusChange,
}: {
  readonly publish: PhonePublish;
  /** Whether the dock's button holds focus (it may go once Published is over). */
  readonly onFocusChange: (on: boolean) => void;
}) {
  const dock = useRef<HTMLDivElement | null>(null);
  useDockPlace(dock);
  return (
    <>
      <div
        className="lineup-phone-dock"
        ref={dock}
        onFocus={() => onFocusChange(true)}
        onBlur={(event) => {
          if (event.relatedTarget) onFocusChange(false);
        }}
      >
        <LineupPublishButton
          waiting={publish.waiting}
          anyPublished={publish.anyPublished}
          open={publish.open}
          published={publish.published}
          busy={publish.busy}
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
