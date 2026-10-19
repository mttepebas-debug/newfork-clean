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
  // What stands in the way, by code. BL-995: approved time off is one of them,
  // and Shift Hub shows an open shift it alone blocks as not open, and why.
  blockers: z
    .array(z.object({ code: z.string(), message: z.string().optional() }))
    .optional(),
  availability_warning: z
    .object({
      fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
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
// Who a request for one's own shift would go to (KARARLAR S-169): the location's
// manager, else an admin, else the owner; self_only when nobody but the owner, who
// asks, can answer it.
export const decisionTierSchema = z.enum(["location_manager", "admin", "owner", "self_only"]);
export const ownExchangeShiftSchema = exchangeShiftSchema.extend({
  decision_tier: decisionTierSchema,
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
  // TAKAS-RELEASE: a release is a cover asked of everyone eligible (audience
  // eligible_pool); only a release reaches the open pool.
  kind: z.enum(["cover", "swap"]),
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
  owner_id: z.string().uuid(),
  owner_name: z.string().nullable(),
  shift: exchangeShiftSchema,
  requested_shift: exchangeShiftSchema.nullable(),
  applications: z.array(exchangeApplicationSchema),
  candidate_count: z.number(),
  can_manage: z.boolean(),
  is_owner: z.boolean(),
  private_note: z.string().optional(),
  teammate_note: z.string(),
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
      case_id: z.string().uuid(),
      shift: exchangeShiftSchema,
      eligibility: exchangeEligibilitySchema,
      note: z.string(),
    }),
  ),
  own_shifts: z.array(ownExchangeShiftSchema),
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
    // A release's note for teammates: everyone it reaches reads it.
    teammate_note: z.string().max(200).optional(),
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
  // Not for me: the released shift leaves this person's Available Shifts.
  z.object({
    action: z.literal("pass"),
    shift_id: z.string().uuid(),
    case_id: z.string().uuid(),
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
export type OwnExchangeShift = z.infer<typeof ownExchangeShiftSchema>;
export type DecisionTier = z.infer<typeof decisionTierSchema>;
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
