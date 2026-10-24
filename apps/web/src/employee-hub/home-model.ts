// The employee's Home, variant A "Gün ışığı" (Mert 2026-10-18): the pure part.
// Every time here is a wall time in the shift's own location.
import type { EmployeeHubReadModel, EmployeeHubShift } from "@newfork/shared";
import { addDays } from "../schedule/lib/scheduleDateTime";

export function minutesOf(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
}

/** The part of the day the sky behind the greeting follows. */
export type DaySlot = "morning" | "afternoon" | "evening" | "night";
export function daySlot(minute: number): DaySlot {
  const hour = minute / 60;
  return hour >= 5 && hour < 12 ? "morning" : hour >= 12 && hour < 17 ? "afternoon" : hour >= 17 && hour < 21 ? "evening" : "night";
}

/** "25m", "2h 15m", "1 day", "2 days". */
export function countdown(milliseconds: number): string {
  const minutes = Math.max(0, Math.round(milliseconds / 60_000));
  if (minutes >= 2880) return `${Math.floor(minutes / 1440)} days`;
  if (minutes >= 1440) return "1 day";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? (rest ? `${hours}h ${rest}m` : `${hours}h`) : `${rest}m`;
}

// The day's arc: 6 AM on the left, midnight on the right, a gentle hill between.
export const ARC = { width: 358, x0: 12, x1: 346, base: 50, peak: -26 } as const;
const arcT = (minute: number) => Math.min(1, Math.max(0, (minute - 360) / 1080));
export function arcPoint(t: number): [number, number] {
  const mid = ARC.width / 2;
  return [
    (1 - t) * (1 - t) * ARC.x0 + 2 * (1 - t) * t * mid + t * t * ARC.x1,
    (1 - t) * (1 - t) * ARC.base + 2 * (1 - t) * t * ARC.peak + t * t * ARC.base,
  ];
}
export function arcPath(from: number, to: number, steps = 48): string {
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const [x, y] = arcPoint(from + ((to - from) * i) / steps);
    d += `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}
/** Where each shift sits on the arc; an overnight one runs to its end, past midnight off the arc. */
export function arcSegments(shifts: readonly { start_time: string; end_time: string }[]) {
  return shifts.map((shift) => {
    const start = minutesOf(shift.start_time);
    let end = minutesOf(shift.end_time);
    if (end <= start) end += 1440;
    return { from: arcT(start), to: arcT(end) };
  });
}
export const arcNow = (minute: number) => arcT(minute);

export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export type HomeDay = {
  date: string;
  weekday: string;
  day: number;
  shifts: EmployeeHubShift[];
  hours: number;
  timeOff: boolean;
  open: number;
};
const shiftHours = (shift: EmployeeHubShift) => {
  const start = minutesOf(shift.start_time);
  let end = minutesOf(shift.end_time);
  if (end <= start) end += 1440;
  return (end - start) / 60;
};
/** Seven days from today: the person's own shifts, approved time off and open shifts. */
export function homeWeek(model: EmployeeHubReadModel, today: string, openDates: readonly string[] = []): HomeDay[] {
  // The read's days with time off, old and new alike (time off rebuild D3, D7).
  const offDays = new Set(model.leave_days);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i);
    const shifts = model.shifts
      .filter((shift) => shift.scheduled_date === date)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
    return {
      date,
      weekday: new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
      day: Number(date.slice(-2)),
      shifts,
      hours: shifts.reduce((sum, shift) => sum + shiftHours(shift), 0),
      timeOff: offDays.has(date),
      // Released shifts in the pool, not unassigned ones (QA 38, S-151 (3)).
      open: openDates.filter((day) => day === date).length,
    };
  });
}

/**
 * "Manager on the floor" (Mert 2026-10-18, S-163 (7)): someone whose shift in a
 * Management job runs at the same place, on the same day, at the same time;
 * the earliest such shift. None, and Home shows nothing.
 */
export type FloorManager = { id: string; name: string; job: string };
export function managerOnFloor(model: EmployeeHubReadModel, shift: EmployeeHubShift): FloorManager | null {
  const span = (item: EmployeeHubShift) => {
    const start = minutesOf(item.start_time);
    const end = minutesOf(item.end_time);
    return [start, end <= start ? end + 1440 : end] as const;
  };
  const [start, end] = span(shift);
  const found = model.team_shifts
    .filter((item) => item.is_management === true && item.employee_name && item.employee_id !== model.employee.id)
    .filter((item) => item.id !== shift.id && item.scheduled_date === shift.scheduled_date && item.location_id === shift.location_id)
    .filter((item) => {
      const [s, e] = span(item);
      return s < end && e > start;
    })
    .sort((a, b) => a.start_time.localeCompare(b.start_time))[0];
  return found ? { id: found.id, name: found.employee_name!, job: found.job_name } : null;
}
