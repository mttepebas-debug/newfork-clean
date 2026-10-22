import { useRef } from "react";
import type { ScheduleEditSession, ScheduleReadModel, ScheduleShiftMutationInput } from "@newfork/shared/schedule";
import { useToast } from "@newfork/ui";
import { scheduleAssignNotice, type ScheduleAssignKind } from "../lib/scheduleAssignNotice";
import { timeOffV2Enabled } from "../../time-off/time-off-flag";

// Five seconds, as the approved mockup (availability-tur2).
const ASSIGN_NOTICE_MS = 5_000;

/**
 * KARARLAR "Müsaitlik tercih" 3 and M12 (Mert, 2026-10-16): a shift on
 * someone's preference or under a manager's note is written at once; one short
 * notice says so, and its Undo takes that write back while nothing came after
 * it (the server's step-by-step Undo, KK-171). Returns whether it showed one.
 */
export function useScheduleAssignNotice(
  model: Pick<ScheduleReadModel, "employees" | "settings"> | undefined,
  revision: number | undefined,
  undo: () => unknown,
) {
  const toast = useToast();
  const revisionRef = useRef(revision);
  revisionRef.current = revision;
  const undoRef = useRef(undo);
  undoRef.current = undo;
  return (
    inputs: readonly ScheduleShiftMutationInput[],
    kind: ScheduleAssignKind,
    next: Pick<ScheduleEditSession, "id" | "revision"> | null,
  ): boolean => {
    if (!next || !model) return false;
    const notice = scheduleAssignNotice(model, inputs, kind, { pendingTimeOff: timeOffV2Enabled() });
    if (!notice) return false;
    toast.action(notice.title, {
      actionLabel: "Undo",
      tone: "warning",
      durationMs: ASSIGN_NOTICE_MS,
      description: notice.lines.join("\n"),
      dedupeKey: `schedule-assign-notice-${next.id}-${next.revision}`,
      onAction: () => {
        if (revisionRef.current !== next.revision) {
          toast.info("Use Undo in the edit bar", {
            dedupeKey: "schedule-assign-notice-moved-on",
            description: "Another change came after this shift, so edits go back one step at a time.",
          });
          return;
        }
        void undoRef.current();
      },
    });
    return true;
  };
}
