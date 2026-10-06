import { z } from "zod";

export const scheduleExportV2PreferencesSchema = z.object({
  version: z.literal(1).default(1),
  format: z.enum(["pdf", "png", "xlsx"]).default("pdf"),
  destination: z.enum(["download", "print"]).default("download"),
  combineHorizontally: z.boolean().default(true),
  combineVertically: z.boolean().default(true),
  paper: z.enum(["A4", "LETTER"]).default("A4"),
});
export type ScheduleExportV2Preferences = z.infer<typeof scheduleExportV2PreferencesSchema>;

const uniqueIds = (limit: number) => z.array(z.string().uuid()).max(limit)
  .refine(ids => new Set(ids).size === ids.length, "Duplicate identifiers are not allowed");

/** Authorization scope only. No cell text, notes, credentials or renderer settings. */
export const scheduleExportV2ScopeSchema = z.object({
  week_start: z.string().date(),
  dates: z.array(z.string().date()).min(1).max(7),
  location_ids: uniqueIds(100).min(1),
  employee_ids: uniqueIds(10000),
  shift_ids: uniqueIds(10000),
  ghost_shift_ids: uniqueIds(10000).optional(),
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("published") }).strict(),
    z.object({ kind: z.literal("draft"), id: z.string().uuid(), revision: z.number().int().positive() }).strict(),
  ]),
}).strict().superRefine((value, context) => {
  const start = Date.parse(`${value.week_start}T00:00:00Z`);
  if (new Set(value.dates).size !== value.dates.length || value.dates.some(date => {
    const offset = (Date.parse(`${date}T00:00:00Z`) - start) / 86400000;
    return offset < 0 || offset > 6;
  })) context.addIssue({ code: "custom", path: ["dates"], message: "Dates must belong to the selected schedule week" });
});
export const scheduleExportV2AuthorizationSchema = z.object({ authorized: z.literal(true) }).strict();
export type ScheduleExportV2Scope = z.infer<typeof scheduleExportV2ScopeSchema>;
