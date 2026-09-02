import type { ScheduleShift } from "@newfork/shared/schedule";

const warningAriaLabels: Record<ScheduleShift["warning_codes"][number], string> = {
  availability: "Outside employee availability",
  closed_location: "Location is closed",
  overlap: "conflicts with another shift",
};

export function formatScheduleBadgeAriaLabel({
  title,
  labelText,
  timeText,
  locationText,
  warningText,
}: {
  readonly title: string;
  readonly labelText: string;
  readonly timeText: string;
  readonly locationText: string;
  readonly warningText: string;
}): string {
  return [title, labelText, timeText, locationText, warningText]
    .filter(Boolean)
    .join(", ");
}

export function formatScheduleShiftWarningAria(
  warningCodes: readonly ScheduleShift["warning_codes"][number][],
): string {
  return warningCodes
    .map((code) => warningAriaLabels[code])
    .filter(Boolean)
    .join(", ");
}
