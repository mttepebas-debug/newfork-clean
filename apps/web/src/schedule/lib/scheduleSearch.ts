import type { ScheduleReadModel } from "@newfork/shared/schedule";

/** How the search marks a card it leaves on screen: framed, or faded beside one. */
export type ScheduleSearchMark = "match" | "dim";

export interface ScheduleSearchResult {
  readonly model: ScheduleReadModel;
  /** Shift id → mark; a card with no entry is drawn as usual. */
  readonly marks: ReadonlyMap<string, ScheduleSearchMark>;
}

const NO_MARKS: ReadonlyMap<string, ScheduleSearchMark> = new Map();

/** The top bar search lives in the address as ?q= (S-228). */
export function scheduleSearchTerm(search: URLSearchParams): string {
  return search.get("q")?.trim() ?? "";
}

/**
 * The manager Schedule's search (KARARLAR S-228 (3)), run on the already
 * filtered model so both must match. A person whose name matches stays with
 * every shift. A job or shift type name that matches keeps the people with
 * such a shift in the shown period: those cards are framed, their other cards
 * fade. Open shifts stay only when they match.
 */
export function searchScheduleModel(
  model: ScheduleReadModel,
  term: string,
  { day = null }: { readonly day?: string | null } = {},
): ScheduleSearchResult {
  const needle = term.trim().toLocaleLowerCase();
  if (!needle) return { model, marks: NO_MARKS };
  const has = (text: string | null | undefined) =>
    Boolean(text?.toLocaleLowerCase().includes(needle));
  const jobHits = new Set(model.jobs.filter((job) => has(job.name)).map((job) => job.id));
  const typeHits = new Set(
    model.shift_types.filter((type) => has(type.name)).map((type) => type.id),
  );
  const workHit = (shift: ScheduleReadModel["shifts"][number]) =>
    jobHits.has(shift.job_id) ||
    (shift.shift_type_id !== null && typeHits.has(shift.shift_type_id));
  const nameHits = new Set(
    model.employees.filter((employee) => has(employee.display_name)).map((employee) => employee.id),
  );
  const workPeople = new Set(
    model.shifts
      .filter((shift) => shift.employee_id && (!day || shift.scheduled_date === day) && workHit(shift))
      .map((shift) => shift.employee_id),
  );
  const employees = model.employees.filter(
    (employee) => nameHits.has(employee.id) || workPeople.has(employee.id),
  );
  const kept = new Set(employees.map((employee) => employee.id));
  const shifts = model.shifts.filter((shift) =>
    shift.employee_id ? kept.has(shift.employee_id) : workHit(shift),
  );
  const marks = new Map<string, ScheduleSearchMark>();
  for (const shift of shifts) {
    if (workHit(shift)) marks.set(shift.id, "match");
    else if (!shift.employee_id || !nameHits.has(shift.employee_id)) marks.set(shift.id, "dim");
  }
  return { model: { ...model, employees, shifts }, marks };
}

/** A stacked card is framed when any of its shifts matches, faded when all fade. */
export function stackSearchMark(
  shiftIds: readonly string[],
  marks: ReadonlyMap<string, ScheduleSearchMark> | undefined,
): ScheduleSearchMark | undefined {
  if (!marks?.size || !shiftIds.length) return undefined;
  if (shiftIds.some((id) => marks.get(id) === "match")) return "match";
  return shiftIds.every((id) => marks.get(id) === "dim") ? "dim" : undefined;
}
