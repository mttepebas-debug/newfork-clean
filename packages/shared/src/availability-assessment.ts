import { z } from "zod";

const interval = z.object({
  start_at: z.string().datetime({ offset: true }),
  end_at: z.string().datetime({ offset: true }),
});
export const shiftAvailabilityAssessmentSchema = z.object({
  service_classification: z.object({
    kind: z.literal("custom"),
    status: z.enum(["preview", "recorded"]),
    reason: z.string(),
    actor_user_id: z.string().uuid().optional(),
    recorded_at: z.string().datetime({ offset: true }).optional(),
  }).optional(),
  service_classification_fingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  type_restrictions: z.array(z.object({ shift_type_id: z.string().uuid(), version_id: z.string().uuid(), revision: z.number().int(), timezone: z.string(),
    start_at: z.string().datetime({ offset: true }), end_at: z.string().datetime({ offset: true }) })).optional(),
  coverage: z.enum(["full", "partial", "none", "unknown"]),
  operation: z.enum([
    "allowed",
    "warning_requires_override",
    "blocked",
    "verification_required",
  ]),
  time_basis: z.enum([
    "explicit",
    "type_default",
    "unresolved",
    "legacy_unverified",
  ]),
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
      intervals: z.array(interval).optional(),
    }),
  ),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  policy_revision: z.number().int(),
  fold_resolution: z.literal("post_transition_offset").nullable(),
  assessment_minutes: z.number().nullable(),
  can_override: z.boolean(),
  warning_policy: z.enum(["warn", "confirm"]).optional(),
  has_availability_conflict: z.boolean().optional(),
  preference_timezone: z.string().optional(),
  employee_intervals: z.array(interval).optional(),
  manager_intervals: z.array(interval).optional(),
  responsibility_retained: z.boolean().optional(),
  override_recorded: z.boolean().optional(),
});
export type ShiftAvailabilityAssessment = z.infer<
  typeof shiftAvailabilityAssessmentSchema
>;
