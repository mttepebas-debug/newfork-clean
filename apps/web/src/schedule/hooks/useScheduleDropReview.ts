import { useEffect, useRef, useState } from "react";
import type { ShiftAvailabilityAssessment } from "@newfork/shared";
import type { SchedulePendingOp, ScheduleShiftMutationInput } from "@newfork/shared/schedule";
import { useToast } from "@newfork/ui";
import { loadShiftAvailability } from "../../availability/availability-data";
import { ScheduleRequestError } from "../schedule-data";
import { assessmentAvailabilityWarnings, formatScheduleConflictMessage } from "../schedule-conflicts";
import { closedDayAlreadyAnswered, rememberClosedDayAnswer } from "../lib/closedDayAnswer";

interface Drop {
  readonly input: ScheduleShiftMutationInput;
  readonly shiftId?: string;
  readonly save: (input: ScheduleShiftMutationInput) => Promise<boolean>;
  readonly optimisticOp?: SchedulePendingOp;
}
interface Review {
  readonly drop: Batch;
  readonly assessment: ShiftAvailabilityAssessment;
  readonly assessments: readonly (ShiftAvailabilityAssessment | null)[];
  readonly warningCount: number;
  readonly blocked: boolean;
}
interface Batch {
  readonly items: readonly { input: ScheduleShiftMutationInput; shiftId?: string }[];
  readonly save: (inputs: ScheduleShiftMutationInput[]) => Promise<boolean>;
  readonly optimisticOp?: SchedulePendingOp;
}

function requiresAvailabilityReview(error: unknown): boolean {
  return error instanceof ScheduleRequestError && error.status === 409 &&
    !!error.body && typeof error.body === "object" && "status" in error.body &&
    error.body.status === "availability_review_required";
}
function status(assessment: ShiftAvailabilityAssessment | null, answeredClosedDay: boolean) {
  const warning = assessment?.operation === "warning_requires_override";
  const accepted = !!assessment?.warning_policy && !!(assessment.override_recorded || assessment.responsibility_retained || answeredClosedDay);
  const blocked = assessment?.operation === "blocked" || assessment?.operation === "verification_required" || (warning && !assessment.can_override);
  return { warning, accepted, blocked,
    needsConfirmation: warning && !accepted && assessment.warning_policy === "confirm" };
}

export function useScheduleDropReview(
  workspaceId: string | undefined, sessionId: string | undefined, revision: number | undefined,
) {
  const toast = useToast();
  const [review, setReview] = useState<Review | null>(null);
  const [pending, setPending] = useState(false);
  const [optimisticOps, setOptimisticOps] = useState<SchedulePendingOp[]>([]);
  const [savingState, setSavingState] = useState<"saving" | "delayed" | null>(null);
  const context = `${workspaceId}:${sessionId}:${revision}`;
  const currentContext = useRef(context); currentContext.current = context;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const active = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    generation.current += 1;
    active.current = false;
    setReview(null); setPending(false); setOptimisticOps([]);
    return () => { generation.current += 1; };
  }, [context]);
  useEffect(() => {
    setSavingState(null);
    if (!pending || !optimisticOps.length) return;
    const saving = window.setTimeout(() => setSavingState("saving"), 600);
    const delayed = window.setTimeout(() => setSavingState("delayed"), 5000);
    return () => { window.clearTimeout(saving); window.clearTimeout(delayed); };
  }, [pending, optimisticOps]);

  const check = async (drop: Batch, confirmation?: Review, fast = false) => {
    if (!workspaceId || !sessionId || active.current) return;
    active.current = true;
    setPending(true);
    const ticket = ++generation.current;
    const isCurrent = () => ticket === generation.current && context === currentContext.current;
    try {
      if (fast && drop.optimisticOp) {
        setOptimisticOps([drop.optimisticOp]);
        try {
          await drop.save(drop.items.map(item => item.input));
          if (isCurrent()) { setReview(null); setOptimisticOps([]); }
          return;
        } catch (error) {
          if (!isCurrent()) return;
          if (!requiresAvailabilityReview(error)) throw error;
        }
      }
      const assessments: (ShiftAvailabilityAssessment | null)[] = [];
      for (const item of drop.items) {
        assessments.push(await loadShiftAvailability(workspaceId, item.input, item.shiftId, sessionId));
        if (!isCurrent()) return;
      }
      const states = assessments.map(value => status(value, closedDayAlreadyAnswered(value, sessionId)));
      const blocked = states.some(state => state.blocked);
      const warningCount = states.filter(state => state.warning && !state.accepted).length;
      const unconfirmed = states.some((state, index) => state.needsConfirmation && (
        !confirmation || assessments[index]?.fingerprint !== confirmation.assessments[index]?.fingerprint
        || assessments[index]?.warning_policy !== confirmation.assessments[index]?.warning_policy
      ));
      const assessment = assessments.find((value, index) => value && (blocked ? states[index]!.blocked : states[index]!.needsConfirmation));
      if (assessment && (blocked || unconfirmed)) {
        setReview({ drop, assessment, assessments, blocked, warningCount });
        if (blocked) setOptimisticOps([]);
        return;
      }
      // The employee's own mark and a manager's note ask on every write (M8, M12).
      const reminded = assessments.find(value => assessmentAvailabilityWarnings(value).length);
      if (reminded && !confirmation) {
        setReview({ drop, assessment: reminded, assessments, blocked: false, warningCount });
        return;
      }
      // K17: an answered closed day holds for the rest of this editing session.
      if (confirmation) assessments.forEach((value, index) => { if (states[index]!.needsConfirmation) rememberClosedDayAnswer(value, sessionId); });
      const saved = await drop.save(drop.items.map((item, index) => ({ ...item.input,
        ...(states[index]!.warning ? { availability_assessment_fingerprint: assessments[index]!.fingerprint } : {}),
      })));
      const warnCount = assessments.filter((value, index) => states[index]!.warning && !states[index]!.accepted && value?.warning_policy === "warn").length;
      // Our successful save advances the revision before this continuation can
      // run. Keep its warning, but never send it into another workspace/session.
      if (saved && mounted.current && currentContext.current.startsWith(`${workspaceId}:${sessionId}:`) && warnCount > 0) {
        toast.warning(
          warnCount === 1 ? "Shift saved with a warning" : "Shifts saved with warnings",
          {
            dedupeKey: "schedule-drop-availability-warning",
            description:
              // The mark and the note were answered in the rule box; the toast names the rest.
              [...new Set(assessments.flatMap(value => value?.reasons.filter(reason => reason.code !== "availability" && reason.code !== "note").map(reason => reason.message) ?? []))].join(" "),
          },
        );
      }
      if (isCurrent()) { setReview(null); setOptimisticOps([]); }
    } catch (error) {
      if (isCurrent()) {
        setReview(null);
        setOptimisticOps([]);
        toast.error("Shift change could not be completed", {
          dedupeKey: "schedule-drop-save-failed",
          description: error instanceof Error ? formatScheduleConflictMessage(error.message) : "Reload and try again.",
        });
      }
    } finally {
      if (isCurrent()) { active.current = false; setPending(false); }
    }
  };
  return {
    review, pending, optimisticOps, savingState: pending ? savingState : null,
    start: (drop: Drop) => { if (!review) void check({ items: [drop], save: inputs => drop.save(inputs[0]!), optimisticOp: drop.optimisticOp }, undefined, Boolean(drop.optimisticOp)); },
    startBatch: (batch: { inputs: readonly ScheduleShiftMutationInput[]; save: Batch["save"] }) => {
      if (!review && batch.inputs.length > 0) void check({ items: batch.inputs.map(input => ({ input })), save: batch.save });
    },
    confirm: () => { if (review && !review.blocked) void check(review.drop, review); },
    dismiss: () => { if (!active.current) { generation.current += 1; setReview(null); setOptimisticOps([]); } },
  };
}
