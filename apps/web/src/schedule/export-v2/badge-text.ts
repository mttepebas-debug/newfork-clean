import type { ExportShift } from "./snapshot";

/** Shared output text order, independent of React and the interactive grid. */
export function exportShiftLines(shift: ExportShift, merged: boolean): readonly string[] {
  return [shift.ghost ? `Reference: ${shift.title}` : shift.title, shift.label, merged || shift.ghost ? `@${shift.location}` : null, shift.time]
    .filter((line): line is string => Boolean(line));
}
