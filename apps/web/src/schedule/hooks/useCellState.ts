import { useMemo } from "react";
import type { ScheduleReadModel, ScheduleShift } from "@newfork/shared/schedule";

import {
  mergeAvailabilityMarks,
  scheduleAvailabilityMarks,
  schedulePendingTimeOff,
  type AvailabilityRange,
  type ScheduleAvailabilityMark,
} from "../lib/scheduleAvailabilityMark";
import type { ScheduleGridLocationGroup } from "../lib/scheduleGridLayout";
import { shiftsOverlap, timeMinutes } from "../lib/scheduleShiftInterval";
import { isPendingRemovalShift } from "../lib/scheduleShiftMetadata";

export interface ScheduleCellState {
  readonly ghostShifts: readonly ScheduleShift[];
  readonly conflictingShiftIds: ReadonlySet<string>;
  readonly hasOverlap: boolean;
  readonly isClosedAllDay: boolean;
  readonly closedTitle: string | null;
  readonly availabilityMark: ScheduleAvailabilityMark | null;
  /** Time off waiting for an answer that day (D3b): a warning only; null when there is none. */
  readonly pendingTimeOff: readonly AvailabilityRange[] | null;
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

export function buildScheduleCellState(
  model: ScheduleReadModel,
  hideAvailability = false,
): ScheduleCellStateMap {
  const cells = new Map<string, MutableScheduleCellState>();
  for (const employee of model.employees) {
    for (const location of employee.weekly_availability ?? []) {
      for (const [date, mark] of scheduleAvailabilityMarks(location)) {
        if (hideAvailability && mark.kind === "unavailable") continue;
        ensureCell(cells, scheduleCellStateKey(location.location_id, date, employee.id)).availabilityMark = mark;
      }
      // Time off rebuild D3b: time off waiting for an answer marks its days at
      // the locations the person works at (the ones the read model projects); approved time off says more.
      for (const [date, ranges] of schedulePendingTimeOff(location)) {
        const cell = ensureCell(cells, scheduleCellStateKey(location.location_id, date, employee.id));
        if (cell.availabilityMark?.kind !== "time_off") cell.pendingTimeOff = ranges;
      }
    }
    spreadTimeOff(cells, model.locations, employee);
  }

  for (const closure of model.closures) {
    const date = closure.closed_date;
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

  const gridLocationIds = new Set(model.locations.map((location) => location.id));
  // Out-of-scope shifts join the same ghost and overlap pass, but never model.shifts.
  const outOfScope = (model.ghost_shifts ?? [])
    .filter((ghost) => !gridLocationIds.has(ghost.location_id))
    .map(outOfScopeShift);
  const ghostLocationNames = new Map(
    (model.ghost_shifts ?? []).map((ghost) => [ghost.location_id, ghost.location_name]),
  );
  // A shift removed while editing is gone once published: no ghost, no overlap.
  const assigned = [
    ...model.shifts.filter((shift) => shift.employee_id && !isPendingRemovalShift(shift)),
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
      const overlapsAnother = shifts.some((other) => other !== shift && shiftsOverlap(shift, other));
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
            overlapsAnother,
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
        `${closure.id}:${closure.location_id}:${closure.closed_date}:${closure.title}:${closure.kind}:${closure.opens ?? ""}:${closure.closes ?? ""}:${closure.status ?? ""}`,
    )
    .join("|")}|${model.shifts
    .map(
      (shift) =>
        `${shift.id}:${shift.employee_id ?? ""}:${shift.location_id}:${shift.scheduled_date}:${shift.start_time}:${shift.end_time}`,
    )
    .join("|")}|${model.employees
    .map((employee) => `${employee.id}:${employee.location_ids.join(",")}`)
    .join("|")}`;
  return useMemo(
    () => buildScheduleCellState(model, hideAvailability),
    [model, version, hideAvailability],
  );
}

interface MutableScheduleCellState {
  ghostShifts: ScheduleShift[];
  conflictingShiftIds: Set<string>;
  hasOverlap: boolean;
  isClosedAllDay: boolean;
  closedTitle: string | null;
  availabilityMark: ScheduleAvailabilityMark | null;
  pendingTimeOff: readonly AvailabilityRange[] | null;
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
    availabilityMark: null,
    pendingTimeOff: null,
  };
  cells.set(key, next);
  return next;
}

// Time off is the person's, not a location's (KARARLAR §1.1), but the read
// model projects only the locations they work at. Another grid location gets
// the same marks when it shares a projection's clock; preference marks stay put.
function spreadTimeOff(
  cells: Map<string, MutableScheduleCellState>,
  locations: ScheduleReadModel["locations"],
  employee: ScheduleReadModel["employees"][number],
): void {
  const projections = employee.weekly_availability ?? [];
  const projected = new Set(projections.map((projection) => projection.location_id));
  for (const location of locations) {
    if (projected.has(location.id)) continue;
    const source = projections.find(
      (projection) => projection.status === "ready" && projection.timezone === location.timezone,
    );
    if (!source) continue;
    for (const [date, mark] of scheduleAvailabilityMarks(source)) {
      if (mark.kind !== "time_off") continue;
      const cell = ensureCell(cells, scheduleCellStateKey(location.id, date, employee.id));
      cell.availabilityMark = mergeAvailabilityMarks(cell.availabilityMark, mark);
    }
  }
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

// Only a Closed day that is out marks the cell; Short hours reach single
// shifts, which the editor and the day header show, and a scheduled post's day
// is only its dashed chip until it goes out (EKRAN-08).
function applyClosureToCell(
  cell: MutableScheduleCellState,
  closure: ScheduleReadModel["closures"][number],
): void {
  if (closure.kind !== "closed" || closure.status === "scheduled") return;
  cell.isClosedAllDay = true;
  cell.closedTitle = closure.title;
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
  target.availabilityMark = mergeAvailabilityMarks(
    target.availabilityMark,
    source.availabilityMark,
  );
  const pending = [...(target.pendingTimeOff ?? []), ...(source.pendingTimeOff ?? [])];
  target.pendingTimeOff = pending.length && target.availabilityMark?.kind !== "time_off" ? pending : null;
}

// A ghost says "conflicts" only when it really overlaps another shift that day (QA 39).
function makeGhostShift(
  shift: ScheduleShift,
  sourceLocationName: string | null,
  overlapsAnother: boolean,
): ScheduleShift {
  return {
    ...shift,
    warning_codes: !overlapsAnother || shift.warning_codes.includes("overlap")
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
