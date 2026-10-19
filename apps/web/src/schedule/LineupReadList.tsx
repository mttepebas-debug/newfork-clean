import { Check } from "lucide-react";
import type { JSX, ReactNode } from "react";

import { lineupReadLists, type LineupReader, type LineupShift } from "./lineup";
import { publishedAt } from "./LineupPublishWindow";
import type { ScheduleTimeFormat } from "./lib/scheduleDateTime";
import "./lineup-read.css";

// Who read a published lineup (Mert 2026-10-17, "Acknowledge edenleri listelemesi şart"; mockup v-c.js readTab): the
// Read tab, on the phone and in the desktop's ticket (F, Mert 2026-10-19) alike (Mert 2026-10-17 ~12:30 PM, ~1 PM):
// Read first, then Not read yet and No app, and one thin bar on the first heading. Every time is on the location's clock, as
// the card's "Published at" is, not the phone's.

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
function readWhen(timeFormat: ScheduleTimeFormat, timezone: string | undefined) {
  return (person: LineupReader) => (
    <span className="lineup-read-when is-read">
      <Check size={14} aria-hidden />
      {publishedAt(person.acknowledgedAt, timeFormat, timezone)}
    </span>
  );
}

/** The phone's Read tab: Read, Not read yet and No app; the first counted heading carries "N/M" and its bar. */
export function LineupReadPhone({
  shift,
  timeFormat,
  timezone,
}: {
  readonly shift: LineupShift;
  readonly timeFormat: ScheduleTimeFormat;
  /** The location's IANA zone. */
  readonly timezone?: string;
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
  // Nobody with the app: nothing to count, so no "0/0" and no bar (its headings keep their counts).
  const lead = withApp > 0 ? bar : undefined;
  const onRead = lists.read.length > 0;
  return (
    <div className="lineup-read is-phone">
      <Group title="Read" people={lists.read} when={readWhen(timeFormat, timezone)} lead={onRead ? lead : undefined} />
      <Group title="Not read yet" people={lists.unread} when={unreadWhen} lead={onRead ? undefined : lead} />
      <Group title="No app" people={lists.noApp} when={noAppWhen} />
    </div>
  );
}
