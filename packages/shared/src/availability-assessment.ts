import { z } from "zod";
import { shiftTimeBasisSchema } from "./availability";

export const scheduleConflictSeveritySchema = z.enum(["allow", "warn", "confirm", "block"]);
export type ScheduleConflictSeverity = z.infer<typeof scheduleConflictSeveritySchema>;
// Availability is a preference, never a conflict rule (BL-186): an
// availability key is refused rather than dropped.
export const scheduleConflictRulesSchema = z.strictObject({
  // Approved time off always blocks a manager's assignment (FB-6.1 T5); the
  // key stays required because the database constraint expects it.
  approved_time_off: z.literal("block"),
  // K17: block, confirm each cell, or confirm once per editing session.
  closed_location: z.enum(["confirm", "confirm_once", "block"]),
  minimum_travel: z.enum(["warn", "confirm", "block"]),
  minimum_rest: z.enum(["warn", "confirm", "block"]),
  document_required: z.enum(["warn", "confirm", "block"]).optional(),
  document_conditional_grace: z.enum(["warn", "confirm", "block"]).optional(),
  document_conditional_overdue: z.enum(["confirm", "block"]).optional(),
}).superRefine((rules, ctx) => {
  const order = ["warn", "confirm", "block"];
  if (order.indexOf(rules.document_conditional_overdue ?? "confirm") < order.indexOf(rules.document_conditional_grace ?? "warn"))
    ctx.addIssue({ code: "custom", path: ["document_conditional_overdue"], message: "Overdue handling cannot be softer than the grace-period rule" });
});
export type ScheduleConflictRules = z.infer<typeof scheduleConflictRulesSchema>;
export const scheduleConflictSettingsSchema = z.object({
  conflict_rules: scheduleConflictRulesSchema,
  conflict_rules_revision: z.number().int().positive(),
  minimum_travel_minutes: z.number().int().min(0).max(240),
  minimum_rest_minutes: z.number().int().min(0).max(1440),
});
export type ScheduleConflictSettings = z.infer<typeof scheduleConflictSettingsSchema>;
export const DEFAULT_SCHEDULE_CONFLICT_RULES: ScheduleConflictRules = {
  approved_time_off: "block", closed_location: "confirm",
  minimum_travel: "confirm", minimum_rest: "confirm",
  document_required: "confirm", document_conditional_grace: "warn", document_conditional_overdue: "confirm",
};

/**
 * K17: "confirm once" asks like "confirm"; the Schedule keeps the answer for
 * the rest of its editing session (the server reports confirm_scope:
 * "edit_session" on the reason).
 */
export function closedLocationSeverity(rule: ScheduleConflictRules["closed_location"]): ScheduleConflictSeverity {
  return rule === "confirm_once" ? "confirm" : rule;
}

/** K17: whether a cell on a closed day still asks, given this editing session's answers so far. */
export function closedLocationAsks(rule: ScheduleConflictRules["closed_location"], confirmedThisSession: boolean): boolean {
  return rule === "confirm" || (rule === "confirm_once" && !confirmedThisSession);
}

export function highestScheduleConflictSeverity(values: readonly ScheduleConflictSeverity[]): ScheduleConflictSeverity {
  const order: readonly ScheduleConflictSeverity[] = ["allow", "warn", "confirm", "block"];
  return order[Math.max(0, ...values.map(value => order.indexOf(value)))]!;
}

const interval = z.object({
  start_at: z.string().datetime({ offset: true }),
  end_at: z.string().datetime({ offset: true }),
});
export const shiftAvailabilityAssessmentSchema = z.object({
  conflict_severity: scheduleConflictSeveritySchema,
  coverage: z.enum(["full", "partial", "none", "unknown"]),
  operation: z.enum([
    "allowed",
    "warning_requires_override",
    "blocked",
    "verification_required",
  ]),
  time_basis: shiftTimeBasisSchema,
  timezone: z.string(),
  assessment_scope: z.enum(["calendar_day", "shift_interval"]),
  intervals: z.array(interval),
  available_intervals: z.array(interval),
  unavailable_intervals: z.array(interval),
  unknown_intervals: z.array(interval),
  reasons: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      definite: z.boolean(),
      severity: scheduleConflictSeveritySchema.optional(),
      intervals: z.array(interval).optional(),
    }),
  ),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  policy_revision: z.number().int(),
  fold_resolution: z.literal("post_transition_offset").nullable(),
  assessment_minutes: z.number().nullable(),
  can_override: z.boolean(),
  warning_policy: z.enum(["warn", "confirm"]).optional(),
  // Availability only warns (BL-186): these name the warning, never gate.
  has_availability_conflict: z.boolean().optional(),
  availability_fingerprint: z.string().regex(/^[a-f0-9]{64}$/).nullable().optional(),
  preference_timezone: z.string().optional(),
  employee_intervals: z.array(interval).optional(),
  manager_intervals: z.array(interval).optional(),
  responsibility_retained: z.boolean().optional(),
  override_recorded: z.boolean().optional(),
});
export type ShiftAvailabilityAssessment = z.infer<
  typeof shiftAvailabilityAssessmentSchema
>;
