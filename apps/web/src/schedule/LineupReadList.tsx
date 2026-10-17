import { Check } from "lucide-react";
import { useEffect, useRef, type JSX } from "react";

import { lineupReadLists, type LineupReader, type LineupShift } from "./lineup";
import { publishedAt } from "./LineupPublishWindow";
import type { ScheduleTimeFormat } from "./lib/scheduleDateTime";
import "./lineup-read.css";

// Who read a published lineup (Mert 2026-10-17, "Acknowledge edenleri listelemesi şart"; mockup v-c.js readTab):
// "7 of 11 read" and its bar, then Not read yet, Read (with the time) and No app (not counted). The phone's Read
// tab and the desktop's Read panel show the same lists.

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
}: {
  readonly title: string;
  readonly people: readonly LineupReader[];
  readonly when: (person: LineupReader) => JSX.Element;
}) {
  if (!people.length) return null;
  return (
    <section className="lineup-read-group" aria-label={title}>
      <h3>
        {title}
        <span>{people.length}</span>
      </h3>
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
      <Group title="Not read yet" people={lists.unread} when={() => <span className="lineup-read-when">—</span>} />
      <Group
        title="Read"
        people={lists.read}
        when={(person) => (
          <span className="lineup-read-when is-read">
            <Check size={14} aria-hidden />
            {publishedAt(person.acknowledgedAt, timeFormat)}
          </span>
        )}
      />
      <Group title="No app" people={lists.noApp} when={() => <span className="lineup-read-when">Not counted</span>} />
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
