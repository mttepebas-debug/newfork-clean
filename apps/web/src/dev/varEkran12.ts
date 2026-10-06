// VAR-EKRAN-12: DEV-only visual variants for Schedule (EKRAN-01 VAR) and
// Requests (EKRAN-02 V). Lives only on task/var-ekran-12; never merged.
// Address: ?var=bl445-b,bl525-c  -> devVar("bl445") === "b".
import type { ScheduleReadModel, ScheduleShift } from "@newfork/shared/schedule";

function params(): URLSearchParams | null {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search);
}

export function devVar(id: string): string | null {
  const raw = params()?.get("var");
  if (!raw) return null;
  for (const item of raw.split(",")) {
    const [key, letter] = item.trim().toLowerCase().split("-");
    if (key === id && letter) return letter;
  }
  return null;
}

/** Mirrors ?var= onto <html data-var-<id>="<letter>"> so plain CSS can switch. */
export function installVarAttributes(): void {
  if (!import.meta.env.DEV) return;
  const sync = () => {
    const root = document.documentElement;
    for (const name of Object.keys(root.dataset)) {
      if (name.startsWith("var")) delete root.dataset[name];
    }
    const raw = params()?.get("var");
    if (!raw) return;
    for (const item of raw.split(",")) {
      const [key, letter] = item.trim().toLowerCase().split("-");
      if (key && letter) root.setAttribute(`data-var-${key}`, letter);
    }
  };
  for (const method of ["pushState", "replaceState"] as const) {
    const original = history[method].bind(history);
    history[method] = (...args: Parameters<History["pushState"]>) => {
      original(...args);
      sync();
    };
  }
  window.addEventListener("popstate", sync);
  sync();
  // Machado et al. 2009 matrices, severity 1.0: ?var=cb-p / cb-d.
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("style", "position:absolute;width:0;height:0");
  svg.innerHTML = `
    <filter id="var-cb-protanopia"><feColorMatrix type="matrix" values="0.152286 1.052583 -0.204868 0 0 0.114503 0.786281 0.099216 0 0 -0.003882 -0.048116 1.051998 0 0 0 0 0 1 0"/></filter>
    <filter id="var-cb-deuteranopia"><feColorMatrix type="matrix" values="0.367322 0.860646 -0.227968 0 0 0.280085 0.672501 0.047413 0 0 -0.011820 0.042940 0.968881 0 0 0 0 0 1 0"/></filter>`;
  document.body.appendChild(svg);
}

/** A full week to look at: only when the address carries ?var=. */
export function devDemoScheduleModel(model: ScheduleReadModel): ScheduleReadModel {
  const search = params();
  if (!search?.get("var") || search.get("demo") === "off") return model;
  const wanted = search.get("locations")?.split(",")[0];
  const location = model.locations.find((item) => item.id === wanted) ?? model.locations[0];
  if (!location) return model;
  const lunch = model.shift_types[0];
  const dinner = model.shift_types[1] ?? lunch;
  const jobIds = new Set(model.jobs.map((job) => job.id));
  const days = Array.from({ length: 7 }, (_, index) => addDays(model.week_start, index));
  const fallbackJob = model.jobs[0]?.id;
  const people = model.employees
    .filter((employee) => employee.location_ids.includes(location.id) && !employee.is_excluded_from_schedule)
    .sort((left, right) => left.display_name.localeCompare(right.display_name))
    .slice(0, 16);
  const offset = offsetOf(model, location.id);

  // Marks on the first rows, so orange and red sit next to each other:
  // row 2 unavailable Tue evening, row 4 all day Sat, rows 3 and 6 on time off.
  const unavailable = new Map<number, { day: number; from: string; to: string; allDay: boolean }>([
    [1, { day: 1, from: "14:00", to: "24:00", allDay: false }],
    [3, { day: 2, from: "00:00", to: "24:00", allDay: true }],
    [7, { day: 5, from: "00:00", to: "24:00", allDay: true }],
  ]);
  const leave = new Map<number, readonly number[]>([
    [2, [2, 3]],
    [5, [0, 1]],
  ]);

  const shifts: ScheduleShift[] = [];
  let serial = 0;
  people.forEach((employee, person) => {
    const own = employee.primary_job_id ?? employee.job_ids[0];
    const jobId = own && jobIds.has(own) ? own : fallbackJob;
    if (!jobId) return;
    days.forEach((date, day) => {
      if ((person + day) % 7 === 5 || (person + day) % 7 === 6) return;
      if (leave.get(person)?.includes(day)) return;
      const mark = unavailable.get(person);
      const type = (mark && !mark.allDay && mark.day === day) || (person + day) % 3 === 0 ? dinner : lunch;
      if (!type) return;
      if (mark?.allDay && mark.day === day) return;
      serial += 1;
      shifts.push({
        id: `00000000-0000-4000-8000-${serial.toString(16).padStart(12, "0")}`,
        location_id: location.id,
        employee_id: employee.id,
        job_id: jobId,
        shift_type_id: type.id,
        scheduled_date: date,
        start_time: type.default_start_time ?? "11:30",
        end_time: type.default_end_time ?? "15:30",
        crosses_midnight: false,
        unpaid_break_minutes: 0,
        hide_time_on_badge: false,
        note: "",
        warning_codes: mark && !mark.allDay && mark.day === day && type === dinner ? ["availability"] : [],
      });
    });
  });

  const employees = model.employees.map((employee) => {
    const person = people.indexOf(employee);
    if (person < 0) return employee;
    const mark = unavailable.get(person);
    const leaveDays = leave.get(person) ?? [];
    if (!mark && !leaveDays.length) return employee;
    const instant = (day: number, time: string) =>
      new Date(Date.parse(`${days[day]}T${time === "24:00" ? "23:59" : time}:00Z`) - offset * 1000 + (time === "24:00" ? 60_000 : 0)).toISOString();
    const projection = {
      location_id: location.id,
      location_name: location.name,
      timezone: location.timezone ?? "America/Los_Angeles",
      week_start: model.week_start,
      status: "ready" as const,
      unavailable_intervals: mark ? [{ start_at: instant(mark.day, mark.from), end_at: instant(mark.day, mark.to) }] : [],
      employee_intervals: mark ? [{ start_at: instant(mark.day, mark.from), end_at: instant(mark.day, mark.to) }] : [],
      note_intervals: [],
      manager_notes: null,
      note_author: null,
      note_edited_at: null,
      leave_intervals: leaveDays.map((day) => ({ start_at: instant(day, "00:00"), end_at: instant(day, "24:00") })),
      clock_segments: [{ start_at: instant(0, "00:00"), end_at: instant(6, "24:00"), offset_seconds: offset }],
      days: days.map((date, day) => ({
        date,
        has_unavailable: mark?.day === day,
        all_day: mark?.day === day && mark.allDay,
      })),
    };
    const others = (employee.weekly_availability ?? []).filter((item) => item.location_id !== location.id);
    return { ...employee, weekly_availability: [...others, projection] } as typeof employee;
  });

  return { ...model, employees, shifts: [...model.shifts.filter((shift) => shift.location_id !== location.id), ...shifts] };
}

function offsetOf(model: ScheduleReadModel, locationId: string): number {
  for (const employee of model.employees) {
    const projection = employee.weekly_availability?.find((item) => item.location_id === locationId);
    const segment = projection?.clock_segments[0];
    if (segment) return segment.offset_seconds;
  }
  return -25_200;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
