import { z } from "zod";
import { shiftAvailabilityAssessmentSchema } from "./availability-assessment";
import { availabilityCalendarSchema, availabilityCalendarInputSchema } from "./availability-calendar";
import {
  availabilityPublicationLockSchema,
  weeklyAvailabilityInputSchema,
  availabilityDateOverrideBounds,
  clockSeconds,
} from "./availability";

export const availabilityOwnershipSchema = z.enum([
  "hybrid",
  "employee_only",
  "manager_only",
]);
export const availabilityApprovalSchema = z.enum(["none", "narrowing", "all"]);
export const availabilityStatusSchema = z.enum([
  "awaiting_employee",
  "pending_review",
  "effective",
  "denied",
  "changes_requested",
  "withdrawn",
  "superseded",
]);
export const availabilityConfirmationSchema = z.object({
  channel: z.enum(["app", "conversation", "phone", "message", "document"]),
  confirmed_at: z.string().datetime({ offset: true }),
  note: z.string().trim().max(1000).optional(),
  user_id: z.string().uuid().optional(),
});
export const availabilityProposalSchema = weeklyAvailabilityInputSchema
  .safeExtend({
    effective_from: z.string().date(),
    effective_until: z.string().date().nullable(),
    kind: z.enum(["weekly", "temporary"]).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.date_overrides?.length) {
      const bounds = availabilityDateOverrideBounds(value.date_overrides);
      if (value.kind === "weekly" || value.effective_from !== bounds.effective_from || value.effective_until !== bounds.effective_until ||
        Date.parse(bounds.effective_until) - Date.parse(bounds.effective_from) > 30 * 86400000)
        ctx.addIssue({ code: "custom", path: ["date_overrides"], message: "Choose dated changes within 31 days and include both dates for overnight hours." });
      if (value.days.some(d => d.mode !== "unavailable" || d.blocked_shift_type_ids?.length))
        ctx.addIssue({ code: "custom", path: ["days"], message: "Dated hours preserve existing weekly and shift-type rules." });
      // Explicit fold choices require the server's actual UTC resolution.
      const ordinary = value.date_overrides.filter(p => !p.start_fold && !p.end_fold).map(p => ({
        start: Date.parse(`${p.segment_date}T00:00:00Z`) / 1000 + clockSeconds(p.start_time ?? "00:00"),
        end: Date.parse(`${p.segment_date}T00:00:00Z`) / 1000 + clockSeconds(p.end_time ?? "24:00") + (p.ends_next_day ? 86400 : 0),
      })).sort((a, b) => a.start - b.start);
      if (ordinary.some((p, i) => i > 0 && p.start < ordinary[i - 1]!.end))
        ctx.addIssue({ code: "custom", path: ["date_overrides"], message: "Dated availability periods cannot overlap. Edit or remove the overlapping hours." });
    }
    if (value.effective_until && value.effective_until < value.effective_from)
      ctx.addIssue({
        code: "custom",
        path: ["effective_until"],
        message: "End date must follow the start date",
      });
    if (value.kind === "temporary" && !value.effective_until)
      ctx.addIssue({
        code: "custom",
        path: ["effective_until"],
        message: "Temporary availability needs an end date",
      });
  });
const revision = z.number().int().nonnegative();
const impactFingerprint = z.string().regex(/^[a-f0-9]{64}$/);
export const availabilityImpactInputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("submit"), employee_id: z.string().uuid(), expected_revision: revision, proposal: availabilityProposalSchema,
    replace_version_ids: z.array(z.string().uuid()).max(50).optional(), supersedes_request_id: z.string().uuid().optional() }),
  z.object({ action: z.literal("approve"), employee_id: z.string().uuid(), expected_revision: revision, request_id: z.string().uuid(), expected_request_revision: revision, policy_revision: revision }),
]);
export type AvailabilityImpactInput = z.infer<typeof availabilityImpactInputSchema>;
export const availabilityImpactSchema = z.object({
  employee_id: z.string().uuid(), request_id: z.string().uuid().nullable(), revision, policy_revision: revision, fingerprint: impactFingerprint,
  affected_count: revision, restricted_count: revision, blocking_count: revision, warning_count: revision, verification_count: revision, cleared_count: revision,
  shifts: z.array(z.object({ key: z.string(), source: z.enum(["saved_draft", "active_edit"]), shift_id: z.string().uuid(), location_id: z.string().uuid(), location_name: z.string(), job_name: z.string(), shift_type_name: z.string().nullable(),
    scheduled_date: z.string().date(), start_time: z.string().nullable(), end_time: z.string().nullable(), before: shiftAvailabilityAssessmentSchema, after: shiftAvailabilityAssessmentSchema })),
});
export type AvailabilityImpact = z.infer<typeof availabilityImpactSchema>;
export const availabilityCommandSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("submit"),
      employee_id: z.string().uuid(),
      expected_revision: revision,
      onboarding_revision: revision.optional(),
      proposal: availabilityProposalSchema,
      source: z
        .enum(["employee", "manager_proposal", "manager_recorded_confirmation"])
        .optional(),
      confirmation: availabilityConfirmationSchema.optional(),
      supersedes_request_id: z.string().uuid().optional(),
      supersedes_request_revision: revision.optional(),
      replace_version_ids: z.array(z.string().uuid()).max(50).optional(),
      impact_fingerprint: impactFingerprint.optional(),
    })
    .superRefine((v, ctx) => {
      if (
        Boolean(v.supersedes_request_id) !==
        (v.supersedes_request_revision !== undefined)
      )
        ctx.addIssue({
          code: "custom",
          message: "Include the request and revision being replaced",
        });
      if (
        v.source === "manager_recorded_confirmation" &&
        (!v.confirmation ||
          v.confirmation.channel === "app" ||
          (v.confirmation.note?.length ?? 0) < 3)
      )
        ctx.addIssue({
          code: "custom",
          path: ["confirmation"],
          message: "Record the employee confirmation",
        });
    }),
  z
    .object({
      action: z.enum([
        "approve",
        "deny",
        "changes_requested",
        "resolve_notice",
        "confirm",
        "withdraw",
        "decline",
      ]),
      employee_id: z.string().uuid(),
      request_id: z.string().uuid(),
      expected_request_revision: revision,
      expected_revision: revision,
      policy_revision: revision,
      impact_fingerprint: impactFingerprint.optional(),
      reason: z.string().trim().max(1000).optional(),
      confirmation: availabilityConfirmationSchema.optional(),
    })
    .superRefine((v, ctx) => {
      if (
        ["deny", "changes_requested"].includes(v.action) &&
        (v.reason?.length ?? 0) < 3
      )
        ctx.addIssue({
          code: "custom",
          path: ["reason"],
          message: "Explain the decision to the employee",
        });
      if (
        v.action === "resolve_notice" &&
        (!v.confirmation ||
          v.confirmation.channel === "app" ||
          (v.confirmation.note?.length ?? 0) < 3)
      )
        ctx.addIssue({
          code: "custom",
          path: ["confirmation"],
          message: "Record the employee conversation that resolved the notice",
        });
    }),
]);
export type AvailabilityCommand = z.infer<typeof availabilityCommandSchema>;
export const availabilityMutationSchema = z.object({
  status: availabilityStatusSchema,
  request_id: z.string().uuid(),
  request_revision: revision,
  revision,
  capacity_notice_open: z.boolean(),
});
export const availabilityVersionSchema =
  weeklyAvailabilityInputSchema.safeExtend({
    id: z.string().uuid(),
    effective_from: z.string().date(),
    effective_until: z.string().date().nullable(),
    revision,
    source: z.enum(["employee", "manager", "onboarding"]),
    kind: z.enum(["weekly", "temporary"]),
    replace_version_ids: z.array(z.string().uuid()).optional(),
    request_id: z.string().uuid().nullable(),
    confirmation_source: z.string().nullable(),
    confirmation: availabilityConfirmationSchema.nullable(),
  });
export const availabilityCalendarComparisonInputSchema = availabilityCalendarInputSchema.extend({
  expected_revision: revision, proposal: availabilityProposalSchema.optional(), replace_version_ids: z.array(z.string().uuid()).max(124).default([]),
  request_id: z.string().uuid().optional(), expected_request_revision: revision.optional(),
}).refine(value => Boolean(value.proposal) !== Boolean(value.request_id), "Choose a proposal or an open request")
  .refine(value => !value.request_id || value.expected_request_revision !== undefined, "Include the current request revision");
export type AvailabilityCalendarComparisonInput = z.infer<typeof availabilityCalendarComparisonInputSchema>;
export const availabilityRequestSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  employee_id: z.string().uuid(),
  author_id: z.string().uuid(),
  // Persisted requests include the canonical replacement selection inside the
  // proposal. Commands intentionally keep their selection at the top level.
  proposal: availabilityProposalSchema.safeExtend({
    replace_version_ids: z.array(z.string().uuid()).optional(),
  }),
  before_snapshot: z.array(z.record(z.string(), z.unknown())).nullable(),
  base_revision: revision,
  policy_revision: revision,
  policy_snapshot: z.record(z.string(), z.unknown()),
  source: z.enum([
    "employee",
    "onboarding",
    "manager_proposal",
    "manager_recorded_confirmation",
  ]),
  confirmation: availabilityConfirmationSchema.nullable(),
  kind: z.enum(["weekly", "temporary"]),
  effective_from: z.string().date(),
  effective_until: z.string().date().nullable(),
  is_narrowing: z.boolean(),
  status: availabilityStatusSchema,
  capacity_notice_open: z.boolean(),
  reviewer_id: z.string().uuid().nullable(),
  decision_reason: z.string(),
  revision,
  created_at: z.string(),
  updated_at: z.string(),
  can_review: z.boolean(),
  can_withdraw: z.boolean(),
  can_confirm: z.boolean(),
});
export type AvailabilityRequest = z.infer<typeof availabilityRequestSchema>;
export const availabilityQueueSchema = z.enum(["needs_review", "waiting_employee", "history"]);
export const availabilityQueueFiltersSchema = z.object({
  queue: availabilityQueueSchema.default("needs_review"),
  search: z.string().trim().max(100).optional(),
  location_id: z.string().uuid().optional(),
  request_id: z.string().uuid().optional(),
  cursor: z.string().max(250).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
});
export type AvailabilityQueueFilters = z.infer<typeof availabilityQueueFiltersSchema>;
export const availabilityQueueRequestSchema = availabilityRequestSchema.pick({
  id: true, employee_id: true, status: true, kind: true, source: true,
  effective_from: true, effective_until: true, capacity_notice_open: true, is_narrowing: true, created_at: true, can_review: true,
}).extend({
  employee_name: z.string(), employee_code: z.string(), timezone: z.string(), queue: availabilityQueueSchema,
  locations: z.array(z.object({id: z.string().uuid(), name: z.string()})),
  review_blocker: z.enum(["self_review", "author_review", "location_scope"]).nullable(),
});
export const availabilityQueueReadSchema = z.object({
  workspace_id: z.string().uuid(), queue: availabilityQueueSchema,
  requests: z.array(availabilityQueueRequestSchema), selected: availabilityQueueRequestSchema.nullable(),
  needs_review_count: revision, waiting_employee_count: revision, history_count: revision,
  next_cursor: z.string().nullable(), locations: z.array(z.object({id:z.string().uuid(),name:z.string()})),
});
export type AvailabilityQueueReadModel = z.infer<typeof availabilityQueueReadSchema>;
export const availabilityShiftTypeSchema = z.object({ id: z.string().uuid(), name: z.string(), archived: z.boolean() });
export type AvailabilityShiftType = z.infer<typeof availabilityShiftTypeSchema>;
export const availabilityReadSchema = z.object({
  calendar: availabilityCalendarSchema.optional(),
  time_format: z.enum(["12h", "24h"]).optional(),
  shift_types: z.array(availabilityShiftTypeSchema).optional(),
  clock_presets: z
    .array(
      z.object({
        id: z.string().uuid(),
        name: z.string(),
        start_time: z.string(),
        end_time: z.string(),
      }),
    )
    .optional(),
  onboarding_revision: revision.optional(),
  employee_id: z.string().uuid(),
  latest: availabilityVersionSchema.nullable(),
  current: availabilityVersionSchema.nullable(),
  revision,
  versions: z.array(availabilityVersionSchema),
  published_periods: z.array(availabilityPublicationLockSchema),
  suggested_start: z.string().date(),
  is_self: z.boolean(),
  can_submit: z.boolean(),
  can_manage: z.boolean(),
  requests: z.array(availabilityRequestSchema),
  events: z.array(
    z.object({
      id: z.string().uuid(),
      request_id: z.string().uuid(),
      actor_id: z.string().uuid(),
      action: z.string(),
      detail: z.record(z.string(), z.unknown()),
      created_at: z.string(),
    }),
  ),
  policy: z.object({
    ownership: availabilityOwnershipSchema,
    approval: availabilityApprovalSchema,
    initial_review: z.boolean(),
    notice_days: z.number().int().min(0).max(90),
    revision,
    enforcement: z.enum(["soft", "hard"]),
  }),
});
export type AvailabilityReadModel = z.infer<typeof availabilityReadSchema>;
