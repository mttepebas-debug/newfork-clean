import { z } from "zod";

export const preferenceInputModeSchema = z.enum(["shift_type", "time_range"]);
const startClock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const endClock = z.string().regex(/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/);
export const unavailableRangeSchema = z
  .object({ start: startClock, end: endClock })
  .refine((value) => value.end > value.start, {
    path: ["end"],
    message: "End time must follow start time.",
  });
export const weeklyPreferenceDaySchema = z
  .object({
    day: z.number().int().min(0).max(6),
    all_day: z.boolean(),
    shift_type_ids: z.array(z.string().uuid()).max(64),
    // What the database holds: in order and apart (touching hours are one
    // range), each within the day. A mode change (M4) can write several; a
    // save takes one (weeklyPreferenceSaveSchema).
    ranges: z.array(unavailableRangeSchema).max(12),
  })
  .superRefine((value, ctx) => {
    if (new Set(value.shift_type_ids).size !== value.shift_type_ids.length)
      ctx.addIssue({
        code: "custom",
        path: ["shift_type_ids"],
        message: "Choose each shift type once.",
      });
    value.ranges.forEach((range, index) => {
      if (index > 0 && range.start <= value.ranges[index - 1]!.end)
        ctx.addIssue({
          code: "custom",
          path: ["ranges", index],
          message: "Hours must be in order and apart.",
        });
    });
    if (value.all_day && (value.shift_type_ids.length || value.ranges.length))
      ctx.addIssue({
        code: "custom",
        message: "All day replaces individual selections.",
      });
  });
export const weeklyPreferenceSchema = z
  .object({
    input_mode: preferenceInputModeSchema,
    days: z.array(weeklyPreferenceDaySchema).length(7),
  })
  .superRefine((value, ctx) => {
    if (new Set(value.days.map((day) => day.day)).size !== 7)
      ctx.addIssue({
        code: "custom",
        path: ["days"],
        message: "Include each weekday once.",
      });
    value.days.forEach((day, index) => {
      if (
        value.input_mode === "shift_type"
          ? day.ranges.length > 0
          : day.shift_type_ids.length > 0
      )
        ctx.addIssue({
          code: "custom",
          path: ["days", index],
          message: "Use the organization's selected entry mode.",
        });
    });
  });
export const weeklyPreferenceSettingsSchema = z.object({
  input_mode: preferenceInputModeSchema,
  onboarding_required: z.boolean(),
  revision: z.number().int().nonnegative(),
});
export const weeklyPreferenceSettingsReadSchema = z.object({
  settings: weeklyPreferenceSettingsSchema,
  can_edit: z.boolean(),
  missing_shift_types: z.array(
    z.object({ id: z.string().uuid(), name: z.string() }),
  ),
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
export const preferenceShiftTypeSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  start_time: startClock.nullable(),
  end_time: endClock.nullable(),
  archived: z.boolean(),
  selectable: z.boolean(),
});
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
  shift_types: z.array(preferenceShiftTypeSchema),
  time_format: z.enum(["12h", "24h"]),
});
export const weeklyTeamReadSchema = z.object({
  locations: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
  time_format: z.enum(["12h", "24h"]),
  shift_types: z.array(preferenceShiftTypeSchema),
  employees: z.array(
    z.object({
      id: z.string().uuid(),
      display_name: z.string(),
      employee_code: z.string(),
      location_ids: z.array(z.string().uuid()),
      submitted: z.boolean(),
      preference: weeklyPreferenceSchema,
      can_open: z.boolean(),
    }),
  ),
});
export type WeeklyTeamRead = z.infer<typeof weeklyTeamReadSchema>;
const weekdayNames = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
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
    // Mert 2026-10-16: one time range a day ("kural da 1'e insin").
    value.preference.days.forEach((day, index) => {
      if (day.ranges.length > 1)
        ctx.addIssue({
          code: "custom",
          path: ["preference", "days", index, "ranges"],
          message: `Keep one time range on ${weekdayNames[day.day]}.`,
        });
    });
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
export type PreferenceShiftType = z.infer<typeof preferenceShiftTypeSchema>;
export type WeeklyPreferenceRead = z.infer<typeof weeklyPreferenceReadSchema>;
export type WeeklyPreferenceSave = z.infer<typeof weeklyPreferenceSaveSchema>;
export type WeeklyPreferenceMutation = z.infer<
  typeof weeklyPreferenceMutationSchema
>;

export function emptyWeeklyPreference(
  input_mode: WeeklyPreference["input_mode"],
): WeeklyPreference {
  return {
    input_mode,
    days: Array.from({ length: 7 }, (_, day) => ({
      day,
      all_day: false,
      shift_type_ids: [],
      ranges: [],
    })),
  };
}
export function preferenceIsEmpty(preference: WeeklyPreference): boolean {
  return preference.days.every(
    (day) => !day.all_day && !day.ranges.length && !day.shift_type_ids.length,
  );
}
