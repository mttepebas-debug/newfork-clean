import { z } from "zod";

export const healthResponseSchema = z.object({
  ok: z.literal(true),
  service: z.literal("newfork-api"),
  phase: z.literal("phase-10"),
});

export * from "./employee-hub";
export * from "./communications";
export * from "./time-capture";
export * from "./kiosk";

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const workspaceRoleSchema = z.enum([
  "owner",
  "admin",
  "manager",
  "employee",
]);
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;

export const permissionSchema = z.enum([
  "workspace.read",
  "workspace.manage",
  "schedule.read",
  "schedule.manage",
  "schedule.publish",
  "schedule.templates.manage",
  "schedule.export",
  "schedule.lineup.read",
  "schedule.lineup.manage",
  "schedule.lineup.share",
  "schedule.time_off_requests.read",
  "schedule.time_off_requests.manage",
  "schedule.shift_change_requests.read",
  "schedule.shift_change_requests.manage",
  "roles.read",
  "roles.manage",
  "documents.read",
  "documents.manage",
  "signature_templates.read",
  "signature_templates.manage",
  "employees.read",
  "employees.manage",
  "employees.archive",
  "employee_access.manage",
  "employee_onboarding.review",
  "employee_documents.review",
  "announcements.read",
  "announcements.manage",
  "notifications.read",
  "time.capture.own",
  "time.read.own",
  "time.correction.request.own",
  "time.read.location",
  "time.amend.location",
  "time.correction.review.location",
  "time.review.approve.location",
  "time.audit.read",
  "time.export.preview.location",
  "time.export.create.location",
  "time.export.read.location",
  "time.export.audit.read",
  "kiosk.device.enroll.location",
  "kiosk.device.read.location",
  "kiosk.device.revoke.location",
  "kiosk.pin.reset.location",
  "kiosk.audit.read.location",
]);
export type Permission = z.infer<typeof permissionSchema>;

const rolePermissions = {
  owner: permissionSchema.options,
  admin: permissionSchema.options,
  manager: [
    "workspace.read",
    "schedule.read",
    "schedule.manage",
    "schedule.publish",
    "schedule.templates.manage",
    "schedule.export",
    "schedule.lineup.read",
    "schedule.lineup.manage",
    "schedule.lineup.share",
    "schedule.time_off_requests.read",
    "schedule.time_off_requests.manage",
    "schedule.shift_change_requests.read",
    "schedule.shift_change_requests.manage",
    "employees.read",
    "employees.manage",
    "employee_onboarding.review",
    "announcements.read",
    "announcements.manage",
    "notifications.read",
    "time.capture.own",
    "time.read.own",
    "time.correction.request.own",
    "time.read.location",
    "time.amend.location",
    "time.correction.review.location",
    "time.review.approve.location",
    "time.export.preview.location",
    "time.export.create.location",
    "time.export.read.location",
    "time.export.audit.read",
    "kiosk.device.enroll.location",
    "kiosk.device.read.location",
    "kiosk.device.revoke.location",
    "kiosk.pin.reset.location",
    "kiosk.audit.read.location",
  ],
  employee: [
    "workspace.read",
    "schedule.read",
    "announcements.read",
    "notifications.read",
    "time.capture.own",
    "time.read.own",
    "time.correction.request.own",
  ],
} as const satisfies Record<WorkspaceRole, readonly Permission[]>;

export const workspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  logo_url: z.string().url().nullable().default(null),
  logo_file_name: z.string().trim().min(1).max(255).nullable().default(null),
  logo_updated_at: z
    .string()
    .datetime({ offset: true })
    .nullable()
    .default(null),
  schedule_logo_placement: z
    .object({
      scale: z.number().min(0.25).max(4),
      offset_x: z.number().min(-100).max(100),
      offset_y: z.number().min(-100).max(100),
    })
    .default({ scale: 1, offset_x: 0, offset_y: 0 }),
});
export type Workspace = z.infer<typeof workspaceSchema>;
export type ScheduleLogoPlacement = Workspace["schedule_logo_placement"];
export const defaultScheduleLogoPlacement: ScheduleLogoPlacement = {
  scale: 1,
  offset_x: 0,
  offset_y: 0,
};
export const organizationLogoMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/svg+xml",
] as const;
export const organizationLogoMaxBytes = 5 * 1024 * 1024;

export const workspaceMembershipSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  role: workspaceRoleSchema,
  roleId: z.string().uuid().optional(),
  roleName: z.string().trim().min(1).max(64).optional(),
  status: z.literal("active"),
  allLocations: z.boolean().default(true),
});
export type WorkspaceMembership = z.infer<typeof workspaceMembershipSchema>;

export const onboardingStatusSchema = z.enum(["incomplete", "complete"]);
export type OnboardingStatus = z.infer<typeof onboardingStatusSchema>;

export const workspaceOnboardingSchema = z.object({
  status: onboardingStatusSchema,
  currentStep: z.number().int().min(1).max(3),
});
export type WorkspaceOnboarding = z.infer<typeof workspaceOnboardingSchema>;

export const themePreferenceSchema = z.enum(["system", "light", "dark"]);
export type ThemePreference = z.infer<typeof themePreferenceSchema>;

export const accountProfileSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().trim().min(1).max(100),
  theme: themePreferenceSchema,
});
export type AccountProfile = z.infer<typeof accountProfileSchema>;

export const workspaceSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  role: workspaceRoleSchema,
  isActive: z.boolean(),
  onboarding: workspaceOnboardingSchema,
});
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;

export const workspaceSummaryRowSchema = z.object({
  workspace_id: z.string().uuid(),
  workspace_name: z.string().trim().min(1).max(120),
  workspace_role: workspaceRoleSchema,
  is_active: z.boolean(),
  onboarding_status: onboardingStatusSchema,
  onboarding_current_step: z.coerce.number().int().min(1).max(3),
});

export function workspaceSummaryFromRow(input: unknown): WorkspaceSummary {
  const row = workspaceSummaryRowSchema.parse(input);
  return workspaceSummarySchema.parse({
    id: row.workspace_id,
    name: row.workspace_name,
    role: row.workspace_role,
    isActive: row.is_active,
    onboarding: {
      status: row.onboarding_status,
      currentStep: row.onboarding_current_step,
    },
  });
}

export const activeWorkspaceContextSchema = z
  .object({
    userId: z.string().uuid(),
    workspace: workspaceSchema,
    membership: workspaceMembershipSchema,
    permissions: z.array(permissionSchema),
    onboarding: workspaceOnboardingSchema.default({
      status: "complete",
      currentStep: 2,
    }),
    locationScope: z
      .object({
        allLocations: z.boolean(),
        locationIds: z.array(z.string().uuid()),
      })
      .default({ allLocations: true, locationIds: [] }),
  })
  .superRefine((context, issue) => {
    if (context.userId !== context.membership.userId) {
      issue.addIssue({
        code: "custom",
        message: "Membership user does not match context user",
      });
    }
    if (context.workspace.id !== context.membership.workspaceId) {
      issue.addIssue({
        code: "custom",
        message: "Membership workspace does not match context",
      });
    }
  });
export type ActiveWorkspaceContext = z.infer<
  typeof activeWorkspaceContextSchema
>;

export const activeWorkspaceRowSchema = z.object({
  user_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  workspace_name: z.string().trim().min(1).max(120),
  workspace_logo_storage_path: z
    .string()
    .trim()
    .min(1)
    .nullable()
    .default(null),
  workspace_logo_file_name: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .nullable()
    .default(null),
  workspace_logo_updated_at: z
    .string()
    .datetime({ offset: true })
    .nullable()
    .default(null),
  schedule_logo_scale: z.coerce.number().min(0.25).max(4).default(1),
  schedule_logo_offset_x: z.coerce.number().min(-100).max(100).default(0),
  schedule_logo_offset_y: z.coerce.number().min(-100).max(100).default(0),
  membership_id: z.string().uuid(),
  workspace_role: workspaceRoleSchema,
  membership_role_id: z.string().uuid().optional(),
  membership_role_name: z.string().trim().min(1).max(64).optional(),
  permission_keys: z.array(permissionSchema).optional(),
  all_locations: z.boolean(),
  onboarding_status: onboardingStatusSchema.default("complete"),
  onboarding_current_step: z.coerce.number().int().min(1).max(3).default(2),
});
export type ActiveWorkspaceRow = z.infer<typeof activeWorkspaceRowSchema>;

export function activeWorkspaceContextFromRow(
  input: unknown,
  locationIds: readonly string[] = [],
): ActiveWorkspaceContext {
  const row = activeWorkspaceRowSchema.parse(input);
  return activeWorkspaceContextSchema.parse({
    userId: row.user_id,
    workspace: {
      id: row.workspace_id,
      name: row.workspace_name,
      logo_url: null,
      logo_file_name: row.workspace_logo_file_name,
      logo_updated_at: row.workspace_logo_updated_at,
      schedule_logo_placement: {
        scale: row.schedule_logo_scale,
        offset_x: row.schedule_logo_offset_x,
        offset_y: row.schedule_logo_offset_y,
      },
    },
    membership: {
      id: row.membership_id,
      userId: row.user_id,
      workspaceId: row.workspace_id,
      role: row.workspace_role,
      roleId: row.membership_role_id,
      roleName: row.membership_role_name,
      status: "active",
      allLocations: row.all_locations,
    },
    permissions: row.permission_keys ?? permissionsForRole(row.workspace_role),
    onboarding: {
      status: row.onboarding_status,
      currentStep: row.onboarding_current_step,
    },
    locationScope: {
      allLocations: row.all_locations,
      locationIds: row.all_locations ? [] : [...locationIds],
    },
  });
}

export function permissionsForRole(role: WorkspaceRole): readonly Permission[] {
  return rolePermissions[role];
}

export function canAccessWorkspace(
  context: ActiveWorkspaceContext,
  workspaceId: string,
  permission: Permission,
): boolean {
  return (
    context.workspace.id === workspaceId &&
    context.permissions.includes(permission)
  );
}

export const auditEventSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  actorUserId: z.string().uuid(),
  action: z.string().trim().min(1).max(120),
  targetType: z.string().trim().min(1).max(80),
  targetId: z.string().trim().min(1).max(160),
  occurredAt: z.string().datetime({ offset: true }),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;

const entityNameSchema = z.string().trim().min(1).max(100);
export const colorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Use a six-digit hex color");

export const locationSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  street_address: z.string().trim().min(1).max(180),
  city: z.string().trim().min(1).max(100),
  region: z.string().trim().min(1).max(100),
  postal_code: z.string().trim().min(1).max(20),
  country_code: z.string().regex(/^[A-Z]{2}$/),
  timezone: z.string().trim().min(1).max(80),
  sort_order: z.number().int().nonnegative(),
  archived_at: z.string().datetime({ offset: true }).nullable(),
});
export type Location = z.infer<typeof locationSchema>;

export const departmentSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  name: entityNameSchema,
  color: colorSchema,
  sort_order: z.number().int().nonnegative(),
  archived_at: z.string().datetime({ offset: true }).nullable(),
});
export type Department = z.infer<typeof departmentSchema>;

export const jobSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  department_id: z.string().uuid().nullable(),
  name: entityNameSchema,
  color: colorSchema,
  sort_order: z.number().int().nonnegative(),
  archived_at: z.string().datetime({ offset: true }).nullable(),
});
export type Job = z.infer<typeof jobSchema>;

export const locationInputSchema = locationSchema.pick({
  name: true,
  street_address: true,
  city: true,
  region: true,
  postal_code: true,
  country_code: true,
  timezone: true,
});
export type LocationInput = z.infer<typeof locationInputSchema>;

export const departmentInputSchema = departmentSchema.pick({
  name: true,
  color: true,
});
export type DepartmentInput = z.infer<typeof departmentInputSchema>;

export const jobInputSchema = jobSchema.pick({
  name: true,
  color: true,
  department_id: true,
});
export type JobInput = z.infer<typeof jobInputSchema>;

export const weekStartDaySchema = z.enum(["sunday", "monday"]);
export const scheduleDeadlineDaySchema = z.enum([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);
export const conflictPolicySchema = z.enum(["warn", "block"]);
export const availabilityEnforcementSchema = z.enum(["soft", "hard"]);
export const scheduleTimeFormatSchema = z.enum(["12h", "24h"]);

export const schedulingSettingsSchema = z.object({
  workspace_id: z.string().uuid(),
  week_start_day: weekStartDaySchema,
  schedule_deadline_day: scheduleDeadlineDaySchema,
  conflict_policy: conflictPolicySchema,
  availability_enforcement: availabilityEnforcementSchema,
  time_format: scheduleTimeFormatSchema,
});
export type SchedulingSettings = z.infer<typeof schedulingSettingsSchema>;
export const schedulingSettingsInputSchema = schedulingSettingsSchema.omit({
  workspace_id: true,
});
export type SchedulingSettingsInput = z.infer<
  typeof schedulingSettingsInputSchema
>;

export const importantDateTypeSchema = z.enum([
  "holiday",
  "event",
  "blackout",
  "closed_day",
]);
export type ImportantDateType = z.infer<typeof importantDateTypeSchema>;

export const importantDateRecurrenceSchema = z.enum(["none", "annual"]);
export type ImportantDateRecurrence = z.infer<
  typeof importantDateRecurrenceSchema
>;

export const importantDateSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  location_id: z.string().uuid().nullable(),
  location_name: z.string().trim().min(1).max(120).nullable(),
  title: z.string().trim().min(1).max(120),
  type: importantDateTypeSchema,
  starts_on: z.string().date(),
  ends_on: z.string().date(),
  recurrence: importantDateRecurrenceSchema,
  note: z.string().max(500),
  affects_scheduling: z.boolean(),
  archived_at: z.string().datetime({ offset: true }).nullable(),
});
export type ImportantDate = z.infer<typeof importantDateSchema>;

export const importantDateInputSchema = importantDateSchema
  .pick({
    location_id: true,
    title: true,
    type: true,
    starts_on: true,
    ends_on: true,
    recurrence: true,
    note: true,
    affects_scheduling: true,
  })
  .superRefine((value, issue) => {
    if (value.ends_on < value.starts_on) {
      issue.addIssue({
        code: "custom",
        message: "End date must be on or after the start date",
        path: ["ends_on"],
      });
    }
    if (value.type === "closed_day" && !value.affects_scheduling) {
      issue.addIssue({
        code: "custom",
        message: "Closed days must affect scheduling",
        path: ["affects_scheduling"],
      });
    }
  });
export type ImportantDateInput = z.infer<typeof importantDateInputSchema>;

const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const scheduleUnpaidBreakMinutesSchema = z.union([
  z.literal(0),
  z.literal(15),
  z.literal(30),
  z.literal(45),
  z.literal(60),
]);
export const shiftTypeSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
  color: colorSchema,
  default_start_time: timeOfDaySchema.nullable(),
  default_end_time: timeOfDaySchema.nullable(),
  crosses_midnight: z.boolean(),
  sort_order: z.number().int().nonnegative(),
  archived_at: z.string().datetime({ offset: true }).nullable(),
});
export type ShiftType = z.infer<typeof shiftTypeSchema>;

export const shiftTypeInputSchema = shiftTypeSchema
  .pick({
    name: true,
    color: true,
    default_start_time: true,
    default_end_time: true,
  })
  .refine(
    (value) =>
      Boolean(value.default_start_time) === Boolean(value.default_end_time),
    {
      message: "Start and end times must both be set",
      path: ["default_end_time"],
    },
  )
  .refine(
    (value) =>
      !value.default_start_time ||
      value.default_start_time !== value.default_end_time,
    {
      message: "Start and end times must be different",
      path: ["default_end_time"],
    },
  );
export type ShiftTypeInput = z.infer<typeof shiftTypeInputSchema>;

export const scheduleViewSchema = z.enum(["day", "week"]);
export type ScheduleView = z.infer<typeof scheduleViewSchema>;

export const scheduleLocationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  timezone: z.string().trim().min(1).max(80),
  sort_order: z.coerce.number().int().nonnegative(),
  publication_status: z.enum(["published", "unpublished"]),
  published_at: z.string().datetime({ offset: true }).nullable(),
});
export type ScheduleLocation = z.infer<typeof scheduleLocationSchema>;

export const scheduleReferenceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  color: colorSchema,
  sort_order: z.coerce.number().int().nonnegative(),
});

export const scheduleJobSchema = scheduleReferenceSchema.extend({
  department_id: z.string().uuid().nullable(),
});

export const scheduleShiftTypeSchema = scheduleReferenceSchema.extend({
  default_start_time: timeOfDaySchema.nullable(),
  default_end_time: timeOfDaySchema.nullable(),
});

export const scheduleShiftLabelSchema = scheduleReferenceSchema;
export type ScheduleShiftLabel = z.infer<typeof scheduleShiftLabelSchema>;

export const scheduleAvailabilityDaySchema = z.object({
  day: z.number().int().min(0).max(6),
  mode: z.enum(["unavailable", "unrestricted", "windows"]),
  windows: z.array(z.object({ start: timeOfDaySchema, end: timeOfDaySchema })),
});

export const scheduleEmployeeSchema = z.object({
  id: z.string().uuid(),
  employee_code: z.string().min(1).max(24),
  display_name: z.string().trim().min(1).max(161),
  location_ids: z.array(z.string().uuid()),
  job_ids: z.array(z.string().uuid()),
  shift_type_ids: z.array(z.string().uuid()).optional(),
  is_excluded_from_schedule: z.boolean().optional(),
  primary_job_id: z.string().uuid().nullable().optional(),
  availability: z.array(scheduleAvailabilityDaySchema).length(7).nullable(),
});
export type ScheduleEmployee = z.infer<typeof scheduleEmployeeSchema>;

export const scheduleShiftSchema = z.object({
  id: z.string().uuid(),
  location_id: z.string().uuid(),
  employee_id: z.string().uuid().nullable(),
  job_id: z.string().uuid(),
  shift_type_id: z.string().uuid().nullable(),
  scheduled_date: z.string().date(),
  start_time: timeOfDaySchema,
  end_time: timeOfDaySchema,
  crosses_midnight: z.boolean(),
  unpaid_break_minutes: scheduleUnpaidBreakMinutesSchema.optional().default(0),
  hide_time_on_badge: z.boolean().optional().default(false),
  label_ids: z.array(z.string().uuid()).optional(),
  label_names: z.array(z.string().trim().min(1).max(80)).optional(),
  note: z.string().max(500),
  warning_codes: z.array(
    z.enum(["availability", "closed_location", "overlap"]),
  ),
});
export type ScheduleShift = z.infer<typeof scheduleShiftSchema>;

export const scheduleClosureSchema = z.object({
  id: z.string().uuid(),
  location_id: z.string().uuid(),
  closed_date: z.string().date(),
  end_date: z.string().date().nullable().optional(),
  title: z.string().trim().min(1).max(120),
  is_all_day: z.boolean(),
  shift_type_ids: z.array(z.string().uuid()).default([]),
});

export const scheduleImportantDateSchema = z.object({
  id: z.string().uuid(),
  location_id: z.string().uuid().nullable(),
  title: z.string().trim().min(1).max(120),
  type: importantDateTypeSchema,
  starts_on: z.string().date(),
  ends_on: z.string().date(),
  recurrence: importantDateRecurrenceSchema.default("none"),
});

export const scheduleReadModelSchema = z.object({
  workspace_id: z.string().uuid(),
  week_start: z.string().date(),
  week_start_day: weekStartDaySchema,
  settings: z
    .object({
      time_format: scheduleTimeFormatSchema,
    })
    .default({ time_format: "12h" }),
  locations: z.array(scheduleLocationSchema),
  departments: z.array(scheduleReferenceSchema),
  jobs: z.array(scheduleJobSchema),
  shift_types: z.array(scheduleShiftTypeSchema),
  shift_labels: z.array(scheduleShiftLabelSchema).optional(),
  employees: z.array(scheduleEmployeeSchema),
  shifts: z.array(scheduleShiftSchema),
  closures: z.array(scheduleClosureSchema),
  important_dates: z.array(scheduleImportantDateSchema).default([]),
});
export type ScheduleReadModel = z.infer<typeof scheduleReadModelSchema>;

export const scheduleDraftSummarySchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  week_start: z.string().date(),
  name: z.string().trim().min(1).max(80),
  revision: z.coerce.number().int().positive(),
  created_by: z.string().uuid(),
  updated_by: z.string().uuid(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});
export type ScheduleDraftSummary = z.infer<typeof scheduleDraftSummarySchema>;

export const scheduleEditSourceSchema = z.enum(["blank", "published", "draft"]);
export type ScheduleEditSource = z.infer<typeof scheduleEditSourceSchema>;

export const scheduleEditableShiftSchema = scheduleShiftSchema
  .omit({
    warning_codes: true,
  })
  .extend({
    revision: z.coerce.number().int().positive(),
    warning_codes: scheduleShiftSchema.shape.warning_codes,
    source_published_shift_id: z.string().uuid().nullable().optional(),
    pending_op_type: z
      .enum(["create", "update", "delete"])
      .nullable()
      .optional(),
    locked: z.boolean().nullable().optional(),
  });
export type ScheduleEditableShift = z.infer<typeof scheduleEditableShiftSchema>;

export const scheduleEditSessionSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  week_start: z.string().date(),
  source_kind: scheduleEditSourceSchema,
  source_draft_id: z.string().uuid().nullable(),
  source_revision: z.coerce.number().int().nonnegative(),
  holder_user_id: z.string().uuid(),
  holder_name: z.string().trim().min(1).max(161),
  revision: z.coerce.number().int().positive(),
  dirty: z.boolean(),
  last_heartbeat: z.string().datetime({ offset: true }),
  expires_at: z.string().datetime({ offset: true }),
  shifts: z.array(scheduleEditableShiftSchema),
});
export type ScheduleEditSession = z.infer<typeof scheduleEditSessionSchema>;

export const scheduleEditAcquireResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.enum(["acquired", "resumed", "acquired_after_recovery"]),
    session: scheduleEditSessionSchema,
    recovered_draft_id: z.string().uuid().nullable().optional(),
  }),
  z.object({
    status: z.literal("conflict"),
    session_id: z.string().uuid().optional(),
    holder_name: z.string().trim().min(1).max(161),
    last_heartbeat: z.string().datetime({ offset: true }),
    expires_at: z.string().datetime({ offset: true }),
  }),
]);
export type ScheduleEditAcquireResult = z.infer<
  typeof scheduleEditAcquireResultSchema
>;

export const schedulePendingOpTypeSchema = z.enum([
  "create",
  "update",
  "delete",
]);
export type SchedulePendingOpType = z.infer<typeof schedulePendingOpTypeSchema>;
export const schedulePendingOpPayloadSchema = z
  .object({
    scheduled_date: z.string().date().optional(),
    start_time: timeOfDaySchema.optional(),
    end_time: timeOfDaySchema.optional(),
    unpaid_break_minutes: scheduleUnpaidBreakMinutesSchema.optional(),
    location_id: z
      .union([z.string().uuid(), z.literal(""), z.null()])
      .optional(),
    employee_id: z
      .union([z.string().uuid(), z.literal(""), z.null()])
      .optional(),
    shift_type_id: z
      .union([z.string().uuid(), z.literal(""), z.null()])
      .optional(),
    job_id: z.union([z.string().uuid(), z.literal(""), z.null()]).optional(),
    label_ids: z.array(z.string().uuid()).optional(),
    label_names: z.array(z.string().trim().min(1).max(80)).optional(),
    source_published_shift_id: z
      .union([z.string().uuid(), z.literal(""), z.null()])
      .optional(),
  })
  .passthrough();
export type SchedulePendingOpPayload = z.infer<
  typeof schedulePendingOpPayloadSchema
>;
export const schedulePendingOpSchema = z.object({
  id: z.string().uuid(),
  location_id: z.string().uuid(),
  week_start: z.string().date(),
  op_type: schedulePendingOpTypeSchema,
  target_shift_id: z.string().uuid().nullable(),
  target_draft_id: z.string().uuid().nullable().optional(),
  payload: schedulePendingOpPayloadSchema,
  created_by: z.string().uuid(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});
export type SchedulePendingOp = z.infer<typeof schedulePendingOpSchema>;
export const schedulePendingOpListSchema = z.object({
  pending_ops: z.array(schedulePendingOpSchema),
});
export const schedulePendingOpMutationResultSchema = z.object({
  status: z.string(),
  op_id: z.string().uuid().optional(),
});
export type SchedulePendingOpMutationResult = z.infer<
  typeof schedulePendingOpMutationResultSchema
>;
export const createSchedulePendingOpInputSchema = z.object({
  lock_id: z.string().uuid(),
  op_type: schedulePendingOpTypeSchema,
  target_shift_id: z.string().uuid().nullable().optional(),
  payload: schedulePendingOpPayloadSchema,
});
export type CreateSchedulePendingOpInput = z.infer<
  typeof createSchedulePendingOpInputSchema
>;
export const updateSchedulePendingOpInputSchema = z.object({
  payload: schedulePendingOpPayloadSchema,
});
export type UpdateSchedulePendingOpInput = z.infer<
  typeof updateSchedulePendingOpInputSchema
>;

export const schedulePublicationLocationStatusSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  color: colorSchema.nullable(),
  timezone: z.string().trim().min(1).max(80).nullable(),
  status: z.enum(["published", "unpublished"]),
  reason: z.enum([
    "active_publication_and_shifts",
    "worked_shifts_kept",
    "missing_publication",
    "no_published_shifts",
    "unpublished_draft",
  ]),
  publication_includes_location: z.boolean(),
  published_shift_count: z.coerce.number().int().nonnegative(),
  worked_shift_count: z.coerce.number().int().nonnegative(),
  draft_shift_count: z.coerce.number().int().nonnegative(),
  published_at: z.string().datetime({ offset: true }).nullable(),
  published_by_name: z.string().trim().min(1).max(161).nullable(),
});
export const schedulePublicationStatusSchema = z.object({
  week_start: z.string().date(),
  week_end: z.string().date(),
  week_start_day: weekStartDaySchema,
  schedule_deadline_day: scheduleDeadlineDaySchema,
  is_anchor_only: z.boolean(),
  locations: z.array(schedulePublicationLocationStatusSchema),
});
export type SchedulePublicationStatus = z.infer<
  typeof schedulePublicationStatusSchema
>;

export const scheduleShiftMutationInputSchema = scheduleShiftSchema
  .pick({
    location_id: true,
    employee_id: true,
    job_id: true,
    shift_type_id: true,
    scheduled_date: true,
    start_time: true,
    end_time: true,
    unpaid_break_minutes: true,
    hide_time_on_badge: true,
    label_ids: true,
    label_names: true,
    note: true,
  })
  .extend({
    unpaid_break_minutes: scheduleUnpaidBreakMinutesSchema
      .optional()
      .default(0),
    idempotency_key: z.string().uuid().optional(),
    conflict_override_note: z.string().trim().min(10).max(1000).optional(),
  });
export type ScheduleShiftMutationInput = z.infer<
  typeof scheduleShiftMutationInputSchema
>;

export const scheduleDraftListSchema = z.object({
  drafts: z.array(scheduleDraftSummarySchema),
});
export type ScheduleDraftList = z.infer<typeof scheduleDraftListSchema>;
export const legacyScheduleShiftListSchema = z.object({
  shifts: z.array(scheduleShiftSchema),
  ghost_shifts: z.array(scheduleShiftSchema).optional(),
});
export type LegacyScheduleShiftList = z.infer<
  typeof legacyScheduleShiftListSchema
>;
export const scheduleBulkDeleteResultSchema = z.object({
  deleted_count: z.coerce.number().int().nonnegative(),
  session: scheduleEditSessionSchema.optional(),
});
export type ScheduleBulkDeleteResult = z.infer<
  typeof scheduleBulkDeleteResultSchema
>;
export const scheduleDraftDeleteResultSchema = z.object({
  status: z.literal("deleted"),
  draft_id: z.string().uuid(),
});
export type ScheduleDraftDeleteResult = z.infer<
  typeof scheduleDraftDeleteResultSchema
>;
export const scheduleAvailabilityConflictSchema = z.object({
  employee_id: z.string().uuid(),
  employee_name: z.string().trim().min(1).max(161),
  shift_id: z.string().uuid(),
  location_id: z.string().uuid(),
  location_name: z.string().trim().min(1).max(120),
  date: z.string().date(),
  start_time: timeOfDaySchema,
  end_time: timeOfDaySchema,
  shift_type_label: z.string().trim().min(1).max(80).nullable(),
  job_name: z.string().trim().min(1).max(120).nullable(),
  warning_text: z.string().trim().min(1).max(500),
  conflict_fingerprint: z.string().min(1).max(64),
});
export type ScheduleAvailabilityConflict = z.infer<
  typeof scheduleAvailabilityConflictSchema
>;
export const scheduleAvailabilityConflictResultSchema = z.object({
  status: z.literal("ok"),
  conflicts: z.array(scheduleAvailabilityConflictSchema),
  fingerprint: z.string().min(1).max(64),
});
export type ScheduleAvailabilityConflictResult = z.infer<
  typeof scheduleAvailabilityConflictResultSchema
>;

export const schedulePublishFindingCodeSchema = z.enum([
  "overlap",
  "availability",
  "closed_location",
  "double_booking",
  "time_off",
  "closed_day",
  "clopening",
  "advance_notice",
  "solo_opener",
]);
export const schedulePublishFindingSchema = z.object({
  id: z.string().min(12).max(64),
  code: schedulePublishFindingCodeSchema,
  severity: z.enum(["hard", "soft"]),
  overrideable: z.boolean(),
  tier: z.enum(["blocker", "risk", "note"]).optional(),
  projected: z.boolean().optional(),
  introduced: z.boolean().optional(),
  fix_hint: z.string().trim().min(1).max(500).nullable().optional(),
  message: z.string().trim().min(1).max(500),
  location_id: z.string().uuid(),
  location_name: z.string().trim().min(1).max(120).nullable().optional(),
  employee_id: z.string().uuid().nullable(),
  employee_name: z.string().trim().min(1).max(161).nullable().optional(),
  scheduled_date: z.string().date(),
  date: z.string().date().nullable().optional(),
  shift_ids: z.array(z.string().uuid()).min(1),
});
export type SchedulePublishFinding = z.infer<
  typeof schedulePublishFindingSchema
>;

export const schedulePublicationLocationPreviewSchema = z.object({
  location_id: z.string().uuid(),
  location_name: z.string().trim().min(1).max(120),
  active_publication_id: z.string().uuid().nullable(),
  active_version: z.coerce.number().int().positive().nullable(),
  current_shift_count: z.coerce.number().int().nonnegative(),
  next_shift_count: z.coerce.number().int().nonnegative(),
  added: z.coerce.number().int().nonnegative(),
  updated: z.coerce.number().int().nonnegative(),
  removed: z.coerce.number().int().nonnegative(),
  unchanged: z.coerce.number().int().nonnegative(),
  affected_employee_ids: z.array(z.string().uuid()).default([]),
});
export type SchedulePublicationLocationPreview = z.infer<
  typeof schedulePublicationLocationPreviewSchema
>;

export const schedulePublicationPreviewSchema = z.object({
  status: z.enum([
    "publish_ready",
    "hard_blocked",
    "override_required",
    "past_week_closed",
  ]),
  workspace_id: z.string().uuid(),
  week_start: z.string().date(),
  draft_id: z.string().uuid(),
  draft_revision: z.coerce.number().int().positive(),
  fingerprint: z.string().min(32).max(128),
  locations: z.array(schedulePublicationLocationPreviewSchema),
  findings: z.array(schedulePublishFindingSchema),
});
export type SchedulePublicationPreview = z.infer<
  typeof schedulePublicationPreviewSchema
>;

export const schedulePublicationOverrideInputSchema = z.object({
  finding_id: z.string().min(12).max(64),
  reason: z.string().trim().min(10).max(500),
});
export type SchedulePublicationOverrideInput = z.infer<
  typeof schedulePublicationOverrideInputSchema
>;

export const schedulePublicationPreflightAckSchema = z.object({
  fingerprint: z.string().min(32).max(128),
  decisions: z
    .array(schedulePublicationOverrideInputSchema)
    .max(200)
    .optional(),
});
export type SchedulePublicationPreflightAck = z.infer<
  typeof schedulePublicationPreflightAckSchema
>;

export const schedulePublishConflictShiftSummarySchema = z.object({
  shift_id: z.string().uuid(),
  location_id: z.string().uuid().optional(),
  location_name: z.string().trim().min(1).max(120).nullable().optional(),
  time_range: z.string().trim().min(1).max(80),
  shift_type: z.string().trim().min(1).max(80).nullable().optional(),
});
export type SchedulePublishConflictShiftSummary = z.infer<
  typeof schedulePublishConflictShiftSummarySchema
>;

export const schedulePublishConflictSummarySchema = z.object({
  employee_id: z.string().uuid(),
  employee_name: z.string().trim().min(1).max(161).nullable(),
  date: z.string().date(),
  reason: z.enum(["same_named_shift_type", "time_overlap"]).optional(),
  first: schedulePublishConflictShiftSummarySchema,
  second: schedulePublishConflictShiftSummarySchema,
  introduced: z.boolean().optional(),
});
export type SchedulePublishConflictSummary = z.infer<
  typeof schedulePublishConflictSummarySchema
>;

export const schedulePublicationPreflightBlockReasonSchema = z.enum([
  "unacknowledged",
  "stale_fingerprint",
  "not_overrideable",
  "missing_reason",
]);
export type SchedulePublicationPreflightBlockReason = z.infer<
  typeof schedulePublicationPreflightBlockReasonSchema
>;

export const schedulePublishPublishedResultSchema = z.object({
  status: z.literal("published"),
  workspace_id: z.string().uuid(),
  week_start: z.string().date(),
  draft_id: z.string().uuid(),
  draft_revision: z.coerce.number().int().positive(),
  location_ids: z.array(z.string().uuid()).min(1),
  publication_ids: z.array(z.string().uuid()).min(1),
  published_shift_count: z.coerce.number().int().nonnegative(),
  notification_count: z.coerce.number().int().nonnegative().optional(),
  published_at: z.string().datetime({ offset: true }),
});
export type SchedulePublishPublishedResult = z.infer<
  typeof schedulePublishPublishedResultSchema
>;

export const schedulePublishStaleBaselineResultSchema = z.object({
  status: z.literal("stale_baseline"),
  fingerprint: z.string().min(1).max(128).optional(),
});
export type SchedulePublishStaleBaselineResult = z.infer<
  typeof schedulePublishStaleBaselineResultSchema
>;

export const schedulePublishScheduleConflictsResultSchema = z.object({
  status: z.literal("schedule_conflicts"),
  schedule_conflicts: z.array(schedulePublishConflictSummarySchema).default([]),
});
export type SchedulePublishScheduleConflictsResult = z.infer<
  typeof schedulePublishScheduleConflictsResultSchema
>;

export const schedulePublishPreflightResultSchema = z.object({
  status: z.literal("preflight"),
  preflight: schedulePublicationPreviewSchema,
  preflight_block_reason:
    schedulePublicationPreflightBlockReasonSchema.optional(),
  fingerprint: z.string().min(1).max(128).optional(),
});
export type SchedulePublishPreflightResult = z.infer<
  typeof schedulePublishPreflightResultSchema
>;

export const schedulePublishResultSchema = z.discriminatedUnion("status", [
  schedulePublishPublishedResultSchema,
  schedulePublishStaleBaselineResultSchema,
  schedulePublishScheduleConflictsResultSchema,
  schedulePublishPreflightResultSchema,
]);
export type SchedulePublishResult = z.infer<typeof schedulePublishResultSchema>;

export const scheduleUnpublishPreviewSchema = z.object({
  status: z.enum(["unpublish_ready", "past_week_closed"]),
  workspace_id: z.string().uuid(),
  week_start: z.string().date(),
  locations: z.array(
    z.object({
      location_id: z.string().uuid(),
      location_name: z.string().trim().min(1).max(120),
      publication_id: z.string().uuid(),
      version: z.coerce.number().int().positive(),
      shift_count: z.coerce.number().int().nonnegative(),
    }),
  ),
  fingerprint: z.string().min(32).max(128),
});
export type ScheduleUnpublishPreview = z.infer<
  typeof scheduleUnpublishPreviewSchema
>;

export const scheduleUnpublishResultSchema = z.object({
  status: z.literal("unpublished"),
  workspace_id: z.string().uuid(),
  week_start: z.string().date(),
  location_ids: z.array(z.string().uuid()).min(1),
  publication_ids: z.array(z.string().uuid()).min(1),
  kept_worked_count: z.coerce.number().int().nonnegative().default(0),
  unpublished_at: z.string().datetime({ offset: true }),
});
export type ScheduleUnpublishResult = z.infer<
  typeof scheduleUnpublishResultSchema
>;

export const schedulePublicationHistorySchema = z.object({
  workspace_id: z.string().uuid(),
  week_start: z.string().date(),
  publications: z.array(
    z.object({
      id: z.string().uuid(),
      location_id: z.string().uuid(),
      location_name: z.string().trim().min(1).max(120),
      version: z.coerce.number().int().positive(),
      status: z.enum(["current", "superseded", "unpublished"]),
      source_draft_id: z.string().uuid().nullable(),
      source_draft_revision: z.coerce.number().int().positive().nullable(),
      shift_count: z.coerce.number().int().nonnegative(),
      published_at: z.string().datetime({ offset: true }),
      unpublished_at: z.string().datetime({ offset: true }).nullable(),
      superseded_by: z.string().uuid().nullable(),
    }),
  ),
});
export type SchedulePublicationHistory = z.infer<
  typeof schedulePublicationHistorySchema
>;

export const scheduleTemplateSummarySchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  revision: z.coerce.number().int().positive(),
  shift_count: z.coerce.number().int().nonnegative(),
  open_slot_count: z.coerce.number().int().nonnegative(),
  created_by_name: z.string().trim().min(1).max(100),
  updated_at: z.string().datetime({ offset: true }),
});
export type ScheduleTemplateSummary = z.infer<
  typeof scheduleTemplateSummarySchema
>;

export const scheduleTemplateShiftSchema = z.object({
  id: z.string().uuid(),
  location_id: z.string().uuid(),
  employee_id: z.string().uuid().nullable(),
  job_id: z.string().uuid(),
  shift_type_id: z.string().uuid().nullable(),
  day_offset: z.coerce.number().int().min(0).max(6),
  start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  crosses_midnight: z.boolean(),
  label_ids: z.array(z.string().uuid()).optional(),
  label_names: z.array(z.string().trim().min(1).max(80)).optional(),
  note: z.string().max(500),
});
export const scheduleTemplateDetailSchema = z.object({
  template: scheduleTemplateSummarySchema,
  shifts: z.array(scheduleTemplateShiftSchema),
});
export type ScheduleTemplateDetail = z.infer<
  typeof scheduleTemplateDetailSchema
>;

export const scheduleTemplateListSchema = z.object({
  templates: z.array(scheduleTemplateSummarySchema),
});
export type ScheduleTemplateList = z.infer<typeof scheduleTemplateListSchema>;

export const scheduleTemplateApplyResultSchema = z.object({
  status: z.literal("applied"),
  mode: z.enum(["merge", "overwrite"]),
  applied_shift_count: z.coerce.number().int().nonnegative(),
  converted_open_count: z.coerce.number().int().nonnegative(),
  session: scheduleEditSessionSchema,
});
export type ScheduleTemplateApplyResult = z.infer<
  typeof scheduleTemplateApplyResultSchema
>;

export const scheduleAutoFillCandidateSchema = z.object({
  employee_id: z.string().uuid(),
  employee_name: z.string().trim().min(1).max(161),
  scheduled_minutes: z.coerce.number().int().nonnegative(),
  primary_job: z.boolean(),
  reasons: z.array(z.string().trim().min(1).max(120)).min(1),
});
export const scheduleAutoFillProposalSchema = z.object({
  shift_id: z.string().uuid(),
  location_name: z.string().trim().min(1).max(120),
  job_name: z.string().trim().min(1).max(120),
  scheduled_date: z.string().date(),
  start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  recommended_employee_id: z.string().uuid(),
  candidates: z.array(scheduleAutoFillCandidateSchema).min(1),
});
export const scheduleAutoFillPreviewSchema = z.object({
  status: z.literal("review_ready"),
  workspace_id: z.string().uuid(),
  session_id: z.string().uuid(),
  session_revision: z.coerce.number().int().positive(),
  fingerprint: z.string().length(64),
  proposals: z.array(scheduleAutoFillProposalSchema),
  unfilled: z.array(
    z.object({
      shift_id: z.string().uuid(),
      reason: z.string().trim().min(1).max(240),
    }),
  ),
});
export type ScheduleAutoFillPreview = z.infer<
  typeof scheduleAutoFillPreviewSchema
>;

export const scheduleAutoFillAssignmentSchema = z.object({
  shift_id: z.string().uuid(),
  employee_id: z.string().uuid(),
});
export type ScheduleAutoFillAssignment = z.infer<
  typeof scheduleAutoFillAssignmentSchema
>;
export const scheduleAutoFillApplyResultSchema = z.object({
  status: z.literal("applied"),
  applied: z.array(scheduleAutoFillAssignmentSchema),
  rejected: z.array(
    z.object({
      shift_id: z.string().uuid(),
      reason: z.string().trim().min(1).max(240),
    }),
  ),
  session: scheduleEditSessionSchema,
});
export type ScheduleAutoFillApplyResult = z.infer<
  typeof scheduleAutoFillApplyResultSchema
>;

export const scheduleExportSettingsSchema = z.object({
  format: z.enum(["pdf", "csv", "print", "xlsx"]),
  layout: z.enum(["weekly", "daily", "daily_roster"]),
  locale: z.enum(["en", "tr", "es"]).optional(),
  time_format: z.enum(["12h", "24h"]),
  paper_size: z.enum(["a4", "letter"]).optional(),
  orientation: z.enum(["auto", "portrait", "landscape"]).optional(),
  fit_mode: z.enum(["auto", "fit_to_page", "one_location_per_page"]).optional(),
  include_unassigned: z.boolean(),
  include_notes: z.boolean(),
  include_scheduled_hours: z.boolean(),
  show_shift_type: z.boolean().optional(),
  show_labels: z.boolean().optional(),
  show_clock_in_out: z.boolean().optional(),
  show_role_separators: z.boolean().optional(),
  show_preset_shift_badges: z.boolean().optional(),
  csv_delimiter: z.enum([",", ";"]),
});
export type ScheduleExportSettings = z.infer<
  typeof scheduleExportSettingsSchema
>;
export const scheduleExportSourceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("published") }),
  z.object({ type: z.literal("draft"), draft_id: z.string().uuid() }),
]);
export type ScheduleExportSource = z.infer<typeof scheduleExportSourceSchema>;
export const scheduleExportRequestSchema = z.object({
  week_start: z.string().date(),
  source: scheduleExportSourceSchema,
  location_ids: z.array(z.string().uuid()).min(1),
  settings: scheduleExportSettingsSchema,
});
export type ScheduleExportRequest = z.infer<typeof scheduleExportRequestSchema>;
export const scheduleExportRowSchema = z.object({
  shift_id: z.string().uuid(),
  scheduled_date: z.string().date(),
  location_name: z.string().trim().min(1).max(120),
  employee_name: z.string().trim().min(1).max(161).nullable(),
  job_name: z.string().trim().min(1).max(120),
  shift_type_name: z.string().trim().min(1).max(80).nullable(),
  label_names: z.array(z.string().trim().min(1).max(80)).optional(),
  start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  crosses_midnight: z.boolean(),
  note: z.string().max(500),
  scheduled_minutes: z.coerce.number().int().positive(),
});
export const scheduleExportPreviewSchema = z.object({
  status: z.literal("export_ready"),
  workspace_id: z.string().uuid(),
  workspace_name: z.string().trim().min(1).max(120),
  week_start: z.string().date(),
  source: scheduleExportSourceSchema,
  source_revision: z.coerce.number().int().positive().nullable(),
  fingerprint: z.string().length(64),
  locations: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(120),
    }),
  ),
  rows: z.array(scheduleExportRowSchema),
  summary: z.object({
    shift_count: z.coerce.number().int().nonnegative(),
    employee_count: z.coerce.number().int().nonnegative(),
    scheduled_minutes: z.coerce.number().int().nonnegative(),
  }),
  warnings: z
    .array(
      z.object({
        code: z.string().trim().min(1).max(80),
        severity: z.enum(["info", "warning"]),
        message: z.string().trim().min(1).max(240),
      }),
    )
    .optional(),
});
export type ScheduleExportPreview = z.infer<typeof scheduleExportPreviewSchema>;
export const scheduleExportPresetSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  settings: scheduleExportSettingsSchema,
  created_by: z.string().uuid(),
  updated_at: z.string().datetime({ offset: true }),
});
export type ScheduleExportPreset = z.infer<typeof scheduleExportPresetSchema>;
export const scheduleExportPresetListSchema = z.object({
  presets: z.array(scheduleExportPresetSchema),
});
export const scheduleExportScheduleSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  preset_id: z.string().uuid(),
  preset_name: z.string().trim().min(1).max(80).nullable(),
  name: z.string().trim().min(1).max(80),
  recipients: z.array(z.string().email()).min(1).max(10),
  location_ids: z.array(z.string().uuid()).default([]),
  day_of_week: z.coerce.number().int().min(0).max(6),
  send_hour: z.coerce.number().int().min(0).max(23),
  timezone: z.string().trim().min(1).max(80),
  enabled: z.boolean(),
  last_sent_at: z.string().datetime({ offset: true }).nullable(),
  consecutive_failures: z.coerce.number().int().nonnegative(),
  last_error: z.string().max(500).nullable(),
  auto_disabled_at: z.string().datetime({ offset: true }).nullable(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});
export type ScheduleExportSchedule = z.infer<
  typeof scheduleExportScheduleSchema
>;
export const scheduleExportScheduleListSchema = z.object({
  schedules: z.array(scheduleExportScheduleSchema),
});
export const scheduleRecentExportEventSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  surface: z.string().trim().min(1).max(80),
  format: z.string().trim().min(1).max(20),
  params: z.record(z.string(), z.unknown()),
  actor_user_id: z.string().uuid().nullable(),
  created_at: z.string().datetime({ offset: true }),
});
export type ScheduleRecentExportEvent = z.infer<
  typeof scheduleRecentExportEventSchema
>;
export const scheduleRecentExportEventListSchema = z.object({
  events: z.array(scheduleRecentExportEventSchema),
});
export const createScheduleExportScheduleInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  preset_id: z.string().uuid(),
  recipients: z.array(z.string().email()).min(1).max(10),
  location_ids: z.array(z.string().uuid()).min(1).max(100),
  day_of_week: z.coerce.number().int().min(0).max(6),
  send_hour: z.coerce.number().int().min(0).max(23),
  timezone: z.string().trim().min(1).max(80),
});
export type CreateScheduleExportScheduleInput = z.infer<
  typeof createScheduleExportScheduleInputSchema
>;
export const updateScheduleExportScheduleInputSchema =
  createScheduleExportScheduleInputSchema.partial().extend({
    enabled: z.boolean().optional(),
  });
export type UpdateScheduleExportScheduleInput = z.infer<
  typeof updateScheduleExportScheduleInputSchema
>;

export const scheduleLineupSectionSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  sort_order: z.coerce.number().int().nonnegative(),
  revision: z.coerce.number().int().positive(),
});
export type ScheduleLineupSection = z.infer<typeof scheduleLineupSectionSchema>;
export const scheduleLineupSectionInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  sort_order: z.number().int().nonnegative(),
});
export type ScheduleLineupSectionInput = z.infer<
  typeof scheduleLineupSectionInputSchema
>;
export const scheduleLineupSectionArchiveResultSchema = z.object({
  status: z.literal("archived"),
  id: z.string().uuid(),
});

export const scheduleLineupPresenceSchema = z.object({
  location_id: z.string().uuid(),
  location_name: z.string().trim().min(1).max(120),
  start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});
export const scheduleLineupEmployeeOptionSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string().trim().min(1).max(161),
  employee_code: z.string().trim().max(40).nullable(),
  location_ids: z.array(z.string().uuid()),
  job_ids: z.array(z.string().uuid()),
  presences: z.array(scheduleLineupPresenceSchema),
});
export type ScheduleLineupEmployeeOption = z.infer<
  typeof scheduleLineupEmployeeOptionSchema
>;

export const scheduleLineupEntrySchema = z.object({
  id: z.string().uuid(),
  overlay_id: z.string().uuid().nullable(),
  source_shift_id: z.string().uuid().nullable(),
  is_manual: z.boolean(),
  orphaned: z.boolean(),
  employee_id: z.string().uuid().nullable(),
  employee_name: z.string().trim().max(161),
  job_id: z.string().uuid().nullable(),
  job_name: z.string().trim().max(120),
  shift_type_id: z.string().uuid().nullable(),
  shift_type_name: z.string().trim().max(80),
  start_time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
  end_time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
  section_id: z.string().uuid().nullable(),
  section_name: z.string().trim().max(80),
  station: z.string().trim().max(80),
  call_off: z.boolean(),
  hidden: z.boolean(),
  display_order: z.coerce.number().int().nonnegative(),
  revision: z.coerce.number().int().positive().nullable(),
});
export type ScheduleLineupEntry = z.infer<typeof scheduleLineupEntrySchema>;

export const scheduleLineupBriefSchema = z.object({
  shift_type_id: z.string().uuid(),
  out_of_stock: z.string().max(1000),
  specials: z.string().max(1000),
  pre_shift_notes: z.string().max(2000),
  revision: z.coerce.number().int().positive(),
});
export type ScheduleLineupBrief = z.infer<typeof scheduleLineupBriefSchema>;

export const scheduleLineupLocationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  timezone: z.string().trim().min(1).max(80),
  lineup_id: z.string().uuid().nullable(),
  revision: z.coerce.number().int().positive().nullable(),
  shared_at: z.string().datetime({ offset: true }).nullable(),
  share_version: z.coerce.number().int().nonnegative(),
  entries: z.array(scheduleLineupEntrySchema),
  briefs: z.array(scheduleLineupBriefSchema),
  summary: z.object({
    active_entries: z.coerce.number().int().nonnegative(),
    open_rows: z.coerce.number().int().nonnegative(),
    called_off: z.coerce.number().int().nonnegative(),
  }),
});
export type ScheduleLineupLocation = z.infer<
  typeof scheduleLineupLocationSchema
>;

export const scheduleLineupReadModelSchema = z.object({
  workspace_id: z.string().uuid(),
  date: z.string().date(),
  source: z.literal("published"),
  locations: z.array(scheduleLineupLocationSchema),
  sections: z.array(scheduleLineupSectionSchema),
  jobs: z.array(scheduleJobSchema),
  shift_types: z.array(scheduleShiftTypeSchema),
  employees: z.array(scheduleLineupEmployeeOptionSchema),
});
export type ScheduleLineupReadModel = z.infer<
  typeof scheduleLineupReadModelSchema
>;

export const scheduleLineupEntryInputSchema = z.object({
  source_shift_id: z.string().uuid().nullable(),
  employee_id: z.string().uuid().nullable(),
  job_id: z.string().uuid().nullable(),
  shift_type_id: z.string().uuid().nullable(),
  start_time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
  end_time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
  section_id: z.string().uuid().nullable(),
  station: z.string().trim().max(80),
  call_off: z.boolean(),
  hidden: z.boolean(),
  display_order: z.number().int().nonnegative(),
});
export type ScheduleLineupEntryInput = z.infer<
  typeof scheduleLineupEntryInputSchema
>;

export const scheduleLineupEntryMoveInputSchema = z.object({
  source_entry_id: z.string().uuid(),
  target_location_id: z.string().uuid(),
  target_date: z.string().date(),
  target_section_id: z.string().uuid().nullable().optional(),
  display_order: z.number().int().nonnegative().optional(),
});
export type ScheduleLineupEntryMoveInput = z.infer<
  typeof scheduleLineupEntryMoveInputSchema
>;

export const scheduleLineupEntryMutationResultSchema = z.object({
  status: z.enum(["saved", "deleted"]),
  lineup_id: z.string().uuid(),
  lineup_revision: z.coerce.number().int().positive(),
  entry_id: z.string().uuid().nullable(),
  entry_revision: z.coerce.number().int().positive().nullable(),
});
export type ScheduleLineupEntryMutationResult = z.infer<
  typeof scheduleLineupEntryMutationResultSchema
>;

export const scheduleLineupSharePreviewSchema = z.object({
  status: z.literal("share_ready"),
  workspace_id: z.string().uuid(),
  date: z.string().date(),
  fingerprint: z.string().length(64),
  locations: z.array(
    z.object({
      location_id: z.string().uuid(),
      location_name: z.string().trim().min(1).max(120),
      current_version: z.coerce.number().int().nonnegative(),
      entry_count: z.coerce.number().int().nonnegative(),
      added: z.coerce.number().int().nonnegative(),
      updated: z.coerce.number().int().nonnegative(),
      removed: z.coerce.number().int().nonnegative(),
    }),
  ),
});
export type ScheduleLineupSharePreview = z.infer<
  typeof scheduleLineupSharePreviewSchema
>;

export const scheduleLineupShareResultSchema = z.object({
  status: z.literal("shared"),
  workspace_id: z.string().uuid(),
  date: z.string().date(),
  location_ids: z.array(z.string().uuid()),
  snapshot_ids: z.array(z.string().uuid()),
  shared_at: z.string().datetime({ offset: true }),
});
export type ScheduleLineupShareResult = z.infer<
  typeof scheduleLineupShareResultSchema
>;

export const scheduleRequestEventSchema = z.object({
  id: z.string().uuid(),
  action: z.string().trim().min(1).max(48),
  actor_name: z.string().trim().min(1).max(160),
  note: z.string().max(1000),
  created_at: z.string().datetime({ offset: true }),
});
export type ScheduleRequestEvent = z.infer<typeof scheduleRequestEventSchema>;

export const timeOffRequestStatusSchema = z.enum([
  "pending",
  "approved",
  "denied",
  "partially_approved",
  "revoked",
]);
export const timeOffSegmentStatusSchema = z.enum([
  "pending",
  "approved",
  "denied",
]);
export const timeOffRequestSegmentSchema = z.object({
  id: z.string().uuid(),
  segment_date: z.string().date(),
  start_time: z.string().nullable(),
  end_time: z.string().nullable(),
  status: timeOffSegmentStatusSchema,
});
export const timeOffRequestSchema = z.object({
  id: z.string().uuid(),
  employee_id: z.string().uuid(),
  employee_name: z.string().trim().min(1).max(160),
  location_id: z.string().uuid(),
  location_name: z.string().trim().min(1).max(120),
  request_type: z.enum(["time_off", "time_off_cancellation"]),
  reason: z.string().max(1000),
  status: timeOffRequestStatusSchema,
  start_date: z.string().date(),
  end_date: z.string().date(),
  revision: z.number().int().positive(),
  viewed_at: z.string().datetime({ offset: true }).nullable(),
  created_at: z.string().datetime({ offset: true }),
  conflict_count: z.number().int().nonnegative(),
  segments: z.array(timeOffRequestSegmentSchema),
  events: z.array(scheduleRequestEventSchema),
});
export type TimeOffRequest = z.infer<typeof timeOffRequestSchema>;

export const shiftChangeRequestTypeSchema = z.enum([
  "release_pickup",
  "direct_coverage",
  "direct_swap",
]);
export const shiftChangeRequestStatusSchema = z.enum([
  "pending_manager_approval",
  "approved",
  "rejected",
  "cancelled",
  "expired",
]);
export const shiftChangeConflictSchema = z.object({
  code: z.string().trim().min(1).max(64),
  severity: z.enum(["hard", "soft"]),
  message: z.string().trim().min(1).max(240),
});
export const shiftChangeShiftSchema = z.object({
  id: z.string().uuid(),
  location_id: z.string().uuid(),
  location_name: z.string().trim().min(1).max(120),
  scheduled_date: z.string().date(),
  start_time: z.string(),
  end_time: z.string(),
  employee_id: z.string().uuid().nullable(),
  employee_name: z.string().trim().min(1).max(160).nullable(),
  job_name: z.string().trim().min(1).max(120),
});
export const shiftChangeParticipantSchema = z.object({
  employee_id: z.string().uuid(),
  employee_name: z.string().trim().min(1).max(160),
  role: z.enum(["requester", "giver", "receiver"]),
});
export const shiftChangeRequestSchema = z.object({
  id: z.string().uuid(),
  request_type: shiftChangeRequestTypeSchema,
  status: shiftChangeRequestStatusSchema,
  revision: z.number().int().positive(),
  note: z.string().max(1000),
  created_at: z.string().datetime({ offset: true }),
  offered_shift: shiftChangeShiftSchema,
  requested_shift: shiftChangeShiftSchema.nullable(),
  participants: z.array(shiftChangeParticipantSchema),
  conflicts: z.array(shiftChangeConflictSchema),
  events: z.array(scheduleRequestEventSchema),
});
export type ShiftChangeRequest = z.infer<typeof shiftChangeRequestSchema>;

export const scheduleRequestsReadModelSchema = z.object({
  workspace_id: z.string().uuid(),
  locations: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(120),
    }),
  ),
  time_off_pending_count: z.number().int().nonnegative(),
  shift_change_pending_count: z.number().int().nonnegative(),
  time_off_next_cursor: z.string().datetime({ offset: true }).nullable(),
  shift_change_next_cursor: z.string().datetime({ offset: true }).nullable(),
  time_off_requests: z.array(timeOffRequestSchema),
  shift_change_requests: z.array(shiftChangeRequestSchema),
});
export type ScheduleRequestsReadModel = z.infer<
  typeof scheduleRequestsReadModelSchema
>;

export const timeOffSegmentDecisionSchema = z.object({
  segment_id: z.string().uuid(),
  status: z.enum(["approved", "denied"]),
});
export type TimeOffSegmentDecision = z.infer<
  typeof timeOffSegmentDecisionSchema
>;
export const timeOffDecisionInputSchema = z.object({
  expected_revision: z.number().int().positive(),
  action: z.enum([
    "approve",
    "deny",
    "partial_approve",
    "return_to_pending",
    "revoke",
  ]),
  note: z.string().trim().max(1000).default(""),
  segment_decisions: z.array(timeOffSegmentDecisionSchema).default([]),
});
export type TimeOffDecisionInput = z.infer<typeof timeOffDecisionInputSchema>;

export const shiftChangeDecisionInputSchema = z.object({
  expected_revision: z.number().int().positive(),
  action: z.enum(["approve", "reject"]),
  note: z.string().trim().max(1000).default(""),
});
export type ShiftChangeDecisionInput = z.infer<
  typeof shiftChangeDecisionInputSchema
>;

export const scheduleRequestMutationResultSchema = z.object({
  status: z.string().trim().min(1).max(48),
  request_id: z.string().uuid(),
  revision: z.number().int().positive(),
});
export type ScheduleRequestMutationResult = z.infer<
  typeof scheduleRequestMutationResultSchema
>;

export const customRoleAccessClassSchema = z.enum(["manager", "employee"]);
export type CustomRoleAccessClass = z.infer<typeof customRoleAccessClassSchema>;

export const permissionDefinitionSchema = z.object({
  key: permissionSchema,
  label: z.string().trim().min(1).max(80),
  category: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(240),
  custom_grantable: z.boolean(),
  sort_order: z.number().int().nonnegative(),
});
export type PermissionDefinition = z.infer<typeof permissionDefinitionSchema>;

export const workspaceRoleRecordSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  name: z.string().trim().min(1).max(64),
  description: z.string().max(240),
  system_key: workspaceRoleSchema.nullable(),
  access_class: workspaceRoleSchema,
  sort_order: z.number().int().nonnegative(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
  permission_keys: z.array(permissionSchema),
  member_count: z.number().int().nonnegative(),
});
export type WorkspaceRoleRecord = z.infer<typeof workspaceRoleRecordSchema>;

export const workspaceRoleInputSchema = z
  .object({
    name: z.string().trim().min(1).max(64),
    description: z.string().trim().max(240),
    access_class: customRoleAccessClassSchema,
    permission_keys: z.array(permissionSchema),
  })
  .superRefine((role, issue) => {
    const permissions = new Set(role.permission_keys);
    if (!permissions.has("workspace.read")) {
      issue.addIssue({
        code: "custom",
        message: "Custom roles require workspace access",
        path: ["permission_keys"],
      });
    }
    if (
      permissions.has("workspace.manage") ||
      permissions.has("roles.manage")
    ) {
      issue.addIssue({
        code: "custom",
        message: "Protected management permissions cannot be granted",
        path: ["permission_keys"],
      });
    }
    if (
      permissions.has("schedule.manage") &&
      !permissions.has("schedule.read")
    ) {
      issue.addIssue({
        code: "custom",
        message: "Schedule management requires schedule access",
        path: ["permission_keys"],
      });
    }
    if (
      permissions.has("schedule.publish") &&
      (!permissions.has("schedule.read") || !permissions.has("schedule.manage"))
    ) {
      issue.addIssue({
        code: "custom",
        message: "Schedule publication requires schedule management access",
        path: ["permission_keys"],
      });
    }
    if (
      permissions.has("schedule.templates.manage") &&
      (!permissions.has("schedule.read") || !permissions.has("schedule.manage"))
    ) {
      issue.addIssue({
        code: "custom",
        message: "Schedule templates require schedule management access",
        path: ["permission_keys"],
      });
    }
    if (
      permissions.has("schedule.export") &&
      !permissions.has("schedule.read")
    ) {
      issue.addIssue({
        code: "custom",
        message: "Schedule export requires schedule access",
        path: ["permission_keys"],
      });
    }
    if (
      permissions.has("schedule.lineup.read") &&
      !permissions.has("schedule.read")
    ) {
      issue.addIssue({
        code: "custom",
        message: "Line-up access requires schedule access",
        path: ["permission_keys"],
      });
    }
    if (
      permissions.has("schedule.lineup.manage") &&
      !permissions.has("schedule.lineup.read")
    ) {
      issue.addIssue({
        code: "custom",
        message: "Line-up management requires Line-up access",
        path: ["permission_keys"],
      });
    }
    if (
      permissions.has("schedule.lineup.share") &&
      !permissions.has("schedule.lineup.read")
    ) {
      issue.addIssue({
        code: "custom",
        message: "Line-up sharing requires Line-up access",
        path: ["permission_keys"],
      });
    }
    for (const [read, manage, label] of [
      [
        "schedule.time_off_requests.read",
        "schedule.time_off_requests.manage",
        "Time off request",
      ],
      [
        "schedule.shift_change_requests.read",
        "schedule.shift_change_requests.manage",
        "Shift change request",
      ],
    ] as const) {
      if (permissions.has(read) && !permissions.has("schedule.read")) {
        issue.addIssue({
          code: "custom",
          message: `${label} access requires schedule access`,
          path: ["permission_keys"],
        });
      }
      if (permissions.has(manage) && !permissions.has(read)) {
        issue.addIssue({
          code: "custom",
          message: `${label} management requires request access`,
          path: ["permission_keys"],
        });
      }
    }
    if (
      permissions.has("documents.manage") &&
      !permissions.has("documents.read")
    ) {
      issue.addIssue({
        code: "custom",
        message: "Document management requires document access",
        path: ["permission_keys"],
      });
    }
    if (
      permissions.has("signature_templates.manage") &&
      !permissions.has("signature_templates.read")
    ) {
      issue.addIssue({
        code: "custom",
        message: "Acknowledgement template management requires template access",
        path: ["permission_keys"],
      });
    }
    if (
      (permissions.has("employees.manage") ||
        permissions.has("employees.archive")) &&
      !permissions.has("employees.read")
    ) {
      issue.addIssue({
        code: "custom",
        message: "Employee management requires employee directory access",
        path: ["permission_keys"],
      });
    }
    if (
      permissions.has("employee_access.manage") &&
      (!permissions.has("employees.read") || !permissions.has("roles.read"))
    ) {
      issue.addIssue({
        code: "custom",
        message: "Employee access management requires employee and role access",
        path: ["permission_keys"],
      });
    }
    if (
      permissions.has("employee_onboarding.review") &&
      !permissions.has("employees.read")
    ) {
      issue.addIssue({
        code: "custom",
        message: "Onboarding review requires employee directory access",
        path: ["permission_keys"],
      });
    }
    if (
      permissions.has("employee_documents.review") &&
      (!permissions.has("employee_onboarding.review") ||
        !permissions.has("documents.read"))
    ) {
      issue.addIssue({
        code: "custom",
        message:
          "Employee document review requires onboarding and document access",
        path: ["permission_keys"],
      });
    }
    if (
      (permissions.has("time.capture.own") ||
        permissions.has("time.correction.request.own")) &&
      !permissions.has("time.read.own")
    ) {
      issue.addIssue({
        code: "custom",
        message: "Own time capture and corrections require own time access",
        path: ["permission_keys"],
      });
    }
    if (
      (permissions.has("time.amend.location") ||
        permissions.has("time.correction.review.location") ||
        permissions.has("time.review.approve.location") ||
        permissions.has("time.export.preview.location") ||
        permissions.has("time.export.create.location") ||
        permissions.has("time.export.read.location")) &&
      !permissions.has("time.read.location")
    ) {
      issue.addIssue({
        code: "custom",
        message: "Location time management requires location time access",
        path: ["permission_keys"],
      });
    }
    if (
      permissions.has("time.export.audit.read") &&
      !permissions.has("time.audit.read")
    ) {
      issue.addIssue({
        code: "custom",
        message: "Time export audit access requires time audit access",
        path: ["permission_keys"],
      });
    }
  });
export type WorkspaceRoleInput = z.infer<typeof workspaceRoleInputSchema>;

export const employeeSectionSchema = z.enum([
  "profile",
  "employment",
  "availability",
  "documents",
  "access",
  "history",
]);
export type EmployeeSection = z.infer<typeof employeeSectionSchema>;

export const employeeDisplayStatusSchema = z.enum([
  "not_invited",
  "invited",
  "onboarding",
  "needs_attention",
  "active",
  "archived",
]);
export type EmployeeDisplayStatus = z.infer<typeof employeeDisplayStatusSchema>;

export const employeeSummarySchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  employee_code: z.string().min(1).max(24),
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().min(1).max(80),
  preferred_name: z.string().max(80),
  display_name: z.string().trim().min(1).max(161),
  invitation_email: z.string().email().nullable(),
  start_date: z.string().date().nullable(),
  primary_location_id: z.string().uuid().nullable(),
  primary_location_name: z.string().nullable(),
  location_count: z.coerce.number().int().nonnegative(),
  primary_job_id: z.string().uuid().nullable(),
  primary_job_name: z.string().nullable(),
  job_count: z.coerce.number().int().nonnegative(),
  role_name: z.string().nullable(),
  display_status: employeeDisplayStatusSchema,
  archived_at: z.string().datetime({ offset: true }).nullable(),
  revision: z.coerce.number().int().positive(),
});
export type EmployeeSummary = z.infer<typeof employeeSummarySchema>;

export const employeeAssignmentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  primary: z.boolean(),
  archived: z.boolean(),
});
export type EmployeeAssignment = z.infer<typeof employeeAssignmentSchema>;

export const employeeEventSchema = z.object({
  id: z.string().uuid(),
  action: z.string().trim().min(1).max(120),
  occurred_at: z.string().datetime({ offset: true }),
  actor_user_id: z.string().uuid(),
  summary: z.string().max(240),
});
export type EmployeeEvent = z.infer<typeof employeeEventSchema>;

export const employeeDetailSchema = employeeSummarySchema.extend({
  user_id: z.string().uuid().nullable(),
  internal_note: z.string().max(1000),
  locations: z.array(employeeAssignmentSchema),
  jobs: z.array(employeeAssignmentSchema),
  invitation: z
    .object({
      id: z.string().uuid(),
      email: z.string().email(),
      role_id: z.string().uuid(),
      status: z.enum(["pending", "accepted", "revoked", "expired"]),
      expires_at: z.string().datetime({ offset: true }),
      sent_at: z.string().datetime({ offset: true }),
    })
    .nullable(),
  onboarding: z.object({
    status: z.enum([
      "not_requested",
      "invited",
      "in_progress",
      "submitted",
      "changes_requested",
      "approved",
      "cancelled",
    ]),
    required_documents: z.coerce.number().int().nonnegative(),
    completed_documents: z.coerce.number().int().nonnegative(),
  }),
  events: z.array(employeeEventSchema),
});
export type EmployeeDetail = z.infer<typeof employeeDetailSchema>;

export const employeeInputSchema = z.object({
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().min(1).max(80),
  preferred_name: z.string().trim().max(80),
  invitation_email: z.string().trim().email().or(z.literal("")),
  start_date: z.string().date().or(z.literal("")),
  internal_note: z.string().trim().max(1000),
  location_ids: z.array(z.string().uuid()),
  primary_location_id: z.string().uuid().nullable(),
  job_ids: z.array(z.string().uuid()),
  primary_job_id: z.string().uuid().nullable(),
  expected_revision: z.number().int().positive().nullable(),
});
export type EmployeeInput = z.infer<typeof employeeInputSchema>;

export const employeeOnboardingCaseStatusSchema = z.enum([
  "in_progress",
  "submitted",
  "changes_requested",
  "approved",
  "cancelled",
]);
export type EmployeeOnboardingCaseStatus = z.infer<
  typeof employeeOnboardingCaseStatusSchema
>;

export const employeeOnboardingRequirementKindSchema = z.enum([
  "profile",
  "ssn",
  "document",
  "acknowledgement",
  "availability",
]);
export const employeeOnboardingRequirementStatusSchema = z.enum([
  "not_started",
  "in_progress",
  "awaiting_review",
  "completed",
  "rejected",
  "manual_follow_up",
  "superseded",
]);

export const employeeOnboardingRequirementSchema = z.object({
  id: z.string().uuid(),
  kind: employeeOnboardingRequirementKindSchema,
  title: z.string().trim().min(1).max(120),
  description: z.string().max(500),
  status: employeeOnboardingRequirementStatusSchema,
  required: z.boolean(),
  blocks_activation: z.boolean(),
  requires_review: z.boolean(),
  sort_order: z.number().int().nonnegative(),
  source_id: z.string().uuid().nullable(),
  accepted_formats: z.array(z.enum(["pdf", "jpeg", "png", "webp"])).default([]),
  content_text: z.string().max(50000).nullable(),
  content_digest: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
  intent_statement: z.string().max(500).nullable(),
  rejection_reason: z.string().max(500).nullable(),
});
export type EmployeeOnboardingRequirement = z.infer<
  typeof employeeOnboardingRequirementSchema
>;

export const employeeOnboardingProfileSchema = z.object({
  legal_first_name: z.string().trim().min(1).max(80),
  legal_last_name: z.string().trim().min(1).max(80),
  preferred_name: z.string().trim().max(80),
  phone: z.string().trim().min(7).max(30),
  street_address: z.string().trim().min(1).max(180),
  city: z.string().trim().min(1).max(100),
  region: z.string().trim().min(1).max(100),
  postal_code: z.string().trim().min(1).max(20),
  country_code: z.string().regex(/^[A-Z]{2}$/),
  date_of_birth: z.string().date(),
  emergency_contact_name: z.string().trim().min(1).max(120),
  emergency_contact_phone: z.string().trim().min(7).max(30),
  share_phone_with_teammates: z.boolean(),
  share_email_with_teammates: z.boolean(),
});
export type EmployeeOnboardingProfile = z.infer<
  typeof employeeOnboardingProfileSchema
>;

export const employeeAvailabilityDaySchema = z
  .object({
    day: z.number().int().min(0).max(6),
    mode: z.enum(["unavailable", "unrestricted", "windows"]),
    windows: z
      .array(
        z.object({
          start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
          end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        }),
      )
      .max(4),
  })
  .superRefine((value, issue) => {
    if (value.mode === "windows" && value.windows.length === 0)
      issue.addIssue({
        code: "custom",
        message: "At least one window is required",
      });
    if (value.mode !== "windows" && value.windows.length > 0)
      issue.addIssue({
        code: "custom",
        message: "Only window mode accepts time ranges",
      });
    for (const window of value.windows) {
      if (window.start >= window.end)
        issue.addIssue({
          code: "custom",
          message: "Availability windows must end after they start",
        });
    }
  });

export const employeeAvailabilityInputSchema = z
  .object({
    timezone: z.string().trim().min(1).max(80),
    days: z.array(employeeAvailabilityDaySchema).length(7),
  })
  .superRefine((value, issue) => {
    if (new Set(value.days.map((day) => day.day)).size !== 7)
      issue.addIssue({
        code: "custom",
        message: "Each weekday must be provided once",
      });
  });
export type EmployeeAvailabilityInput = z.infer<
  typeof employeeAvailabilityInputSchema
>;

export const employeeOnboardingSchema = z.object({
  case_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  workspace_name: z.string().trim().min(1).max(120),
  employee_id: z.string().uuid(),
  employee_name: z.string().trim().min(1).max(161),
  membership_id: z.string().uuid(),
  membership_status: z.enum(["pending_activation", "active"]),
  case_status: employeeOnboardingCaseStatusSchema,
  revision: z.number().int().positive(),
  progress_completed: z.number().int().nonnegative(),
  progress_total: z.number().int().nonnegative(),
  first_actionable_path: z.string().startsWith("/welcome"),
  ssn_status: z.object({
    present: z.boolean(),
    last_four: z
      .string()
      .regex(/^\d{4}$/)
      .nullable(),
  }),
  profile: employeeOnboardingProfileSchema.partial().nullable(),
  availability: employeeAvailabilityInputSchema.nullable(),
  assignments: z.object({
    locations: z.array(z.string()),
    jobs: z.array(z.string()),
  }),
  requirements: z.array(employeeOnboardingRequirementSchema),
});
export type EmployeeOnboarding = z.infer<typeof employeeOnboardingSchema>;

export const employeeOnboardingManagerSchema = z.object({
  case_id: z.string().uuid(),
  employee_id: z.string().uuid(),
  case_status: employeeOnboardingCaseStatusSchema,
  revision: z.number().int().positive(),
  submitted_at: z.string().datetime({ offset: true }).nullable(),
  progress_completed: z.number().int().nonnegative(),
  progress_total: z.number().int().nonnegative(),
  ssn_present: z.boolean(),
  requirements: z.array(employeeOnboardingRequirementSchema),
});
export type EmployeeOnboardingManager = z.infer<
  typeof employeeOnboardingManagerSchema
>;

export const documentFormatSchema = z.enum(["pdf", "jpeg", "png", "webp"]);
export type DocumentFormat = z.infer<typeof documentFormatSchema>;

export const documentTypeSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  title: z.string().trim().min(1).max(80),
  description: z.string().max(240),
  required_at_onboarding: z.boolean(),
  requires_review: z.boolean(),
  accepted_formats: z.array(documentFormatSchema).min(1),
  tracks_expiry: z.boolean(),
  expiry_warning_days: z.number().int().min(1).max(365),
  sort_order: z.number().int().nonnegative(),
  archived_at: z.string().datetime({ offset: true }).nullable(),
});
export type DocumentType = z.infer<typeof documentTypeSchema>;

export const documentTypeInputSchema = documentTypeSchema
  .pick({
    title: true,
    description: true,
    required_at_onboarding: true,
    requires_review: true,
    accepted_formats: true,
    tracks_expiry: true,
    expiry_warning_days: true,
  })
  .refine(
    (documentType) =>
      new Set(documentType.accepted_formats).size ===
      documentType.accepted_formats.length,
    {
      message: "Document formats must be unique",
      path: ["accepted_formats"],
    },
  );
export type DocumentTypeInput = z.infer<typeof documentTypeInputSchema>;

export const signatureRetentionTriggerSchema = z.enum([
  "signed_at",
  "employment_end",
]);
export const signatureRetentionStatusSchema = z.enum(["draft", "approved"]);
export const signatureExecutionClassSchema = z.enum([
  "acknowledgement",
  "electronic_signature",
  "external_process",
]);
export const signatureVersionStatusSchema = z.enum(["draft", "published"]);

export const signatureRetentionPolicySchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  retention_trigger: signatureRetentionTriggerSchema,
  duration_days: z.number().int().min(1).max(36500),
  jurisdiction_scope: z.string().trim().min(1).max(120),
  authority_reference: z.string().trim().min(1).max(500),
  status: signatureRetentionStatusSchema,
  approved_at: z.string().datetime({ offset: true }).nullable(),
  archived_at: z.string().datetime({ offset: true }).nullable(),
});
export type SignatureRetentionPolicy = z.infer<
  typeof signatureRetentionPolicySchema
>;

export const signatureRetentionPolicyInputSchema =
  signatureRetentionPolicySchema.pick({
    name: true,
    retention_trigger: true,
    duration_days: true,
    jurisdiction_scope: true,
    authority_reference: true,
  });
export type SignatureRetentionPolicyInput = z.infer<
  typeof signatureRetentionPolicyInputSchema
>;

export const signatureTemplateSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  archived_at: z.string().datetime({ offset: true }).nullable(),
});
export type SignatureTemplate = z.infer<typeof signatureTemplateSchema>;

export const signatureTemplateVersionSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  template_id: z.string().uuid(),
  version_number: z.number().int().positive(),
  title: z.string().trim().min(1).max(80),
  summary: z.string().max(240),
  execution_class: signatureExecutionClassSchema,
  content_text: z.string().min(1).max(50000),
  content_digest: z.string().regex(/^[0-9a-f]{64}$/),
  intent_statement: z.string().trim().min(1).max(500),
  locale: z.string().regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/),
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  required_at_onboarding: z.boolean(),
  blocks_activation: z.boolean(),
  retention_policy_id: z.string().uuid(),
  status: signatureVersionStatusSchema,
  published_at: z.string().datetime({ offset: true }).nullable(),
});
export type SignatureTemplateVersion = z.infer<
  typeof signatureTemplateVersionSchema
>;

export const signatureTemplateDraftInputSchema = signatureTemplateVersionSchema
  .pick({
    title: true,
    summary: true,
    content_text: true,
    intent_statement: true,
    locale: true,
    effective_date: true,
    required_at_onboarding: true,
    blocks_activation: true,
    retention_policy_id: true,
  })
  .superRefine((template, issue) => {
    if (template.blocks_activation && !template.required_at_onboarding) {
      issue.addIssue({
        code: "custom",
        message: "Activation blocking requires onboarding assignment",
        path: ["blocks_activation"],
      });
    }
  });
export type SignatureTemplateDraftInput = z.infer<
  typeof signatureTemplateDraftInputSchema
>;

export const productBoundary = {
  oldReferencePath: "C:\\Users\\TheWe\\newfork",
  forbiddenLegacyDomains: [
    "time-entry",
    "kiosk",
    "payroll",
    "pay-entity",
    "compliance",
    "labor-law",
    "breaks",
    "overtime",
    "jurisdiction",
  ],
  exactPortSurfaces: [
    "left-sidebar-app-shell",
    "calendar",
    "main-schedule-page",
    "employee-drawer-shell",
  ],
} as const;
