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

// Time off rebuild D3 (KARARLAR S-239): a manager, an admin or the owner answers. The database
// (answer_time_off_service, time_off_impact_service, time_off_requests_service, my_time_off_shifts_service)
// decides who may and what an approval opens; these are the shapes.

/** A request as the people who answer it read it: the employee's view, who asked, where they work. */
export const timeOffDeciderViewSchema = timeOffRequestViewSchema.extend({
  employee_id: id,
  employee_name: z.string(),
  location_names: z.array(z.string()),
  shifts_opened: z.number().int().min(0),
});
export type TimeOffDeciderView = z.infer<typeof timeOffDeciderViewSchema>;

export const timeOffRequestsViews = ["all", "open", "closed"] as const;
export const timeOffRequestsSorts = ["needs_decision", "starts", "newest"] as const;
export const timeOffRequestsPageSizes = [25, 50, 100] as const;

/** Requests → Time off's question: which requests, in what order, which page. Paged and sorted by the server. */
export const timeOffRequestsQuerySchema = z
  .object({
    view: z.enum(timeOffRequestsViews).default("all"),
    location_id: id.optional(),
    search: z.string().max(200).default(""),
    sort: z.enum(timeOffRequestsSorts).default("needs_decision"),
    page: z.coerce.number().int().min(1).default(1),
    page_size: z.coerce
      .number()
      .int()
      .refine((size) => (timeOffRequestsPageSizes as readonly number[]).includes(size))
      .default(50),
    request_id: id.optional(),
  })
  .strict();
export type TimeOffRequestsQuery = z.input<typeof timeOffRequestsQuerySchema>;

/** One page of it: how many match, how many wait for an answer, and the page's requests. */
export const timeOffRequestsPageSchema = z.object({
  total: z.number().int().min(0),
  waiting: z.number().int().min(0),
  page: z.number().int().min(1),
  page_size: z.number().int(),
  requests: z.array(timeOffDeciderViewSchema),
});
export type TimeOffRequestsPage = z.infer<typeof timeOffRequestsPageSchema>;

export const timeOffOpeningShiftSchema = z.object({
  id,
  scheduled_date: day,
  start_time: clock,
  end_time: clock,
  job_name: z.string(),
  starts_at: instant,
  ends_at: instant,
  timezone: z.string(),
});
export type TimeOffOpeningShift = z.infer<typeof timeOffOpeningShiftSchema>;

/** What approving would open, location by location; the locations whose schedule the reader cannot see only count. */
export const timeOffImpactSchema = z.object({
  request: timeOffDeciderViewSchema,
  fingerprint: z.string(),
  shift_count: z.number().int().min(0),
  hidden_shift_count: z.number().int().min(0),
  locations: z.array(z.object({ location_id: id, location_name: z.string(), shifts: z.array(timeOffOpeningShiftSchema) })),
});
export type TimeOffImpact = z.infer<typeof timeOffImpactSchema>;

/** The answer, given on what was read: the revision, and for an approval the shifts' print. */
export const timeOffAnswerInputSchema = z
  .object({
    verdict: z.enum(["approve", "decline"]),
    note: z.string().max(1000).nullable(),
    expected_revision: z.number().int().min(1),
    expected_impact: z.string().nullable(),
  })
  .strict()
  .refine((input) => input.verdict === "decline" || input.expected_impact !== null, {
    message: "An approval says which shifts it opens",
    path: ["expected_impact"],
  });
export type TimeOffAnswerInput = z.infer<typeof timeOffAnswerInputSchema>;

/** Every reason an answer is refused besides the authorization core's. */
export const timeOffAnswerReasons = ["time_off.invalid", "time_off.changed", "time_off.not_pending", "time_off.not_found"] as const;
export type TimeOffAnswerReason = (typeof timeOffAnswerReasons)[number];

/** The employee form's question: the days, and the hours unless it is all day. */
export const myTimeOffShiftsQuerySchema = z
  .object({
    start: day,
    end: day,
    from: clock.optional(),
    to: endClock.optional(),
  })
  .strict()
  .refine((query) => (query.from === undefined) === (query.to === undefined), {
    message: "Both hours, or neither",
    path: ["from"],
  });
export type MyTimeOffShiftsQuery = z.infer<typeof myTimeOffShiftsQuerySchema>;

/** The person's published shifts in those days and hours that have not started: what an approval would open. */
export const myTimeOffShiftsSchema = z.object({
  count: z.number().int().min(0),
  shifts: z.array(
    z.object({
      id,
      location_name: z.string(),
      job_name: z.string(),
      scheduled_date: day,
      start_time: clock,
      end_time: clock,
    }),
  ),
});
export type MyTimeOffShifts = z.infer<typeof myTimeOffShiftsSchema>;
