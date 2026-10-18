import { Button } from "@newfork/ui";
import { Check, EyeOff, Lock, Pencil, RotateCw, Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type JSX } from "react";

import { validZone } from "../lib/today";
import { canPublish, lineupCardState, LINEUP_BUSY_MS, type LineupLocation, type LineupShift } from "./lineup";
import { lineupCommandMessage, useLineupCommand } from "./lineup-data";
import { formatTime, type ScheduleTimeFormat } from "./lib/scheduleDateTime";
import "./lineup-publish.css";
import { ConfirmDialog } from "../shell/ConfirmDialog";
import { WindowAlert } from "../shell/WindowAlert";

// The Publish window (Mert 2026-10-13, "harika bu"; PLAN §3): one small window under the page's Publish
// button, the look of the Schedule's top-right menus (style B). Lineups by location; a box beside each one
// waiting to be published; "Ask staff to acknowledge"; green "Publish N". A published lineup has the phone's green
// Edit, which opens the same Edit window (S-162, Mert 2026-10-18). Image and text sharing come later (KARARLAR
// 2026-10-17).

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const keyOf = (location: LineupLocation, shift: LineupShift) => `${location.id}:${shift.key}`;

/**
 * Publish says what it did in its buttons (Mert 2026-10-17, notice A; mockup v-e.js .d-pub): the window's Publish
 * spins and says "Publishing…" for at least PUBLISH_WORK_MS; then the window closes and the Publish that opened it
 * says "Published" for PUBLISH_DONE_MS (2.6 s in all), then is as it was. No notice, no line in the window.
 */
export const PUBLISH_WORK_MS = 900;
export const PUBLISH_DONE_MS = 1700;

/**
 * A lineup has gone out (notice A): true once when `live` turns on for the same lineup, held back while `held` (the
 * Publish window over it is open) so the light shows when the window has closed. The second value turns it off
 * (the light's animation end).
 */
export function useGoneOutLight(key: string, live: boolean, held: boolean): readonly [boolean, () => void] {
  const [lit, setLit] = useState(false);
  const seen = useRef({ key, live, waiting: false });
  useEffect(() => {
    const before = seen.current;
    const waiting = live && before.key === key && (before.waiting || !before.live);
    if (waiting && !held) setLit(true);
    seen.current = { key, live, waiting: waiting && held };
  }, [key, live, held]);
  const off = useCallback(() => setLit(false), []);
  return [lit, off];
}

function people(shifts: readonly LineupShift[]): number {
  return new Set(
    shifts.flatMap((shift) => shift.departments.flatMap((d) => d.jobs.flatMap((j) => j.rows.map((r) => r.employeeId)))),
  ).size;
}

/**
 * "2:10 PM" in the Schedule's format: on the location's clock when `zone` is given (the phone card, whose started
 * lock reads that clock too), else on the browser's.
 */
export function publishedAt(sharedAt: string | null, timeFormat: ScheduleTimeFormat, zone?: string): string {
  if (!sharedAt) return "";
  const at = new Date(sharedAt);
  const hhmm = zone
    ? new Intl.DateTimeFormat("en-GB", { timeZone: validZone(zone), hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at)
    : `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
  return formatTime(hhmm, timeFormat, "long");
}

/** The Publish button's count: lineups waiting to be published. */
export function LineupPublishButton({
  waiting,
  anyPublished,
  open,
  published = false,
  onToggle,
  className,
}: {
  readonly waiting: number;
  readonly anyPublished: boolean;
  readonly open: boolean;
  /** It has just published: a check and "Published" for PUBLISH_DONE_MS; presses wait. */
  readonly published?: boolean;
  readonly onToggle: () => void;
  readonly className?: string;
}): JSX.Element {
  // Nothing to publish and nothing to take back: the button rests, faded.
  const idle = waiting === 0 && !anyPublished && !published;
  return (
    <Button
      className={`lineup-publish-trigger${published ? " is-published" : ""}${className ? ` ${className}` : ""}`}
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-label={published ? undefined : waiting ? `Publish, ${plural(waiting, "lineup")} waiting` : "Publish"}
      aria-disabled={published || undefined}
      aria-live="polite"
      disabled={idle}
      title={idle ? "No lineups to publish this day." : undefined}
      onClick={() => {
        if (!published) onToggle();
      }}
    >
      {published ? (
        <span className="lineup-publish-ok">
          <Check size={16} strokeWidth={3} aria-hidden />
          Published
        </span>
      ) : (
        <>
          <Send size={15} aria-hidden />
          Publish
          {waiting ? <span className="lineup-publish-badge" aria-hidden>{waiting}</span> : null}
        </>
      )}
    </Button>
  );
}

export function LineupPublishWindow({
  workspaceId,
  date,
  dateLabel,
  locations,
  timeFormat,
  nowAt,
  onClose,
  onPublished,
  className,
}: {
  readonly workspaceId: string | null;
  readonly date: string;
  readonly dateLabel: string;
  readonly locations: readonly LineupLocation[];
  readonly timeFormat: ScheduleTimeFormat;
  /** A location's wall clock on this day ("HH:MM"), null on another day: a started shift locks Edit. */
  readonly nowAt?: (location: LineupLocation) => string | null;
  readonly onClose: () => void;
  /**
   * It went out and "Publishing…" has shown PUBLISH_WORK_MS: the page closes the window and its Publish says
   * "Published" (focus goes back to that button as the window closes). `keys`: the lineups that went out,
   * "<location id>:<shift key>".
   */
  readonly onPublished: (keys: readonly string[]) => void;
  readonly className?: string;
}): JSX.Element {
  const ref = useRef<HTMLElement | null>(null);
  const command = useLineupCommand(workspaceId, date);
  // Every lineup waiting is ticked when the window opens.
  const [picked, setPicked] = useState<ReadonlySet<string>>(
    () => new Set(locations.flatMap((l) => l.shifts.filter(canPublish).map((s) => keyOf(l, s)))),
  );
  const [askAck, setAskAck] = useState(true);
  // Why the last press didn't go through (S-139: the window's band). A success says so in its button only.
  const [refusal, setRefusal] = useState<string | null>(null);
  // Publish is working: "Publishing…" in its button; presses wait (one command per press).
  const [working, setWorking] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  // The lineup the Edit window is open on, and the lineup whose box takes focus once Edit has taken it back.
  const [editing, setEditing] = useState<{ readonly location: LineupLocation; readonly shift: LineupShift } | null>(null);
  // Read at event time: the Edit window over this one answers its own Escape and clicks, and while Publish works
  // the window stays, so a refusal still shows in its band (as the Edit window does while busy).
  const editingNow = useRef(false);
  editingNow.current = editing !== null;
  const workingNow = useRef(false);
  workingNow.current = working;
  const [focusKey, setFocusKey] = useState<string | null>(null);

  // Focus goes into the window when it opens and back to what opened it (or the Publish button) when it closes.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement
      : null;
    ref.current?.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
    return () => {
      const back = opener?.isConnected ? opener : document.querySelector<HTMLElement>(".lineup-publish-trigger");
      back?.focus();
    };
  }, []);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || editingNow.current) return;
      event.preventDefault();
      if (workingNow.current) {
        event.stopPropagation();
        return;
      }
      event.stopPropagation();
      onClose();
    };
    const outside = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (editingNow.current || workingNow.current) return;
      if (!target || ref.current?.contains(target) || target.closest?.(".lineup-publish-trigger")) return;
      onClose();
    };
    window.addEventListener("keydown", escape, true);
    document.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("keydown", escape, true);
      document.removeEventListener("pointerdown", outside);
    };
  }, [onClose]);

  const listed = locations
    .map((location) => ({ location, shifts: location.shifts.filter((s) => s.count > 0 || s.publish.published) }))
    .filter((entry) => entry.shifts.length);
  const chosen = listed.flatMap(({ location, shifts }) =>
    shifts.filter((s) => canPublish(s) && picked.has(keyOf(location, s))));

  // Edit has taken a lineup back: its box (ticked to go out again) takes the focus the Edit button had, once the day
  // read shows it as a draft; until then the window itself holds it.
  useEffect(() => {
    if (!focusKey) return;
    const box = [...(ref.current?.querySelectorAll<HTMLElement>("[data-lineup-key]") ?? [])].find(
      (element) => element.dataset.lineupKey === focusKey,
    );
    (box ?? ref.current)?.focus();
    if (box) setFocusKey(null);
  }, [focusKey, locations]);

  function toggle(key: string) {
    setRefusal(null);
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function publish() {
    // One command per press: a press while it works does nothing.
    if (working || !chosen.length) return;
    const since = Date.now();
    const sent = listed.flatMap(({ location, shifts }) =>
      shifts.filter((s) => canPublish(s) && picked.has(keyOf(location, s))).map((s) => keyOf(location, s)));
    setWorking(true);
    setRefusal(null);
    command.mutate(
      { kind: "share", lineups: chosen.map((s) => s.publish.target), askAck },
      {
        onSuccess: () => {
          timer.current = window.setTimeout(() => onPublished(sent), Math.max(0, PUBLISH_WORK_MS - (Date.now() - since)));
        },
        // The window stays: the button as it was, why in the window's band (S-139).
        onError: (error) => {
          setWorking(false);
          setRefusal(lineupCommandMessage(error));
        },
      },
    );
  }

  const busy = working;
  return (
    <section
      ref={ref}
      className={`lineup-publish-window${className ? ` ${className}` : ""}`}
      role="dialog"
      aria-labelledby="lineup-publish-title"
      tabIndex={-1}
    >
      <header className="lineup-publish-top">
        <strong id="lineup-publish-title">Publish lineups</strong>
        <small>{dateLabel}</small>
      </header>
      <div className="lineup-publish-list">
        {listed.length ? (
          listed.map(({ location, shifts }) => (
            <section key={location.id} aria-label={location.name}>
              <h3 className="lineup-publish-place">{location.name}</h3>
              <ul>
                {shifts.map((shift) => (
                  <PublishRow
                    key={shift.key}
                    rowKey={keyOf(location, shift)}
                    shift={shift}
                    zone={location.timezone}
                    picked={picked.has(keyOf(location, shift))}
                    busy={busy || command.isPending}
                    started={lineupCardState(shift, nowAt?.(location) ?? null).started}
                    timeFormat={timeFormat}
                    onToggle={() => toggle(keyOf(location, shift))}
                    onEdit={() => {
                      if (!busy) setEditing({ location, shift });
                    }}
                  />
                ))}
              </ul>
            </section>
          ))
        ) : (
          <p className="lineup-publish-empty">No one is on a lineup this day.</p>
        )}
      </div>
      <div className="lineup-publish-sep" />
      <button
        type="button"
        className="lineup-publish-item"
        role="switch"
        aria-checked={askAck}
        onClick={() => setAskAck(!askAck)}
      >
        <span>Ask staff to acknowledge</span>
        <span className="lineup-publish-switch" aria-hidden />
      </button>
      <footer className="lineup-publish-foot">
        {/* Over the window's bottom edge, above the buttons (UI-FIELDMSG). */}
        <WindowAlert message={refusal} />
        <span className="lineup-publish-sum">
          {chosen.length
            ? `${plural(chosen.length, "lineup")} · ${plural(people(chosen), "person", "people")}`
            : "Nothing to publish"}
        </span>
        {/* While it works it is aria-disabled, not disabled, so the keyboard's focus stays on it (D2). */}
        <Button
          className={`lineup-publish-go${working ? " is-working" : ""}`}
          disabled={!working && !chosen.length}
          aria-disabled={working || undefined}
          aria-busy={working || undefined}
          aria-live="polite"
          onClick={publish}
        >
          {working ? (
            <>
              <span className="lineup-publish-spin" aria-hidden />
              Publishing…
            </>
          ) : (
            <>
              <Send size={14} aria-hidden />
              {`Publish${chosen.length ? ` ${chosen.length}` : ""}`}
            </>
          )}
        </Button>
      </footer>
      {editing ? (
        <LineupEditWindow
          workspaceId={workspaceId}
          date={date}
          location={editing.location}
          shift={editing.shift}
          at={publishedAt(editing.shift.publish.sharedAt, timeFormat, editing.location.timezone)}
          onClose={() => setEditing(null)}
          onDone={() => {
            const key = keyOf(editing.location, editing.shift);
            setEditing(null);
            setPicked((current) => new Set(current).add(key));
            setFocusKey(key);
          }}
        />
      ) : null}
    </section>
  );
}

function PublishRow({
  rowKey,
  shift,
  zone,
  picked,
  busy,
  started,
  timeFormat,
  onToggle,
  onEdit,
}: {
  readonly rowKey: string;
  readonly shift: LineupShift;
  /** The location's clock, the one "Published" and the Edit window read. */
  readonly zone: string;
  readonly picked: boolean;
  readonly busy: boolean;
  /** The shift has begun (or the day is over): Edit is locked, as on the phone. */
  readonly started: boolean;
  readonly timeFormat: ScheduleTimeFormat;
  readonly onToggle: () => void;
  readonly onEdit: () => void;
}): JSX.Element {
  const ready = canPublish(shift);
  const { publish } = shift;
  const past = publish.status === "past";
  const style = { "--lineup-shift": shift.color ?? "var(--theme-border-strong)" } as CSSProperties;
  const meta = publish.published ? (
    <span className="lineup-publish-meta is-published">
      <Check size={12} aria-hidden />
      Published {publishedAt(publish.sharedAt, timeFormat, zone)}
      {publish.askAck ? ` · ${publish.acknowledged}/${publish.withApp}` : ""}
    </span>
  ) : past ? (
    <span className="lineup-publish-meta">Day is over</span>
  ) : publish.status === "editing" ? (
    <span className="lineup-publish-meta is-editing">Unpublished · {plural(shift.count, "person", "people")}</span>
  ) : (
    <span className="lineup-publish-meta">{plural(shift.count, "person", "people")}</span>
  );
  const inner = (
    <>
      <span className={`lineup-publish-box${ready && picked ? " is-on" : ""}${ready ? "" : " is-ghost"}`} aria-hidden>
        {ready && picked ? <Check size={11} strokeWidth={3} /> : null}
      </span>
      <i className="lineup-publish-chip" aria-hidden />
      <span className="lineup-publish-name">{shift.name}</span>
      {meta}
    </>
  );
  return (
    <li className={`lineup-publish-row${past ? " is-past" : ""}`} style={style}>
      {ready ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={picked}
          className="lineup-publish-pick"
          data-lineup-key={rowKey}
          disabled={busy}
          onClick={onToggle}
        >
          {inner}
        </button>
      ) : (
        <div className="lineup-publish-pick">{inner}</div>
      )}
      {publish.published ? (
        <button
          type="button"
          className="lineup-publish-edit"
          aria-label={`Edit ${shift.name} lineup`}
          disabled={started}
          title={started ? lockedWhy(shift) : undefined}
          onClick={onEdit}
        >
          {started ? <Lock aria-hidden /> : <Pencil aria-hidden />}
          Edit
        </button>
      ) : null}
    </li>
  );
}

/** Why a published lineup's Edit is locked: its day is over, or its shift has begun (phone card and this window). */
export function lockedWhy(shift: LineupShift): string {
  return shift.publish.status === "past" ? "This day is over" : "This shift has started";
}

/**
 * Edit window A (Mert 2026-10-17 ~1:15 PM), on the phone's lineup card and in the Publish window (S-162): what Edit
 * does, in two lines, before the lineup goes back to draft. The words follow today's rule: a republished lineup asks
 * everyone again (the changed-only rule is BL-1135). Its green Edit works in place: a spinner and "Unpublishing…" for
 * at least LINEUP_BUSY_MS, so a quick answer still reads; then the window closes on the draft.
 */
export function LineupEditWindow({
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
  /** When it went out, in the Schedule's format on the location's clock. */
  readonly at: string;
  readonly onClose: () => void;
  /** The lineup is back in draft. */
  readonly onDone: () => void;
}): JSX.Element {
  const command = useLineupCommand(workspaceId, date);
  // Read once, when the window opens (D1): the day read turns the lineup to a draft while the button still holds,
  // and "Published at" would go blank under it.
  const [said] = useState(() => ({
    title: `Edit ${shift.name} lineup?`,
    description: `${location.name} · Published at ${at}`,
    target: shift.publish.target,
  }));
  const [refused, setRefused] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const busy = working || command.isPending;
  return (
    <ConfirmDialog
      open
      title={said.title}
      description={said.description}
      confirmLabel="Edit"
      busyLabel="Unpublishing…"
      busy={busy}
      error={refused}
      onCancel={onClose}
      onConfirm={() => {
        const since = Date.now();
        setWorking(true);
        setRefused(null);
        command.mutate(
          { kind: "unpublish", lineups: [said.target] },
          {
            onSuccess: () => {
              timer.current = window.setTimeout(onDone, Math.max(0, LINEUP_BUSY_MS - (Date.now() - since)));
            },
            onError: (reason) => {
              setWorking(false);
              setRefused(lineupCommandMessage(reason));
            },
          },
        );
      }}
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
    </ConfirmDialog>
  );
}
