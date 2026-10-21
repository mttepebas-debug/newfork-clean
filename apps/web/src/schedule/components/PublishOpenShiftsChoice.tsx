import type { ScheduleOpenShiftChoice, SchedulePublicationOpenShift } from "@newfork/shared/schedule";
import { AlertTriangle } from "lucide-react";

import { formatTimeRange, formatWeekdayDate } from "../lib/scheduleDateTime";

// Open shifts in the pool (Mert, 2026-10-20): the publish asks once what happens to the open
// shifts it brings, and the one choice holds for all of them. Offering is the default.
const OPTIONS: readonly { readonly value: ScheduleOpenShiftChoice; readonly label: string; readonly hint: string }[] = [
  {
    value: "offer",
    label: "Offer to eligible employees",
    hint: "People at the location who do the job see them in Shift Hub and can ask. You approve who gets each one.",
  },
  { value: "keep", label: "Keep as open shifts", hint: "Only managers see them. Employees don't." },
  { value: "delete", label: "Delete them", hint: "They come off the schedule before it goes live." },
];
const SHOWN = 5;

const shiftLine = (shift: SchedulePublicationOpenShift) =>
  [
    formatWeekdayDate(shift.scheduled_date),
    shift.start_time && shift.end_time ? formatTimeRange(shift.start_time, shift.end_time) : "Hours unset",
    shift.job_name,
    shift.location_name,
  ].join(" · ");

export function PublishOpenShiftsChoice({
  shifts,
  choice,
  disabled,
  onChoose,
}: {
  readonly shifts: readonly SchedulePublicationOpenShift[];
  readonly choice: ScheduleOpenShiftChoice;
  readonly disabled?: boolean;
  readonly onChoose: (choice: ScheduleOpenShiftChoice) => void;
}) {
  const count = `${shifts.length} open shift${shifts.length === 1 ? "" : "s"}`;
  return (
    <fieldset className="schedule-publish-finding-group risk schedule-publish-open-shifts" disabled={disabled}>
      <legend className="schedule-publish-finding-heading">
        <AlertTriangle size={16} aria-hidden />
        <strong>{count}: what happens when you publish?</strong>
      </legend>
      <ul className="schedule-publish-open-shift-list">
        {shifts.slice(0, SHOWN).map((shift) => (
          <li key={shift.id}>{shiftLine(shift)}</li>
        ))}
        {shifts.length > SHOWN ? <li>and {shifts.length - SHOWN} more</li> : null}
      </ul>
      {OPTIONS.map((option) => (
        <label key={option.value} className="schedule-publish-open-shift-option">
          <input
            type="radio"
            name="schedule-publish-open-shifts"
            value={option.value}
            checked={choice === option.value}
            onChange={() => onChoose(option.value)}
          />
          <span>
            <strong>{option.label}</strong>
            <small>{option.hint}</small>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
