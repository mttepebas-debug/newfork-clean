import { z } from "zod";
import { shiftTimeBasisSchema, shiftTimeSnapshotSchema } from "./availability";

export const exchangeApplicationStatusSchema = z.enum([
  "invited",
  "pending_manager",
  "approved",
  "rejected_by_manager",
  "declined_by_employee",
  "withdrawn",
  "closed_other_selected",
  "closed_case_cancelled",
  "expired",
  "invalidated",
]);
export const exchangeEligibilitySchema = z.object({
  status: z.enum([
    "eligible",
    "ineligible",
    "partial",
    "verification_required",
  ]),
  reasons: z.array(z.string()),
  // BL-182: taking this shift gives back the employee's own approved time off
  // for these hours; it shortens when a manager approves the transfer.
  shortens_time_off: z.boolean().optional(),
  availability_warning: z
    .object({
      fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
      time_off_intervals: z
        .array(z.object({ start_at: z.string(), end_at: z.string() }))
        .optional(),
    })
    .nullable()
    .optional(),
  // EKRAN-02 C2: what the approving manager is shown (travel, rest, availability
  // set aside by consent, their own note) and, in the decision preview, what the
  // core measured, so the H2 review can name the rule that holds too.
  approval_flags: z
    .array(
      z.object({
        code: z.string(),
        gap_minutes: z.number().int().optional(),
        rule_minutes: z.number().int().optional(),
      }),
    )
    .optional(),
  measures: z
    .object({
      rest_gap_minutes: z.number().int().nullable(),
      travel_gap_minutes: z.number().int().nullable(),
      rest_rule_minutes: z.number().int(),
      travel_rule_minutes: z.number().int(),
    })
    .optional(),
});
export const exchangeShiftSchema = z.object({
  availability_warning: exchangeEligibilitySchema.shape.availability_warning,
  time_snapshot: shiftTimeSnapshotSchema.nullable().optional(),
  time_timezone: z.string().nullable().optional(),
  id: z.string().uuid(),
  source_id: z.string().uuid(),
  location_id: z.string().uuid(),
  location_name: z.string(),
  timezone: z.string(),
  job_id: z.string().uuid().nullable(),
  job_name: z.string(),
  shift_type_name: z.string().nullable().optional(),
  unpaid_break_minutes: z.number().int().nonnegative().optional(),
  scheduled_date: z.string(),
  time_basis: shiftTimeBasisSchema.optional(),
  start_time: z.string().nullable(),
  end_time: z.string().nullable(),
  starts_at: z.string().nullable(),
  ends_at: z.string().nullable(),
  employee_id: z.string().uuid().nullable(),
  employee_name: z.string().nullable(),
});
export const exchangeApplicationSchema = z.object({
  id: z.string().uuid(),
  employee_id: z.string().uuid(),
  employee_name: z.string(),
  status: exchangeApplicationStatusSchema,
  created_at: z.string(),
  reason: z.string(),
  eligibility: exchangeEligibilitySchema.nullable(),
});
export const exchangeCaseSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["cover", "open_pickup", "swap"]),
  audience: z.enum(["eligible_pool", "direct"]),
  status: z.enum(["open", "completed", "cancelled", "expired", "invalidated"]),
  stage: z.enum([
    "seeking_candidates",
    "awaiting_peer",
    "ready_for_manager",
    "awaiting_other_manager",
    "closed",
  ]),
  revision: z.number().int(),
  created_at: z.string(),
  expires_at: z.string(),
  owner_id: z.string().uuid().nullable(),
  owner_name: z.string().nullable(),
  shift: exchangeShiftSchema,
  requested_shift: exchangeShiftSchema.nullable(),
  applications: z.array(exchangeApplicationSchema),
  candidate_count: z.number(),
  can_manage: z.boolean(),
  is_owner: z.boolean(),
  private_note: z.string().optional(),
  current_published: z.boolean().optional(),
  requested_current_published: z.boolean().nullable().optional(),
  history: z.array(
    z.object({
      id: z.string().uuid(),
      action: z.string(),
      created_at: z.string(),
      message: z.string(),
    }),
  ),
});
export const exchangeReadModelSchema = z.object({
  employee_id: z.string().uuid().nullable(),
  cases: z.array(exchangeCaseSchema),
  opportunities: z.array(
    z.object({
      case_id: z.string().uuid().nullable(),
      shift: exchangeShiftSchema,
      eligibility: exchangeEligibilitySchema,
    }),
  ),
  own_shifts: z.array(exchangeShiftSchema),
});
export const exchangeCommandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    availability_fingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    shift_id: z.string().uuid(),
    kind: z.enum(["cover", "swap"]),
    requested_shift_id: z.string().uuid().optional(),
    employee_id: z.string().uuid().optional(),
    note: z.string().max(1000).default(""),
  }),
  z.object({
    action: z.literal("apply"),
    availability_fingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    shift_id: z.string().uuid(),
    case_id: z.string().uuid().optional(),
  }),
  z.object({
    action: z.enum(["accept", "decline", "withdraw"]),
    availability_fingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    case_id: z.string().uuid(),
    application_id: z.string().uuid(),
    expected_revision: z.number().int().positive(),
  }),
  z.object({
    action: z.enum(["close", "reject", "approve"]),
    case_id: z.string().uuid(),
    application_id: z.string().uuid().optional(),
    expected_revision: z.number().int().positive(),
    fingerprint: z.string().optional(),
    reason: z.string().max(1000).default(""),
    private_note: z.string().max(1000).default(""),
  }),
]);
export const exchangePreviewSchema = z.object({
  allowed: z.boolean(),
  fingerprint: z.string(),
  reasons: z.array(z.string()),
  receiver: exchangeEligibilitySchema,
  giver: exchangeEligibilitySchema.nullable(),
  requires_other_manager: z.boolean(),
  other_applications: z.number(),
});
export const exchangeCandidatesSchema = z.object({
  employees: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      eligibility: exchangeEligibilitySchema,
    }),
  ),
  shifts: z.array(exchangeShiftSchema),
});
export const exchangeMutationSchema = z.object({
  case_id: z.string().uuid(),
  status: z.string(),
  revision: z.number().int(),
});
export type ExchangeCase = z.infer<typeof exchangeCaseSchema>;
export type ExchangeShift = z.infer<typeof exchangeShiftSchema>;
export type ExchangeApplication = z.infer<typeof exchangeApplicationSchema>;
export type ExchangeCommand = z.infer<typeof exchangeCommandSchema>;
export type ExchangeReadModel = z.infer<typeof exchangeReadModelSchema>;
export type ExchangePreview = z.infer<typeof exchangePreviewSchema>;
export const exchangeScheduleRecoverySchema = z.object({
  session_id: z.string().uuid(),
  session_revision: z.number().int(),
  fingerprint: z.string(),
  changes: z.array(
    z.object({
      current: exchangeShiftSchema,
      session_shift_id: z.string().uuid().nullable(),
      edited_employee_name: z.string().nullable(),
      edited_start_time: z.string().nullable(),
      edited_end_time: z.string().nullable(),
      edited_job_name: z.string().nullable().optional(),
      edited_shift_type_name: z.string().nullable().optional(),
      edited_timezone: z.string().nullable().optional(),
      edited_unpaid_break_minutes: z.number().nullable().optional(),
      removed: z.boolean().nullable(),
    }),
  ),
});
export type ExchangeScheduleRecovery = z.infer<
  typeof exchangeScheduleRecoverySchema
>;
