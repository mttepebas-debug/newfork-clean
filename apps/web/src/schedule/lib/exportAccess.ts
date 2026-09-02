import type { Permission } from "@newfork/shared";
import type { ScheduleEmployee, ScheduleLocation } from "@newfork/shared/schedule";

const scheduleExportPermission: Permission = "schedule.export";

export function canExportSchedule(
  permissions: readonly Permission[] | null | undefined,
): boolean {
  return Boolean(permissions?.includes(scheduleExportPermission));
}

export function filterScheduleExportLocations<T extends Pick<ScheduleLocation, "id">>(
  locations: readonly T[],
  permissions: readonly Permission[] | null | undefined,
): T[] {
  return canExportSchedule(permissions) ? [...locations] : [];
}

export function filterScheduleExportEmployees<
  T extends Pick<ScheduleEmployee, "location_ids">,
>(
  employees: readonly T[],
  permissions: readonly Permission[] | null | undefined,
): T[] {
  return canExportSchedule(permissions) ? [...employees] : [];
}

export function filterScheduleExportIds(
  ids: readonly string[],
  locations: readonly Pick<ScheduleLocation, "id">[],
  permissions: readonly Permission[] | null | undefined,
): string[] {
  const allowed = new Set(
    filterScheduleExportLocations(locations, permissions).map(
      (location) => location.id,
    ),
  );
  return ids.filter((id) => allowed.has(id));
}
