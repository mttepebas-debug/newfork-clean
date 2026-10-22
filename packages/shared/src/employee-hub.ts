import { z } from "zod";
import { timeOffCancellationContextSchema, timeOffDecisionEventSchema, timeOffPeriodReadSchema } from "./time-off";
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
  /** The shift's type ("Brunch", "Dinner"); only on the person's own shifts (Daylight Home). */
  shift_type_name: z.string().nullable().optional(),
  /** A teammate's shift in a Management department job: Home's "Manager on the floor". */
  is_management: z.boolean().optional(),
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
      // Settings > Scheduling: how long before time off starts it must be decided (FB-6.3).
      time_off_lead_hours: z.number().int().min(0).max(720).optional(),
    })
    .default({ time_format: "12h" }),
  // The primary location's zone a time-off request is asked in; null for somebody who works nowhere.
  time_off_timezone: z.string().min(1).nullable().optional(),
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
  // The days of the range with time off the person has, old system and new alike (time off rebuild D3).
  // Optional while an API without it may answer.
  leave_days: z.array(z.string().date()).optional(),
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

export const employeeRequestActionInputSchema = z.object({
  request_id: z.string().uuid(),
  kind: z.literal("time_off"),
  action: z.literal("cancel"),
  expected_revision: z.number().int().positive(),
});
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
