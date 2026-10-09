import type { ScheduleShift } from "@newfork/shared/schedule";

const warningAriaLabels: Record<Exclude<ScheduleShift["warning_codes"][number], "availability">, string> = {
  closed_location: "Location is closed",
  overlap: "conflicts with another shift",
};

// The warning says where the person stands for this shift, not what changed
// (BL-186): "Ali shows as unavailable for this shift."
export function formatAvailabilityWarning(employeeName?: string | null): string {
  const name = employeeName?.trim();
  return name ? `${name} shows as unavailable for this shift.` : "Shows as unavailable for this shift.";
}

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
  employeeName?: string | null,
): string {
  return warningCodes
    .map((code) => code === "availability"
      ? employeeName?.trim()
        ? formatAvailabilityWarning(employeeName).replace(/\.$/, "")
        : "shows as unavailable for this shift"
      : warningAriaLabels[code])
    .filter(Boolean)
    .join(", ");
}
