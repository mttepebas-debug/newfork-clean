import { z } from "zod";

const interval = z.object({ start_at: z.string().datetime({ offset: true }), end_at: z.string().datetime({ offset: true }) });
export const availabilityCalendarInputSchema = z.object({
  employee_id: z.string().uuid(), starts_on: z.string().date().min(10).refine(value => value >= "1900-01-01" && value <= "2199-12-01", "Choose a date between 1900 and 2199"),
  timezone: z.string().min(1).max(100), day_count: z.number().int().min(1).max(31).default(7),
});
export type AvailabilityCalendarInput = z.infer<typeof availabilityCalendarInputSchema>;
export const availabilityCalendarSchema = z.object({
  employee_id: z.string().uuid(), revision: z.number().int().nonnegative(), timezone: z.string(), starts_on: z.string().date(), ends_on: z.string().date(),
  days: z.array(z.object({
    date: z.string().date(), starts_at: z.string().datetime({ offset: true }).nullable(), ends_at: z.string().datetime({ offset: true }).nullable(),
    available: z.array(interval), unavailable: z.array(interval), unknown: z.array(interval), approved_leave: z.array(interval), planning_available: z.array(interval),
    shift_type_rules: z.array(interval.extend({ shift_type_id: z.string().uuid(), version_id: z.string().uuid(), revision: z.number().int(), timezone: z.string() })),
    sources: z.array(z.object({ version_id: z.string().uuid(), revision: z.number().int(), timezone: z.string(), kind: z.string(), applies: z.array(interval) })),
  })).max(31),
});
export type AvailabilityCalendar = z.infer<typeof availabilityCalendarSchema>;
export const availabilityCalendarComparisonSchema = z.object({
  before: availabilityCalendarSchema, after: availabilityCalendarSchema,
  changes: z.array(z.object({ date: z.string().date(), newly_available: z.array(interval), no_longer_available: z.array(interval), shift_type_rules_changed: z.boolean() })).max(31),
});
export type AvailabilityCalendarComparison = z.infer<typeof availabilityCalendarComparisonSchema>;
