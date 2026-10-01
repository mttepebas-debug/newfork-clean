import { z } from "zod";
import { timeOffCancellationContextSchema, timeOffCancellationPeriodSchema, timeOffDecisionEventSchema, timeOffPeriodInputSchema, timeOffPeriodReadSchema } from "./time-off";
import { shiftTimeBasisSchema, shiftTimeSnapshotSchema } from "./availability";

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/);
const employeeHubTimeFormatSchema = z.enum(["12h", "24h"]);

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
  kind: z.literal("time_off"),
  status: z.string().min(1),
  title: z.string().min(1),
  detail: z.string(),
  revision: z.number().int().positive(),
  created_at: z.string().datetime({ offset: true }),
  can_cancel: z.boolean(),
  periods: z.array(timeOffPeriodReadSchema).optional(),
  request_type: z.enum(["time_off", "time_off_cancellation"]).optional(),
  cancellation: timeOffCancellationContextSchema.optional(),
  decision_events: z.array(timeOffDecisionEventSchema).optional(),
  // FB-6.3: "Pending" until it closes, then the outcome; never who voted.
  display_status: z.string().min(1).optional(),
  decide_by: z.string().datetime({ offset: true }).nullable().optional(),
});

export const employeeHubTeamMemberSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string().min(1),
  job_names: z.array(z.string()),
  location_names: z.array(z.string()),
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
  team: z.array(employeeHubTeamMemberSchema),
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

export const employeeRequestActionInputSchema = z.union([z.object({
  request_id: z.string().uuid(),
  kind: z.literal("time_off"),
  action: z.literal("cancel"),
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
