import { useEffect, useRef, useState } from "react";
import type { ShiftAvailabilityAssessment } from "@newfork/shared";
import type { ScheduleShiftMutationInput } from "@newfork/shared/schedule";
import { useToast } from "@newfork/ui";
import { loadShiftAvailability } from "../../availability/availability-data";

interface Drop {
  readonly input: ScheduleShiftMutationInput;
  readonly shiftId?: string;
  readonly save: (input: ScheduleShiftMutationInput) => Promise<boolean>;
}
interface Review {
  readonly drop: Batch;
  readonly assessment: ShiftAvailabilityAssessment;
  readonly assessments: readonly (ShiftAvailabilityAssessment | null)[];
  readonly requiresReason: boolean;
  readonly warningCount: number;
  readonly blocked: boolean;
}
interface Batch {
  readonly items: readonly { input: ScheduleShiftMutationInput; shiftId?: string }[];
  readonly save: (inputs: ScheduleShiftMutationInput[]) => Promise<boolean>;
}
function status(assessment: ShiftAvailabilityAssessment | null) {
  const warning = assessment?.operation === "warning_requires_override";
  const accepted = !!assessment?.warning_policy && !!(assessment.override_recorded || assessment.responsibility_retained);
  const blocked = assessment?.operation === "blocked" || assessment?.operation === "verification_required" || (warning && !assessment.can_override);
  const needsReason = warning && !assessment.warning_policy;
  return { warning, accepted, blocked, needsReason,
    needsConfirmation: warning && !accepted && (needsReason || assessment.warning_policy === "confirm") };
}

export function useScheduleDropReview(workspaceId: string | undefined, sessionId: string | undefined, revision: number | undefined) {
  const toast = useToast();
  const [review, setReview] = useState<Review | null>(null);
  const [pending, setPending] = useState(false);
  const [reason, setReason] = useState("");
  const context = `${workspaceId}:${sessionId}:${revision}`;
  const currentContext = useRef(context); currentContext.current = context;
  const active = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    generation.current += 1;
    active.current = false;
    setReview(null); setReason(""); setPending(false);
    return () => { generation.current += 1; };
  }, [context]);

  const check = async (drop: Batch, confirmation?: Review) => {
    if (!workspaceId || !sessionId || active.current) return;
    active.current = true;
    setPending(true);
    const ticket = ++generation.current;
    const isCurrent = () => ticket === generation.current && context === currentContext.current;
    try {
      const assessments: (ShiftAvailabilityAssessment | null)[] = [];
      for (const item of drop.items) {
        assessments.push(item.input.employee_id
          ? await loadShiftAvailability(workspaceId, item.input, item.shiftId, sessionId) : null);
        if (!isCurrent()) return;
      }
      const states = assessments.map(status);
      const blocked = states.some(state => state.blocked);
      const requiresReason = states.some(state => state.needsReason);
      const warningCount = states.filter(state => state.warning && !state.accepted).length;
      const unconfirmed = states.some((state, index) => state.needsConfirmation && (
        !confirmation || assessments[index]?.fingerprint !== confirmation.assessments[index]?.fingerprint
        || assessments[index]?.warning_policy !== confirmation.assessments[index]?.warning_policy
        || (state.needsReason && (reason.trim().length < 10 || reason.trim().length > 500))
      ));
      const assessment = assessments.find((value, index) => value && (blocked ? states[index]!.blocked : states[index]!.needsConfirmation));
      if (assessment && (blocked || unconfirmed)) {
        setReview({ drop, assessment, assessments, blocked, requiresReason, warningCount });
        if (assessments.some((value, index) => value?.fingerprint !== confirmation?.assessments[index]?.fingerprint)) setReason("");
        return;
      }
      const saved = await drop.save(drop.items.map((item, index) => ({ ...item.input,
        ...(states[index]!.warning ? { availability_assessment_fingerprint: assessments[index]!.fingerprint } : {}),
        ...(states[index]!.needsReason ? { conflict_override_note: reason.trim() } : {}),
      })));
      const warnCount = assessments.filter((value, index) => states[index]!.warning && !states[index]!.accepted && value?.warning_policy === "warn").length;
      if (saved && warnCount > 0) {
        toast.warning(
          warnCount === 1 ? "Availability conflict saved" : "Availability conflicts saved",
          {
            dedupeKey: "schedule-drop-availability-warning",
            description:
              warnCount === 1
                ? "This shift overlaps unavailable hours."
                : `${warnCount} shifts overlap unavailable hours.`,
          },
        );
      }
      if (isCurrent()) { setReview(null); setReason(""); }
    } catch (error) {
      if (isCurrent()) {
        setReview(null);
        toast.error("Shift change could not be completed", {
          dedupeKey: "schedule-drop-save-failed",
          description: error instanceof Error ? error.message : "Reload and try again.",
        });
      }
    } finally {
      if (isCurrent()) { active.current = false; setPending(false); }
    }
  };
  return {
    review, pending, reason, setReason,
    start: (drop: Drop) => { if (!review) void check({ items: [drop], save: inputs => drop.save(inputs[0]!) }); },
    startBatch: (batch: { inputs: readonly ScheduleShiftMutationInput[]; save: Batch["save"] }) => {
      if (!review && batch.inputs.length > 0) void check({ items: batch.inputs.map(input => ({ input })), save: batch.save });
    },
    confirm: () => { if (review && !review.blocked) void check(review.drop, review); },
    dismiss: () => { if (!active.current) { generation.current += 1; setReview(null); setReason(""); } },
  };
}
