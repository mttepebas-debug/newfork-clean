import { z } from "zod";

const startClock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const endClock = z.string().regex(/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/);
export const unavailableRangeSchema = z
  .object({ start: startClock, end: endClock })
  .refine((value) => value.end > value.start, {
    path: ["end"],
    message: "End time must follow start time.",
  });
const weekdayNames = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
// Availability is asked in hours only (Mert, 2026-10-16): a day is a whole day
// or at most one range of hours ("kural da 1'e insin"); the database holds the
// same rule (weekly_preference_valid).
export const weeklyPreferenceDaySchema = z
  .object({
    day: z.number().int().min(0).max(6),
    all_day: z.boolean(),
    ranges: z.array(unavailableRangeSchema),
  })
  .superRefine((value, ctx) => {
    if (value.ranges.length > 1)
      ctx.addIssue({
        code: "custom",
        path: ["ranges"],
        message: `Keep one time range on ${weekdayNames[value.day]}.`,
      });
    if (value.all_day && value.ranges.length)
      ctx.addIssue({
        code: "custom",
        message: "All day replaces individual hours.",
      });
  });
export const weeklyPreferenceSchema = z
  .object({
    days: z.array(weeklyPreferenceDaySchema).length(7),
  })
  .superRefine((value, ctx) => {
    if (new Set(value.days.map((day) => day.day)).size !== 7)
      ctx.addIssue({
        code: "custom",
        path: ["days"],
        message: "Include each weekday once.",
      });
  });
export const weeklyPreferenceSettingsSchema = z.object({
  onboarding_required: z.boolean(),
  revision: z.number().int().nonnegative(),
});
export const weeklyPreferenceSettingsReadSchema = z.object({
  settings: weeklyPreferenceSettingsSchema,
  can_edit: z.boolean(),
});
export const weeklyPreferenceSettingsSaveSchema = weeklyPreferenceSettingsSchema
  .omit({ revision: true })
  .extend({ expected_revision: z.number().int().nonnegative() });
export type WeeklyPreferenceSettingsRead = z.infer<
  typeof weeklyPreferenceSettingsReadSchema
>;
export type WeeklyPreferenceSettingsSave = z.infer<
  typeof weeklyPreferenceSettingsSaveSchema
>;
export const weeklyPreferenceRecordSchema = z.object({
  revision: z.number().int().nonnegative(),
  submitted: z.boolean(),
  updated_at: z.string().datetime({ offset: true }).nullable(),
  preference: weeklyPreferenceSchema,
});
export const managerPreferenceRecordSchema =
  weeklyPreferenceRecordSchema.extend({
    enabled: z.boolean(),
    notes: z.array(z.string().max(1000)).length(7),
  });
export const weeklyPreferenceReadSchema = z.object({
  employee_id: z.string().uuid(),
  employee_name: z.string(),
  can_edit_employee: z.boolean(),
  can_manage: z.boolean(),
  settings: weeklyPreferenceSettingsSchema,
  employee: weeklyPreferenceRecordSchema,
  // Object: the reader sees the note. null: an employee target whose note this
  // reader may not see. Absent: the target is a manager, admin or owner (no note).
  manager: managerPreferenceRecordSchema.nullable().optional(),
  time_format: z.enum(["12h", "24h"]),
});
export const weeklyTeamReadSchema = z.object({
  locations: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
  time_format: z.enum(["12h", "24h"]),
  employees: z.array(
    z.object({
      id: z.string().uuid(),
      display_name: z.string(),
      employee_code: z.string(),
      // The job the Employees list names; null for somebody with no job.
      job_name: z.string().nullable(),
      location_ids: z.array(z.string().uuid()),
      submitted: z.boolean(),
      // When their own week was last saved; null when never.
      updated_at: z.string().datetime({ offset: true }).nullable(),
      preference: weeklyPreferenceSchema,
      can_open: z.boolean(),
    }),
  ),
});
export type WeeklyTeamRead = z.infer<typeof weeklyTeamReadSchema>;
export const weeklyPreferenceSaveSchema = z
  .object({
    employee_id: z.string().uuid(),
    source: z.enum(["employee", "manager"]),
    expected_revision: z.number().int().nonnegative(),
    settings_revision: z.number().int().nonnegative(),
    preference: weeklyPreferenceSchema,
    enabled: z.boolean().optional(),
    notes: z.array(z.string().trim().max(1000)).length(7).optional(),
    copy_employee_revision: z.number().int().positive().optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.source === "employee" &&
      (value.enabled !== undefined ||
        value.notes !== undefined ||
        value.copy_employee_revision !== undefined)
    )
      ctx.addIssue({
        code: "custom",
        message: "Manager reminders are a separate record.",
      });
    if (
      value.source === "manager" &&
      (value.enabled === undefined || value.notes === undefined)
    )
      ctx.addIssue({
        code: "custom",
        message: "Include reminder state and notes.",
      });
  });
// M5: saving a week decides nothing about pending requests.
export const weeklyPreferenceMutationSchema = z.object({
  model: weeklyPreferenceReadSchema,
});
export type WeeklyPreference = z.infer<typeof weeklyPreferenceSchema>;
export type WeeklyPreferenceDay = z.infer<typeof weeklyPreferenceDaySchema>;
export type WeeklyPreferenceRead = z.infer<typeof weeklyPreferenceReadSchema>;
export type WeeklyPreferenceSave = z.infer<typeof weeklyPreferenceSaveSchema>;
export type WeeklyPreferenceMutation = z.infer<
  typeof weeklyPreferenceMutationSchema
>;

export function emptyWeeklyPreference(): WeeklyPreference {
  return {
    days: Array.from({ length: 7 }, (_, day) => ({
      day,
      all_day: false,
      ranges: [],
    })),
  };
}
export function preferenceIsEmpty(preference: WeeklyPreference): boolean {
  return preference.days.every((day) => !day.all_day && !day.ranges.length);
}
