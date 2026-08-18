import { z } from "zod";

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/);
const availabilityDaySchema = z.object({
  day: z.number().int().min(0).max(6),
  mode: z.enum(["unavailable", "unrestricted", "windows"]),
  windows: z.array(z.object({ start: timeSchema, end: timeSchema })).max(4),
});
export const employeeHubAvailabilityInputSchema = z
  .object({
    timezone: z.string().trim().min(1).max(80),
    days: z.array(availabilityDaySchema).length(7),
  })
  .refine((value) => new Set(value.days.map((day) => day.day)).size === 7, {
    message: "Each weekday must be provided once",
    path: ["days"],
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
  start_time: timeSchema,
  end_time: timeSchema,
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
});

export const employeeHubReadModelSchema = z.object({
  workspace_id: z.string().uuid(),
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
  team: z.array(employeeHubTeamMemberSchema),
  lineup: z.array(employeeHubLineupEntrySchema),
});
export type EmployeeHubReadModel = z.infer<typeof employeeHubReadModelSchema>;

export const employeeTimeOffInputSchema = z.object({
  location_id: z.string().uuid(),
  reason: z.string().trim().max(1000).default(""),
  dates: z.array(z.string().date()).min(1).max(31),
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

export const employeeRequestActionInputSchema = z.object({
  request_id: z.string().uuid(),
  kind: z.enum(["time_off", "shift_change"]),
  action: z.enum(["cancel", "accept", "decline"]),
  expected_revision: z.number().int().positive(),
});
export type EmployeeRequestActionInput = z.infer<
  typeof employeeRequestActionInputSchema
>;

export const employeeHubMutationResultSchema = z.object({
  status: z.string().min(1),
  request_id: z.string().uuid().optional(),
  revision: z.number().int().positive().optional(),
});
export type EmployeeHubMutationResult = z.infer<
  typeof employeeHubMutationResultSchema
>;
