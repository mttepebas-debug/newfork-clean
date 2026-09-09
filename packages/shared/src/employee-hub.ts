import { z } from "zod";
import { timeOffCancellationContextSchema, timeOffCancellationPeriodSchema, timeOffDecisionEventSchema, timeOffPeriodInputSchema, timeOffPeriodReadSchema } from "./time-off";
import { availabilityPublicationLockSchema, weeklyAvailabilityInputSchema, shiftTimeBasisSchema, shiftTimeSnapshotSchema } from "./availability";

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/);
const employeeHubTimeFormatSchema = z.enum(["12h", "24h"]);
export const employeeHubAvailabilityInputSchema = weeklyAvailabilityInputSchema.safeExtend({
  effective_from: z.string().date().optional(),
  effective_until: z.string().date().nullable().optional(),
  expected_revision: z.number().int().nonnegative().optional(),
}).superRefine((value, ctx) => {
  if (value.effective_until && (!value.effective_from || value.effective_until < value.effective_from))
    ctx.addIssue({ code: "custom", path: ["effective_until"], message: "End date must follow the start date" });
  if (value.effective_from && value.expected_revision === undefined)
    ctx.addIssue({ code: "custom", path: ["expected_revision"], message: "Refresh availability before saving" });
});
export const employeeAvailabilityContextSchema = z.object({
  latest: weeklyAvailabilityInputSchema.safeExtend({
    effective_from: z.string().date(), effective_until: z.string().date().nullable(),
    revision: z.number().int().positive(), source: z.enum(["employee", "manager", "onboarding"]),
  }).nullable(),
  revision: z.number().int().nonnegative(),
  suggested_start: z.string().date(),
  published_periods: z.array(availabilityPublicationLockSchema),
});
export type EmployeeHubAvailabilityInput = z.infer<
  typeof employeeHubAvailabilityInputSchema
>;

export const employeeHubShiftSchema = z.object({
  id: z.string().uuid(),
  location_id: z.string().uuid(),
  location_name: z.string().min(1),
  job_name: z.string().min(1),
  scheduled_date: z.string().date(),
  start_time: z.preprocess((value) => value ?? "", z.union([timeSchema, z.literal("")])),
  end_time: z.preprocess((value) => value ?? "", z.union([timeSchema, z.literal("")])),
  time_basis: shiftTimeBasisSchema.optional(),
  time_snapshot: shiftTimeSnapshotSchema.nullable().optional(),
  time_timezone: z.string().nullable().optional(),
  note: z.string(),
  employee_id: z.string().uuid().nullable(),
  employee_name: z.string().nullable().optional(),
});
export type EmployeeHubShift = z.infer<typeof employeeHubShiftSchema>;

export const employeeHubRequestSchema = z.object({
  id: z.string().uuid(),
  shift_id: z.string().uuid().nullable().default(null),
  kind: z.enum(["time_off", "release", "pickup", "swap"]),
  status: z.string().min(1),
  title: z.string().min(1),
  detail: z.string(),
  revision: z.number().int().positive(),
  created_at: z.string().datetime({ offset: true }),
  can_cancel: z.boolean(),
  can_respond: z.boolean().default(false),
  periods: z.array(timeOffPeriodReadSchema).optional(),
  request_type: z.enum(["time_off", "time_off_cancellation"]).optional(),
  cancellation: timeOffCancellationContextSchema.optional(),
  decision_events: z.array(timeOffDecisionEventSchema).optional(),
});

export const employeeHubTeamMemberSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string().min(1),
  job_names: z.array(z.string()),
  location_names: z.array(z.string()),
});

export const employeeHubLineupEntrySchema = z.object({
  id: z.string().uuid(),
  lineup_date: z.string().date(),
  location_name: z.string().min(1),
  employee_name: z.string().min(1),
  job_name: z.string().nullable(),
  start_time: timeSchema.nullable(),
  end_time: timeSchema.nullable(),
  station: z.string(),
  section_name: z.string().nullable(),
  call_off: z.boolean(),
});

export const employeeHubLocationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  timezone: z.string().optional(),
});

export const employeeHubReadModelSchema = z.object({
  workspace_id: z.string().uuid(),
  settings: z
    .object({
      time_format: employeeHubTimeFormatSchema,
    })
    .default({ time_format: "12h" }),
  employee: z.object({
    id: z.string().uuid(),
    display_name: z.string().min(1),
  }),
  locations: z.array(employeeHubLocationSchema),
  shifts: z.array(employeeHubShiftSchema),
  open_shifts: z.array(employeeHubShiftSchema),
  team_shifts: z.array(employeeHubShiftSchema),
  requests: z.array(employeeHubRequestSchema),
  availability: employeeHubAvailabilityInputSchema.nullable(),
  availability_context: employeeAvailabilityContextSchema.optional(),
  team: z.array(employeeHubTeamMemberSchema),
  lineup: z.array(employeeHubLineupEntrySchema),
});
export type EmployeeHubReadModel = z.infer<typeof employeeHubReadModelSchema>;

export const employeePersonalTaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  completed: z.boolean(),
  created_at: z.string().datetime({ offset: true }),
});
export const employeePersonalTasksSchema = z.array(employeePersonalTaskSchema);
export type EmployeePersonalTask = z.infer<typeof employeePersonalTaskSchema>;
export const employeePersonalTaskInputSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("create"),
      id: z.string().uuid(),
      title: z.string().trim().min(1).max(160),
    })
    .strict(),
  z.object({ action: z.literal("complete"), id: z.string().uuid() }).strict(),
  z.object({ action: z.literal("reopen"), id: z.string().uuid() }).strict(),
  z.object({ action: z.literal("delete"), id: z.string().uuid() }).strict(),
]);
export type EmployeePersonalTaskInput = z.infer<
  typeof employeePersonalTaskInputSchema
>;

export const employeeTimeOffInputSchema = z.object({
  location_id: z.string().uuid(),
  reason: z.string().trim().max(1000).default(""),
  dates: z.array(z.string().date()).min(1).max(31).optional(),
  periods: z.array(timeOffPeriodInputSchema).min(1).max(124).optional(),
  request_id: z.string().uuid().optional(),
  expected_timezone: z.string().trim().min(1).max(64).optional(),
}).superRefine((value, ctx) => {
  if (Boolean(value.dates) === Boolean(value.periods))
    ctx.addIssue({ code: "custom", path: ["periods"], message: "Choose dates or specific periods for the request." });
  if (value.periods && !value.request_id)
    ctx.addIssue({ code: "custom", path: ["request_id"], message: "A request key is required for retrying these hours safely." });
  if (value.periods && !value.expected_timezone)
    ctx.addIssue({ code: "custom", path: ["expected_timezone"], message: "Refresh the location time zone before requesting hours." });
  if (value.periods && new Set(value.periods.map((p) => p.segment_date)).size > 31)
    ctx.addIssue({ code: "custom", path: ["periods"], message: "Request at most 31 calendar dates at a time." });
});
export type EmployeeTimeOffInput = z.infer<typeof employeeTimeOffInputSchema>;

export const employeeShiftRequestInputSchema = z
  .object({
    action: z.enum(["release", "pickup", "swap"]),
    shift_id: z.string().uuid(),
    requested_shift_id: z.string().uuid().optional(),
    note: z.string().trim().max(1000).default(""),
  })
  .superRefine((value, issue) => {
    if (value.action === "swap" && !value.requested_shift_id)
      issue.addIssue({
        code: "custom",
        path: ["requested_shift_id"],
        message: "A requested shift is required for a swap",
      });
    if (value.action !== "swap" && value.requested_shift_id)
      issue.addIssue({
        code: "custom",
        path: ["requested_shift_id"],
        message: "Only swaps accept a requested shift",
      });
  });
export type EmployeeShiftRequestInput = z.infer<
  typeof employeeShiftRequestInputSchema
>;

export const employeeRequestActionInputSchema = z.union([z.object({
  request_id: z.string().uuid(),
  kind: z.enum(["time_off", "shift_change"]),
  action: z.enum(["cancel", "accept", "decline"]),
  expected_revision: z.number().int().positive(),
}), z.object({
  request_id: z.string().uuid(), kind: z.literal("time_off"), action: z.literal("request_cancellation"),
  expected_revision: z.number().int().positive(), operation_id: z.string().uuid(),
  reason: z.string().trim().max(1000), periods: z.array(timeOffCancellationPeriodSchema).min(1).max(124),
}).superRefine((value, ctx) => {
  const ordered = [...value.periods].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  if (ordered.some((p, index) => index > 0 && Date.parse(p.starts_at) < Date.parse(ordered[index - 1]!.ends_at)))
    ctx.addIssue({ code: "custom", path: ["periods"], message: "Cancellation periods must not overlap." });
})]);
export type EmployeeRequestActionInput = z.infer<
  typeof employeeRequestActionInputSchema
>;

export const employeeHubMutationResultSchema = z.object({
  status: z.string().min(1),
  request_id: z.string().uuid().optional(),
  revision: z.number().int().nonnegative().optional(),
});
export type EmployeeHubMutationResult = z.infer<
  typeof employeeHubMutationResultSchema
>;
