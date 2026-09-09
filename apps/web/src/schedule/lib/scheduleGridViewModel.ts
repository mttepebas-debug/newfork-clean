import type {
  ScheduleEmployee,
  ScheduleReadModel,
} from "@newfork/shared/schedule";

import {
  groupScheduleEmployeesByJob,
  isExcludedEmployeeVisibleForWeek,
  type ScheduleEmployeeSortMode,
} from "./scheduleEmployeeSort";
import {
  countScheduleGridBodyRows,
  countScheduleGridFillerRows,
} from "./scheduleGridLayout";

export function createScheduleGridViewModel({
  employeeSortMode,
  filtered,
  hideUnscheduled,
  layout,
  showPresetShiftBadges,
  showRoleSeparators,
  showTotalHours,
  showUnassignedShifts,
  hasEditSession,
  addDays,
}: {
  readonly employeeSortMode: ScheduleEmployeeSortMode;
  readonly filtered: ScheduleReadModel;
  readonly hideUnscheduled: boolean;
  readonly layout: "separate" | "unified";
  readonly showPresetShiftBadges: boolean;
  readonly showRoleSeparators: boolean;
  readonly showTotalHours: boolean;
  readonly showUnassignedShifts: boolean;
  readonly hasEditSession: boolean;
  readonly addDays: (date: string, offset: number) => string;
}): {
  readonly employeeRowGroups: ReturnType<typeof groupScheduleEmployeesByJob>;
  readonly fillerRowCount: number;
  readonly rows: readonly ScheduleEmployee[];
  readonly showEmployeeGroupHeaders: boolean;
  readonly showEmployeeGroups: boolean;
  readonly showLocationInBadge: boolean;
  readonly showShiftTypePresets: boolean;
  readonly showUnassignedRow: boolean;
} {
  const unassigned = filtered.shifts.filter(
    (shift) => shift.employee_id === null,
  );
  const scheduledEmployeeIds = new Set(
    filtered.shifts.flatMap((shift) =>
      shift.employee_id ? [shift.employee_id] : [],
    ),
  );
  const scheduleVisibleEmployees = filtered.employees.filter((employee) =>
    isExcludedEmployeeVisibleForWeek(
      employee,
      filtered.shifts,
      filtered.week_start,
      addDays,
    ),
  );
  const rows = hideUnscheduled
    ? scheduleVisibleEmployees.filter((employee) =>
        scheduledEmployeeIds.has(employee.id),
      )
    : scheduleVisibleEmployees;
  const showUnassignedRow =
    showUnassignedShifts && (hasEditSession || unassigned.length > 0);
  const showEmployeeGroups = employeeSortMode === "byJob";
  const showEmployeeGroupHeaders = showEmployeeGroups && showRoleSeparators;
  const showShiftTypePresets =
    hasEditSession && showPresetShiftBadges && showEmployeeGroupHeaders;
  const showLocationInBadge = layout === "unified";
  const employeeRowGroups = showEmployeeGroups
    ? groupScheduleEmployeesByJob(rows, filtered.jobs)
    : [];
  const bodyRowCount = countScheduleGridBodyRows({
    rowCount: rows.length,
    showUnassignedRow,
    showEmployeeGroupHeaders,
    employeeRowGroupCount: employeeRowGroups.length,
    showTotalHours,
  });
  const fillerRowCount = countScheduleGridFillerRows(bodyRowCount);

  return {
    employeeRowGroups,
    fillerRowCount,
    rows,
    showEmployeeGroupHeaders,
    showEmployeeGroups,
    showLocationInBadge,
    showShiftTypePresets,
    showUnassignedRow,
  };
}
