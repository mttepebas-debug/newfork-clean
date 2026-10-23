import { z } from "zod";
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
  team: z.array(employeeHubTeamMemberSchema),
  // The days of the range with time off the person has, old system and new alike (time off rebuild D3).
  leave_days: z.array(z.string().date()).default([]),
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

