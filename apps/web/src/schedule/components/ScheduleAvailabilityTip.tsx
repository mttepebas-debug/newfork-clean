import { Tooltip } from "../../shell/Tooltip";
import {
  formatAvailabilityClock,
  formatAvailabilityMarkDay,
  formatAvailabilityRange,
  type AvailabilityWindow,
  type ScheduleAvailabilityMark,
} from "../lib/scheduleAvailabilityMark";

type TimeFormat = "12h" | "24h";

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

// The manager's note text is not in the Schedule read yet; the line says
// whose it is until it is (G14, data contract asked of nf-backend).
function sourceLine(window: AvailabilityWindow, name: string): string {
  return window.source === "manager"
    ? "Manager note (only managers see this)"
    : `${firstName(name)}'s own availability`;
}

function WindowLines({ windows, name, timeFormat }: {
  readonly windows: readonly AvailabilityWindow[];
  readonly name: string;
  readonly timeFormat: TimeFormat;
}) {
  return windows.map((window) => (
    <span key={`${window.from}-${window.to}-${window.source}`} className="schedule-availability-tip-window">
      <strong>{formatAvailabilityRange("unavailable", window, timeFormat)}</strong>
      <span className="schedule-availability-tip-source">{sourceLine(window, name)}</span>
    </span>
  ));
}

function Head({ kind, children }: { readonly kind: ScheduleAvailabilityMark["kind"]; readonly children: string }) {
  return (
    <span className="schedule-availability-tip-head">
      <span className="schedule-availability-tip-dot" data-kind={kind} aria-hidden="true">
        {kind === "time_off" ? "×" : "!"}
      </span>
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
  const content = (
    <>
      <Head kind={mark.kind}>{`${employeeName} · ${dayText}`}</Head>
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
      content={content}
      data-availability-anchor="true"
    />
  );
}

/** The bubble on a shift card's "!" (the approved prototype's card tip). */
export function ScheduleAvailabilityCardTip({ employeeName, day, startTime, endTime, windows, timeFormat }: {
  readonly employeeName: string;
  readonly day: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly windows: readonly AvailabilityWindow[];
  readonly timeFormat: TimeFormat;
}) {
  const clock = (value: string) => {
    const [hour = "0", minute = "0"] = value.split(":");
    return formatAvailabilityClock(Number(hour) * 60 + Number(minute), timeFormat);
  };
  return (
    <>
      <Head kind="unavailable">{`${employeeName} shows as unavailable for this shift`}</Head>
      <span>{`${formatAvailabilityMarkDay(day)} · ${clock(startTime)} – ${clock(endTime)}`}</span>
      <WindowLines windows={windows} name={employeeName} timeFormat={timeFormat} />
      <span className="schedule-availability-tip-foot">Publish asks you to confirm it.</span>
    </>
  );
}
