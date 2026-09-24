import { z } from "zod";
import { shiftTimeBasisSchema } from "./availability";
import { shiftAvailabilityAssessmentSchema } from "./availability-assessment";

export const scheduleDefaultHoursInputSchema = z.object({
  expected_session_revision: z.number().int().nonnegative(), starts_on: z.string().date(), ends_on: z.string().date(),
  shift_ids: z.array(z.string().uuid()).min(1).max(200).refine(ids => new Set(ids).size === ids.length, "Choose each shift once"),
  overrides: z.array(z.object({ shift_id: z.string().uuid(), note: z.string().trim().min(10).max(500) })).max(200).default([]),
});
export const scheduleDefaultHoursApplySchema = scheduleDefaultHoursInputSchema.extend({
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/), idempotency_key: z.string().uuid(), acknowledge_reference_overlaps: z.boolean().default(false),
  confirm_availability: z.boolean().default(false),
});
const reference = z.object({ start_time: z.string().nullable(), end_time: z.string().nullable(), time_timezone: z.string().nullable(),
  time_basis: shiftTimeBasisSchema,
  time_snapshot: z.object({ default_revision: z.number().int().positive() }).passthrough().nullable(),
});
export const scheduleDefaultHoursPreviewSchema = z.object({
  session_id: z.string().uuid(), session_revision: z.number().int().nonnegative(), starts_on: z.string().date(), ends_on: z.string().date(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/), changed_count: z.number().int().nonnegative(), blocked_count: z.number().int().nonnegative(),
  shifts: z.array(z.object({ shift_id: z.string().uuid(), shift_revision: z.number().int().positive(), scheduled_date: z.string().date(),
    location_id: z.string().uuid(), location_name: z.string(), shift_type_name: z.string(), employee_name: z.string(),
    before: reference, after: reference.nullable(), before_assessment: shiftAvailabilityAssessmentSchema.nullable(), after_assessment: shiftAvailabilityAssessmentSchema.nullable(),
    reason: z.string().nullable(), will_change: z.boolean(), can_apply: z.boolean(), current_default_revision: z.number().int().positive().nullable(),
    before_overlap_count: z.number().int().nonnegative(), after_overlap_count: z.number().int().nonnegative(),
  })).max(200),
});
export type ScheduleDefaultHoursInput = z.infer<typeof scheduleDefaultHoursInputSchema>;
export type ScheduleDefaultHoursApply = z.infer<typeof scheduleDefaultHoursApplySchema>;
export type ScheduleDefaultHoursPreview = z.infer<typeof scheduleDefaultHoursPreviewSchema>;
