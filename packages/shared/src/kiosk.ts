import { z } from "zod";

export const kioskPinSchema = z.string().regex(/^\d{6}$/);

export const kioskDeviceSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  location_id: z.string().uuid(),
  label: z.string().trim().min(1).max(80),
  status: z.enum(["active", "revoked"]),
  credential_version: z.coerce.number().int().positive(),
  created_at: z.string().datetime({ offset: true }),
  last_seen_at: z.string().datetime({ offset: true }).nullable(),
  revoked_at: z.string().datetime({ offset: true }).nullable(),
});
export type KioskDevice = z.infer<typeof kioskDeviceSchema>;

export const kioskEnrollmentSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  location_id: z.string().uuid(),
  label: z.string().trim().min(1).max(80),
  code: z.string().regex(/^[A-Z2-7]{5}(?:-[A-Z2-7]{5}){3}$/),
  expires_at: z.string().datetime({ offset: true }),
});
export type KioskEnrollment = z.infer<typeof kioskEnrollmentSchema>;

export const kioskEnrollmentExchangeSchema = z.object({
  device: kioskDeviceSchema,
});
export type KioskEnrollmentExchange = z.infer<
  typeof kioskEnrollmentExchangeSchema
>;

export const kioskPinResetResultSchema = z.object({
  employee_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  location_id: z.string().uuid(),
  updated_at: z.string().datetime({ offset: true }),
});
export type KioskPinResetResult = z.infer<typeof kioskPinResetResultSchema>;

export const kioskVerificationResponseSchema = z.object({
  verified: z.literal(true),
  expires_at: z.string().datetime({ offset: true }),
});
export type KioskVerificationResponse = z.infer<
  typeof kioskVerificationResponseSchema
>;

export const kioskEmployeeSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string().trim().min(1).max(161),
});
export type KioskEmployee = z.infer<typeof kioskEmployeeSchema>;

export const kioskLocationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1),
  timezone: z.string().trim().min(1),
});

export const kioskDirectorySchema = z.object({
  device: z.object({
    id: z.string().uuid(),
    label: z.string().trim().min(1).max(80),
    workspace_id: z.string().uuid(),
    workspace_name: z.string().trim().min(1),
    location: kioskLocationSchema,
  }),
  employees: z.array(kioskEmployeeSchema),
});
export type KioskDirectory = z.infer<typeof kioskDirectorySchema>;

export const kioskActionTypeSchema = z.enum([
  "clock_in",
  "break_start",
  "break_end",
  "clock_out",
  "end_break_and_clock_out",
]);
export type KioskActionType = z.infer<typeof kioskActionTypeSchema>;

export const kioskActionStateSchema = z.object({
  employee: kioskEmployeeSchema,
  location: kioskLocationSchema,
  current_session: z
    .object({
      id: z.string().uuid(),
      capture_state: z.enum(["open", "on_break"]),
      started_at: z.string().datetime({ offset: true }),
      revision: z.coerce.number().int().positive(),
    })
    .nullable(),
  expected_revision: z.coerce.number().int().nonnegative(),
  allowed_actions: z.array(kioskActionTypeSchema),
  blocked_reason: z.enum(["other_location"]).nullable(),
  expires_at: z.string().datetime({ offset: true }),
});
export type KioskActionState = z.infer<typeof kioskActionStateSchema>;

export const kioskCaptureInputSchema = z.object({
  action: kioskActionTypeSchema,
  expected_revision: z.number().int().nonnegative(),
  occurred_at: z.string().datetime({ offset: true }),
  idempotency_key: z.string().uuid(),
});
export type KioskCaptureInput = z.infer<typeof kioskCaptureInputSchema>;

export const kioskCaptureResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("accepted"),
    session: z.object({
      id: z.string().uuid(),
      capture_state: z.enum(["open", "on_break", "complete"]),
      revision: z.coerce.number().int().positive(),
      last_event_at: z.string().datetime({ offset: true }),
    }),
    events: z.array(
      z.object({
        id: z.string().uuid(),
        event_type: z.enum([
          "clock_in",
          "break_start",
          "break_end",
          "clock_out",
        ]),
        occurred_at: z.string().datetime({ offset: true }),
        received_at: z.string().datetime({ offset: true }),
      }),
    ),
    idempotent_replay: z.boolean(),
  }),
  z.object({
    status: z.literal("conflict"),
    reason: z.enum(["stale_state", "invalid_action", "other_location"]),
  }),
]);
export type KioskCaptureResult = z.infer<typeof kioskCaptureResultSchema>;

export const kioskManagedDeviceSchema = kioskDeviceSchema.extend({
  location_name: z.string().trim().min(1).max(120),
});
export type KioskManagedDevice = z.infer<typeof kioskManagedDeviceSchema>;

export const kioskManagementLocationSchema = kioskLocationSchema.extend({
  can_enroll: z.boolean(),
  can_reset_pin: z.boolean(),
});

export const kioskManagementEmployeeSchema = kioskEmployeeSchema.extend({
  employee_code: z.string().trim().min(1).max(24),
  location_ids: z.array(z.string().uuid()).min(1),
  pin_configured: z.boolean(),
});
export type KioskManagementEmployee = z.infer<
  typeof kioskManagementEmployeeSchema
>;

export const kioskSecurityEventSchema = z.object({
  id: z.string().uuid(),
  action: z.string().trim().min(1).max(120),
  occurred_at: z.string().datetime({ offset: true }),
  location_id: z.string().uuid().nullable(),
  location_name: z.string().trim().min(1).max(120).nullable(),
  device_id: z.string().uuid().nullable(),
  device_label: z.string().trim().min(1).max(80).nullable(),
  employee_id: z.string().uuid().nullable(),
  employee_name: z.string().trim().min(1).max(161).nullable(),
  actor_name: z.string().trim().min(1).max(120).nullable(),
});

export const kioskManagementSchema = z.object({
  workspace_id: z.string().uuid(),
  locations: z.array(kioskManagementLocationSchema),
  devices: z.array(kioskManagedDeviceSchema),
  employees: z.array(kioskManagementEmployeeSchema),
  events: z.array(kioskSecurityEventSchema),
});
export type KioskManagement = z.infer<typeof kioskManagementSchema>;

export const kioskDeviceLabelInputSchema = z.object({
  label: z.string().trim().min(1).max(80),
});
export type KioskDeviceLabelInput = z.infer<typeof kioskDeviceLabelInputSchema>;
