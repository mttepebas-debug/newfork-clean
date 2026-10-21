// Can this shift go into this cell? A local twin of the rules a drop, a
// paste or the shift window checks (BEHAVIOR §5 rules 93-95, 105, 133).
// Covered here: excluded, not assigned (location, job, shift type), overlap
// with the person's own shifts (other locations and unreachable ones too),
// a closed or short day by the workspace policy, unknown hours.
import type { Shift, Week } from "./model";
import { minutesOf } from "./model";
import { jobOf, typeOf } from "./derive";

export type CellStatus = "allowed" | "warning" | "blocked";

export type Target = { employeeId: string | null; locationId: string; date: string };

export type Assessment = {
  status: CellStatus;
  /** One or two words for the dragged card. */
  reason: string | null;
  messages: string[];
};

type Candidate = Pick<Shift, "jobId" | "shiftTypeId" | "start" | "end"> & { id?: string };

function span(start: string | null, end: string | null): [number, number] | null {
  const s = minutesOf(start);
  const e = minutesOf(end);
  if (s === null || e === null) return null;
  return [s, e > s ? e : e + 24 * 60];
}

const overlaps = (a: [number, number], b: [number, number]) => a[0] < b[1] && b[0] < a[1];

export function assess(args: {
  week: Week;
  shifts: Shift[];
  candidate: Candidate;
  target: Target;
  /** The shift being moved: it does not clash with itself. */
  ignoreId?: string | null;
}): Assessment {
  const { week, shifts, candidate, target } = args;
  const blocks: { reason: string; message: string }[] = [];
  const confirms: { reason: string; message: string }[] = [];
  const location = week.locations.find((l) => l.id === target.locationId);
  const job = jobOf(week, candidate.jobId);
  if (!location || !job) blocks.push({ reason: "Not allowed", message: "This location or job no longer exists." });

  const closure = week.closures.find((c) => c.locationId === target.locationId && c.date === target.date);
  if (closure) {
    const entry = {
      reason: closure.kind === "closed" ? "Closed" : "Short hours",
      message: closure.kind === "closed" ? `${location?.name ?? "The location"} is closed: ${closure.title}.` : `Short hours: ${closure.title}.`,
    };
    if (week.closedPolicy === "block") blocks.push(entry);
    else if (week.closedPolicy === "confirm") confirms.push(entry);
  }

  if (target.employeeId) {
    const person = week.employees.find((e) => e.id === target.employeeId);
    if (!person) {
      blocks.push({ reason: "Not allowed", message: "This person is not on the schedule." });
    } else {
      if (person.excluded) blocks.push({ reason: "Excluded", message: `${person.name} is excluded from the schedule.` });
      if (!person.locationIds.includes(target.locationId)) {
        blocks.push({ reason: "Not assigned", message: `${person.name} does not work at ${location?.name ?? "this location"}.` });
      } else if (!person.jobIds.includes(candidate.jobId)) {
        blocks.push({ reason: "Not assigned", message: `${person.name} is not assigned to ${job?.name ?? "this job"}.` });
      } else if (candidate.shiftTypeId && person.shiftTypeIds.length && !person.shiftTypeIds.includes(candidate.shiftTypeId)) {
        blocks.push({ reason: "Not assigned", message: `${person.name} does not work ${typeOf(week, candidate.shiftTypeId)?.name ?? "this shift type"}.` });
      }
      const mine = span(candidate.start, candidate.end);
      if (mine) {
        const clash =
          shifts.some(
            (s) =>
              s.employeeId === person.id &&
              s.date === target.date &&
              !s.removed &&
              s.id !== args.ignoreId &&
              s.id !== candidate.id &&
              (() => {
                const other = span(s.start, s.end);
                return other ? overlaps(mine, other) : false;
              })(),
          ) ||
          week.outside.some((g) => {
            if (g.employeeId !== person.id || g.date !== target.date) return false;
            const other = span(g.start, g.end);
            return other ? overlaps(mine, other) : false;
          });
        if (clash) blocks.push({ reason: "Overlaps", message: `${person.name} already works then.` });
      }
    }
  }
  if (!candidate.start || !candidate.end) confirms.push({ reason: "Check hours", message: "This shift has no hours yet." });

  if (blocks.length) return { status: "blocked", reason: blocks[0]!.reason, messages: blocks.map((b) => b.message) };
  if (confirms.length) return { status: "warning", reason: confirms[0]!.reason, messages: confirms.map((c) => c.message) };
  return { status: "allowed", reason: null, messages: [] };
}

/** Rows fold away during a drag for people with no non-blocked day for it at its own location (rule 95). */
export function foldedFor(week: Week, shifts: Shift[], shift: Shift, dates: string[]): Set<string> {
  const folded = new Set<string>();
  for (const person of week.employees) {
    if (person.id === shift.employeeId) continue;
    const anyDay = dates.some(
      (date) =>
        assess({ week, shifts, candidate: shift, target: { employeeId: person.id, locationId: shift.locationId, date }, ignoreId: shift.id })
          .status !== "blocked",
    );
    if (!anyDay) folded.add(person.id);
  }
  return folded;
}

/** People who can take a shift with this job and type at this location (rule 133). */
export function eligiblePeople(week: Week, shifts: Shift[], candidate: Candidate, target: Omit<Target, "employeeId">, keepId: string | null) {
  return week.employees
    .filter(
      (person) =>
        person.id === keepId ||
        assess({ week, shifts, candidate, target: { ...target, employeeId: person.id }, ignoreId: candidate.id }).status !== "blocked",
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}
