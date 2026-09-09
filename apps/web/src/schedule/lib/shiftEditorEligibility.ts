import type {
  ScheduleEmployee,
  ScheduleReadModel,
  ScheduleShift,
  ScheduleShiftMutationInput,
} from "@newfork/shared/schedule";

import { evaluateScheduleShiftConflicts } from "../schedule-conflicts";

export function getShiftEditorSelectedEmployee(
  employees: readonly ScheduleEmployee[],
  employeeId: string | null,
): ScheduleEmployee | null {
  if (employeeId === null) return null;
  return employees.find((employee) => employee.id === employeeId) ?? null;
}

export function getShiftEditorEligibleEmployees({
  employees,
  locationId,
  jobId,
  model,
  shifts,
  value,
  excludeShiftId = null,
}: {
  readonly employees: readonly ScheduleEmployee[];
  readonly locationId: string;
  readonly jobId: string | null;
  readonly model?: ScheduleReadModel;
  readonly shifts?: readonly ScheduleShift[];
  readonly value?: ScheduleShiftMutationInput;
  readonly excludeShiftId?: string | null;
}): ScheduleEmployee[] {
  return employees.filter(
    (employee) =>
      employee.location_ids.includes(locationId) &&
      (!jobId || employee.job_ids.includes(jobId)) &&
      !employee.is_excluded_from_schedule &&
      (!value?.shift_type_id ||
        (employee.shift_type_ids ?? []).length === 0 ||
        employee.shift_type_ids?.includes(value.shift_type_id)) &&
      (!model ||
        !value ||
        evaluateScheduleShiftConflicts(
          model,
          shifts ?? model.shifts,
          { ...value, employee_id: employee.id },
          excludeShiftId,
        ).every((reason) => !isEmployeeEligibilityBlockingConflict(reason))),
  );
}

function isEmployeeEligibilityBlockingConflict(reason: unknown): boolean {
  if (!reason || typeof reason !== "object" || Array.isArray(reason)) {
    return false;
  }

  const type = (reason as { readonly type?: unknown }).type;
  // Availability is checked against all effective patterns and timezones by
  // the server before saving. Cached windows must not hide a reviewable person.
  return type === "time_overlap" || type === "named_duplicate";
}

export function getShiftEditorEligibleJobs({
  jobs,
  selectedEmployee,
  employeeId,
}: {
  readonly jobs: ScheduleReadModel["jobs"];
  readonly selectedEmployee: ScheduleEmployee | null;
  readonly employeeId: string | null;
}): ScheduleReadModel["jobs"] {
  return jobs.filter(
    (job) => employeeId === null || selectedEmployee?.job_ids.includes(job.id),
  );
}

export function shouldShowShiftEditorCountStepper({
  mode,
  targetEmployeeId,
  valueEmployeeId,
}: {
  readonly mode: "create" | "edit";
  readonly targetEmployeeId: string | null;
  readonly valueEmployeeId: string | null;
}): boolean {
  return (
    mode === "create" && targetEmployeeId === null && valueEmployeeId === null
  );
}

export function clampShiftEditorCount(nextCount: number): number {
  return Math.max(1, Math.min(10, nextCount));
}

export function shouldDisableShiftEditorEmployeePicker({
  showCountStepper,
  count,
}: {
  readonly showCountStepper: boolean;
  readonly count: number;
}): boolean {
  return showCountStepper && count > 1;
}
