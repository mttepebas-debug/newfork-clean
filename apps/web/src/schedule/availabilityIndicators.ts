import type { ScheduleEmployee } from "@newfork/shared/schedule";

const scheduleWeekdayNames = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export function scheduleEmployeeAvailabilityRules(
  employee: ScheduleEmployee,
): NonNullable<ScheduleEmployee["availability"]> {
  if (employee.weekly_availability !== undefined) return [];
  return (employee.availability ?? []).filter(
    (availability) => availability.mode !== "unrestricted",
  );
}

export function formatEmployeeAvailabilitySummary(
  rules: readonly NonNullable<ScheduleEmployee["availability"]>[number][],
): string {
  return rules
    .map((rule) => {
      const day = scheduleWeekdayNames[rule.day] ?? "Unknown day";
      if (rule.mode === "unavailable") return `Unavailable ${day} all day`;
      const windows = rule.windows
        .map((window) => `${window.start}-${window.end}`)
        .join(", ");
      return windows ? `Unavailable outside ${day} ${windows}` : `Availability restricted ${day}`;
    })
    .join(" · ");
}
