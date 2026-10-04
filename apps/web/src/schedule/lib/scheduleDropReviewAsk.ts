import type { ShiftAvailabilityAssessment } from "@newfork/shared";
import type { ScheduleReadModel, ScheduleShiftMutationInput } from "@newfork/shared/schedule";
import type { ScheduleNoteCell } from "../components/ScheduleNoteConfirm";
import { formatScheduleConflictMessage, type ScheduleConflictReason } from "../schedule-conflicts";
import { formatNoteWhen } from "./scheduleAvailabilityMark";
import { weeklyTargetNote } from "./scheduleWeeklyAvailability";

export type ScheduleDropReviewAsk =
  | { readonly kind: "sheet"; readonly messages: readonly string[] }
  | { readonly kind: "note"; readonly cell: ScheduleNoteCell; readonly when: string; readonly employeeName: string; readonly text: string };

/**
 * What a drop, copy, preset or paste asks before it writes: a manager's note
 * alone gets the card under its cell (S2 B); anything else, one rule box with
 * a line per reason (M8, M12, D9).
 */
export function scheduleDropReviewAsk(
  model: ScheduleReadModel,
  inputs: readonly ScheduleShiftMutationInput[],
  assessments: readonly (Pick<ShiftAvailabilityAssessment, "reasons"> | null)[],
): ScheduleDropReviewAsk {
  let firstNote: Extract<ScheduleDropReviewAsk, { kind: "note" }> | null = null;
  const reasons = assessments.flatMap((assessment, index): ScheduleConflictReason[] => {
    const input = inputs[index];
    const employee = model.employees.find((item) => item.id === input?.employee_id);
    return (assessment?.reasons ?? []).map((reason) => {
      if (reason.code !== "note") return reason.code === "availability" ? { type: "availability", message: reason.message } : reason.message;
      // The note's words live in the week on screen; the server only says a note is there.
      const text = employee && input ? weeklyTargetNote(employee, input)?.text ?? "" : "";
      if (employee && input && !firstNote) {
        const projection = employee.weekly_availability?.find((item) => item.location_id === input.location_id);
        firstNote = {
          kind: "note",
          cell: { locationId: input.location_id, employeeId: employee.id, date: input.scheduled_date },
          when: formatNoteWhen(projection, input.scheduled_date, model.settings.time_format),
          employeeName: employee.display_name,
          text,
        };
      }
      return { type: "note", note: text, message: reason.message };
    });
  });
  const onlyNotes = reasons.length > 0 && reasons.every((reason) => typeof reason !== "string" && reason.type === "note");
  if (onlyNotes && firstNote) return firstNote;
  return { kind: "sheet", messages: [...new Set(reasons.map(formatScheduleConflictMessage))] };
}
