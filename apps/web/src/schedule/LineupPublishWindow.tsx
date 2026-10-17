import { Button, ConfirmButton } from "@newfork/ui";
import { Check, Send } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type JSX } from "react";

import { canPublish, type LineupLocation, type LineupShift } from "./lineup";
import { lineupCommandMessage, useLineupCommand } from "./lineup-data";
import { formatTime, type ScheduleTimeFormat } from "./lib/scheduleDateTime";
import "./lineup-publish.css";

// The Publish window (Mert 2026-10-13, "harika bu"; PLAN §3): one small window under the page's Publish
// button, the look of the Schedule's top-right menus (style B). Lineups by location; a box beside each one
// waiting to be published; "Ask staff to acknowledge"; green "Publish N". A published lineup shows a red
// Unpublish on hover or focus, two clicks. Image and text sharing come later (KARARLAR 2026-10-17).

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const keyOf = (location: LineupLocation, shift: LineupShift) => `${location.id}:${shift.key}`;

function people(shifts: readonly LineupShift[]): number {
  return new Set(
    shifts.flatMap((shift) => shift.departments.flatMap((d) => d.jobs.flatMap((j) => j.rows.map((r) => r.employeeId)))),
  ).size;
}

/** "2:10 PM" in the location's own clock is the Schedule's format; the browser's clock is close enough here. */
export function publishedAt(sharedAt: string | null, timeFormat: ScheduleTimeFormat): string {
  if (!sharedAt) return "";
  const at = new Date(sharedAt);
  const hhmm = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
  return formatTime(hhmm, timeFormat, "long");
}

/** The Publish button's count: lineups waiting to be published. */
export function LineupPublishButton({
  waiting,
  anyPublished,
  open,
  onToggle,
  className,
}: {
  readonly waiting: number;
  readonly anyPublished: boolean;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly className?: string;
}): JSX.Element {
  // Nothing to publish and nothing to take back: the button rests, faded.
  const idle = waiting === 0 && !anyPublished;
  return (
    <Button
      className={`lineup-publish-trigger${className ? ` ${className}` : ""}`}
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-label={waiting ? `Publish, ${plural(waiting, "lineup")} waiting` : "Publish"}
      disabled={idle}
      title={idle ? "No lineups to publish this day." : undefined}
      onClick={onToggle}
    >
      <Send size={15} aria-hidden />
      Publish
      {waiting ? <span className="lineup-publish-badge" aria-hidden>{waiting}</span> : null}
    </Button>
  );
}

export function LineupPublishWindow({
  workspaceId,
  date,
  dateLabel,
  locations,
  timeFormat,
  onClose,
  className,
}: {
  readonly workspaceId: string | null;
  readonly date: string;
  readonly dateLabel: string;
  readonly locations: readonly LineupLocation[];
  readonly timeFormat: ScheduleTimeFormat;
  readonly onClose: () => void;
  readonly className?: string;
}): JSX.Element {
  const ref = useRef<HTMLElement | null>(null);
  const command = useLineupCommand(workspaceId, date);
  // Every lineup waiting is ticked when the window opens.
  const [picked, setPicked] = useState<ReadonlySet<string>>(
    () => new Set(locations.flatMap((l) => l.shifts.filter(canPublish).map((s) => keyOf(l, s)))),
  );
  const [askAck, setAskAck] = useState(true);
  const [note, setNote] = useState<{ readonly kind: "ok" | "error"; readonly text: string } | null>(null);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if ((event.target as Element | null)?.closest?.('[data-confirming="true"]')) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    const outside = (event: PointerEvent) => {
      const target = event.target as Element | null;
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

  function toggle(key: string) {
    setNote(null);
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function publish() {
    if (!chosen.length) return;
    const count = chosen.length;
    const notified = people(chosen);
    command.mutate(
      { kind: "share", lineups: chosen.map((s) => s.publish.target), askAck },
      {
        onSuccess: () => {
          setPicked(new Set());
          setNote({ kind: "ok", text: `Published ${plural(count, "lineup")} · ${plural(notified, "person", "people")} notified` });
        },
        onError: (error) => setNote({ kind: "error", text: lineupCommandMessage(error) }),
      },
    );
  }

  function unpublish(location: LineupLocation, shift: LineupShift) {
    command.mutate(
      { kind: "unpublish", lineups: [shift.publish.target] },
      {
        onSuccess: () => {
          setPicked((current) => new Set(current).add(keyOf(location, shift)));
          setNote({ kind: "ok", text: `Unpublished. Staff can't see ${shift.name} until you publish it again.` });
        },
        onError: (error) => setNote({ kind: "error", text: lineupCommandMessage(error) }),
      },
    );
  }

  return (
    <section
      ref={ref}
      className={`lineup-publish-window${className ? ` ${className}` : ""}`}
      role="dialog"
      aria-labelledby="lineup-publish-title"
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
                    shift={shift}
                    picked={picked.has(keyOf(location, shift))}
                    busy={command.isPending}
                    timeFormat={timeFormat}
                    onToggle={() => toggle(keyOf(location, shift))}
                    onUnpublish={() => unpublish(location, shift)}
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
      {note?.kind === "error" ? (
        <p className="lineup-publish-error" role="alert">{note.text}</p>
      ) : null}
      <footer className="lineup-publish-foot">
        {note?.kind === "ok" ? (
          <span className="lineup-publish-sum is-ok" role="status">
            <Check size={14} aria-hidden />
            {note.text}
          </span>
        ) : (
          <span className="lineup-publish-sum">
            {chosen.length
              ? `${plural(chosen.length, "lineup")} · ${plural(people(chosen), "person", "people")}`
              : "Nothing to publish"}
          </span>
        )}
        {note?.kind === "ok" && !chosen.length ? (
          <button type="button" className="secondary-button lineup-publish-done" onClick={onClose}>
            Done
          </button>
        ) : (
          <Button
            className="lineup-publish-go"
            disabled={!chosen.length || command.isPending}
            onClick={publish}
          >
            <Send size={14} aria-hidden />
            {command.isPending ? "Publishing…" : `Publish${chosen.length ? ` ${chosen.length}` : ""}`}
          </Button>
        )}
      </footer>
    </section>
  );
}

function PublishRow({
  shift,
  picked,
  busy,
  timeFormat,
  onToggle,
  onUnpublish,
}: {
  readonly shift: LineupShift;
  readonly picked: boolean;
  readonly busy: boolean;
  readonly timeFormat: ScheduleTimeFormat;
  readonly onToggle: () => void;
  readonly onUnpublish: () => void;
}): JSX.Element {
  const ready = canPublish(shift);
  const { publish } = shift;
  const past = publish.status === "past";
  const style = { "--lineup-shift": shift.color ?? "var(--theme-border-strong)" } as CSSProperties;
  const meta = publish.published ? (
    <span className="lineup-publish-meta is-published">
      <Check size={12} aria-hidden />
      Published {publishedAt(publish.sharedAt, timeFormat)}
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
          disabled={busy}
          onClick={onToggle}
        >
          {inner}
        </button>
      ) : (
        <div className="lineup-publish-pick">{inner}</div>
      )}
      {publish.published && !past ? (
        <ConfirmButton
          unstyled
          className="lineup-publish-unpublish"
          confirmLabel="Unpublish?"
          aria-label={`Unpublish ${shift.name}`}
          confirmName={`Unpublish ${shift.name}? Click again to confirm.`}
          disabled={busy}
          onConfirm={onUnpublish}
        >
          Unpublish
        </ConfirmButton>
      ) : null}
    </li>
  );
}
