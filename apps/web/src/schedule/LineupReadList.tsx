import { Check } from "lucide-react";
import { useEffect, useRef, type JSX, type ReactNode } from "react";

import { lineupReadLists, type LineupReader, type LineupShift } from "./lineup";
import { publishedAt } from "./LineupPublishWindow";
import type { ScheduleTimeFormat } from "./lib/scheduleDateTime";
import "./lineup-read.css";

// Who read a published lineup (Mert 2026-10-17, "Acknowledge edenleri listelemesi şart"; mockup v-c.js readTab):
// "7 of 11 read" and its bar, then Not read yet, Read (with the time) and No app (not counted) on the desktop's Read
// panel. The phone's Read tab (Mert 2026-10-17 ~12:30 PM, ~1 PM) has the same lists without the summary: Read first,
// then Not read yet and No app, and one thin bar on the first heading.

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

function Group({
  title,
  people,
  when,
  lead,
}: {
  readonly title: string;
  readonly people: readonly LineupReader[];
  readonly when: (person: LineupReader) => JSX.Element;
  /** The progress the first heading carries in place of its count (the phone's Read tab). */
  readonly lead?: ReactNode;
}) {
  if (!people.length) return null;
  return (
    <section className="lineup-read-group" aria-label={title}>
      {lead ? (
        <div className="lineup-read-head">
          <h3>{title}</h3>
          {lead}
        </div>
      ) : (
        <h3>
          {title}
          <span>{people.length}</span>
        </h3>
      )}
      <ul className="lineup-read-list">
        {people.map((person) => (
          <li key={person.employeeId} className="lineup-read-row">
            <span className="lineup-read-avatar" aria-hidden>
              {initials(person.name)}
            </span>
            <span className="lineup-read-mid">
              <span className="lineup-read-name">{person.name}</span>
              <span className="lineup-read-job">{person.jobName}</span>
            </span>
            {when(person)}
          </li>
        ))}
      </ul>
    </section>
  );
}

const unreadWhen = () => <span className="lineup-read-when">—</span>;
const noAppWhen = () => <span className="lineup-read-when">Not counted</span>;
function readWhen(timeFormat: ScheduleTimeFormat) {
  return (person: LineupReader) => (
    <span className="lineup-read-when is-read">
      <Check size={14} aria-hidden />
      {publishedAt(person.acknowledgedAt, timeFormat)}
    </span>
  );
}

/** The phone's Read tab: Read, Not read yet and No app; the first counted heading carries "N/M" and its bar. */
export function LineupReadPhone({
  shift,
  timeFormat,
}: {
  readonly shift: LineupShift;
  readonly timeFormat: ScheduleTimeFormat;
}): JSX.Element {
  const { acknowledged, withApp } = shift.publish;
  const lists = lineupReadLists(shift);
  const percent = withApp ? Math.round((acknowledged / withApp) * 100) : 0;
  const bar = (
    <span className="lineup-read-prog">
      <b>
        {acknowledged}/{withApp}
      </b>
      <span
        className="lineup-read-bar"
        role="progressbar"
        aria-label={`${acknowledged} of ${withApp} read`}
        aria-valuemin={0}
        aria-valuemax={withApp}
        aria-valuenow={acknowledged}
      >
        <i style={{ width: `${percent}%` }} />
      </span>
    </span>
  );
  const onRead = lists.read.length > 0;
  return (
    <div className="lineup-read is-phone">
      <Group title="Read" people={lists.read} when={readWhen(timeFormat)} lead={onRead ? bar : undefined} />
      <Group title="Not read yet" people={lists.unread} when={unreadWhen} lead={onRead ? undefined : bar} />
      <Group title="No app" people={lists.noApp} when={noAppWhen} />
    </div>
  );
}

export function LineupReadLists({
  shift,
  timeFormat,
}: {
  readonly shift: LineupShift;
  readonly timeFormat: ScheduleTimeFormat;
}): JSX.Element {
  const { publish } = shift;
  const lists = lineupReadLists(shift);
  const percent = publish.withApp ? Math.round((publish.acknowledged / publish.withApp) * 100) : 0;
  return (
    <div className="lineup-read">
      <div className="lineup-read-sum">
        <div>
          <b>{publish.acknowledged}</b>
          <span>of {publish.withApp} read</span>
        </div>
        <i className="lineup-read-progress" role="img" aria-label={`${percent}% read`}>
          <i style={{ width: `${percent}%` }} />
        </i>
        <p>Published {publishedAt(publish.sharedAt, timeFormat)}. People who open the app later see it too.</p>
      </div>
      <Group title="Not read yet" people={lists.unread} when={unreadWhen} />
      <Group title="Read" people={lists.read} when={readWhen(timeFormat)} />
      <Group title="No app" people={lists.noApp} when={noAppWhen} />
    </div>
  );
}

/**
 * The desktop's Read panel under a shift's "Read 7/11" (the Publish window's family: white, small, a soft ring;
 * no window in the middle). A click outside or Escape closes it; focus goes in and comes back.
 */
export function LineupReadPanel({
  shift,
  timeFormat,
  onClose,
  returnFocus,
}: {
  readonly shift: LineupShift;
  readonly timeFormat: ScheduleTimeFormat;
  readonly onClose: () => void;
  /** Where focus goes back when it closes (the count that opened it). */
  readonly returnFocus: () => void;
}): JSX.Element {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    ref.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    const outside = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target || ref.current?.contains(target) || target.closest?.(".lineup-shift-read")) return;
      onClose();
    };
    window.addEventListener("keydown", escape, true);
    document.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("keydown", escape, true);
      document.removeEventListener("pointerdown", outside);
      returnFocus();
    };
  }, [onClose, returnFocus]);
  return (
    <section
      ref={ref}
      className="lineup-read-panel"
      role="dialog"
      aria-label={`Who read ${shift.name}`}
      tabIndex={-1}
    >
      <LineupReadLists shift={shift} timeFormat={timeFormat} />
    </section>
  );
}
