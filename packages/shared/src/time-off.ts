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
// BL-127: a manager gives back hours of approved time off (Requests → Time off).
export const timeOffShortenInputSchema = z.object({
  expected_revision: z.number().int().positive(),
  periods: z.array(timeOffCancellationPeriodSchema).min(1).max(124),
  note: z.string().max(1000).default(""),
  operation_id: z.string().uuid(),
});
export type TimeOffShortenInput = z.infer<typeof timeOffShortenInputSchema>;
export const timeOffShortenResultSchema = z.object({
  status: z.string(), request_id: z.string().uuid(), revision: z.number().int().positive(),
});
export type TimeOffShortenResult = z.infer<typeof timeOffShortenResultSchema>;
const timeOffReadIntervalSchema = z.object({ start_at: z.string().datetime({ offset: true }), end_at: z.string().datetime({ offset: true }) });

// FB-6.3: time off belongs to the person; the managers of their locations vote on it.
const instant = z.string().datetime({ offset: true });
const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;
/** Employee Hub > Request time off: one run of days in a row, hours per day allowed, no location. */
export const timeOffSubmitInputSchema = z.object({
  periods: z.array(timeOffPeriodInputSchema).min(1).max(31),
  reason: z.string().trim().max(1000).default(""),
  expected_timezone: z.string().trim().min(1).max(64),
  operation_id: z.string().uuid(),
}).strict().superRefine((value, ctx) => {
  const days = [...new Set(value.periods.map((p) => dayNumber(p.segment_date)))].sort((a, b) => a - b);
  if (days.length && days[days.length - 1]! - days[0]! + 1 !== days.length)
    ctx.addIssue({ code: "custom", path: ["periods"], message: "A request is one run of days in a row." });
});
export type TimeOffSubmitInput = z.infer<typeof timeOffSubmitInputSchema>;
export const timeOffSubmitResultSchema = z.object({
  status: z.string().min(1), request_id: z.string().uuid(), revision: z.number().int().positive(), decide_by: instant.nullable(),
});
export type TimeOffSubmitResult = z.infer<typeof timeOffSubmitResultSchema>;
/** Asking to cancel approved hours: voted on like a request; the time off stands meanwhile. */
export const timeOffCancellationRequestInputSchema = z.object({
  expected_revision: z.number().int().positive(),
  periods: z.array(timeOffCancellationPeriodSchema).min(1).max(124),
  reason: z.string().trim().max(1000).default(""),
  operation_id: z.string().uuid(),
}).strict();
export type TimeOffCancellationRequestInput = z.infer<typeof timeOffCancellationRequestInputSchema>;
/** The impact fingerprint the voter saw: progress.impact.fingerprint. */
export const timeOffImpactFingerprintSchema = z.string().regex(/^[a-f0-9]{32}$/);
export const timeOffVerdictInputSchema = z.object({
  verdict: z.enum(["approve", "deny"]),
  note: z.string().trim().max(1000).default(""),
  expected_impact: timeOffImpactFingerprintSchema,
}).strict();
export type TimeOffVerdictInput = z.infer<typeof timeOffVerdictInputSchema>;
export const timeOffVerdictResultSchema = z.object({
  status: z.string().min(1), final: z.boolean(), alone: z.boolean(), remaining: z.number().int().nonnegative(),
  revision: z.number().int().positive(), request_id: z.string().uuid(),
});
export type TimeOffVerdictResult = z.infer<typeof timeOffVerdictResultSchema>;
export const timeOffRevokeInputSchema = z.object({
  expected_revision: z.number().int().positive(),
  reason: z.string().trim().min(1, "Say why the time off is revoked.").max(1000),
}).strict();
export type TimeOffRevokeInput = z.infer<typeof timeOffRevokeInputSchema>;
export const timeOffRevokeResultSchema = z.object({
  status: z.string().min(1), request_id: z.string().uuid(), revision: z.number().int().positive(),
});
export type TimeOffRevokeResult = z.infer<typeof timeOffRevokeResultSchema>;
/** A published, not yet started shift the approval would open. */
export const timeOffImpactShiftSchema = z.object({
  id: z.string().uuid(), location_id: z.string().uuid(), location_name: z.string(), scheduled_date: z.string().date(),
  start_time: z.string().nullable(), end_time: z.string().nullable(), timezone: z.string(), job_name: z.string(),
  time_unknown: z.boolean(), starts_at: instant.nullable(), ends_at: instant.nullable(),
});
export type TimeOffImpactShift = z.infer<typeof timeOffImpactShiftSchema>;
/** Requests > Time off: where a pending request stands, as the reader may see it. */
export const timeOffProgressSchema = z.object({
  remaining: z.number().int().nonnegative(),
  fallback: z.boolean(),
  decide_by: instant.nullable(),
  can_vote: z.boolean(),
  can_decide_alone: z.boolean(),
  my_vote: z.enum(["approve", "deny"]).nullable(),
  my_approval_finalizes: z.boolean(),
  locations: z.array(z.object({
    id: z.string().uuid(), name: z.string(), approved_by: z.string().uuid().nullable(),
    approved_by_name: z.string().nullable(), approved_at: instant.nullable(),
  })),
  // Shifts in full at locations whose schedule the reader reads, a count elsewhere.
  impact: z.object({
    fingerprint: timeOffImpactFingerprintSchema,
    locations: z.record(z.string().uuid(), z.object({ fingerprint: timeOffImpactFingerprintSchema, shifts: z.array(timeOffImpactShiftSchema) })),
    hidden_shift_count: z.number().int().nonnegative(),
  }).nullable(),
});
export type TimeOffProgress = z.infer<typeof timeOffProgressSchema>;
/** "N shifts become open shifts": what the confirm dialog counts. */
export function timeOffOpenedShiftCount(progress: Pick<TimeOffProgress, "impact">): number {
  if (!progress.impact) return 0;
  return Object.values(progress.impact.locations).reduce((total, place) => total + place.shifts.length, progress.impact.hidden_shift_count);
}

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
  fold_choices: z.object({ start_fold: z.enum(["earlier", "later"]).optional(), end_fold: z.enum(["earlier", "later"]).optional() }).optional(),
});
export type TimeOffPeriodRead = z.infer<typeof timeOffPeriodReadSchema>;
