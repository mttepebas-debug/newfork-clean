import type { TimeOffRequest } from "@newfork/shared";

/** Someone else off on some of the days a time off request asks for. */
export type AlsoOff = { employeeId: string; name: string; from: string; to: string };

/**
 * "Also off these days" (Mert, 2026-10-11): who else already has approved time
 * off on the days this request asks for, among the requests the reader may
 * read. One line per person, their overlap from its first to its last day.
 */
export function alsoOffThese(request: TimeOffRequest, all: readonly TimeOffRequest[]): AlsoOff[] {
  const people = new Map<string, AlsoOff>();
  for (const other of all) {
    if (other.employee_id === request.employee_id || other.status !== "approved" || other.request_type !== "time_off") continue;
    if (other.start_date > request.end_date || other.end_date < request.start_date) continue;
    const from = other.start_date > request.start_date ? other.start_date : request.start_date;
    const to = other.end_date < request.end_date ? other.end_date : request.end_date;
    const seen = people.get(other.employee_id);
    people.set(other.employee_id, seen
      ? { ...seen, from: from < seen.from ? from : seen.from, to: to > seen.to ? to : seen.to }
      : { employeeId: other.employee_id, name: other.employee_name, from, to });
  }
  return [...people.values()].sort((a, b) => a.from.localeCompare(b.from) || a.name.localeCompare(b.name));
}

/** "Oct 14" or "Oct 13 – Oct 14". */
export function alsoOffDays(entry: Pick<AlsoOff, "from" | "to">) {
  const day = (date: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(`${date}T12:00:00Z`));
  return entry.from === entry.to ? day(entry.from) : `${day(entry.from)} – ${day(entry.to)}`;
}
