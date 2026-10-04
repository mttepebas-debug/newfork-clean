import { Clock } from "lucide-react";
import { Tooltip } from "../../shell/Tooltip";
import {
  formatAvailabilityMarkDay,
  formatAvailabilityRange,
  type AvailabilityWindow,
  type ScheduleAvailabilityMark,
} from "../lib/scheduleAvailabilityMark";

type TimeFormat = "12h" | "24h";

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

function WindowLines({ windows, name, timeFormat }: {
  readonly windows: readonly AvailabilityWindow[];
  readonly name: string;
  readonly timeFormat: TimeFormat;
}) {
  return windows.map((window) => (
    <span key={`${window.from}-${window.to}`} className="schedule-availability-tip-window">
      <strong>{formatAvailabilityRange("unavailable", window, timeFormat)}</strong>
      <span className="schedule-availability-tip-source">{`${firstName(name)}'s own availability`}</span>
    </span>
  ));
}

// `plain` leaves out the decorative "!" / "×" for the screen reader text.
function Head({ kind, plain, children }: {
  readonly kind: ScheduleAvailabilityMark["kind"];
  readonly plain: boolean;
  readonly children: string;
}) {
  return (
    <span className="schedule-availability-tip-head">
      {plain ? null : (
        <span className="schedule-availability-tip-dot" data-kind={kind} aria-hidden="true">
          {kind === "time_off" ? "×" : "!"}
        </span>
      )}
      <strong>{children}</strong>
    </span>
  );
}

function markLines(mark: ScheduleAvailabilityMark, timeFormat: TimeFormat): string[] {
  return mark.kind === "time_off"
    ? mark.ranges.map((range) => formatAvailabilityRange("time_off", range, timeFormat))
    : mark.windows.map((window) => formatAvailabilityRange("unavailable", window, timeFormat));
}

/**
 * A marked Schedule cell's bubble (G14, BL-204): the mouse anywhere on the
 * cell's empty part, or keyboard focus, shows whose day it is and why.
 */
export function ScheduleAvailabilityCellTip({ mark, employeeName, day, timeFormat }: {
  readonly mark: ScheduleAvailabilityMark;
  readonly employeeName: string;
  readonly day: string;
  readonly timeFormat: TimeFormat;
}) {
  const dayText = formatAvailabilityMarkDay(day);
  const body = (plain: boolean) => (
    <>
      <Head kind={mark.kind} plain={plain}>{`${employeeName} · ${dayText}`}</Head>
      {mark.kind === "time_off" ? (
        markLines(mark, timeFormat).map((line) => <strong key={line}>{line}</strong>)
      ) : (
        <WindowLines windows={mark.windows} name={employeeName} timeFormat={timeFormat} />
      )}
      <span className="schedule-availability-tip-foot">
        {mark.kind === "time_off"
          ? "Shifts can't be scheduled on this day."
          : `A preference. You can still schedule ${firstName(employeeName)}.`}
      </span>
    </>
  );
  return (
    <Tooltip
      area
      // A card has its own say; the empty cell and its Add shift do not.
      areaExcept="[data-shift-badge]"
      rich
      label={`${employeeName}, ${dayText}: ${markLines(mark, timeFormat).join(", ")}`}
      content={body(false)}
      description={body(true)}
      data-availability-anchor="true"
    />
  );
}

/**
 * The bubble on a shift card's "!": C3 "Tinted header" (KARARLAR, 2026-10-03)
 * — name and date in an orange band, the hours below, and a grey pill when the
 * mark came after the shift's first publish (M11). Nothing to confirm (M9).
 */
export function ScheduleAvailabilityCardTip({ employeeName, day, windows, timeFormat, changedAfterPublish = false, plain = false }: {
  readonly employeeName: string;
  readonly day: string;
  readonly windows: readonly AvailabilityWindow[];
  readonly timeFormat: TimeFormat;
  readonly changedAfterPublish?: boolean;
  readonly plain?: boolean;
}) {
  return (
    <>
      <span className="schedule-availability-tip-band">
        {plain ? null : <span className="schedule-availability-tip-dot" aria-hidden="true">!</span>}
        <span className="schedule-availability-tip-who">
          <strong>{employeeName}</strong>
          <span>{formatAvailabilityMarkDay(day)}</span>
        </span>
      </span>
      <span className="schedule-availability-tip-body">
        {windows.map((window) => (
          <strong key={`${window.from}-${window.to}`}>{formatAvailabilityRange("unavailable", window, timeFormat)}</strong>
        ))}
        {changedAfterPublish ? (
          <span className="schedule-availability-tip-pill">
            {plain ? null : <Clock size={12} aria-hidden />}
            Changed after publishing
          </span>
        ) : null}
      </span>
    </>
  );
}
