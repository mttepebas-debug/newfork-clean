import type {
  ScheduleEditableShift,
  ScheduleShift,
} from "@newfork/shared/schedule";

import type { ShiftPublicationState } from "../components/ScheduleContextMenu";
import type { ScheduleCellState } from "../hooks/useCellState";
import { shiftsOverlap } from "./scheduleShiftInterval";

type GhostShiftMetadata = {
  readonly ghost?: boolean;
  readonly is_ghost?: boolean;
  readonly ghost_location_name?: string | null;
  readonly source_location_name?: string | null;
};

type ShiftPublicationMetadata = {
  readonly source_published_shift_id?: string | null;
  readonly pending_op_type?: "create" | "update" | "delete" | null;
  readonly locked?: boolean | null;
};

export function publicationStateForShift(
  shift: ScheduleShift | ScheduleEditableShift,
): ShiftPublicationState | null {
  const metadata = shift as ScheduleShift & ShiftPublicationMetadata;
  const liveBacked = Boolean(
    metadata.source_published_shift_id || metadata.locked,
  );
  if (!liveBacked) return null;
  if (metadata.pending_op_type === "delete") return "staged-removed";
  if (metadata.pending_op_type === "update") return "unlocked-modified";
  return "locked";
}

export function isPendingRemovalShift(
  shift: ScheduleShift | ScheduleEditableShift,
): boolean {
  return (shift as ScheduleShift & ShiftPublicationMetadata).pending_op_type === "delete";
}

// Mert, 2026-10-12: a shift written in a removed shift's place, over its hours
// or with its shift type, covers it; the removal still publishes. Live shifts
// nobody touched in this edit cover nothing.
export function hideReplacedRemovedShifts<T extends ScheduleShift>(
  shifts: readonly T[],
): T[] {
  const written = shifts.filter(isWrittenInThisEdit);
  if (written.length === 0 || !shifts.some(isPendingRemovalShift)) return [...shifts];
  return shifts.filter(
    (item) =>
      !isPendingRemovalShift(item) ||
      !written.some(
        (other) =>
          shiftsOverlap(item, other) ||
          (item.shift_type_id != null && item.shift_type_id === other.shift_type_id),
      ),
  );
}

// The same rule over a whole schedule, cell by cell (person, location, day).
export function withoutReplacedRemovedShifts<T extends ScheduleShift>(
  shifts: readonly T[],
): T[] {
  if (!shifts.some(isPendingRemovalShift)) return [...shifts];
  const cells = new Map<string, T[]>();
  for (const item of shifts) {
    const key = `${item.employee_id ?? ""}|${item.location_id}|${item.scheduled_date}`;
    const cell = cells.get(key);
    if (cell) cell.push(item);
    else cells.set(key, [item]);
  }
  const shown = new Set(
    [...cells.values()].flatMap((cell) => hideReplacedRemovedShifts(cell)),
  );
  return shifts.filter((item) => shown.has(item));
}

function isWrittenInThisEdit(shift: ScheduleShift): boolean {
  const metadata = shift as ScheduleShift & ShiftPublicationMetadata;
  if (metadata.pending_op_type === "delete") return false;
  if (metadata.pending_op_type === "create" || metadata.pending_op_type === "update") return true;
  return !metadata.source_published_shift_id && !metadata.locked;
}

export function isGhostScheduleShift(shift: ScheduleShift): boolean {
  const metadata = shift as ScheduleShift & GhostShiftMetadata;
  return Boolean(metadata.ghost || metadata.is_ghost);
}

export function shiftWithDerivedWarnings(
  shift: ScheduleShift,
  cellState: ScheduleCellState | undefined,
  { editing = false }: { readonly editing?: boolean } = {},
): ScheduleShift {
  if (!cellState?.conflictingShiftIds.has(shift.id)) {
    // While editing, the grid's own overlap pass is the truth: the server's
    // code is from its last read and still counts shifts removed in this edit.
    if (!editing || !shift.warning_codes.includes("overlap")) return shift;
    return { ...shift, warning_codes: shift.warning_codes.filter((code) => code !== "overlap") };
  }
  if (shift.warning_codes.includes("overlap")) return shift;
  return { ...shift, warning_codes: [...shift.warning_codes, "overlap"] };
}
