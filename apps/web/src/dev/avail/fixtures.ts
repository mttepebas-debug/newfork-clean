// Fake week for the availability lab: Kadıköy, Mon Oct 19 – Sun Oct 25 2026, New York clock (EDT, -4h).
import type { ExchangeShift } from "@newfork/shared";
import type { ScheduleEditSession, ScheduleReadModel } from "@newfork/shared/schedule";

export const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
export const kadikoy = "11111111-1111-4111-8111-111111111111";
const timezone = "America/New_York";
const offset = -4 * 3600;
export const week = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"];

export const jobs = {
  manager: "33333333-3333-4333-8333-333333333331",
  server: "33333333-3333-4333-8333-333333333332",
  bartender: "33333333-3333-4333-8333-333333333333",
  cook: "33333333-3333-4333-8333-333333333334",
};
const lunch = "44444444-4444-4444-8444-444444444441";
const dinner = "44444444-4444-4444-8444-444444444442";

export const people = {
  mudur1: "55555555-5555-4555-8555-555555555551",
  garson1: "55555555-5555-4555-8555-555555555552",
  garson2: "55555555-5555-4555-8555-555555555553",
  barmen1: "55555555-5555-4555-8555-555555555554",
  asci1: "55555555-5555-4555-8555-555555555555",
};

// Local wall time on a lab day as a UTC instant.
const at = (day: string, hour: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + hour * 3_600_000 - offset * 1000).toISOString();

type Window = { readonly day: string; readonly from: number; readonly to: number };

function projection(unavailable: readonly Window[], leave: readonly Window[] = []) {
  const interval = ({ day, from, to }: Window) => ({ start_at: at(day, from), end_at: at(day, to) });
  return [
    {
      location_id: kadikoy,
      location_name: "Kadıköy",
      timezone,
      week_start: week[0]!,
      status: "ready" as const,
      unavailable_intervals: unavailable.map(interval),
      employee_intervals: unavailable.map(interval),
      manager_notes: ["", "", "", "", "", "", ""],
      leave_intervals: leave.map(interval),
      clock_segments: [{ start_at: at(week[0]!, -24), end_at: at(week[6]!, 48), offset_seconds: offset }],
      days: week.map((date) => ({
        date,
        has_unavailable: unavailable.some((item) => item.day === date),
        all_day: unavailable.some((item) => item.day === date && item.from <= 0 && item.to >= 24),
      })),
    },
  ];
}

const employee = (id: string, code: string, name: string, job: string, availability = projection([])) => ({
  id,
  employee_code: code,
  display_name: name,
  location_ids: [kadikoy],
  job_ids: [job],
  primary_job_id: job,
  weekly_availability: availability,
});

let shiftNumber = 0;
export function shift(employeeId: string | null, job: string, day: string, start: string, end: string, warn = false) {
  shiftNumber += 1;
  return {
    id: `66666666-6666-4666-8666-${String(shiftNumber).padStart(12, "0")}`,
    location_id: kadikoy,
    employee_id: employeeId,
    job_id: job,
    shift_type_id: start < "15:00" ? lunch : dinner,
    scheduled_date: day,
    start_time: start,
    end_time: end,
    crosses_midnight: false,
    unpaid_break_minutes: 0,
    hide_time_on_badge: false,
    label_ids: [] as string[],
    label_names: [] as string[],
    note: "",
    warning_codes: (warn ? ["availability"] : []) as "availability"[],
  };
}

export type LabShift = ReturnType<typeof shift>;

// KadıköyGarson2: unavailable Tue after 5:00 PM and all day Sat. KadıköyGarson1: approved
// time off Thu, unavailable Mon until 2:00 PM. KadıköyBarmen1: unavailable Fri after 6:00 PM.
export function scheduleModel(shifts: readonly LabShift[] = seedShifts()): ScheduleReadModel {
  return {
    workspace_id: workspaceId,
    week_start: week[0]!,
    week_start_day: "monday",
    settings: { time_format: "12h" },
    locations: [
      { id: kadikoy, name: "Kadıköy", timezone, sort_order: 0, publication_status: "published", published_at: "2026-10-16T18:00:00Z" },
    ],
    departments: [],
    jobs: [
      { id: jobs.manager, department_id: null, system_key: null, name: "Manager", color: "#0F766E" },
      { id: jobs.server, department_id: null, system_key: null, name: "Server", color: "#2563EB" },
      { id: jobs.bartender, department_id: null, system_key: null, name: "Bartender", color: "#9333EA" },
      { id: jobs.cook, department_id: null, system_key: null, name: "Cook", color: "#EA580C" },
    ],
    referenced_jobs: [],
    referenced_shift_types: [],
    shift_types: [
      { id: lunch, name: "Lunch", color: "#0EA5E9", sort_order: 0, default_start_time: "11:00", default_end_time: "16:00" },
      { id: dinner, name: "Dinner", color: "#7C3AED", sort_order: 1, default_start_time: "16:00", default_end_time: "23:00" },
    ],
    shift_labels: [],
    employees: [
      employee(people.mudur1, "NF-001", "KadıköyMüdür1", jobs.manager),
      employee(people.garson1, "NF-002", "KadıköyGarson1", jobs.server,
        projection([{ day: week[0]!, from: 0, to: 14 }], [{ day: week[3]!, from: 0, to: 24 }])),
      employee(people.garson2, "NF-003", "KadıköyGarson2", jobs.server,
        projection([{ day: week[1]!, from: 17, to: 24 }, { day: week[5]!, from: 0, to: 24 }])),
      employee(people.barmen1, "NF-004", "KadıköyBarmen1", jobs.bartender, projection([{ day: week[4]!, from: 18, to: 24 }])),
      employee(people.asci1, "NF-005", "KadıköyAşçı1", jobs.cook),
    ],
    shifts: shifts.map((item) => ({ ...item })),
    closures: [],
    important_dates: [],
  } as ScheduleReadModel;
}

export function seedShifts(): LabShift[] {
  shiftNumber = 0;
  return [
    shift(people.mudur1, jobs.manager, week[0]!, "10:00", "18:00"),
    shift(people.mudur1, jobs.manager, week[2]!, "10:00", "18:00"),
    shift(people.mudur1, jobs.manager, week[4]!, "14:00", "22:00"),
    shift(people.garson1, jobs.server, week[1]!, "11:00", "16:00"),
    shift(people.garson1, jobs.server, week[4]!, "16:00", "23:00"),
    shift(people.garson2, jobs.server, week[0]!, "11:00", "16:00"),
    // Placed through the Warn box, so the card carries the orange "!".
    shift(people.garson2, jobs.server, week[1]!, "16:00", "23:00", true),
    shift(people.barmen1, jobs.bartender, week[3]!, "16:00", "23:00"),
    shift(people.barmen1, jobs.bartender, week[5]!, "16:00", "23:00"),
    shift(people.asci1, jobs.cook, week[0]!, "10:00", "16:00"),
    shift(people.asci1, jobs.cook, week[2]!, "16:00", "23:00"),
    shift(people.asci1, jobs.cook, week[6]!, "11:00", "16:00"),
  ];
}

export function editSession(model: ScheduleReadModel): ScheduleEditSession {
  return {
    id: "77777777-7777-4777-8777-777777777777",
    workspace_id: model.workspace_id,
    week_start: model.week_start,
    source_kind: "published",
    source_draft_id: null,
    source_revision: 1,
    holder_user_id: "88888888-8888-4888-8888-888888888888",
    location_ids: [kadikoy],
    holder_name: "KadıköyMüdür1",
    revision: 1,
    dirty: false,
    last_heartbeat: "2026-10-19T12:00:00Z",
    expires_at: "2026-10-19T12:04:00Z",
    shifts: model.shifts.map((item) => ({ ...item, revision: 1 })),
  } as ScheduleEditSession;
}

// The shift KadıköyGarson1 gave up (cover, Tue) and an open Saturday shift (pickup), both at Kadıköy.
export function exchangeShift(kind: "cover" | "pickup"): ExchangeShift {
  const day = kind === "cover" ? week[1]! : week[5]!;
  return {
    id: kind === "cover" ? "99999999-9999-4999-8999-999999999991" : "99999999-9999-4999-8999-999999999992",
    source_id: kind === "cover" ? "99999999-9999-4999-8999-999999999981" : "99999999-9999-4999-8999-999999999982",
    location_id: kadikoy,
    location_name: "Kadıköy",
    timezone,
    job_id: jobs.server,
    job_name: "Server",
    shift_type_name: "Dinner",
    unpaid_break_minutes: 0,
    scheduled_date: day,
    start_time: "16:00",
    end_time: "23:00",
    starts_at: at(day, 16),
    ends_at: at(day, 23),
    employee_id: kind === "cover" ? people.garson1 : null,
    employee_name: kind === "cover" ? "KadıköyGarson1" : null,
    availability_warning: null,
  } as ExchangeShift;
}
