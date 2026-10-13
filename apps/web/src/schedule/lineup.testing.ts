import { scheduleReadModelSchema } from "@newfork/shared/schedule";

// Test world for the Lineup: two locations, two shift types, two departments.

export const ws = "10000000-0000-4000-8000-000000000001";
export const downtown = "20000000-0000-4000-8000-000000000001";
export const uptown = "20000000-0000-4000-8000-000000000002";
export const lunch = "30000000-0000-4000-8000-000000000001";
export const dinner = "30000000-0000-4000-8000-000000000002";
export const foh = "40000000-0000-4000-8000-000000000001";
export const boh = "40000000-0000-4000-8000-000000000002";
export const server = "50000000-0000-4000-8000-000000000001";
export const host = "50000000-0000-4000-8000-000000000002";
export const cook = "50000000-0000-4000-8000-000000000003";
export const oldJob = "50000000-0000-4000-8000-000000000009";
export const maria = "60000000-0000-4000-8000-000000000001";
export const hannah = "60000000-0000-4000-8000-000000000002";
export const chloe = "60000000-0000-4000-8000-000000000003";
export const aisha = "60000000-0000-4000-8000-000000000004";
export const day = "2026-10-13";

let n = 0;
export function shift(input: {
  location?: string;
  employee: string | null;
  job: string;
  type: string | null;
  start: string;
  end: string;
  date?: string;
  labels?: string[];
}) {
  n += 1;
  return {
    id: `70000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    location_id: input.location ?? downtown,
    employee_id: input.employee,
    job_id: input.job,
    shift_type_id: input.type,
    scheduled_date: input.date ?? day,
    start_time: input.start,
    end_time: input.end,
    crosses_midnight: false,
    label_names: input.labels,
    note: "",
    warning_codes: [],
  };
}

function person(id: string, name: string) {
  return { id, employee_code: name.slice(0, 3).toUpperCase(), display_name: name, location_ids: [downtown], job_ids: [] };
}

export function model(shifts: ReturnType<typeof shift>[], closures: unknown[] = []) {
  return scheduleReadModelSchema.parse({
    workspace_id: ws,
    week_start: "2026-10-12",
    week_start_day: "monday",
    settings: { time_format: "12h" },
    locations: [
      { id: uptown, name: "Uptown", timezone: "America/Los_Angeles", sort_order: 2, publication_status: "published", published_at: null },
      { id: downtown, name: "Downtown", timezone: "America/Los_Angeles", sort_order: 1, publication_status: "published", published_at: null },
    ],
    departments: [
      { id: boh, name: "Kitchen", color: "#aa3300", system_key: null },
      { id: foh, name: "Front of House", color: "#0033aa", system_key: null },
    ],
    jobs: [
      { id: server, name: "Server", color: "#2255ee", department_id: foh, system_key: null },
      { id: host, name: "Host", color: "#22aaee", department_id: foh, system_key: null },
      { id: cook, name: "Line Cook", color: "#ee5522", department_id: boh, system_key: null },
    ],
    shift_types: [
      { id: dinner, name: "Dinner", color: "#5b4bd6", sort_order: 2, default_start_time: "16:00", default_end_time: "22:00" },
      { id: lunch, name: "Lunch", color: "#1fb08a", sort_order: 1, default_start_time: "11:00", default_end_time: "16:00" },
    ],
    employees: [person(maria, "Maria Lopez"), person(hannah, "Hannah Lee"), person(chloe, "Chloe Davis"), person(aisha, "Aisha Johnson")],
    shifts,
    closures,
    referenced_jobs: [{ id: oldJob, name: "Barback" }],
    referenced_shift_types: [],
  });
}
