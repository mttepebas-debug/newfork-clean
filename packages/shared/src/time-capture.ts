import { z } from "zod";

export const timeEventTypeSchema = z.enum([
  "clock_in",
  "break_start",
  "break_end",
  "clock_out",
]);
export type TimeEventType = z.infer<typeof timeEventTypeSchema>;

export const timeCaptureSourceSchema = z.enum([
  "web",
  "mobile_web",
  "manager",
  "kiosk",
]);
export type TimeCaptureSource = z.infer<typeof timeCaptureSourceSchema>;

export const timeCaptureStateSchema = z.enum([
  "open",
  "on_break",
  "complete",
  "needs_attention",
]);
export type TimeCaptureState = z.infer<typeof timeCaptureStateSchema>;

export const timeReviewStateSchema = z.enum([
  "unreviewed",
  "approved",
  "reopened",
]);
export type TimeReviewState = z.infer<typeof timeReviewStateSchema>;

export const captureTimeEventInputSchema = z.object({
  employee_id: z.string().uuid(),
  location_id: z.string().uuid(),
  session_id: z.string().uuid().nullable(),
  event_type: timeEventTypeSchema,
  occurred_at: z.string().datetime({ offset: true }),
  idempotency_key: z.string().uuid(),
  source: timeCaptureSourceSchema,
});
export type CaptureTimeEventInput = z.infer<typeof captureTimeEventInputSchema>;

export const timeSessionSchema = z
  .object({
    id: z.string().uuid(),
    workspace_id: z.string().uuid(),
    employee_id: z.string().uuid(),
    location_id: z.string().uuid(),
    capture_state: timeCaptureStateSchema,
    review_state: timeReviewStateSchema,
    started_at: z.string().datetime({ offset: true }),
    ended_at: z.string().datetime({ offset: true }).nullable(),
    effective_started_at: z.string().datetime({ offset: true }),
    effective_ended_at: z.string().datetime({ offset: true }).nullable(),
    last_event_at: z.string().datetime({ offset: true }),
    revision: z.coerce.number().int().positive(),
  })
  .superRefine((session, issue) => {
    if (
      session.effective_ended_at &&
      Date.parse(session.effective_ended_at) <=
        Date.parse(session.effective_started_at)
    ) {
      issue.addIssue({
        code: "custom",
        path: ["effective_ended_at"],
        message: "Session end must be after its start",
      });
    }
  });
export type TimeSession = z.infer<typeof timeSessionSchema>;

export const timeEventSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  session_id: z.string().uuid(),
  employee_id: z.string().uuid(),
  location_id: z.string().uuid(),
  event_type: timeEventTypeSchema,
  occurred_at: z.string().datetime({ offset: true }),
  received_at: z.string().datetime({ offset: true }),
  actor_user_id: z.string().uuid().nullable(),
  actor_employee_id: z.string().uuid().nullable().optional(),
  kiosk_device_id: z.string().uuid().nullable().optional(),
  kiosk_action_session_id: z.string().uuid().nullable().optional(),
  source: timeCaptureSourceSchema,
  idempotency_key: z.string().uuid(),
});
export type TimeEvent = z.infer<typeof timeEventSchema>;

export const captureTimeEventResultSchema = z.object({
  session: timeSessionSchema,
  event: timeEventSchema,
  idempotent_replay: z.boolean(),
});
export type CaptureTimeEventResult = z.infer<
  typeof captureTimeEventResultSchema
>;

export const applyTimeAmendmentInputSchema = z
  .object({
    session_id: z.string().uuid(),
    expected_revision: z.number().int().positive(),
    effective_started_at: z.string().datetime({ offset: true }),
    effective_ended_at: z.string().datetime({ offset: true }),
    reason: z.string().trim().min(3).max(500),
    idempotency_key: z.string().uuid(),
  })
  .refine(
    (input) =>
      Date.parse(input.effective_ended_at) >
      Date.parse(input.effective_started_at),
    {
      path: ["effective_ended_at"],
      message: "Amended end must be after its start",
    },
  );
export type ApplyTimeAmendmentInput = z.infer<
  typeof applyTimeAmendmentInputSchema
>;

export const timeAmendmentSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  session_id: z.string().uuid(),
  actor_user_id: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
  before_started_at: z.string().datetime({ offset: true }),
  before_ended_at: z.string().datetime({ offset: true }),
  after_started_at: z.string().datetime({ offset: true }),
  after_ended_at: z.string().datetime({ offset: true }),
  base_revision: z.coerce.number().int().positive(),
  result_revision: z.coerce.number().int().positive(),
  idempotency_key: z.string().uuid(),
  created_at: z.string().datetime({ offset: true }),
});
export type TimeAmendment = z.infer<typeof timeAmendmentSchema>;

export const timeCorrectionStatusSchema = z.enum([
  "pending",
  "accepted",
  "rejected",
]);
export type TimeCorrectionStatus = z.infer<typeof timeCorrectionStatusSchema>;

export const timeCorrectionRequestSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  session_id: z.string().uuid(),
  employee_id: z.string().uuid(),
  location_id: z.string().uuid(),
  requested_started_at: z.string().datetime({ offset: true }),
  requested_ended_at: z.string().datetime({ offset: true }),
  reason: z.string().trim().min(3).max(500),
  base_revision: z.coerce.number().int().positive(),
  status: timeCorrectionStatusSchema,
  submitted_at: z.string().datetime({ offset: true }),
  decided_by: z.string().uuid().nullable(),
  decision_reason: z.string().nullable(),
  decided_at: z.string().datetime({ offset: true }).nullable(),
  result_amendment_id: z.string().uuid().nullable(),
});
export type TimeCorrectionRequest = z.infer<typeof timeCorrectionRequestSchema>;

export const employeeTimeCorrectionInputSchema = z
  .object({
    session_id: z.string().uuid(),
    expected_revision: z.number().int().positive(),
    requested_started_at: z.string().datetime({ offset: true }),
    requested_ended_at: z.string().datetime({ offset: true }),
    reason: z.string().trim().min(3).max(500),
  })
  .refine(
    (input) =>
      Date.parse(input.requested_ended_at) >
      Date.parse(input.requested_started_at),
    {
      path: ["requested_ended_at"],
      message: "Requested end must be after its start",
    },
  );
export type EmployeeTimeCorrectionInput = z.infer<
  typeof employeeTimeCorrectionInputSchema
>;

export const timeCorrectionDecisionInputSchema = z.object({
  expected_session_revision: z.number().int().positive(),
  action: z.enum(["accept", "reject"]),
  reason: z.string().trim().min(3).max(500),
});
export type TimeCorrectionDecisionInput = z.infer<
  typeof timeCorrectionDecisionInputSchema
>;

export const timeReviewWindowSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  location_id: z.string().uuid(),
  from_date: z.string().date(),
  to_date: z.string().date(),
  status: z.literal("approved"),
  session_versions: z.record(z.string().uuid(), z.number().int().positive()),
  approved_by: z.string().uuid(),
  approved_at: z.string().datetime({ offset: true }),
});
export type TimeReviewWindow = z.infer<typeof timeReviewWindowSchema>;

export const approveTimeReviewWindowInputSchema = z
  .object({
    location_id: z.string().uuid(),
    from: z.string().date(),
    to: z.string().date(),
    sessions: z
      .array(
        z.object({
          session_id: z.string().uuid(),
          expected_revision: z.number().int().positive(),
        }),
      )
      .min(1)
      .max(500),
  })
  .refine((input) => input.to >= input.from, {
    path: ["to"],
    message: "Review end must not precede start",
  });
export type ApproveTimeReviewWindowInput = z.infer<
  typeof approveTimeReviewWindowInputSchema
>;

export const employeeTimeCaptureInputSchema = z.object({
  location_id: z.string().uuid(),
  session_id: z.string().uuid().nullable(),
  event_type: timeEventTypeSchema,
  occurred_at: z.string().datetime({ offset: true }),
});
export type EmployeeTimeCaptureInput = z.infer<
  typeof employeeTimeCaptureInputSchema
>;

export const employeeTimeSessionDetailSchema = timeSessionSchema.extend({
  location_name: z.string().trim().min(1).max(120),
  events: z.array(timeEventSchema),
  amendments: z.array(timeAmendmentSchema),
  correction_requests: z.array(timeCorrectionRequestSchema),
});
export type EmployeeTimeSessionDetail = z.infer<
  typeof employeeTimeSessionDetailSchema
>;

export const employeeTimeTrackingReadModelSchema = z.object({
  workspace_id: z.string().uuid(),
  employee: z.object({
    id: z.string().uuid(),
    display_name: z.string().trim().min(1).max(160),
  }),
  locations: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(120),
      timezone: z.string().trim().min(1).max(80),
    }),
  ),
  current_session: employeeTimeSessionDetailSchema.nullable(),
  sessions: z.array(employeeTimeSessionDetailSchema).max(30),
});
export type EmployeeTimeTrackingReadModel = z.infer<
  typeof employeeTimeTrackingReadModelSchema
>;

export const managerTimeAttentionCodeSchema = z.enum([
  "open_session",
  "open_break",
  "needs_attention",
  "overlap",
  "amended",
  "correction_pending",
]);
export type ManagerTimeAttentionCode = z.infer<
  typeof managerTimeAttentionCodeSchema
>;

export const managerManualTimeEntrySchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  actor_user_id: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
  idempotency_key: z.string().uuid(),
  created_at: z.string().datetime({ offset: true }),
});
export type ManagerManualTimeEntry = z.infer<
  typeof managerManualTimeEntrySchema
>;

export const managerTimeSessionDetailSchema = timeSessionSchema.extend({
  employee_name: z.string().trim().min(1).max(161),
  employee_code: z.string().trim().min(1).max(24),
  location_name: z.string().trim().min(1).max(120),
  location_timezone: z.string().trim().min(1).max(80),
  attention_codes: z.array(managerTimeAttentionCodeSchema),
  events: z.array(timeEventSchema),
  amendments: z.array(timeAmendmentSchema),
  manual_entry: managerManualTimeEntrySchema.nullable(),
  correction_requests: z.array(timeCorrectionRequestSchema),
});
export type ManagerTimeSessionDetail = z.infer<
  typeof managerTimeSessionDetailSchema
>;

export const managerTimeEntriesReadModelSchema = z.object({
  workspace_id: z.string().uuid(),
  from: z.string().date(),
  to: z.string().date(),
  locations: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(120),
      timezone: z.string().trim().min(1).max(80),
    }),
  ),
  employees: z.array(
    z.object({
      id: z.string().uuid(),
      employee_code: z.string().trim().min(1).max(24),
      display_name: z.string().trim().min(1).max(161),
      location_ids: z.array(z.string().uuid()).min(1),
    }),
  ),
  sessions: z.array(managerTimeSessionDetailSchema).max(500),
  review_windows: z.array(timeReviewWindowSchema).max(100),
});
export type ManagerTimeEntriesReadModel = z.infer<
  typeof managerTimeEntriesReadModelSchema
>;

export const managerManualTimeEntryInputSchema = z
  .object({
    employee_id: z.string().uuid(),
    location_id: z.string().uuid(),
    started_at: z.string().datetime({ offset: true }),
    ended_at: z.string().datetime({ offset: true }),
    reason: z.string().trim().min(3).max(500),
  })
  .refine(
    (input) => Date.parse(input.ended_at) > Date.parse(input.started_at),
    {
      path: ["ended_at"],
      message: "Manual entry end must be after its start",
    },
  );
export type ManagerManualTimeEntryInput = z.infer<
  typeof managerManualTimeEntryInputSchema
>;

export const managerManualTimeEntryResultSchema = z.object({
  session: timeSessionSchema,
  events: z.array(timeEventSchema).length(2),
  manual_entry: managerManualTimeEntrySchema,
  idempotent_replay: z.boolean(),
});
export type ManagerManualTimeEntryResult = z.infer<
  typeof managerManualTimeEntryResultSchema
>;

export const managerTimeAmendmentInputSchema = z
  .object({
    expected_revision: z.number().int().positive(),
    effective_started_at: z.string().datetime({ offset: true }),
    effective_ended_at: z.string().datetime({ offset: true }),
    reason: z.string().trim().min(3).max(500),
  })
  .refine(
    (input) =>
      Date.parse(input.effective_ended_at) >
      Date.parse(input.effective_started_at),
    {
      path: ["effective_ended_at"],
      message: "Amended end must be after its start",
    },
  );
export type ManagerTimeAmendmentInput = z.infer<
  typeof managerTimeAmendmentInputSchema
>;

export const applyTimeAmendmentResultSchema = z.object({
  session: timeSessionSchema,
  amendment: timeAmendmentSchema,
  idempotent_replay: z.boolean(),
});
export type ApplyTimeAmendmentResult = z.infer<
  typeof applyTimeAmendmentResultSchema
>;

export const timeCorrectionMutationResultSchema = z.object({
  correction: timeCorrectionRequestSchema,
  amendment: timeAmendmentSchema.nullable(),
  session: timeSessionSchema,
  idempotent_replay: z.boolean(),
});
export type TimeCorrectionMutationResult = z.infer<
  typeof timeCorrectionMutationResultSchema
>;

export const approveTimeReviewWindowResultSchema = z.object({
  window: timeReviewWindowSchema,
  approved_session_count: z.coerce.number().int().positive(),
  idempotent_replay: z.boolean(),
});
export type ApproveTimeReviewWindowResult = z.infer<
  typeof approveTimeReviewWindowResultSchema
>;
