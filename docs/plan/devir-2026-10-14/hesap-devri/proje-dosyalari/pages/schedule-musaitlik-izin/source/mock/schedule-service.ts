// Schedule routes of the demo backend. Each handler mirrors the matching
// public.*_service function in supabase/schema.sql at the level the screen
// can see: edit sessions with revisions, drafts, publications, templates.
import { ApiError, type Handler } from "./api";
import {
  addDays, clockSegments, fingerprint, iso, localInstant, minutesOf, mondayOf, shiftSpan, todayIn, uuid,
} from "./time";
import {
  OWNER_NAME, OWNER_USER_ID, WORKSPACE_ID, ZONE, persist, world,
  type Draft, type Publication, type Session, type Shift, type Template, type TemplateShift,
} from "./world";

type Route = (method: string, path: string, handler: Handler) => void;

const NO_DEPARTMENT = "__no_department__";
const nowIso = () => new Date().toISOString();
const lease = () => new Date(Date.now() + 4 * 60_000).toISOString();
const currentWeek = () => mondayOf(todayIn(ZONE));
// The week the page last read; the Templates prototypes preview against it.
let lastViewedDate = todayIn(ZONE);

function fail(status: number, error: string, extra: Record<string, unknown> = {}): never {
  throw new ApiError(status, { error, ...extra });
}

// ---------- availability ----------

interface Span { start: number; end: number }

function unavailableSpans(employeeId: string, weekStart: string): Span[] {
  const employee = world.employees.find((item) => item.id === employeeId);
  if (!employee) return [];
  const spans: Span[] = [];
  for (let day = -1; day < 8; day += 1) {
    const date = addDays(weekStart, day);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    for (const mark of employee.unavailable.filter((item) => item.weekday === weekday)) {
      const start = localInstant(date, mark.from, ZONE);
      const end = mark.to === "24:00" ? localInstant(addDays(date, 1), "00:00", ZONE) : localInstant(date, mark.to, ZONE);
      spans.push({ start, end });
    }
  }
  return spans;
}

function leaveSpans(employeeId: string, weekStart?: string): Span[] {
  return world.time_off
    .filter((item) => item.employee_id === employeeId && item.status === "approved")
    .filter((item) => !weekStart || (item.end_date >= addDays(weekStart, -1) && item.start_date <= addDays(weekStart, 7)))
    .map((item) => ({
      start: localInstant(item.start_date, item.from ?? "00:00", ZONE),
      end: item.to && item.to !== "23:59" ? localInstant(item.end_date, item.to, ZONE) : localInstant(addDays(item.end_date, 1), "00:00", ZONE),
    }));
}

const overlaps = (spans: Span[], span: Span) => spans.some((item) => item.start < span.end && span.start < item.end);
const toInterval = (span: Span) => ({ start_at: iso(span.start), end_at: iso(span.end) });

function weeklyAvailability(employeeId: string, locationIds: string[], weekStart: string) {
  const unavailable = unavailableSpans(employeeId, weekStart);
  const leave = leaveSpans(employeeId, weekStart);
  const segments = clockSegments(weekStart, ZONE);
  return locationIds.map((locationId) => {
    const location = world.locations.find((item) => item.id === locationId)!;
    return {
      location_id: locationId,
      location_name: location.name,
      timezone: ZONE,
      week_start: weekStart,
      status: "ready" as const,
      unavailable_intervals: unavailable.map(toInterval),
      employee_intervals: unavailable.map(toInterval),
      note_intervals: [],
      manager_notes: ["", "", "", "", "", "", ""],
      note_author: null,
      note_edited_at: null,
      leave_intervals: leave.map(toInterval),
      clock_segments: segments,
      days: Array.from({ length: 7 }, (_, index) => {
        const date = addDays(weekStart, index);
        const day = { start: localInstant(date, "00:00", ZONE), end: localInstant(addDays(date, 1), "00:00", ZONE) };
        return {
          date,
          has_unavailable: overlaps(unavailable, day),
          all_day: unavailable.some((item) => item.start <= day.start && item.end >= day.end),
        };
      }),
    };
  });
}

function assess(shift: { employee_id: string | null; scheduled_date: string; start_time: string; end_time: string; location_id: string }) {
  const span = shiftSpan(shift, ZONE);
  const reasons: { code: string; message: string; definite: boolean; severity?: "allow" | "warn" | "confirm" | "block"; intervals?: { start_at: string; end_at: string }[] }[] = [];
  let severity: "allow" | "warn" | "confirm" | "block" = "allow";
  let operation: "allowed" | "blocked" = "allowed";
  const weekStart = mondayOf(shift.scheduled_date);
  const leave = shift.employee_id ? leaveSpans(shift.employee_id, weekStart) : [];
  const unavailable = shift.employee_id ? unavailableSpans(shift.employee_id, weekStart) : [];
  const leaveHit = span ? leave.filter((item) => item.start < span.end && span.start < item.end) : [];
  const unavailableHit = span ? unavailable.filter((item) => item.start < span.end && span.start < item.end) : [];
  if (leaveHit.length) {
    reasons.push({ code: "approved_time_off", message: "Approved time off overlaps this assignment. Resolve the leave or assignment before assigning.", definite: true, severity: "block", intervals: leaveHit.map(toInterval) });
    severity = "block";
    operation = "blocked";
  }
  if (unavailableHit.length) {
    reasons.push({ code: "availability", message: "The assignment overlaps unavailable hours.", definite: true, intervals: unavailableHit.map(toInterval) });
    if (severity === "allow") severity = "warn";
  }
  const all = span ? [toInterval(span)] : [];
  return {
    conflict_severity: severity,
    coverage: !span ? "unknown" : leaveHit.length || unavailableHit.length ? "partial" : "full",
    operation,
    time_basis: "explicit",
    timezone: ZONE,
    assessment_scope: "shift_interval",
    intervals: all,
    available_intervals: leaveHit.length || unavailableHit.length ? [] : all,
    unavailable_intervals: unavailableHit.map(toInterval),
    unknown_intervals: [],
    reasons,
    fingerprint: fingerprint(JSON.stringify([shift, reasons])),
    policy_revision: 1,
    fold_resolution: null,
    assessment_minutes: span ? Math.round((span.end - span.start) / 60000) : null,
    can_override: false,
    warning_policy: "warn",
    has_availability_conflict: unavailableHit.length > 0,
    availability_fingerprint: unavailableHit.length ? fingerprint(JSON.stringify(unavailableHit)) : null,
    preference_timezone: ZONE,
    employee_intervals: unavailableHit.map(toInterval),
    manager_intervals: [],
    responsibility_retained: false,
    override_recorded: false,
  };
}

// ---------- shapes ----------

function warningCodes(shift: Shift, siblings: readonly Shift[]): ("availability" | "closed_location" | "overlap")[] {
  const codes: ("availability" | "closed_location" | "overlap")[] = [];
  if (world.closures.some((closure) => closure.location_id === shift.location_id && closure.closed_date === shift.scheduled_date && closure.is_all_day)) codes.push("closed_location");
  if (shift.employee_id) {
    const span = shiftSpan(shift, ZONE);
    const weekStart = mondayOf(shift.scheduled_date);
    if (span && (overlaps(unavailableSpans(shift.employee_id, weekStart), span) || overlaps(leaveSpans(shift.employee_id, weekStart), span))) codes.push("availability");
    if (siblings.some((other) => other.id !== shift.id && other.employee_id === shift.employee_id && other.pending_op_type !== "delete" &&
      other.scheduled_date === shift.scheduled_date && !shift.crosses_midnight && !other.crosses_midnight &&
      shift.start_time < other.end_time && shift.end_time > other.start_time)) codes.push("overlap");
  }
  return codes;
}

function readShift(shift: Shift, siblings: readonly Shift[]) {
  return {
    id: shift.id,
    location_id: shift.location_id,
    employee_id: shift.employee_id,
    job_id: shift.job_id,
    shift_type_id: shift.shift_type_id,
    scheduled_date: shift.scheduled_date,
    start_time: shift.start_time,
    end_time: shift.end_time,
    crosses_midnight: shift.crosses_midnight,
    time_basis: shift.time_basis,
    time_snapshot: shift.time_snapshot ?? null,
    time_timezone: shift.time_timezone ?? ZONE,
    unpaid_break_minutes: shift.unpaid_break_minutes,
    hide_time_on_badge: shift.hide_time_on_badge,
    label_ids: shift.label_ids,
    label_names: shift.label_names,
    note: shift.note,
    warning_codes: warningCodes(shift, siblings),
    availability_changed_after_publish: false,
  };
}

function editableShift(shift: Shift, siblings: readonly Shift[]) {
  return {
    ...readShift(shift, siblings),
    revision: shift.revision,
    source_published_shift_id: shift.source_published_shift_id ?? null,
    pending_op_type: shift.pending_op_type ?? null,
    locked: shift.locked ?? false,
  };
}

function currentPublication(locationId: string, weekStart: string): Publication | undefined {
  return world.publications.find((item) => item.location_id === locationId && item.week_start === weekStart);
}

function publishedShifts(weekStart: string, locationIds?: readonly string[]): Shift[] {
  return world.publications
    .filter((item) => item.week_start === weekStart && (!locationIds?.length || locationIds.includes(item.location_id)))
    .flatMap((item) => item.shifts);
}

function draftSummary(draft: Draft) {
  return {
    id: draft.id,
    workspace_id: WORKSPACE_ID,
    week_start: draft.week_start,
    name: draft.name,
    revision: draft.revision,
    created_by: OWNER_USER_ID,
    updated_by: OWNER_USER_ID,
    created_at: draft.created_at,
    updated_at: draft.updated_at,
  };
}

function sessionShape(session: Session) {
  const live = session.shifts;
  return {
    id: session.id,
    workspace_id: WORKSPACE_ID,
    week_start: session.week_start,
    source_kind: session.source_kind,
    source_draft_id: session.source_draft_id,
    source_revision: session.source_revision,
    holder_user_id: OWNER_USER_ID,
    holder_name: OWNER_NAME,
    revision: session.revision,
    dirty: session.dirty,
    last_heartbeat: session.last_heartbeat,
    expires_at: session.expires_at,
    location_ids: session.location_ids,
    undo_depth: session.undo.length,
    shifts: [...live]
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date) || a.start_time.localeCompare(b.start_time) || a.id.localeCompare(b.id))
      .map((shift) => editableShift(shift, live)),
  };
}

function templateSummary(template: Template) {
  return {
    id: template.id,
    workspace_id: WORKSPACE_ID,
    name: template.name,
    revision: template.revision,
    shift_count: template.shifts.length,
    open_slot_count: template.shifts.filter((shift) => !shift.employee_id).length,
    created_by_name: template.created_by_name,
    updated_at: template.updated_at,
  };
}

function templateDetail(template: Template) {
  return { template: templateSummary(template), shifts: template.shifts.map((shift) => ({ ...shift })) };
}

function readModel(date: string) {
  const weekStart = mondayOf(date);
  const shifts = publishedShifts(weekStart);
  return {
    workspace_id: WORKSPACE_ID,
    week_start: weekStart,
    week_start_day: "monday",
    settings: {
      time_format: "12h",
      conflict_rules: { approved_time_off: "block", closed_location: "confirm", minimum_travel: "confirm", minimum_rest: "confirm" },
      minimum_travel_minutes: 30,
      minimum_rest_minutes: 600,
    },
    locations: world.locations.map((location) => {
      const publication = currentPublication(location.id, weekStart);
      return {
        id: location.id,
        name: location.name,
        short_name: location.short_name,
        timezone: location.timezone,
        sort_order: location.sort_order,
        publication_status: publication ? "published" : "unpublished",
        published_at: publication?.published_at ?? null,
      };
    }),
    departments: world.departments,
    jobs: world.jobs,
    shift_types: world.shift_types,
    shift_labels: world.shift_labels,
    employees: world.employees.map((employee) => ({
      id: employee.id,
      employee_code: employee.employee_code,
      display_name: employee.display_name,
      location_ids: employee.location_ids,
      job_ids: employee.job_ids,
      primary_job_id: employee.primary_job_id,
      is_excluded_from_schedule: false,
      weekly_availability: weeklyAvailability(employee.id, employee.location_ids, weekStart),
    })),
    shifts: shifts.map((shift) => readShift(shift, shifts)),
    closures: world.closures,
    important_dates: world.important_dates,
    ghost_shifts: [],
    referenced_jobs: [],
    referenced_shift_types: [],
  };
}

// ---------- sessions ----------

function activeSession(sessionId: string, expectedRevision?: number): Session {
  const session = world.sessions.find((item) => item.id === sessionId);
  if (!session) fail(404, "Edit session not found");
  if (session.status !== "active") fail(409, "edit session closed", { code: "edit_session_closed" });
  if (expectedRevision !== undefined && session.revision !== expectedRevision) fail(409, "session revision stale", { code: "edit_session_stale" });
  return session;
}

function touch(session: Session): void {
  session.revision += 1;
  session.dirty = true;
  session.last_heartbeat = nowIso();
  session.expires_at = lease();
}

function remember(session: Session): void {
  session.undo.push(structuredClone(session.shifts));
  if (session.undo.length > 25) session.undo.shift();
}

function copyShift(shift: Shift, extra: Partial<Shift> = {}): Shift {
  return { ...structuredClone(shift), ...extra };
}

function startingShifts(source: Session["source_kind"], weekStart: string, locationIds: string[], draft?: Draft): Shift[] {
  if (source === "published")
    return publishedShifts(weekStart, locationIds).map((shift) =>
      copyShift(shift, { revision: 1, source_published_shift_id: shift.id, pending_op_type: null, locked: true }));
  if (source === "draft" && draft)
    return draft.shifts.filter((shift) => locationIds.includes(shift.location_id)).map((shift) =>
      copyShift(shift, { source_published_shift_id: null, pending_op_type: null, locked: false }));
  return [];
}

/** Closes an edit; unsaved work is kept as an "Auto-save" draft (close_schedule_edit_session). */
function closeSession(session: Session): Draft | null {
  session.status = "closed";
  if (!session.dirty) return null;
  const stamp = new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: ZONE });
  const base = session.source_draft_id ? world.drafts.find((item) => item.id === session.source_draft_id) : undefined;
  const draft: Draft = {
    id: uuid(),
    week_start: session.week_start,
    name: `Auto-save · ${base?.name ?? "New Schedule"} · ${stamp}`.slice(0, 80),
    revision: 1,
    location_ids: [...session.location_ids],
    shifts: session.shifts.filter((shift) => shift.pending_op_type !== "delete").map((shift) => copyShift(shift, { revision: 1, source_published_shift_id: null, pending_op_type: null, locked: false })),
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  world.drafts.push(draft);
  return draft;
}

function eligible(employeeId: string, locationId: string, jobId: string): boolean {
  const employee = world.employees.find((item) => item.id === employeeId);
  return Boolean(employee && employee.location_ids.includes(locationId) && employee.job_ids.includes(jobId));
}

function shiftFromInput(input: any, base?: Shift): Shift {
  const pick = <K extends keyof Shift>(key: K, fallback: Shift[K]): Shift[K] =>
    (input && Object.prototype.hasOwnProperty.call(input, key) ? input[key] : base ? base[key] : fallback) as Shift[K];
  const start = String(pick("start_time", "") ?? "").slice(0, 5);
  const end = String(pick("end_time", "") ?? "").slice(0, 5);
  const labelIds = (pick("label_ids", []) ?? []) as string[];
  return {
    id: base?.id ?? uuid(),
    location_id: pick("location_id", ""),
    employee_id: (pick("employee_id", null) || null) as string | null,
    job_id: pick("job_id", ""),
    shift_type_id: (pick("shift_type_id", null) || null) as string | null,
    scheduled_date: pick("scheduled_date", ""),
    start_time: start,
    end_time: end,
    crosses_midnight: Boolean(start && end && minutesOf(end) <= minutesOf(start)),
    time_basis: pick("time_basis", "explicit"),
    time_snapshot: pick("time_snapshot", null),
    time_timezone: pick("time_timezone", ZONE) ?? ZONE,
    unpaid_break_minutes: Number(pick("unpaid_break_minutes", 0) ?? 0),
    hide_time_on_badge: Boolean(pick("hide_time_on_badge", false)),
    label_ids: labelIds,
    label_names: labelIds.map((labelId) => world.shift_labels.find((label) => label.id === labelId)?.name
      ?? base?.label_names[base.label_ids.indexOf(labelId)] ?? "Label"),
    note: String(pick("note", "") ?? ""),
    revision: base ? base.revision + 1 : 1,
    source_published_shift_id: base?.source_published_shift_id ?? null,
    pending_op_type: base?.pending_op_type ?? null,
    locked: base?.locked ?? false,
  };
}

function validate(session: Session, shift: Shift): void {
  if (shift.start_time && shift.start_time === shift.end_time) fail(400, "Start and end time cannot be the same.");
  if (shift.scheduled_date < session.week_start || shift.scheduled_date > addDays(session.week_start, 6)) fail(400, "Request could not be completed");
  if (!world.jobs.some((job) => job.id === shift.job_id) || !world.locations.some((location) => location.id === shift.location_id))
    fail(400, "Request could not be completed");
  if (shift.employee_id && !eligible(shift.employee_id, shift.location_id, shift.job_id)) fail(400, "Request could not be completed");
  if (shift.employee_id && assess(shift).operation === "blocked")
    fail(400, "Resolve shift hours or approved time off before this assignment");
}

function createInSession(session: Session, input: any): Shift {
  const shift = shiftFromInput(input);
  validate(session, shift);
  shift.pending_op_type = null;
  shift.locked = false;
  session.shifts.push(shift);
  return shift;
}

// ---------- publication ----------

function publicationStatus(weekStart: string) {
  return {
    week_start: weekStart,
    week_end: addDays(weekStart, 6),
    week_start_day: "monday",
    schedule_deadline_day: "thursday",
    is_anchor_only: false,
    locations: world.locations.map((location) => {
      const publication = currentPublication(location.id, weekStart);
      const draftCount = Math.max(0, ...world.drafts.filter((draft) => draft.week_start === weekStart)
        .map((draft) => draft.shifts.filter((shift) => shift.location_id === location.id).length));
      return {
        id: location.id,
        name: location.name,
        color: location.color,
        timezone: location.timezone,
        status: publication ? "published" : "unpublished",
        reason: !publication ? "missing_publication" : publication.shifts.length ? "active_publication_and_shifts" : "no_published_shifts",
        publication_includes_location: Boolean(publication),
        published_shift_count: publication?.shifts.length ?? 0,
        draft_shift_count: draftCount,
        published_at: publication?.published_at ?? null,
        published_by_name: publication ? publication.published_by_name : null,
        source_draft_id: publication?.source_draft_id ?? null,
        source_draft_name: publication?.source_draft_name ?? null,
      };
    }),
  };
}

const shiftKey = (shift: Shift) => JSON.stringify([shift.employee_id, shift.job_id, shift.shift_type_id, shift.scheduled_date, shift.start_time, shift.end_time, shift.label_ids, shift.note, shift.unpaid_break_minutes]);

function inDepartmentScope(shift: Shift, departmentIds?: string[], includeNoDepartment?: boolean): boolean {
  if (!departmentIds) return true;
  const department = world.jobs.find((job) => job.id === shift.job_id)?.department_id ?? null;
  return department ? departmentIds.includes(department) : Boolean(includeNoDepartment);
}

function publicationPreview(body: any) {
  const draft = world.drafts.find((item) => item.id === body.draft_id);
  if (!draft) fail(404, "Schedule draft not found");
  const locationIds: string[] = body.location_ids?.length ? body.location_ids : draft.location_ids;
  const findings: any[] = [];
  const locations = locationIds.map((locationId) => {
    const location = world.locations.find((item) => item.id === locationId)!;
    const publication = currentPublication(locationId, draft.week_start);
    const current = publication?.shifts ?? [];
    const next = draft.shifts.filter((shift) => shift.location_id === locationId && inDepartmentScope(shift, body.department_ids, body.include_no_department));
    const currentByKey = new Map(current.map((shift) => [shift.id, shift]));
    let added = 0, updated = 0, unchanged = 0;
    const affected = new Set<string>();
    for (const shift of next) {
      const before = currentByKey.get(shift.id);
      if (!before) added += 1;
      else if (shiftKey(before) === shiftKey(shift)) unchanged += 1;
      else updated += 1;
      if (!before || shiftKey(before) !== shiftKey(shift)) if (shift.employee_id) affected.add(shift.employee_id);
    }
    const nextIds = new Set(next.map((shift) => shift.id));
    const removedShifts = current.filter((shift) => !nextIds.has(shift.id) && inDepartmentScope(shift, body.department_ids, body.include_no_department));
    removedShifts.forEach((shift) => shift.employee_id && affected.add(shift.employee_id));
    for (const shift of next) {
      const codes = warningCodes(shift, next);
      if (codes.includes("overlap") && shift.employee_id) {
        const employee = world.employees.find((item) => item.id === shift.employee_id);
        findings.push({
          id: `overlap-${shift.id}`.slice(0, 64), code: "overlap", severity: "soft", overrideable: true, tier: "risk",
          message: `${employee?.display_name ?? "This person"} has overlapping shifts on this day.`,
          location_id: locationId, location_name: location.name, employee_id: shift.employee_id,
          employee_name: employee?.display_name ?? null, scheduled_date: shift.scheduled_date, shift_ids: [shift.id],
        });
      }
    }
    return {
      location_id: locationId,
      location_name: location.name,
      active_publication_id: publication?.id ?? null,
      active_version: publication?.version ?? null,
      current_shift_count: current.length,
      next_shift_count: next.length + (body.department_ids ? current.length - removedShifts.length - (next.length - added) : 0),
      added,
      updated,
      removed: removedShifts.length,
      unchanged,
      affected_employee_ids: [...affected],
      changed_since_start: null,
    };
  });
  const status = draft.week_start < currentWeek() ? "past_week_closed" : findings.length ? "override_required" : "publish_ready";
  return {
    status,
    workspace_id: WORKSPACE_ID,
    week_start: draft.week_start,
    draft_id: draft.id,
    draft_revision: draft.revision,
    fingerprint: fingerprint(JSON.stringify([draft.id, draft.revision, locationIds, body.department_ids ?? null, locations])),
    locations,
    findings,
  };
}

// ---------- templates ----------

function templateDepartmentFilter(departmentKeys: string[] | null) {
  return (shift: TemplateShift) => {
    if (!departmentKeys) return true;
    const department = world.jobs.find((job) => job.id === shift.job_id)?.department_id ?? null;
    return department ? departmentKeys.includes(department) : departmentKeys.includes(NO_DEPARTMENT);
  };
}

export interface ApplyNotes {
  converted: { shift_day: string; start_time: string; end_time: string; job_name: string; location_name: string; employee_name: string; reason: string }[];
  removed: { shift_day: string; start_time: string; end_time: string; job_name: string; location_name: string; employee_name: string | null }[];
}

function applyTemplate(session: Session, template: Template, mode: "merge" | "overwrite", departmentKeys: string[] | null, notes?: ApplyNotes) {
  remember(session);
  const inScope = templateDepartmentFilter(departmentKeys);
  const templateLocations = new Set(template.shifts.map((shift) => shift.location_id));
  let removed = 0;
  if (mode === "overwrite") {
    // Replace clears only the template's own locations and departments, never a shift that has started.
    const now = Date.now();
    const targets = session.shifts.filter((shift) => {
      if (!templateLocations.has(shift.location_id) || shift.pending_op_type === "delete") return false;
      if (departmentKeys) {
        const department = world.jobs.find((job) => job.id === shift.job_id)?.department_id ?? null;
        if (!(department ? departmentKeys.includes(department) : departmentKeys.includes(NO_DEPARTMENT))) return false;
      }
      const span = shiftSpan(shift, ZONE);
      return !span || span.start > now;
    });
    removed = targets.length;
    notes?.removed.push(...targets.map((shift) => ({
      shift_day: shift.scheduled_date, start_time: shift.start_time, end_time: shift.end_time,
      job_name: world.jobs.find((job) => job.id === shift.job_id)?.name ?? "Job",
      location_name: world.locations.find((location) => location.id === shift.location_id)?.name ?? "Location",
      employee_name: world.employees.find((employee) => employee.id === shift.employee_id)?.display_name ?? null,
    })));
    const ids = new Set(targets.map((shift) => shift.id));
    session.shifts = session.shifts.flatMap((shift) => {
      if (!ids.has(shift.id)) return [shift];
      if (!shift.source_published_shift_id && !shift.locked) return [];
      return [{ ...shift, pending_op_type: "delete" as const, locked: true, revision: shift.revision + 1 }];
    });
  }
  let applied = 0;
  let converted = 0;
  const left: string[] = [];
  const sources = template.shifts.filter(inScope).sort((a, b) => a.day_offset - b.day_offset || a.start_time.localeCompare(b.start_time));
  for (const source of sources) {
    const date = addDays(session.week_start, source.day_offset);
    let employeeId = source.employee_id;
    const candidate = { employee_id: employeeId, location_id: source.location_id, scheduled_date: date, start_time: source.start_time, end_time: source.end_time };
    if (employeeId) {
      const span = shiftSpan(candidate, ZONE)!;
      const busy = session.shifts.some((shift) => shift.employee_id === employeeId && shift.pending_op_type !== "delete" && (() => {
        const other = shiftSpan(shift, ZONE);
        return other ? other.start < span.end && span.start < other.end : false;
      })());
      const canWork = eligible(employeeId, source.location_id, source.job_id);
      const timeOff = assess(candidate).operation === "blocked";
      if (!canWork || busy || timeOff) {
        notes?.converted.push({
          shift_day: date, start_time: source.start_time, end_time: source.end_time,
          job_name: world.jobs.find((job) => job.id === source.job_id)?.name ?? "Job",
          location_name: world.locations.find((location) => location.id === source.location_id)?.name ?? "Location",
          employee_name: world.employees.find((employee) => employee.id === employeeId)?.display_name ?? "Former employee",
          reason: timeOff ? "Approved time off" : busy ? "Already working at that time" : "No longer works this job or location",
        });
        employeeId = null;
        converted += 1;
      }
    }
    const keptIds = source.label_ids.filter((labelId) => world.shift_labels.some((label) => label.id === labelId));
    source.label_ids.forEach((labelId, index) => { if (!keptIds.includes(labelId)) left.push(source.label_names[index] || "Unnamed label"); });
    session.shifts.push({
      id: uuid(),
      location_id: source.location_id,
      employee_id: employeeId,
      job_id: source.job_id,
      shift_type_id: source.shift_type_id,
      scheduled_date: date,
      start_time: source.start_time,
      end_time: source.end_time,
      crosses_midnight: minutesOf(source.end_time) <= minutesOf(source.start_time),
      time_basis: source.time_basis,
      time_snapshot: source.time_snapshot,
      time_timezone: source.time_timezone,
      unpaid_break_minutes: source.unpaid_break_minutes,
      hide_time_on_badge: source.hide_time_on_badge,
      label_ids: keptIds,
      label_names: keptIds.map((labelId) => world.shift_labels.find((label) => label.id === labelId)!.name),
      note: source.note,
      revision: 1,
      source_published_shift_id: null,
      pending_op_type: null,
      locked: false,
    });
    applied += 1;
  }
  // Locations the template brings in join the edit.
  for (const locationId of templateLocations) if (!session.location_ids.includes(locationId)) session.location_ids.push(locationId);
  touch(session);
  const counts = new Map<string, number>();
  left.forEach((name) => counts.set(name, (counts.get(name) ?? 0) + 1));
  return {
    status: "applied",
    mode,
    applied_shift_count: applied,
    converted_open_count: converted,
    removed_shift_count: removed,
    skipped: [...counts].sort().map(([name, count]) => ({ kind: "archived_label", name, shift_count: count })),
    session: sessionShape(session),
  };
}

// ---------- routes ----------

export function schedule(route: Route): void {
  const saved = <T>(value: T): T => {
    persist();
    return value;
  };

  route("GET", "/schedule/reference", ({ query }) => {
    lastViewedDate = query.get("date") ?? todayIn(ZONE);
    return readModel(lastViewedDate);
  });

  route("GET", "/schedule/drafts", ({ query }) => ({
    drafts: world.drafts.filter((draft) => draft.week_start === query.get("week_start"))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at)).map(draftSummary),
  }));

  route("GET", "/schedule/shifts", ({ query }) => {
    const weekStart = query.get("week_start")!;
    const locationIds = query.getAll("location_ids");
    const draft = world.drafts.find((item) => item.id === query.get("draft_id"));
    const shifts = (draft ? draft.shifts : publishedShifts(weekStart)).filter((shift) => !locationIds.length || locationIds.includes(shift.location_id));
    return { shifts: shifts.map((shift) => readShift(shift, shifts)) };
  });

  route("GET", "/schedule/publication-status", ({ query }) => publicationStatus(query.get("week_start")!));
  route("GET", "/schedule/pending-ops", () => ({ pending_ops: [] }));

  route("POST", "/schedule/edit-lock/acquire", ({ body }) => {
    const weekStart: string = body.week_start;
    if (weekStart < currentWeek())
      throw new ApiError(403, {
        status: "past_edit_blocked",
        past_edits: [{ op_type: "update", shift_id: null, scheduled_date: weekStart, location_name: "Schedule week", employee_name: null, reason: "past_week", severity: "blocked" }],
        past_edit_messages: ["Past schedule weeks are read-only."],
        current_week_start: currentWeek(),
      });
    const requested: string[] = body.location_ids?.length ? body.location_ids : world.locations.map((location) => location.id);
    const source: Session["source_kind"] = body.source_kind;
    const draftId: string | null = source === "draft" ? body.source_draft_id : null;
    let own = world.sessions.find((item) => item.status === "active" && item.week_start === weekStart);
    let recovered: Draft | null = null;
    if (own && (own.source_kind !== source || own.source_draft_id !== draftId)) {
      recovered = closeSession(own);
      own = undefined;
    }
    if (own) {
      const adding = requested.filter((locationId) => !own!.location_ids.includes(locationId));
      const draft = draftId ? world.drafts.find((item) => item.id === draftId) : undefined;
      own.shifts.push(...startingShifts(own.source_kind, weekStart, adding, draft));
      own.location_ids = [...new Set([...own.location_ids, ...adding])].sort();
      own.last_heartbeat = nowIso();
      own.expires_at = lease();
      return saved({ status: "resumed", session: sessionShape(own), recovered_draft_id: null, recovered_draft_name: null });
    }
    let draft: Draft | undefined;
    if (source === "draft") {
      draft = world.drafts.find((item) => item.id === draftId && item.week_start === weekStart);
      if (!draft) fail(403, "Not allowed", { reason: "authz.out_of_scope" });
    }
    const session: Session = {
      id: uuid(),
      week_start: weekStart,
      source_kind: source,
      source_draft_id: draft?.id ?? null,
      source_revision: draft?.revision ?? 0,
      revision: 1,
      dirty: false,
      last_heartbeat: nowIso(),
      expires_at: lease(),
      location_ids: [...requested].sort(),
      shifts: startingShifts(source, weekStart, requested, draft),
      undo: [],
      status: "active",
    };
    world.sessions = world.sessions.filter((item) => item.status === "active");
    world.sessions.push(session);
    return saved({
      status: recovered ? "acquired_after_recovery" : "acquired",
      session: sessionShape(session),
      recovered_draft_id: recovered?.id ?? null,
      recovered_draft_name: recovered?.name ?? null,
    });
  });

  route("PATCH", "/schedule/edit-lock/heartbeat", ({ body }) => {
    const session = activeSession(body.session_id);
    session.last_heartbeat = nowIso();
    session.expires_at = lease();
    return saved(sessionShape(session));
  });

  route("DELETE", "/schedule/edit-lock/release", ({ body }) => {
    const session = world.sessions.find((item) => item.id === body.session_id);
    if (session) session.status = "closed";
    return saved({ status: "released" });
  });

  route("POST", "/schedule/edit-lock/autosave", ({ body }) => {
    const session = activeSession(body.session_id);
    const draft = closeSession(session);
    return saved(draft ? { status: "saved", draft_id: draft.id, draft_name: draft.name } : { status: "nothing_to_save", draft_id: null, draft_name: null });
  });

  route("POST", "/shifts", ({ body }) => {
    const session = activeSession(body.session_id, body.expected_session_revision);
    remember(session);
    try {
      createInSession(session, body.shift);
    } catch (error) {
      session.undo.pop();
      throw error;
    }
    touch(session);
    return saved(sessionShape(session));
  });

  route("POST", "/shifts/batch", ({ body }) => {
    const session = activeSession(body.session_id, body.expected_session_revision);
    const before = structuredClone(session.shifts);
    try {
      for (const input of body.shifts) createInSession(session, input);
    } catch (error) {
      session.shifts = before;
      throw error;
    }
    session.undo.push(before);
    touch(session);
    return saved(sessionShape(session));
  });

  route("PATCH", "/shifts/:shiftId", ({ params, body }) => {
    const session = activeSession(body.session_id, body.expected_session_revision);
    const index = session.shifts.findIndex((shift) => shift.id === params.shiftId && shift.revision === body.expected_shift_revision);
    if (index < 0) fail(409, "shift revision stale", { code: "edit_session_stale" });
    const current = session.shifts[index]!;
    const next = shiftFromInput(body.shift, current);
    validate(session, next);
    remember(session);
    if (next.source_published_shift_id) {
      if (next.pending_op_type !== "delete") next.pending_op_type = "update";
      next.locked = false;
    }
    session.shifts[index] = next;
    touch(session);
    return saved(sessionShape(session));
  });

  route("DELETE", "/shifts/:shiftId", ({ params, body }) => {
    const session = activeSession(body.session_id, body.expected_session_revision);
    const index = session.shifts.findIndex((shift) => shift.id === params.shiftId && shift.revision === body.expected_shift_revision);
    if (index < 0) fail(409, "shift revision stale", { code: "edit_session_stale" });
    remember(session);
    const shift = session.shifts[index]!;
    if (!shift.source_published_shift_id && !shift.locked) session.shifts.splice(index, 1);
    else session.shifts[index] = { ...shift, pending_op_type: "delete", locked: true, revision: shift.revision + 1 };
    touch(session);
    return saved(sessionShape(session));
  });

  route("PATCH", "/shifts/:shiftId/restore", ({ params, body }) => {
    const session = activeSession(body.session_id, body.expected_session_revision);
    const index = session.shifts.findIndex((shift) => shift.id === params.shiftId && shift.revision === body.expected_shift_revision);
    if (index < 0) fail(409, "shift revision stale", { code: "edit_session_stale" });
    const shift = session.shifts[index]!;
    if (!shift.source_published_shift_id || shift.pending_op_type !== "delete") fail(400, "Request could not be completed");
    remember(session);
    session.shifts[index] = { ...shift, pending_op_type: null, locked: true, revision: shift.revision + 1 };
    touch(session);
    return saved(sessionShape(session));
  });

  route("POST", "/shifts/bulk-delete", ({ body }) => {
    const ids = new Set<string>(body.ids);
    const session = world.sessions.find((item) => item.status === "active" && item.shifts.some((shift) => ids.has(shift.id)));
    if (!session) return { deleted_count: 0 };
    remember(session);
    let count = 0;
    session.shifts = session.shifts.flatMap((shift) => {
      if (!ids.has(shift.id)) return [shift];
      count += 1;
      if (!shift.source_published_shift_id && !shift.locked) return [];
      return [{ ...shift, pending_op_type: "delete" as const, locked: true, revision: shift.revision + 1 }];
    });
    touch(session);
    return saved({ deleted_count: count, session: sessionShape(session) });
  });

  route("POST", "/schedule/edit-sessions/:sessionId/undo", ({ params, body }) => {
    const session = activeSession(params.sessionId, body.expected_session_revision);
    const previous = session.undo.pop();
    if (!previous) fail(400, "Nothing to undo", { reason: "schedule.nothing_to_undo" });
    session.shifts = previous;
    session.revision += 1;
    session.dirty = true;
    return saved(sessionShape(session));
  });

  route("POST", "/schedule/drafts/save", ({ body }) => {
    const session = activeSession(body.session_id, body.expected_session_revision);
    const kept = session.shifts.filter((shift) => shift.pending_op_type !== "delete")
      .map((shift) => copyShift(shift, { source_published_shift_id: null, pending_op_type: null, locked: false }));
    let draft = body.draft_id ? world.drafts.find((item) => item.id === body.draft_id) : undefined;
    if (body.draft_id && !draft) fail(404, "Schedule draft not found");
    if (draft && body.expected_draft_revision != null && draft.revision !== body.expected_draft_revision)
      fail(409, "Someone saved this draft in the meantime. Reload it, then save again.", { reason: "schedule.draft_stale" });
    const name = String(body.name ?? "").trim();
    if (!name) fail(400, "Draft name required");
    if (!draft) {
      draft = { id: uuid(), week_start: session.week_start, name, revision: 1, location_ids: [...session.location_ids], shifts: kept, created_at: nowIso(), updated_at: nowIso() };
      world.drafts.push(draft);
    } else {
      draft.name = name;
      draft.revision += 1;
      draft.location_ids = [...new Set([...draft.location_ids, ...session.location_ids])];
      draft.shifts = [...draft.shifts.filter((shift) => !session.location_ids.includes(shift.location_id)), ...kept];
      draft.updated_at = nowIso();
    }
    session.status = "closed";
    session.dirty = false;
    return saved(draftSummary(draft));
  });

  route("DELETE", "/schedule/drafts/:draftId", ({ params }) => {
    if (world.sessions.some((item) => item.status === "active" && item.source_draft_id === params.draftId))
      fail(409, "Someone is editing this draft", { reason: "schedule.draft_being_edited" });
    world.drafts = world.drafts.filter((item) => item.id !== params.draftId);
    return saved({ status: "deleted", draft_id: params.draftId });
  });

  route("POST", "/schedule/publish-preview", ({ body }) => publicationPreview(body));

  route("POST", "/schedule/publish", ({ body }) => {
    const draft = world.drafts.find((item) => item.id === body.draft_id);
    if (!draft) fail(404, "Schedule draft not found");
    const preview = publicationPreview(body);
    if (preview.fingerprint !== body.fingerprint) return saved({ status: "stale_baseline", fingerprint: preview.fingerprint });
    const publishedAt = nowIso();
    const publicationIds: string[] = [];
    let count = 0;
    for (const locationId of body.location_ids as string[]) {
      const current = currentPublication(locationId, draft.week_start);
      const kept = body.department_ids
        ? (current?.shifts ?? []).filter((shift) => !inDepartmentScope(shift, body.department_ids, body.include_no_department))
        : [];
      const next = [...kept, ...draft.shifts.filter((shift) => shift.location_id === locationId && inDepartmentScope(shift, body.department_ids, body.include_no_department)).map((shift) => copyShift(shift))];
      world.publications = world.publications.filter((item) => item !== current);
      const publication: Publication = {
        id: uuid(), location_id: locationId, week_start: draft.week_start, version: (current?.version ?? 0) + 1,
        published_at: publishedAt, published_by_name: OWNER_NAME, source_draft_id: draft.id, source_draft_name: draft.name, shifts: next,
      };
      world.publications.push(publication);
      publicationIds.push(publication.id);
      count += next.length;
    }
    return saved({
      status: "published", workspace_id: WORKSPACE_ID, week_start: draft.week_start, draft_id: draft.id, draft_revision: draft.revision,
      location_ids: body.location_ids, publication_ids: publicationIds, published_shift_count: count,
      notification_count: 0, published_at: publishedAt,
    });
  });

  route("POST", "/schedule/unpublish-preview", ({ body }) => {
    const locations = (body.location_ids as string[]).flatMap((locationId) => {
      const publication = currentPublication(locationId, body.week_start);
      if (!publication) return [];
      return [{ location_id: locationId, location_name: world.locations.find((item) => item.id === locationId)!.name, publication_id: publication.id, version: publication.version, shift_count: publication.shifts.length }];
    });
    return {
      status: body.week_start < currentWeek() ? "past_week_closed" : "unpublish_ready",
      workspace_id: WORKSPACE_ID, week_start: body.week_start, locations,
      fingerprint: fingerprint(JSON.stringify(locations)),
    };
  });

  route("POST", "/schedule/unpublish", ({ body }) => {
    const removed = world.publications.filter((item) => item.week_start === body.week_start && body.location_ids.includes(item.location_id));
    world.publications = world.publications.filter((item) => !removed.includes(item));
    return saved({
      status: "unpublished", workspace_id: WORKSPACE_ID, week_start: body.week_start,
      location_ids: removed.map((item) => item.location_id), publication_ids: removed.map((item) => item.id), unpublished_at: nowIso(),
    });
  });

  // Templates.
  route("GET", "/schedule/templates", () => ({
    templates: [...world.templates].sort((a, b) => a.name.localeCompare(b.name)).map(templateSummary),
  }));
  route("GET", "/schedule/templates/:templateId", ({ params }) => {
    const template = world.templates.find((item) => item.id === params.templateId);
    if (!template) fail(404, "Not found");
    return templateDetail(template);
  });
  route("POST", "/schedule/templates", ({ body }) => {
    const draft = world.drafts.find((item) => item.id === body.draft_id);
    if (!draft) fail(404, "Schedule draft not found");
    if (!draft.shifts.length) fail(400, "This draft has no shifts to save.");
    const name = String(body.name ?? "").trim();
    if (world.templates.some((item) => item.name.toLowerCase() === name.toLowerCase())) fail(409, "A template with this name already exists.");
    const template: Template = {
      id: uuid(), name, revision: 1, created_by_name: OWNER_NAME, updated_at: nowIso(),
      shifts: draft.shifts.map((shift) => ({
        id: uuid(), location_id: shift.location_id, employee_id: body.strip_assignments ? null : shift.employee_id,
        job_id: shift.job_id, shift_type_id: shift.shift_type_id,
        day_offset: Math.round((Date.parse(shift.scheduled_date) - Date.parse(draft.week_start)) / 86_400_000),
        start_time: shift.start_time, end_time: shift.end_time, crosses_midnight: shift.crosses_midnight,
        time_basis: shift.time_basis, time_snapshot: shift.time_snapshot, time_timezone: shift.time_timezone,
        unpaid_break_minutes: shift.unpaid_break_minutes, hide_time_on_badge: shift.hide_time_on_badge,
        label_ids: [...shift.label_ids], label_names: [...shift.label_names], note: shift.note,
      })),
    };
    world.templates.push(template);
    return saved(templateDetail(template));
  });
  route("PATCH", "/schedule/templates/:templateId", ({ params, body }) => {
    const template = world.templates.find((item) => item.id === params.templateId);
    if (!template) fail(404, "Not found");
    if (template.revision !== body.expected_revision) fail(409, "Request conflicts with the current state");
    const name = String(body.name ?? "").trim();
    if (world.templates.some((item) => item.id !== template.id && item.name.toLowerCase() === name.toLowerCase())) fail(409, "A template with this name already exists.");
    template.name = name;
    template.revision += 1;
    template.updated_at = nowIso();
    return saved(templateDetail(template));
  });
  route("DELETE", "/schedule/templates/:templateId", ({ params }) => {
    world.templates = world.templates.filter((item) => item.id !== params.templateId);
    return saved(undefined);
  });
  route("POST", "/schedule/edit-sessions/:sessionId/apply-template", ({ params, body }) => {
    const session = activeSession(params.sessionId, body.expected_session_revision);
    const template = world.templates.find((item) => item.id === body.template_id);
    if (!template) fail(404, "Not found");
    return saved(applyTemplate(session, template, body.mode, body.department_keys ?? null));
  });

  // ---- Templates prototypes (Stage 2). Not in the real API yet: ----
  // a dry run of "apply template" that says what would happen, and saving the
  // week on screen (an edit, a draft or the live week) as a template.
  route("POST", "/prototype/templates/:templateId/apply-preview", ({ params, body }) => {
    const template = world.templates.find((item) => item.id === params.templateId);
    if (!template) fail(404, "Not found");
    const weekStart = mondayOf(body.week_start ?? lastViewedDate);
    const live = body.session_id ? world.sessions.find((item) => item.id === body.session_id && item.status === "active") : undefined;
    const trial: Session = live ? structuredClone(live) : {
      id: uuid(), week_start: weekStart, source_kind: "published", source_draft_id: null, source_revision: 0, revision: 0, dirty: false,
      last_heartbeat: nowIso(), expires_at: lease(), location_ids: world.locations.map((location) => location.id),
      shifts: startingShifts("published", weekStart, world.locations.map((location) => location.id)), undo: [], status: "active",
    };
    const notes: ApplyNotes = { converted: [], removed: [] };
    const result = applyTemplate(trial, template, body.mode ?? "merge", body.department_keys ?? null, notes);
    return {
      week_start: trial.week_start,
      mode: result.mode,
      added_shift_count: result.applied_shift_count,
      open_shift_count: trial.shifts.filter((shift) => !shift.employee_id && shift.pending_op_type !== "delete").length,
      converted_open_count: result.converted_open_count,
      removed_shift_count: result.removed_shift_count,
      converted: notes.converted,
      removed: notes.removed,
      skipped: result.skipped,
    };
  });
  route("POST", "/prototype/templates/from-week", ({ body }) => {
    const name = String(body.name ?? "").trim();
    if (!name) fail(400, "Give the template a name.");
    if (world.templates.some((item) => item.name.toLowerCase() === name.toLowerCase())) fail(409, "A template with this name already exists.");
    let weekStart: string;
    let shifts: Shift[];
    if (body.source === "session") {
      const session = activeSession(body.session_id);
      weekStart = session.week_start;
      shifts = session.shifts.filter((shift) => shift.pending_op_type !== "delete");
    } else if (body.source === "draft") {
      const draft = world.drafts.find((item) => item.id === body.draft_id);
      if (!draft) fail(404, "Schedule draft not found");
      weekStart = draft.week_start;
      shifts = draft.shifts;
    } else {
      weekStart = mondayOf(body.week_start ?? lastViewedDate);
      shifts = publishedShifts(weekStart);
    }
    if (Array.isArray(body.location_ids)) shifts = shifts.filter((shift) => body.location_ids.includes(shift.location_id));
    if (!shifts.length) fail(400, "This week has no shifts to save.");
    const template: Template = {
      id: uuid(), name, revision: 1, created_by_name: OWNER_NAME, updated_at: nowIso(),
      shifts: shifts.map((shift) => ({
        id: uuid(), location_id: shift.location_id, employee_id: body.strip_assignments ? null : shift.employee_id,
        job_id: shift.job_id, shift_type_id: shift.shift_type_id,
        day_offset: Math.round((Date.parse(shift.scheduled_date) - Date.parse(weekStart)) / 86_400_000),
        start_time: shift.start_time, end_time: shift.end_time, crosses_midnight: shift.crosses_midnight,
        time_basis: shift.time_basis, time_snapshot: shift.time_snapshot, time_timezone: shift.time_timezone,
        unpaid_break_minutes: shift.unpaid_break_minutes, hide_time_on_badge: shift.hide_time_on_badge,
        label_ids: [...shift.label_ids], label_names: [...shift.label_names], note: shift.note,
      })),
    };
    world.templates.push(template);
    return saved(templateDetail(template));
  });
  route("GET", "/prototype/viewed-week", () => ({ week_start: mondayOf(lastViewedDate) }));

  // Availability check the shift editor runs while writing.
  route("POST", "/v1/workspaces/:workspaceId/availability/shift-assessment", ({ body }) => assess(body.shift));

  // Auto-fill: open shifts go to people who can work them and are free.
  const busyMinutes = (session: Session, employeeId: string) => session.shifts
    .filter((shift) => shift.employee_id === employeeId && shift.pending_op_type !== "delete")
    .reduce((total, shift) => {
      const span = shiftSpan(shift, ZONE);
      return total + (span ? Math.round((span.end - span.start) / 60000) : 0);
    }, 0);
  const clashes = (session: Session, employeeId: string, shift: Shift) => {
    const span = shiftSpan(shift, ZONE);
    return Boolean(span) && session.shifts.some((other) => other.id !== shift.id && other.employee_id === employeeId
      && other.pending_op_type !== "delete" && (() => {
        const o = shiftSpan(other, ZONE);
        return o ? o.start < span!.end && span!.start < o.end : false;
      })());
  };
  // preview_schedule_auto_fill_service: fewest hours first, then primary job;
  // one person is recommended for at most one of overlapping open shifts.
  const autoFillPreview = (session: Session) => {
    const proposals: { shift_id: string; scheduled_date: string; start_time: string; end_time: string; recommended_employee_id: string; [key: string]: unknown }[] = [];
    const unfilled: { shift_id: string; reason: string }[] = [];
    const open = session.shifts
      .filter((shift) => !shift.employee_id && shift.pending_op_type !== "delete")
      .sort((x, y) => x.scheduled_date.localeCompare(y.scheduled_date) || x.start_time.localeCompare(y.start_time) || x.id.localeCompare(y.id));
    for (const shift of open) {
      const job = world.jobs.find((item) => item.id === shift.job_id);
      const location = world.locations.find((item) => item.id === shift.location_id);
      const span = shiftSpan(shift, ZONE);
      const eligibleRows = world.employees
        .filter((employee) => eligible(employee.id, shift.location_id, shift.job_id)
          && (() => { const a = assess({ ...shift, employee_id: employee.id }); return a.operation === "allowed" && !a.has_availability_conflict; })()
          && !clashes(session, employee.id, shift)
          && !proposals.some((proposal) => proposal.recommended_employee_id === employee.id && span && (() => {
            const o = shiftSpan(proposal as unknown as Shift, ZONE);
            return o ? o.start < span.end && span.start < o.end : false;
          })()))
        .map((employee) => ({ employee, minutes: busyMinutes(session, employee.id), primary: employee.primary_job_id === shift.job_id }));
      const fewest = Math.min(...eligibleRows.map((row) => row.minutes));
      const candidates = eligibleRows
        .sort((x, y) => x.minutes - y.minutes || Number(y.primary) - Number(x.primary) || x.employee.id.localeCompare(y.employee.id))
        .map((row) => ({
          employee_id: row.employee.id,
          employee_name: row.employee.display_name,
          scheduled_minutes: row.minutes,
          primary_job: row.primary,
          reasons: [row.minutes === fewest ? "Fewest scheduled hours" : null, row.primary ? "Primary job" : null, "Available"].filter((reason): reason is string => Boolean(reason)),
        }));
      if (!candidates.length) {
        unfilled.push({ shift_id: shift.id, reason: "No eligible employee" });
        continue;
      }
      proposals.push({
        shift_id: shift.id,
        location_name: location?.name ?? "Location",
        job_name: job?.name ?? "Job",
        scheduled_date: shift.scheduled_date,
        start_time: shift.start_time.slice(0, 5),
        end_time: shift.end_time.slice(0, 5),
        recommended_employee_id: candidates[0]!.employee_id,
        candidates,
      });
    }
    return {
      status: "review_ready",
      workspace_id: WORKSPACE_ID,
      session_id: session.id,
      session_revision: Math.max(1, session.revision),
      fingerprint: fingerprint(JSON.stringify([session.revision, proposals, unfilled])),
      proposals,
      unfilled,
    };
  };
  route("POST", "/schedule/edit-sessions/:sessionId/auto-fill-preview", ({ params }) => autoFillPreview(activeSession(params.sessionId)));
  route("POST", "/schedule/edit-sessions/:sessionId/auto-fill-apply", ({ params, body }) => {
    const session = activeSession(params.sessionId, body.expected_session_revision);
    const review = autoFillPreview(session);
    if (review.fingerprint !== body.fingerprint) fail(409, "stale auto-fill preview");
    const applied: { shift_id: string; employee_id: string }[] = [];
    const rejected: { shift_id: string; reason: string }[] = [];
    remember(session);
    for (const assignment of (body.assignments ?? []) as { shift_id: string; employee_id: string }[]) {
      const index = session.shifts.findIndex((shift) => shift.id === assignment.shift_id);
      const shift = session.shifts[index];
      const proposal = review.proposals.find((item) => item.shift_id === assignment.shift_id) as { candidates: { employee_id: string }[] } | undefined;
      if (!shift || shift.employee_id || !proposal || !proposal.candidates.some((candidate) => candidate.employee_id === assignment.employee_id)
        || clashes(session, assignment.employee_id, shift)) {
        rejected.push({ shift_id: assignment.shift_id, reason: "Assignment is no longer eligible" });
        continue;
      }
      session.shifts[index] = {
        ...shift,
        employee_id: assignment.employee_id,
        revision: shift.revision + 1,
        pending_op_type: shift.source_published_shift_id ? "update" : shift.pending_op_type ?? null,
      };
      applied.push(assignment);
    }
    if (applied.length) touch(session);
    else session.undo.pop();
    return saved({ status: "applied", applied, rejected, session: sessionShape(session) });
  });

  // Default hours: shifts that follow their shift type move to its current hours.
  const typeReference = (shift: Shift) => ({
    start_time: shift.start_time.slice(0, 5),
    end_time: shift.end_time.slice(0, 5),
    time_timezone: shift.time_timezone ?? ZONE,
    time_basis: shift.time_basis ?? "explicit",
    time_snapshot: (shift.time_snapshot as { default_revision: number } | null | undefined) ?? null,
  });
  const defaultHoursPreview = (session: Session, body: any) => {
    const rows = (body.shift_ids as string[]).map((shiftId) => {
      const shift = session.shifts.find((item) => item.id === shiftId);
      if (!shift) fail(409, "The schedule changed since this review.", { code: "edit_session_stale" });
      const type = world.shift_types.find((item) => item.id === shift.shift_type_id);
      const location = world.locations.find((item) => item.id === shift.location_id);
      const employee = world.employees.find((item) => item.id === shift.employee_id);
      const before = typeReference(shift);
      const started = (shiftSpan(shift, ZONE)?.start ?? 0) <= Date.now();
      let reason: string | null = shift.time_basis !== "type_default"
        ? "Only saved shift-type reference hours are included; explicit hours stay unchanged"
        : !type ? "This shift type is archived or unavailable"
        : started ? "This shift has already started"
        : before.time_snapshot?.default_revision === type.default_revision ? "Already uses the current defaults"
        : null;
      const moved = !reason && type ? { ...shift, start_time: type.default_start_time, end_time: type.default_end_time } : null;
      const after = moved && type ? {
        ...typeReference(moved),
        time_basis: "type_default" as const,
        time_snapshot: { shift_type_id: type.id, default_revision: type.default_revision, start_time: type.default_start_time, end_time: type.default_end_time, timezone: ZONE },
      } : null;
      const afterAssessment = moved && shift.employee_id ? assess(moved) : null;
      if (afterAssessment?.operation === "blocked") reason = "Resolve shift hours or approved time off before applying these hours";
      const overlapCount = (candidate: Shift) => shift.employee_id ? session.shifts.filter((other) => other.id !== shift.id
        && other.employee_id === shift.employee_id && other.pending_op_type !== "delete" && (() => {
          const x = shiftSpan(candidate, ZONE); const o = shiftSpan(other, ZONE);
          return x && o ? o.start < x.end && x.start < o.end : false;
        })()).length : 0;
      return {
        shift_id: shift.id,
        shift_revision: Math.max(1, shift.revision),
        scheduled_date: shift.scheduled_date,
        location_id: shift.location_id,
        location_name: location?.name ?? "Location",
        shift_type_name: type?.name ?? "No shift type",
        employee_name: employee?.display_name ?? "Open shift",
        before,
        after,
        before_assessment: moved && shift.employee_id ? assess(shift) : null,
        after_assessment: afterAssessment,
        reason,
        will_change: Boolean(after),
        can_apply: Boolean(after) && !reason,
        current_default_revision: type?.default_revision ?? null,
        before_overlap_count: overlapCount(shift),
        after_overlap_count: moved ? overlapCount(moved) : 0,
      };
    });
    return {
      session_id: session.id,
      session_revision: session.revision,
      starts_on: body.starts_on,
      ends_on: body.ends_on,
      fingerprint: fingerprint(JSON.stringify([session.revision, rows])),
      changed_count: rows.filter((row) => row.will_change).length,
      blocked_count: rows.filter((row) => row.will_change && !row.can_apply).length,
      shifts: rows,
    };
  };
  route("POST", "/v1/workspaces/:workspaceId/schedule/edit-sessions/:sessionId/default-hours-preview", ({ params, body }) =>
    defaultHoursPreview(activeSession(params.sessionId, body.expected_session_revision), body));
  route("POST", "/v1/workspaces/:workspaceId/schedule/edit-sessions/:sessionId/default-hours-apply", ({ params, body }) => {
    const session = activeSession(params.sessionId, body.expected_session_revision);
    const review = defaultHoursPreview(session, body);
    if (review.fingerprint !== body.fingerprint) fail(409, "The schedule changed since this review.", { code: "edit_session_stale" });
    remember(session);
    for (const row of review.shifts) {
      if (!row.can_apply || !row.after) continue;
      const index = session.shifts.findIndex((shift) => shift.id === row.shift_id);
      const shift = session.shifts[index]!;
      session.shifts[index] = {
        ...shift,
        start_time: row.after.start_time,
        end_time: row.after.end_time,
        crosses_midnight: minutesOf(row.after.end_time) <= minutesOf(row.after.start_time),
        time_basis: "type_default",
        time_snapshot: row.after.time_snapshot,
        revision: shift.revision + 1,
        pending_op_type: shift.source_published_shift_id ? "update" : shift.pending_op_type ?? null,
        locked: false,
      };
    }
    touch(session);
    return saved(sessionShape(session));
  });

  // Exports: saved presets and schedules are empty in the demo.
  route("GET", "/schedule/export-presets", () => ({ presets: [] }));
  route("GET", "/schedule/export-schedules", () => ({ schedules: [] }));
  route("GET", "/schedule/exports/recent", () => ({ events: [] }));
  route("POST", "/v1/workspaces/:workspaceId/schedule/export-v2/authorize", () => ({ authorized: true }));
}
