import { useMemo } from "react";
import type { ScheduleReadModel, ScheduleShift } from "@newfork/shared/schedule";

import {
  mergeAvailabilityMarks,
  scheduleAvailabilityMarks,
  type ScheduleAvailabilityMark,
} from "../lib/scheduleAvailabilityMark";
import type { ScheduleGridLocationGroup } from "../lib/scheduleGridLayout";

export interface ScheduleCellState {
  readonly ghostShifts: readonly ScheduleShift[];
  readonly conflictingShiftIds: ReadonlySet<string>;
  readonly hasOverlap: boolean;
  readonly isClosedAllDay: boolean;
  readonly closedTitle: string | null;
  readonly closedShiftTypeIds: readonly string[];
  readonly availabilityMark: ScheduleAvailabilityMark | null;
}

export type ScheduleCellStateMap = ReadonlyMap<string, ScheduleCellState>;

interface DisplayShiftItem {
  readonly kind: "real" | "ghost";
  readonly shift: ScheduleShift;
}

export function scheduleCellStateKey(
  locationId: string,
  date: string,
  employeeId: string | null,
): string {
  return `${locationId}|${date}|${employeeId ?? "unassigned"}`;
}

export function orderScheduleCellShifts(
  realShifts: readonly ScheduleShift[],
  ghostShifts: readonly ScheduleShift[],
  shiftTypes: ScheduleReadModel["shift_types"],
): ScheduleShift[] {
  const shiftTypesById = new Map(
    shiftTypes.map((shiftType) => [shiftType.id, shiftType]),
  );
  return [
    ...realShifts.map((shift) => ({ kind: "real" as const, shift })),
    ...ghostShifts.map((shift) => ({ kind: "ghost" as const, shift })),
  ]
    .sort((left, right) =>
      compareDisplayShiftItems(left, right, shiftTypesById),
    )
    .map((item) => item.shift);
}

export function buildScheduleCellState(model: ScheduleReadModel, hideAvailability = false): ScheduleCellStateMap {
  const cells = new Map<string, MutableScheduleCellState>();
  for (const employee of model.employees) {
    for (const location of employee.weekly_availability ?? []) {
      for (const [date, mark] of scheduleAvailabilityMarks(location)) {
        if (hideAvailability && mark.kind === "unavailable") continue;
        ensureCell(cells, scheduleCellStateKey(location.location_id, date, employee.id)).availabilityMark = mark;
      }
    }
  }

  for (const closure of model.closures) {
    for (const date of datesInRange(closure.closed_date, closure.end_date ?? null)) {
      for (const employee of model.employees) {
        const cell = ensureCell(
          cells,
          scheduleCellStateKey(closure.location_id, date, employee.id),
        );
        applyClosureToCell(cell, closure);
      }
      const unassignedCell = ensureCell(
        cells,
        scheduleCellStateKey(closure.location_id, date, null),
      );
      applyClosureToCell(unassignedCell, closure);
    }
  }

  const gridLocationIds = new Set(model.locations.map((location) => location.id));
  // Out-of-scope shifts join the same ghost and overlap pass, but never model.shifts.
  const outOfScope = (model.ghost_shifts ?? [])
    .filter((ghost) => !gridLocationIds.has(ghost.location_id))
    .map(outOfScopeShift);
  const ghostLocationNames = new Map(
    (model.ghost_shifts ?? []).map((ghost) => [ghost.location_id, ghost.location_name]),
  );
  const assigned = [
    ...model.shifts.filter((shift) => shift.employee_id),
    ...outOfScope,
  ];
  const byEmployeeDate = new Map<string, ScheduleShift[]>();

  for (const shift of assigned) {
    const employeeId = shift.employee_id;
    if (!employeeId) continue;
    const key = `${employeeId}|${shift.scheduled_date}`;
    const bucket = byEmployeeDate.get(key);
    if (bucket) bucket.push(shift);
    else byEmployeeDate.set(key, [shift]);
  }

  for (const shifts of byEmployeeDate.values()) {
    for (const shift of shifts) {
      const employeeId = shift.employee_id;
      if (!employeeId) continue;
      for (const location of model.locations) {
        if (location.id === shift.location_id) continue;
        const cell = ensureCell(
          cells,
          scheduleCellStateKey(location.id, shift.scheduled_date, employeeId),
        );
        cell.ghostShifts.push(
          makeGhostShift(
            shift,
            locationName(model, shift.location_id) ??
              ghostLocationNames.get(shift.location_id) ??
              null,
          ),
        );
      }
    }

    for (let i = 0; i < shifts.length; i += 1) {
      for (let j = i + 1; j < shifts.length; j += 1) {
        const left = shifts[i]!;
        const right = shifts[j]!;
        if (!shiftsOverlap(left, right)) continue;
        markConflict(cells, left);
        markConflict(cells, right);
      }
    }
  }

  return cells;
}

export function buildDisplayScheduleCellState({
  locationGroups,
  sourceState,
}: {
  readonly locationGroups: readonly ScheduleGridLocationGroup[];
  readonly sourceState: ScheduleCellStateMap;
}): ScheduleCellStateMap {
  const sourceLocationIdToDisplayId = new Map<string, string>();
  for (const location of locationGroups) {
    for (const sourceId of location.sourceIds) {
      sourceLocationIdToDisplayId.set(sourceId, location.id);
    }
  }

  const displayState = new Map<string, MutableScheduleCellState>();
  for (const [sourceKey, sourceCell] of sourceState.entries()) {
    const [sourceLocationId, date, employeeKey] = sourceKey.split("|");
    if (!sourceLocationId || !date || !employeeKey) continue;
    const displayLocationId =
      sourceLocationIdToDisplayId.get(sourceLocationId) ?? sourceLocationId;
    const displayKey = scheduleCellStateKey(
      displayLocationId,
      date,
      employeeKey === "unassigned" ? null : employeeKey,
    );
    mergeCellState(ensureCell(displayState, displayKey), sourceCell);
  }
  return displayState;
}

export function useScheduleCellState(model: ScheduleReadModel, hideAvailability = false): ScheduleCellStateMap {
  const version = `${model.locations.map((location) => location.id).join(",")}|${model.closures
    .map(
      (closure) =>
        `${closure.id}:${closure.location_id}:${closure.closed_date}:${closure.end_date ?? ""}:${closure.title}:${closure.is_all_day}:${closure.shift_type_ids.join(",")}`,
    )
    .join("|")}|${model.shifts
    .map(
      (shift) =>
        `${shift.id}:${shift.employee_id ?? ""}:${shift.location_id}:${shift.scheduled_date}:${shift.start_time}:${shift.end_time}`,
    )
    .join("|")}|${model.employees
    .map((employee) => `${employee.id}:${employee.location_ids.join(",")}`)
    .join("|")}`;
  return useMemo(() => buildScheduleCellState(model, hideAvailability), [model, version, hideAvailability]);
}

interface MutableScheduleCellState {
  ghostShifts: ScheduleShift[];
  conflictingShiftIds: Set<string>;
  hasOverlap: boolean;
  isClosedAllDay: boolean;
  closedTitle: string | null;
  closedShiftTypeIds: string[];
  availabilityMark: ScheduleAvailabilityMark | null;
}

function ensureCell(
  cells: Map<string, MutableScheduleCellState>,
  key: string,
): MutableScheduleCellState {
  const existing = cells.get(key);
  if (existing) return existing;
  const next: MutableScheduleCellState = {
    ghostShifts: [],
    conflictingShiftIds: new Set<string>(),
    hasOverlap: false,
    isClosedAllDay: false,
    closedTitle: null,
    closedShiftTypeIds: [],
    availabilityMark: null,
  };
  cells.set(key, next);
  return next;
}

function markConflict(
  cells: Map<string, MutableScheduleCellState>,
  shift: ScheduleShift,
): void {
  const employeeId = shift.employee_id;
  if (!employeeId) return;
  const cell = ensureCell(
    cells,
    scheduleCellStateKey(shift.location_id, shift.scheduled_date, employeeId),
  );
  cell.hasOverlap = true;
  cell.conflictingShiftIds.add(shift.id);
}

function applyClosureToCell(
  cell: MutableScheduleCellState,
  closure: ScheduleReadModel["closures"][number],
): void {
  if (closure.is_all_day) {
    cell.isClosedAllDay = true;
    cell.closedTitle = closure.title;
    return;
  }
  cell.closedShiftTypeIds = Array.from(
    new Set([...cell.closedShiftTypeIds, ...closure.shift_type_ids]),
  );
}

function mergeCellState(
  target: MutableScheduleCellState,
  source: ScheduleCellState,
): void {
  target.ghostShifts.push(...source.ghostShifts);
  for (const id of source.conflictingShiftIds) {
    target.conflictingShiftIds.add(id);
  }
  target.hasOverlap = target.hasOverlap || source.hasOverlap;
  target.isClosedAllDay = target.isClosedAllDay || source.isClosedAllDay;
  target.closedTitle = target.closedTitle ?? source.closedTitle;
  target.closedShiftTypeIds = Array.from(
    new Set([...target.closedShiftTypeIds, ...source.closedShiftTypeIds]),
  );
  target.availabilityMark = mergeAvailabilityMarks(
    target.availabilityMark,
    source.availabilityMark,
  );
}

function makeGhostShift(shift: ScheduleShift, sourceLocationName: string | null): ScheduleShift {
  return {
    ...shift,
    warning_codes: shift.warning_codes.includes("overlap")
      ? shift.warning_codes
      : [...shift.warning_codes, "overlap"],
    ghost: true,
    ghost_location_name: sourceLocationName,
  } as ScheduleShift;
}

// The job and type of an out-of-scope location are not in the model's lists,
// so their names ride along for GhostShiftCard. The note is never sent.
function outOfScopeShift(
  ghost: NonNullable<ScheduleReadModel["ghost_shifts"]>[number],
): ScheduleShift {
  return {
    id: ghost.id,
    location_id: ghost.location_id,
    employee_id: ghost.employee_id,
    job_id: ghost.job_id,
    shift_type_id: ghost.shift_type_id,
    scheduled_date: ghost.scheduled_date,
    start_time: ghost.start_time,
    end_time: ghost.end_time,
    crosses_midnight: ghost.crosses_midnight,
    unpaid_break_minutes: 0,
    hide_time_on_badge: false,
    label_ids: ghost.label_ids,
    label_names: ghost.label_names,
    note: "",
    warning_codes: [],
    ghost_job_name: ghost.job_name,
    ghost_shift_type_name: ghost.shift_type_name,
  } as ScheduleShift;
}

function locationName(model: ScheduleReadModel, locationId: string): string | null {
  return model.locations.find((location) => location.id === locationId)?.name ?? null;
}

function datesInRange(start: string, end: string | null): string[] {
  if (!end || end === start) return [start];
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00.000Z`);
  const last = new Date(`${end}T00:00:00.000Z`);
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function shiftsOverlap(left: ScheduleShift, right: ScheduleShift): boolean {
  return (
    datedInterval(left.scheduled_date, left.start_time, left.end_time).start <
      datedInterval(right.scheduled_date, right.start_time, right.end_time).end &&
    datedInterval(right.scheduled_date, right.start_time, right.end_time).start <
      datedInterval(left.scheduled_date, left.start_time, left.end_time).end
  );
}

function datedInterval(date: string, start: string, end: string) {
  const day = Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
  const startMinutes = day * 1_440 + timeMinutes(start);
  let endMinutes = day * 1_440 + timeMinutes(end);
  if (endMinutes <= startMinutes) endMinutes += 1_440;
  return { start: startMinutes, end: endMinutes };
}

function timeMinutes(value: string): number {
  const [hour = 0, minute = 0] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function compareDisplayShiftItems(
  left: DisplayShiftItem,
  right: DisplayShiftItem,
  shiftTypesById: ReadonlyMap<
    string,
    ScheduleReadModel["shift_types"][number]
  >,
): number {
  const leftScheduleTime = shiftSortTime(left.shift, shiftTypesById);
  const rightScheduleTime = shiftSortTime(right.shift, shiftTypesById);
  const byStart = leftScheduleTime.startMinutes - rightScheduleTime.startMinutes;
  if (byStart !== 0) return byStart;
  if (leftScheduleTime.sourceRank !== rightScheduleTime.sourceRank) {
    return leftScheduleTime.sourceRank - rightScheduleTime.sourceRank;
  }
  if (left.kind !== right.kind) return left.kind === "real" ? -1 : 1;
  const leftShiftTypeSort = shiftTypeSort(left.shift, shiftTypesById);
  const rightShiftTypeSort = shiftTypeSort(right.shift, shiftTypesById);
  if (leftShiftTypeSort !== rightShiftTypeSort) {
    return leftShiftTypeSort - rightShiftTypeSort;
  }
  return left.shift.id.localeCompare(right.shift.id);
}

function shiftTypeSort(
  shift: ScheduleShift,
  shiftTypesById: ReadonlyMap<
    string,
    ScheduleReadModel["shift_types"][number]
  >,
): number {
  if (!shift.shift_type_id) return Number.POSITIVE_INFINITY;
  return shiftTypesById.get(shift.shift_type_id)?.sort_order ?? Number.POSITIVE_INFINITY;
}

function shiftSortTime(
  shift: ScheduleShift,
  shiftTypesById: ReadonlyMap<
    string,
    ScheduleReadModel["shift_types"][number]
  >,
): { readonly sourceRank: number; readonly startMinutes: number } {
  if (!shift.hide_time_on_badge) {
    return { sourceRank: 0, startMinutes: timeMinutes(shift.start_time) };
  }

  const shiftType = shift.shift_type_id
    ? shiftTypesById.get(shift.shift_type_id)
    : null;
  if (shiftType?.default_start_time) {
    return {
      sourceRank: 1,
      startMinutes: timeMinutes(shiftType.default_start_time),
    };
  }

  return {
    sourceRank: 2,
    startMinutes: Number.POSITIVE_INFINITY,
  };
}
