import { z } from "zod";

const clock = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
const endClock = /^(([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?|24:00(?::00)?)$/;
const seconds = (value: string) => {
  const [h, m, s = 0] = value.split(":").map(Number);
  return h! * 3600 + m! * 60 + s;
};
export const timeOffPeriodInputSchema = z.object({
  segment_date: z.string().date(),
  start_time: z.string().regex(clock, "Enter a valid start time.").nullable().default(null),
  end_time: z.string().regex(endClock, "Enter a valid end time.").nullable().default(null),
  ends_next_day: z.boolean().default(false),
  start_fold: z.enum(["earlier", "later"]).optional(),
  end_fold: z.enum(["earlier", "later"]).optional(),
}).superRefine((value, ctx) => {
  if ((value.start_time === null) !== (value.end_time === null))
    ctx.addIssue({ code: "custom", path: ["end_time"], message: "Enter both a start and an end time." });
  if (value.start_time === null && value.ends_next_day)
    ctx.addIssue({ code: "custom", path: ["ends_next_day"], message: "A full-day period already covers its calendar day." });
  if (value.start_time && value.end_time && clock.test(value.start_time) && endClock.test(value.end_time)) {
    const duration = seconds(value.end_time) + (value.ends_next_day ? 86400 : 0) - seconds(value.start_time);
    if (duration <= 0 || duration > 86400)
      ctx.addIssue({ code: "custom", path: ["end_time"], message: "End after the start, within one day. Select next day for overnight hours." });
  }
});
export type TimeOffPeriodInput = z.infer<typeof timeOffPeriodInputSchema>;

export const timeOffCancellationContextSchema = z.object({
  parent_request_id: z.string().uuid().nullable(), parent_revision: z.number().int().positive().nullable(),
  pending_request_id: z.string().uuid().nullable(), has_completed_cancellation: z.boolean(), can_request: z.boolean(),
});
export const timeOffCancellationPeriodSchema = z.object({
  segment_id: z.string().uuid(), starts_at: z.string().datetime({ offset: true }), ends_at: z.string().datetime({ offset: true }),
}).refine(value => Date.parse(value.starts_at) < Date.parse(value.ends_at), { message: "Choose a positive period of approved leave." });
export type TimeOffCancellationPeriod = z.infer<typeof timeOffCancellationPeriodSchema>;
const timeOffReadIntervalSchema = z.object({ start_at: z.string().datetime({ offset: true }), end_at: z.string().datetime({ offset: true }) });

export const timeOffDecisionPieceSchema = z.object({
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }),
  status: z.enum(["approved", "denied"]),
}).refine((piece) => Date.parse(piece.starts_at) < Date.parse(piece.ends_at), { message: "Each decision piece must end after it starts." });
export type TimeOffDecisionPiece = z.infer<typeof timeOffDecisionPieceSchema>;

export const timeOffSegmentDecisionSchema = z.object({
  segment_id: z.string().uuid(),
  status: z.enum(["approved", "denied"]).optional(),
  pieces: z.array(timeOffDecisionPieceSchema).min(1).max(32).optional(),
}).superRefine((value, ctx) => {
  if (Boolean(value.status) === Boolean(value.pieces))
    ctx.addIssue({ code: "custom", message: "Choose a whole-period decision or explicit pieces." });
  if (value.pieces) {
    const ordered = [...value.pieces].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
    if (ordered.some((piece, i) => i > 0 && Date.parse(ordered[i - 1]!.ends_at) !== Date.parse(piece.starts_at)))
      ctx.addIssue({ code: "custom", path: ["pieces"], message: "Decision pieces must join without gaps or overlap." });
  }
});
export type TimeOffSegmentDecision = z.infer<typeof timeOffSegmentDecisionSchema>;

export const timeOffAssignmentDispositionSchema = z.object({ shift_id: z.string().uuid(), action: z.literal("release_entire_shift") });
export type TimeOffAssignmentDisposition = z.infer<typeof timeOffAssignmentDispositionSchema>;
export const timeOffAssignmentPreviewInputSchema = z.object({
  expected_revision: z.number().int().positive(), action: z.enum(["approve", "partial_approve"]),
  segment_decisions: z.array(timeOffSegmentDecisionSchema).default([]),
}).superRefine((value, ctx) => {
  if (value.action === "partial_approve" && (!value.segment_decisions.length || new Set(value.segment_decisions.map(s => s.segment_id.toLowerCase())).size !== value.segment_decisions.length))
    ctx.addIssue({ code: "custom", path: ["segment_decisions"], message: "Review each requested period exactly once." });
});
export type TimeOffAssignmentPreviewInput = z.infer<typeof timeOffAssignmentPreviewInputSchema>;
export const timeOffAssignmentPreviewSchema = z.object({
  request_id: z.string().uuid(), revision: z.number().int().positive(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  restricted_count: z.number().int().nonnegative(), approved_intervals: z.array(z.object({ start_at: z.string().datetime({ offset: true }), end_at: z.string().datetime({ offset: true }) })),
  affected_shifts: z.array(z.object({
    id: z.string().uuid(), source_id: z.string().uuid(), publication_id: z.string().uuid(), location_id: z.string().uuid(), location_name: z.string(),
    scheduled_date: z.string().date(), start_time: z.string().nullable(), end_time: z.string().nullable(), timezone: z.string(),
    time_basis: z.string(), time_unknown: z.boolean(), job_name: z.string(), starts_at: z.string().datetime({ offset: true }).nullable(), ends_at: z.string().datetime({ offset: true }).nullable(),
  })),
});
export type TimeOffAssignmentPreview = z.infer<typeof timeOffAssignmentPreviewSchema>;

export const timeOffReleasedAssignmentSchema = z.object({
  id: z.string().uuid(), location_name: z.string(), job_name: z.string(), scheduled_date: z.string().date(), timezone: z.string(),
  starts_at: z.string().datetime({ offset: true }).nullable(), ends_at: z.string().datetime({ offset: true }).nullable(),
});
export type TimeOffReleasedAssignment = z.infer<typeof timeOffReleasedAssignmentSchema>;
export const timeOffDecisionEventSchema = z.object({
  id: z.string().uuid(), action: z.string(), note: z.string(),
  created_at: z.string().datetime({ offset: true }), revision: z.number().int().positive().nullable(),
  released_assignments: z.array(timeOffReleasedAssignmentSchema).optional(),
});

export const timeOffPeriodReadSchema = z.object({
  id: z.string().uuid(),
  segment_date: z.string().date(),
  start_time: z.string().nullable(),
  end_time: z.string().nullable(),
  status: z.enum(["pending", "approved", "denied"]),
  effective_intervals: z.array(timeOffReadIntervalSchema).optional(),
  cancelled_intervals: z.array(timeOffReadIntervalSchema).optional(),
  ends_next_day: z.boolean().optional(),
  time_timezone: z.string().optional(),
  starts_at: z.string().datetime({ offset: true }).nullable().optional(),
  ends_at: z.string().datetime({ offset: true }).nullable().optional(),
  time_source: z.enum(["snapshot", "legacy_location"]).optional(),
  fold_choices: z.object({ start_fold: z.enum(["earlier", "later"]).optional(), end_fold: z.enum(["earlier", "later"]).optional() }).optional(),
  decision_revision: z.number().int().positive().nullable().optional(),
  decision_pieces: z.array(z.object({
    id: z.string().uuid(), starts_at: z.string().datetime({ offset: true }), ends_at: z.string().datetime({ offset: true }),
    time_timezone: z.string(), status: z.enum(["approved", "denied"]),
  })).optional(),
});
export type TimeOffPeriodRead = z.infer<typeof timeOffPeriodReadSchema>;
