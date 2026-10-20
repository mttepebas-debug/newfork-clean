import type { LineupDay, LineupDayLineup } from "@newfork/shared";
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
  crossesMidnight?: boolean;
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
    crosses_midnight: input.crossesMidnight ?? false,
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

type Model = ReturnType<typeof model>;

/**
 * The lineup day read (get_lineup_day_service) for a test model, as the server answers it: each location in
 * its order, a lineup per shift type that has shifts there (or that `extra` names, with its fields), rows as
 * the Schedule has them.
 */
export function dayRead(m: Model, date: string, extra: Record<string, Partial<LineupDayLineup>> = {}): LineupDay {
  const jobs = new Map(
    [...m.referenced_jobs.map((job) => ({ ...job, color: null, department_id: null as string | null })), ...m.jobs]
      .map((job) => [job.id, job]),
  );
  const departments = new Map(m.departments.map((department) => [department.id, department]));
  const types = new Map(m.shift_types.map((type) => [type.id, type]));
  const names = new Map(m.employees.map((employee) => [employee.id, employee.display_name]));
  const closure = (location: string, kind: string) => {
    const c = m.closures.find((item) => item.location_id === location && item.closed_date === date && item.kind === kind);
    return c ? { title: c.title, status: c.status ?? null, opens: c.opens ?? null, closes: c.closes ?? null } : null;
  };
  return {
    workspace_id: m.workspace_id,
    date,
    sections: [],
    locations: [...m.locations].sort((a, b) => a.sort_order - b.sort_order).map((location) => {
      const closed = closure(location.id, "closed");
      const here = m.shifts.filter((s) => s.location_id === location.id && s.scheduled_date === date);
      const keys = [...new Set([
        ...here.map((s) => s.shift_type_id),
        ...Object.keys(extra).map((key) => (key === "none" ? null : key)),
      ])];
      return {
        id: location.id,
        name: location.name,
        timezone: location.timezone,
        closed,
        short_hours: closure(location.id, "short"),
        lineups: closed ? [] : keys.map((key) => {
          const rows = here.filter((s) => s.shift_type_id === key);
          const people = new Set(rows.flatMap((s) => (s.employee_id ? [s.employee_id] : []))).size;
          return {
            id: null, shift_type_id: key, shift_type_name: key ? types.get(key)?.name ?? null : null,
            color: key ? types.get(key)?.color ?? null : null, status: "draft" as const, version: null, shared_at: null,
            ask_ack: null, acknowledged: null, revision: null, published: false, version_id: null, shared_by: null,
            shared_by_name: null, people, with_app: people, notes: { specials: "", n86: "", shift_notes: "" },
            rows: rows.map((s) => {
              const job = jobs.get(s.job_id);
              const department = job?.department_id ? departments.get(job.department_id) : undefined;
              return {
                id: null, shift_id: s.id, source_shift_id: s.id, employee_id: s.employee_id,
                name: s.employee_id ? names.get(s.employee_id) ?? null : null, job_id: s.job_id, job_name: job?.name ?? null,
                job_color: job?.color ?? null, department_id: department?.id ?? null, department_name: department?.name ?? null,
                start_time: s.start_time, end_time: s.end_time, crosses_midnight: s.crosses_midnight,
                schedule_start_time: s.start_time, schedule_end_time: s.end_time, label_ids: [],
                label_names: s.label_names ?? [], section_id: null, section_name: null, sort_order: null,
                called_off_at: null, called_off_by: null, replaced_by_row_id: null, lineup_only: false, changed: [],
                has_app: Boolean(s.employee_id), acknowledged_at: null, art_key: null,
              };
            }),
            ...extra[key ?? "none"],
          };
        }),
      };
    }),
  };
}
