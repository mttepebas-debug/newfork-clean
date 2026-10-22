import { z } from "zod";

// Time off rebuild D2 (KARARLAR S-239): the employee asks for time off and takes back a request that waits.
// The database (ask_time_off_service, withdraw_time_off_service, my_time_off_service) decides; these are the
// shapes the API takes and answers with, and the few rules a form checks before it sends. A refusal comes
// back with one of the reasons below, from the form or from the database alike.

const id = z.string().uuid();
const day = z.string().date();
const instant = z.string().datetime({ offset: true });
/** A clock on a day, 00:00 to 23:59. */
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
/** An end clock: the same, or 24:00 for the midnight that ends the day. */
const endClock = z.union([clock, z.literal("24:00")]);

export const kindsOfLeave = ["vacation", "sick", "personal", "other"] as const;
export const kindOfLeaveSchema = z.enum(kindsOfLeave);
export type KindOfLeave = z.infer<typeof kindOfLeaveSchema>;

export const timeOffRequestStatusSchema = z.enum([
  "pending",
  "approved",
  "declined",
  "withdrawn",
  "expired",
  "cancelled",
  "revoked",
]);
export type TimeOffRequestStatus = z.infer<typeof timeOffRequestStatusSchema>;

/** What the employee sends. Hours need both clocks; All day needs none. */
export const timeOffAskInputSchema = z
  .object({
    kind_of_leave: kindOfLeaveSchema,
    start_date: day,
    end_date: day,
    all_day: z.boolean(),
    start_time: clock.nullable(),
    end_time: endClock.nullable(),
    note: z.string().max(1000).nullable(),
    expected_timezone: z.string().min(1).max(100),
    client_key: id,
  })
  .strict()
  .refine((input) => input.all_day || (input.start_time !== null && input.end_time !== null), {
    message: "Choose a start and an end time",
    path: ["start_time"],
  });
export type TimeOffAskInput = z.infer<typeof timeOffAskInputSchema>;

export const timeOffWithdrawInputSchema = z.object({ expected_revision: z.number().int().min(1) }).strict();
export type TimeOffWithdrawInput = z.infer<typeof timeOffWithdrawInputSchema>;

/** One request as the employee reads it; dates and clocks are local to the zone it was asked in. */
export const timeOffRequestViewSchema = z.object({
  id,
  kind: z.enum(["leave", "cancel"]),
  kind_of_leave: kindOfLeaveSchema,
  status: timeOffRequestStatusSchema,
  starts_at: instant,
  ends_at: instant,
  all_day: z.boolean(),
  time_timezone: z.string(),
  start_date: day,
  end_date: day,
  start_time: clock.nullable(),
  end_time: endClock.nullable(),
  note: z.string().nullable(),
  revision: z.number().int(),
  created_at: instant,
  decided_at: instant.nullable(),
  decided_by_name: z.string().nullable(),
  decision_note: z.string().nullable(),
  ended_at: instant.nullable(),
  ended_note: z.string().nullable(),
});
export type TimeOffRequestView = z.infer<typeof timeOffRequestViewSchema>;

/** The employee's own time off: their zone, today there, where an answer comes from, their requests. */
export const myTimeOffSchema = z.object({
  time_zone: z.string().nullable(),
  today: day.nullable(),
  location_names: z.array(z.string()),
  requests: z.array(timeOffRequestViewSchema),
});
export type MyTimeOff = z.infer<typeof myTimeOffSchema>;

/** Every reason a request is refused, by the form or by the database (its hint). */
export const timeOffAskReasons = [
  "time_off.invalid",
  "time_off.order",
  "time_off.too_long",
  "time_off.started",
  "time_off.overlap",
  "time_off.no_such_time",
  "time_off.no_location",
  "time_off.timezone_changed",
  "time_off.key_reused",
] as const;
export type TimeOffAskReason = (typeof timeOffAskReasons)[number];

export const timeOffMostDays = 31;

const dayNumber = (date: string) => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / 86_400_000;
const minutes = (time: string) => +time.slice(0, 2) * 60 + +time.slice(3, 5);

/** Days from the first to the last, both counted. */
export function timeOffDayCount(startDate: string, endDate: string): number {
  return dayNumber(endDate) - dayNumber(startDate) + 1;
}

export interface TimeOffAskRange {
  readonly start_date: string;
  readonly end_date: string;
  readonly all_day: boolean;
  readonly start_time: string | null;
  readonly end_time: string | null;
}

/**
 * What the form refuses before it sends, from the range alone and the location's clock now: an end before
 * the start, more than 31 days, a start that has passed (All day today has started). Overlap, a clock the
 * zone skips and everything else stays the database's answer.
 */
export function timeOffAskRefusal(
  range: TimeOffAskRange,
  now: { readonly date: string; readonly time: string },
): "time_off.order" | "time_off.too_long" | "time_off.started" | null {
  if (range.end_date < range.start_date) return "time_off.order";
  if (range.all_day) {
    if (timeOffDayCount(range.start_date, range.end_date) > timeOffMostDays) return "time_off.too_long";
    return range.start_date <= now.date ? "time_off.started" : null;
  }
  if (range.start_time === null || range.end_time === null) return null;
  const start = dayNumber(range.start_date) * 1440 + minutes(range.start_time);
  const end = dayNumber(range.end_date) * 1440 + minutes(range.end_time);
  if (end <= start) return "time_off.order";
  if (end - start > timeOffMostDays * 1440) return "time_off.too_long";
  return start <= dayNumber(now.date) * 1440 + minutes(now.time) ? "time_off.started" : null;
}
