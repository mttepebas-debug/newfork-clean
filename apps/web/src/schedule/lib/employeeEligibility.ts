import type { ScheduleEmployee, ScheduleShift } from "@newfork/shared/schedule";

export interface ScheduleFocusContext {
  readonly locationId: string;
  readonly shiftTypeId: string | null;
  readonly jobId: string;
}

export interface EmployeeFilterContext {
  readonly locationIds: readonly string[];
  readonly shiftTypeIds: readonly string[];
  readonly jobIds: readonly string[];
}

export interface ShiftVisibilityFilterContext extends EmployeeFilterContext {
  readonly weekDates: readonly string[];
  readonly dayDate?: string | null;
  readonly focusContext?: ScheduleFocusContext | null;
}

type MinimalEmployee = Pick<
  ScheduleEmployee,
  "job_ids" | "location_ids"
> &
  Partial<
    Pick<
      ScheduleEmployee,
      "shift_type_ids"
    >
>;

type MinimalShift = Pick<
  ScheduleShift,
  | "employee_id"
  | "location_id"
  | "shift_type_id"
  | "job_id"
  | "scheduled_date"
>;

export function isScheduleEmployeeEligible(
  employee: MinimalEmployee,
  context: ScheduleFocusContext,
): boolean {
  const shiftTypeIds = employee.shift_type_ids;
  return (
    employee.location_ids.includes(context.locationId) &&
    employee.job_ids.includes(context.jobId) &&
    (context.shiftTypeId === null ||
      shiftTypeIds === undefined ||
      shiftTypeIds.includes(context.shiftTypeId))
  );
}

export function matchesScheduleEmployeeFilters(
  employee: MinimalEmployee,
  filters: EmployeeFilterContext,
): boolean {
  const shiftTypeIds = employee.shift_type_ids;
  return (
    matchesAny(employee.location_ids, filters.locationIds) &&
    (shiftTypeIds === undefined ||
      matchesAny(shiftTypeIds, filters.shiftTypeIds)) &&
    matchesAny(employee.job_ids, filters.jobIds)
  );
}

export function scheduleShiftMatchesVisibilityFilters(
  shift: MinimalShift,
  filters: ShiftVisibilityFilterContext,
): boolean {
  if (!filters.weekDates.includes(shift.scheduled_date)) return false;
  if (filters.dayDate && shift.scheduled_date !== filters.dayDate) return false;

  if (filters.focusContext) {
    const { focusContext } = filters;
    return (
      shift.location_id === focusContext.locationId &&
      shift.job_id === focusContext.jobId &&
      (focusContext.shiftTypeId === null ||
        shift.shift_type_id === focusContext.shiftTypeId)
    );
  }

  return (
    matchesAny([shift.location_id], filters.locationIds) &&
    (!filters.shiftTypeIds.length ||
      (shift.shift_type_id !== null &&
        filters.shiftTypeIds.includes(shift.shift_type_id))) &&
    (!filters.jobIds.length ||
      (shift.job_id !== null && filters.jobIds.includes(shift.job_id)))
  );
}

export function hasVisibleScheduleShiftForEmployee(
  shifts: readonly MinimalShift[],
  employeeId: string,
  filters: ShiftVisibilityFilterContext,
): boolean {
  return shifts.some(
    (shift) =>
      shift.employee_id === employeeId &&
      scheduleShiftMatchesVisibilityFilters(shift, filters),
  );
}

function matchesAny(
  employeeValues: readonly string[],
  selectedValues: readonly string[],
): boolean {
  return (
    selectedValues.length === 0 ||
    selectedValues.some((id) => employeeValues.includes(id))
  );
}
