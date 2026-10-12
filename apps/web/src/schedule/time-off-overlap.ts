import type { TimeOffRequest } from "@newfork/shared";

type Days = { from: string; to: string };
/** Someone else off on some of the days a time off request asks for. */
export type AlsoOff = { employeeId: string; name: string; days: Days[] };

const nextDay = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/**
 * "Also off these days" (Mert, 2026-10-11): who else already has approved time
 * off on the days this request asks for, among the requests the reader may
 * read. One line per person; days that run on are joined, days apart stay apart.
 */
export function alsoOffThese(request: TimeOffRequest, all: readonly TimeOffRequest[]): AlsoOff[] {
  const people = new Map<string, { name: string; days: Days[] }>();
  for (const other of all) {
    if (other.employee_id === request.employee_id || other.status !== "approved" || other.request_type !== "time_off") continue;
    if (other.start_date > request.end_date || other.end_date < request.start_date) continue;
    const from = other.start_date > request.start_date ? other.start_date : request.start_date;
    const to = other.end_date < request.end_date ? other.end_date : request.end_date;
    const seen = people.get(other.employee_id) ?? { name: other.employee_name, days: [] };
    seen.days.push({ from, to });
    people.set(other.employee_id, seen);
  }
  return [...people.entries()]
    .map(([employeeId, { name, days }]) => ({ employeeId, name, days: joined(days) }))
    .sort((a, b) => a.days[0]!.from.localeCompare(b.days[0]!.from) || a.name.localeCompare(b.name));
}

function joined(days: Days[]): Days[] {
  const out: Days[] = [];
  for (const range of [...days].sort((a, b) => a.from.localeCompare(b.from))) {
    const last = out.at(-1);
    if (last && range.from <= nextDay(last.to)) last.to = range.to > last.to ? range.to : last.to;
    else out.push({ ...range });
  }
  return out;
}

/** "Oct 14", "Oct 13 – Oct 14" or "Oct 13, Oct 15". */
export function alsoOffDays(entry: Pick<AlsoOff, "days">) {
  const day = (date: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(`${date}T12:00:00Z`));
  return entry.days.map((range) => (range.from === range.to ? day(range.from) : `${day(range.from)} – ${day(range.to)}`)).join(", ");
}
