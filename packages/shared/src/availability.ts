import { z } from "zod";

/** Every shift has hours; without stored source metadata they are its own. */
export function getShiftTimeBasis(shift: {
  time_basis?: ShiftTimeBasis;
}): ShiftTimeBasis {
  return shift.time_basis ?? "explicit";
}

const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((timezone) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid time zone");

const clockSchema = z
  .string()
  .regex(
    /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/,
    "Enter a valid time such as 09:00.",
  );

export const shiftTimeBasisSchema = z.enum(["explicit", "type_default"]);
export type ShiftTimeBasis = z.infer<typeof shiftTimeBasisSchema>;
export const shiftTimeSnapshotSchema = z.object({
  shift_type_id: z.string().uuid(),
  default_revision: z.number().int().positive(),
  start_time: clockSchema,
  end_time: clockSchema,
  timezone: timezoneSchema,
});
export type ShiftTimeSnapshot = z.infer<typeof shiftTimeSnapshotSchema>;
