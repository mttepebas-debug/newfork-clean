import type {
  ScheduleEditableShift,
  ScheduleShift,
} from "@newfork/shared/schedule";

import type { ShiftPublicationState } from "../components/ScheduleContextMenu";
import type { ScheduleCellState } from "../hooks/useCellState";

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

export function isGhostScheduleShift(shift: ScheduleShift): boolean {
  const metadata = shift as ScheduleShift & GhostShiftMetadata;
  return Boolean(metadata.ghost || metadata.is_ghost);
}

export function shiftWithDerivedWarnings(
  shift: ScheduleShift,
  cellState: ScheduleCellState | undefined,
): ScheduleShift {
  if (!cellState?.conflictingShiftIds.has(shift.id)) return shift;
  if (shift.warning_codes.includes("overlap")) return shift;
  return { ...shift, warning_codes: [...shift.warning_codes, "overlap"] };
}
