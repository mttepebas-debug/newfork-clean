// Test page: what a Schedule cell draws for approved time off (item 6, 16)
// and the words of an unavailable day (item 1). Every piece is in the DOM on
// every variant; variants.css decides what each variant shows.
import { Lock } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  formatAvailabilityClock,
  formatAvailabilityMarkDay,
  formatAvailabilityRange,
  type ScheduleAvailabilityMark,
} from "../../../src/schedule/lib/scheduleAvailabilityMark";

type TimeFormat = "12h" | "24h";

export interface TimeOffFacts {
  readonly allDay: boolean;
  /** "All day", "2:00 PM – 12:00 AM". */
  readonly hours: string;
  /** "2 PM – 12 AM" for the small tag over a shift. */
  readonly hoursShort: string;
  /** "Wed, Oct 7 – Thu, Oct 8" (within the week on screen). */
  readonly span: string;
  /** Where the time off sits in the day, for variant C's drawn hours. */
  readonly fromPercent: number;
  readonly toPercent: number;
}

export interface UnavailableFacts {
  readonly words: string;
  readonly fromPercent: number;
  readonly toPercent: number;
}

const percent = (minutes: number) => Math.round((Math.max(0, Math.min(1440, minutes)) / 1440) * 1000) / 10;
const shortDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export function timeOffFacts(
  mark: ScheduleAvailabilityMark | null,
  day: string,
  days: readonly string[],
  markOf: (date: string) => ScheduleAvailabilityMark | null,
  timeFormat: TimeFormat,
): TimeOffFacts | null {
  if (mark?.kind !== "time_off") return null;
  const allDay = mark.ranges.some((range) => range.from <= 0 && range.to >= 1440);
  const clock = (minutes: number) => formatAvailabilityClock(minutes, timeFormat);
  const hours = allDay ? "All day" : mark.ranges.map((range) => `${clock(range.from)} – ${clock(range.to)}`).join(", ");
  const short = (minutes: number) => clock(minutes).replace(":00", "");
  const hoursShort = allDay ? "All day" : mark.ranges.map((range) => `${short(range.from)}–${short(range.to)}`).join(", ");
  const index = days.indexOf(day);
  let first = index;
  let last = index;
  while (first > 0 && markOf(days[first - 1]!)?.kind === "time_off") first -= 1;
  while (last < days.length - 1 && markOf(days[last + 1]!)?.kind === "time_off") last += 1;
  const span = first === last ? formatAvailabilityMarkDay(day) : `${shortDay(days[first]!)} – ${shortDay(days[last]!)}`;
  return {
    allDay,
    hours,
    hoursShort,
    span,
    fromPercent: allDay ? 0 : percent(Math.min(...mark.ranges.map((range) => range.from))),
    toPercent: allDay ? 100 : percent(Math.max(...mark.ranges.map((range) => range.to))),
  };
}

export function unavailableFacts(mark: ScheduleAvailabilityMark | null, timeFormat: TimeFormat): UnavailableFacts | null {
  if (mark?.kind !== "unavailable" || !mark.windows.length) return null;
  return {
    words: mark.windows.map((window) => formatAvailabilityRange("unavailable", window, timeFormat)).join(", "),
    fromPercent: percent(Math.min(...mark.windows.map((window) => window.from))),
    toPercent: percent(Math.max(...mark.windows.map((window) => window.to))),
  };
}

export function TimeOffCellParts({ timeOff, unavailable, locked, employeeName, hasShift }: {
  readonly timeOff: TimeOffFacts | null;
  readonly unavailable: UnavailableFacts | null;
  readonly locked: boolean;
  readonly employeeName: string;
  readonly hasShift: boolean;
}) {
  return (
    <>
      {timeOff ? (
        <span
          className="mi-timeoff"
          data-has-shift={hasShift || undefined}
          style={{ "--mi-from": `${timeOff.fromPercent}%`, "--mi-to": `${timeOff.toPercent}%` } as CSSProperties}
          aria-hidden
        >
          <span className="mi-timeoff-fill" />
          <span className="mi-timeoff-label">
            <span className="mi-timeoff-title">
              <Lock className="mi-timeoff-lock-icon" size={11} strokeWidth={2.6} aria-hidden />
              Time off
            </span>
            <small className="mi-timeoff-hours">{timeOff.hours}</small>
            <small className="mi-timeoff-hours-short">{timeOff.hoursShort}</small>
            <small className="mi-timeoff-span">{timeOff.span}</small>
            <small className="mi-timeoff-refuse">Can't place a shift here</small>
          </span>
        </span>
      ) : null}
      {timeOff && locked ? <LockedTimeOffButton facts={timeOff} employeeName={employeeName} /> : null}
      {unavailable ? (
        <>
          <span
            className="mi-unavailable-bar"
            style={{ "--mi-from": `${unavailable.fromPercent}%`, "--mi-to": `${unavailable.toPercent}%` } as CSSProperties}
            aria-hidden
          />
          <span className="mi-unavailable-hours" aria-hidden>{unavailable.words}</span>
        </>
      ) : null}
    </>
  );
}

/** A whole-day time off: the cell is one button that says why nothing can be added. */
function LockedTimeOffButton({ facts, employeeName }: { readonly facts: TimeOffFacts; readonly employeeName: string }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const firstName = employeeName.split(" ")[0] || employeeName;

  useEffect(() => {
    if (!rect) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopImmediatePropagation();
        setRect(null);
        button.current?.focus();
        return;
      }
      const target = event.target as Node;
      if (button.current?.contains(target) || card.current?.contains(target)) return;
      setRect(null);
    };
    const onScroll = (event: Event) => {
      if (card.current?.contains(event.target as Node)) return;
      setRect(null);
    };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", close, true);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", close, true);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [rect]);

  return (
    <>
      <button
        ref={button}
        type="button"
        className="mi-timeoff-lock"
        data-schedule-employee-card-trigger="true"
        aria-label={`${employeeName} has approved time off, ${facts.span}. A shift can't be added.`}
        aria-expanded={Boolean(rect)}
        aria-haspopup="dialog"
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const next = event.currentTarget.getBoundingClientRect();
          setRect((current) => (current ? null : next));
        }}
      />
      {rect
        ? createPortal(
            <div
              ref={card}
              className="mi-timeoff-card"
              role="dialog"
              aria-label="Approved time off"
              style={{ top: Math.min(rect.bottom + 6, window.innerHeight - 170), left: Math.max(8, Math.min(rect.left, window.innerWidth - 320)) }}
            >
              <strong>
                <span className="mi-timeoff-card-dot" aria-hidden />
                Approved time off
              </strong>
              <p className="mi-timeoff-card-when">{employeeName} · {facts.span} · {facts.hours}</p>
              <p>
                No shift can be added over approved time off. To work this day, {firstName} first asks to shorten the time off.
              </p>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
