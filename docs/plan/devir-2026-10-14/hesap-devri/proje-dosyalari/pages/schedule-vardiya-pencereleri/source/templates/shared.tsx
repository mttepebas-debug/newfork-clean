// What the three Templates prototypes share: their data (the real template
// routes plus two prototype routes the mock answers), the week summary, and
// small parts (week table, department chips, add/replace choice, impact list,
// "save this week" form). Each variant arranges these differently.
import type {
  ScheduleDraftSummary,
  ScheduleEditSession,
  ScheduleReadModel,
  ScheduleTemplateDetail,
  ScheduleTemplateSummary,
} from "@newfork/shared/schedule";
import { toast } from "@newfork/ui";
import { CalendarRange, Check, ChevronDown, CircleAlert, UserRoundX } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export const TEMPLATE_NO_DEPARTMENT_KEY = "__no_department__";

export interface TemplatesDialogProps {
  readonly templates: readonly ScheduleTemplateSummary[];
  readonly drafts: readonly ScheduleDraftSummary[];
  readonly session: ScheduleEditSession | null;
  readonly departments?: ScheduleReadModel["departments"];
  readonly initialDraftId?: string | null;
  readonly onClose: () => void;
  readonly onCreate: (draftId: string, name: string, stripAssignments: boolean) => Promise<unknown>;
  readonly onRename: (template: ScheduleTemplateSummary, name: string) => Promise<unknown>;
  readonly onDelete: (template: ScheduleTemplateSummary) => Promise<unknown>;
  readonly onApply: (templateId: string, mode: "merge" | "overwrite", departmentKeys: readonly string[] | null) => Promise<unknown>;
}

export type Mode = "merge" | "overwrite";

// ---------- requests ----------

const BASE = import.meta.env.VITE_API_URL as string;

export async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: "Bearer demo" },
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error((body as { error?: string } | null)?.error ?? "Request failed");
  return body as T;
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}

export interface Reference {
  readonly weekStart: string;
  readonly locations: ScheduleReadModel["locations"];
  readonly departments: ScheduleReadModel["departments"];
  readonly jobs: ScheduleReadModel["jobs"];
  readonly shiftTypes: ScheduleReadModel["shift_types"];
  readonly employees: ScheduleReadModel["employees"];
}

/** Catalog data and the week the page shows (the session's week while editing). */
export function useReference(session: ScheduleEditSession | null): Reference | null {
  const [reference, setReference] = useState<Reference | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const weekStart = session?.week_start ?? (await call<{ week_start: string }>("/prototype/viewed-week")).week_start;
      const model = await call<ScheduleReadModel>(`/schedule/reference?date=${weekStart}&view=week`);
      if (!alive) return;
      setReference({
        weekStart,
        locations: model.locations,
        departments: model.departments,
        jobs: model.jobs,
        shiftTypes: model.shift_types,
        employees: model.employees,
      });
    })();
    return () => {
      alive = false;
    };
  }, [session?.week_start]);
  return reference;
}

/** The template list, kept fresh after every change made here. */
export function useTemplateList(initial: readonly ScheduleTemplateSummary[]) {
  const [templates, setTemplates] = useState<readonly ScheduleTemplateSummary[]>(initial);
  const refresh = useCallback(async () => {
    const result = await call<{ templates: ScheduleTemplateSummary[] }>("/schedule/templates");
    setTemplates(result.templates);
    return result.templates;
  }, []);
  return { templates, refresh };
}

const detailCache = new Map<string, ScheduleTemplateDetail>();

export function useTemplateDetail(template: ScheduleTemplateSummary | null): ScheduleTemplateDetail | null {
  const key = template ? `${template.id}:${template.revision}` : "";
  const [detail, setDetail] = useState<ScheduleTemplateDetail | null>(() => detailCache.get(key) ?? null);
  useEffect(() => {
    if (!template) {
      setDetail(null);
      return;
    }
    const cached = detailCache.get(key);
    if (cached) {
      setDetail(cached);
      return;
    }
    let alive = true;
    void call<ScheduleTemplateDetail>(`/schedule/templates/${template.id}`).then((result) => {
      detailCache.set(key, result);
      if (alive) setDetail(result);
    });
    return () => {
      alive = false;
    };
  }, [key, template]);
  return detail;
}

export interface ApplyPreview {
  readonly week_start: string;
  readonly mode: Mode;
  readonly added_shift_count: number;
  readonly open_shift_count: number;
  readonly converted_open_count: number;
  readonly removed_shift_count: number;
  readonly converted: readonly { shift_day: string; start_time: string; end_time: string; job_name: string; location_name: string; employee_name: string; reason: string }[];
  readonly removed: readonly { shift_day: string; start_time: string; end_time: string; job_name: string; location_name: string; employee_name: string | null }[];
  readonly skipped: readonly { name: string; shift_count: number }[];
}

/** What applying would do, asked of the server (a dry run) whenever a choice changes. */
export function useApplyPreview(templateId: string | null, mode: Mode, departmentKeys: readonly string[] | null,
  session: ScheduleEditSession | null, weekStart: string | null) {
  const [state, setState] = useState<{ key: string; data: ApplyPreview | null; error: string | null }>({ key: "", data: null, error: null });
  const key = JSON.stringify([templateId, mode, departmentKeys, session?.id, session?.revision, weekStart]);
  useEffect(() => {
    if (!templateId || (departmentKeys && !departmentKeys.length)) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      call<ApplyPreview>(`/prototype/templates/${templateId}/apply-preview`, {
        method: "POST",
        body: JSON.stringify({ mode, department_keys: departmentKeys, session_id: session?.id ?? null, week_start: weekStart }),
      })
        .then((data) => alive && setState({ key, data, error: null }))
        .catch((error: unknown) => alive && setState({ key, data: null, error: errorText(error) }));
    }, 120);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return { preview: state.key === key ? state.data : null, loading: state.key !== key, error: state.key === key ? state.error : null };
}

// ---------- the week a template holds ----------

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export interface WeekSummary {
  readonly shiftCount: number;
  readonly openCount: number;
  readonly peopleCount: number;
  readonly hours: number;
  readonly perDay: readonly number[];
  readonly locations: readonly { id: string; name: string; count: number }[];
  readonly departments: readonly { key: string; name: string; count: number }[];
  readonly rows: readonly {
    key: string;
    locationName: string;
    departmentName: string;
    total: number;
    days: readonly { count: number; open: number; segments: readonly { color: string; name: string; count: number }[] }[];
  }[];
}

export function minutesBetween(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let minutes = eh! * 60 + em! - (sh! * 60 + sm!);
  if (minutes <= 0) minutes += 24 * 60;
  return minutes;
}

export function summarize(detail: ScheduleTemplateDetail, reference: Reference): WeekSummary {
  const jobDepartment = new Map(reference.jobs.map((job) => [job.id, job.department_id ?? null]));
  const departmentName = new Map(reference.departments.map((department) => [department.id, department.name]));
  const locationName = new Map(reference.locations.map((location) => [location.id, location.name]));
  const typeOf = new Map(reference.shiftTypes.map((type) => [type.id, type]));
  const perDay = [0, 0, 0, 0, 0, 0, 0];
  const people = new Set<string>();
  let open = 0;
  let minutes = 0;
  const rows = new Map<string, { key: string; locationName: string; departmentName: string; locationOrder: number; departmentName2: string; total: number; days: { count: number; open: number; segments: Map<string, { color: string; name: string; count: number }> }[] }>();
  const departments = new Map<string, { key: string; name: string; count: number }>();
  const locations = new Map<string, { id: string; name: string; count: number }>();
  for (const shift of detail.shifts) {
    perDay[shift.day_offset]! += 1;
    if (shift.employee_id) people.add(shift.employee_id);
    else open += 1;
    minutes += minutesBetween(shift.start_time, shift.end_time);
    const departmentId = jobDepartment.get(shift.job_id) ?? null;
    const departmentKey = departmentId ?? TEMPLATE_NO_DEPARTMENT_KEY;
    const department = departmentId ? departmentName.get(departmentId) ?? "Department" : "No department";
    const location = locationName.get(shift.location_id) ?? "Location";
    const rowKey = `${shift.location_id}:${departmentKey}`;
    if (!rows.has(rowKey)) {
      rows.set(rowKey, {
        key: rowKey, locationName: location, departmentName: department, departmentName2: department,
        locationOrder: reference.locations.findIndex((item) => item.id === shift.location_id), total: 0,
        days: WEEKDAYS.map(() => ({ count: 0, open: 0, segments: new Map() })),
      });
    }
    const row = rows.get(rowKey)!;
    row.total += 1;
    const day = row.days[shift.day_offset]!;
    day.count += 1;
    if (!shift.employee_id) day.open += 1;
    const type = shift.shift_type_id ? typeOf.get(shift.shift_type_id) : undefined;
    const segmentKey = type?.id ?? "none";
    const segment = day.segments.get(segmentKey) ?? { color: type?.color ?? "#94a3b8", name: type?.name ?? "No shift type", count: 0 };
    segment.count += 1;
    day.segments.set(segmentKey, segment);
    const departmentEntry = departments.get(departmentKey) ?? { key: departmentKey, name: department, count: 0 };
    departmentEntry.count += 1;
    departments.set(departmentKey, departmentEntry);
    const locationEntry = locations.get(shift.location_id) ?? { id: shift.location_id, name: location, count: 0 };
    locationEntry.count += 1;
    locations.set(shift.location_id, locationEntry);
  }
  return {
    shiftCount: detail.shifts.length,
    openCount: open,
    peopleCount: people.size,
    hours: Math.round(minutes / 60),
    perDay,
    locations: [...locations.values()].sort((a, b) => a.name.localeCompare(b.name)),
    departments: [...departments.values()].sort((a, b) =>
      a.key === TEMPLATE_NO_DEPARTMENT_KEY ? 1 : b.key === TEMPLATE_NO_DEPARTMENT_KEY ? -1 : a.name.localeCompare(b.name)),
    rows: [...rows.values()]
      .sort((a, b) => a.locationOrder - b.locationOrder || a.departmentName.localeCompare(b.departmentName))
      .map((row) => ({
        key: row.key, locationName: row.locationName, departmentName: row.departmentName, total: row.total,
        days: row.days.map((day) => ({ count: day.count, open: day.open, segments: [...day.segments.values()] })),
      })),
  };
}

// ---------- dates and words ----------

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

const monthDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const dayOnly = new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "UTC" });
const weekdayMonthDay = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export function weekLabel(weekStart: string): string {
  const end = addDays(weekStart, 6);
  const sameMonth = weekStart.slice(5, 7) === end.slice(5, 7);
  const startDate = new Date(`${weekStart}T12:00:00Z`);
  const endDate = new Date(`${end}T12:00:00Z`);
  return `${monthDay.format(startDate)} – ${sameMonth ? dayOnly.format(endDate) : monthDay.format(endDate)}`;
}

export function dayLabel(date: string): string {
  return weekdayMonthDay.format(new Date(`${date}T12:00:00Z`));
}

export function clock(value: string): string {
  const [h, m] = value.split(":").map(Number);
  const suffix = h! >= 12 ? "p" : "a";
  const hour = h! % 12 || 12;
  return m ? `${hour}:${String(m).padStart(2, "0")}${suffix}` : `${hour}${suffix}`;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

const updated = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
export function updatedLabel(value: string): string {
  return updated.format(new Date(value));
}

// ---------- apply from a week that is not being edited yet ----------

interface PendingApply {
  templateId: string;
  mode: Mode;
  departmentKeys: readonly string[] | null;
}
let pendingApply: PendingApply | null = null;

/**
 * Applying needs an edit. From the view mode the prototype starts one the way
 * the page does (Edit live schedule, Edit <draft> or a blank week), then
 * reopens Templates, which applies the waiting choice. In the real app this
 * is one call into the page.
 */
export async function editThenApply(pending: PendingApply, close: () => void): Promise<void> {
  pendingApply = pending;
  close();
  const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
  const trigger = document.querySelector<HTMLButtonElement>("[data-schedule-top-action-trigger='new-schedule']");
  if (!trigger) return;
  const viewing = (trigger.getAttribute("aria-label") ?? "").replace(/^Draft selector: /, "");
  trigger.click();
  await wait(250);
  const buttons = [...document.querySelectorAll<HTMLElement>("button, [role=button]")];
  const named = (name: string) => buttons.find((button) => button.getAttribute("aria-label") === name || button.textContent?.trim() === name);
  const entry = viewing !== "New Schedule" ? named(`Edit ${viewing}`) : named("Edit live schedule") ?? named("New Schedule (blank)");
  if (!entry) {
    pendingApply = null;
    return;
  }
  entry.click();
  for (let tries = 0; tries < 40; tries += 1) {
    await wait(150);
    if (document.querySelector(".schedule-edit-toolbar, [data-schedule-edit-toolbar]") || [...document.querySelectorAll("button")].some((button) => button.textContent?.trim() === "Discard")) break;
  }
  await wait(200);
  document.querySelector<HTMLButtonElement>("[data-schedule-top-action-trigger='templates']")?.click();
}

/** The choice waiting from editThenApply, taken once a session exists. */
export function takePendingApply(session: ScheduleEditSession | null): PendingApply | null {
  if (!session || !pendingApply) return null;
  const pending = pendingApply;
  pendingApply = null;
  return pending;
}

// ---------- parts ----------

export function WeekTable({ summary, weekStart, caption }: { readonly summary: WeekSummary; readonly weekStart: string | null; readonly caption: string }) {
  const max = Math.max(1, ...summary.rows.flatMap((row) => row.days.map((day) => day.count)));
  let lastLocation = "";
  return (
    <div className="tpl-week" role="region" aria-label={caption} tabIndex={0}>
      <table>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="tpl-week-corner">Department</th>
            {WEEKDAYS.map((day, index) => (
              <th scope="col" key={day}>
                <span>{day}</span>
                {weekStart ? <small>{dayOnly.format(new Date(`${addDays(weekStart, index)}T12:00:00Z`))}</small> : null}
              </th>
            ))}
            <th scope="col" className="tpl-week-total">Total</th>
          </tr>
        </thead>
        <tbody>
          {summary.rows.map((row) => {
            const heading = row.locationName !== lastLocation ? row.locationName : null;
            lastLocation = row.locationName;
            return [
              heading && summary.locations.length > 1 ? (
                <tr key={`${row.key}:heading`} className="tpl-week-location">
                  <th scope="rowgroup" colSpan={9}>{heading}</th>
                </tr>
              ) : null,
              <tr key={row.key}>
                <th scope="row">{row.departmentName}</th>
                {row.days.map((day, index) => (
                  <td key={index} className={day.count ? "" : "is-empty"}
                    aria-label={day.count ? `${WEEKDAYS[index]}: ${plural(day.count, "shift")}${day.open ? `, ${day.open} open` : ""}` : `${WEEKDAYS[index]}: none`}>
                    {day.count ? (
                      <>
                        <span className="tpl-week-count">{day.count}</span>
                        <span className="tpl-week-bar" style={{ width: `${Math.max(18, (day.count / max) * 100)}%` }} aria-hidden="true">
                          {day.segments.map((segment) => (
                            <i key={segment.name} title={`${segment.name}: ${segment.count}`} style={{ flexGrow: segment.count, background: segment.color }} />
                          ))}
                        </span>
                        {day.open ? <span className="tpl-week-open" title={`${day.open} open`}>{day.open} open</span> : null}
                      </>
                    ) : <span aria-hidden="true">–</span>}
                  </td>
                ))}
                <td className="tpl-week-total">{row.total}</td>
              </tr>,
            ];
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">All</th>
            {summary.perDay.map((count, index) => <td key={index}>{count || "–"}</td>)}
            <td className="tpl-week-total">{summary.shiftCount}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function ShiftTypeLegend({ reference }: { readonly reference: Reference }) {
  return (
    <ul className="tpl-legend" aria-label="Shift types">
      {reference.shiftTypes.map((type) => (
        <li key={type.id}><i style={{ background: type.color }} aria-hidden="true" />{type.name}</li>
      ))}
    </ul>
  );
}

/** Seven small bars, one per day: the shape of the week at a glance. */
export function WeekSpark({ perDay, label }: { readonly perDay: readonly number[]; readonly label: string }) {
  const max = Math.max(1, ...perDay);
  return (
    <span className="tpl-spark" role="img" aria-label={label}>
      {perDay.map((count, index) => (
        <span key={index} className="tpl-spark-day">
          <i style={{ height: `${Math.max(count ? 12 : 4, (count / max) * 100)}%` }} className={count ? "" : "is-empty"} />
          <small aria-hidden="true">{WEEKDAYS[index]![0]}</small>
        </span>
      ))}
    </span>
  );
}

export function DepartmentChips({ options, selected, onChange, legend = "Departments" }: {
  readonly options: readonly { key: string; name: string; count: number }[];
  readonly selected: readonly string[];
  readonly onChange: (next: readonly string[]) => void;
  readonly legend?: string;
}) {
  const all = options.every((option) => selected.includes(option.key));
  return (
    <fieldset className="tpl-chips">
      <legend>{legend}</legend>
      <div>
        <button type="button" aria-pressed={all} onClick={() => onChange(options.map((option) => option.key))}>
          {all ? <Check size={14} aria-hidden="true" /> : null}All
        </button>
        {options.map((option) => {
          const on = selected.includes(option.key);
          return (
            <button key={option.key} type="button" aria-pressed={on && !all}
              onClick={() => {
                if (all) onChange([option.key]);
                else onChange(on ? selected.filter((key) => key !== option.key) : [...selected, option.key]);
              }}>
              {on && !all ? <Check size={14} aria-hidden="true" /> : null}
              {option.name}<small>{option.count}</small>
            </button>
          );
        })}
      </div>
      {!selected.length ? <p className="tpl-field-error">Pick at least one department.</p> : null}
    </fieldset>
  );
}

export function ModeChoice({ mode, onChange, weekLabelText, compact = false }: {
  readonly mode: Mode;
  readonly onChange: (mode: Mode) => void;
  readonly weekLabelText: string;
  readonly compact?: boolean;
}) {
  const options: { value: Mode; title: string; text: string }[] = [
    { value: "merge", title: "Add to the week", text: `Keeps what ${weekLabelText} already has and adds the template's shifts.` },
    { value: "overwrite", title: "Replace the week", text: "Clears the template's locations and departments first. Shifts that have started stay." },
  ];
  return (
    <fieldset className={`tpl-mode${compact ? " is-compact" : ""}`}>
      <legend>How to apply</legend>
      <div>
        {options.map((option) => (
          <label key={option.value} className={mode === option.value ? "is-on" : ""}>
            <input type="radio" name="tpl-mode" value={option.value} checked={mode === option.value} onChange={() => onChange(option.value)} />
            <span>
              <strong>{option.title}</strong>
              {!compact ? <small>{option.text}</small> : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Numbers first, then the people who lose a shift and why. */
export function Impact({ preview, loading, error, weekStart, open = false }: {
  readonly preview: ApplyPreview | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly weekStart: string | null;
  readonly open?: boolean;
}) {
  if (error) return <p className="tpl-impact-error" role="alert"><CircleAlert size={16} aria-hidden="true" />{error}</p>;
  if (!preview) return <div className="tpl-impact is-loading" aria-busy="true"><span /><span /><span /></div>;
  return (
    <div className={`tpl-impact${loading ? " is-stale" : ""}`} aria-live="polite">
      <dl>
        <div><dt>Shifts added</dt><dd>+{preview.added_shift_count}</dd></div>
        <div className={preview.removed_shift_count ? "is-danger" : ""}><dt>Shifts removed</dt><dd>{preview.removed_shift_count ? `−${preview.removed_shift_count}` : "0"}</dd></div>
        <div className={preview.converted_open_count ? "is-warning" : ""}><dt>Become open shifts</dt><dd>{preview.converted_open_count}</dd></div>
      </dl>
      {preview.converted.length ? (
        <details className="tpl-impact-detail" open={open}>
          <summary><UserRoundX size={15} aria-hidden="true" />See who can't take their shift ({preview.converted.length})<ChevronDown size={15} aria-hidden="true" /></summary>
          <ul>
            {preview.converted.map((item, index) => (
              <li key={index}>
                <strong>{item.employee_name}</strong>
                <span>{dayLabel(item.shift_day)} · {clock(item.start_time)}–{clock(item.end_time)} · {item.job_name}</span>
                <em>{item.reason}</em>
              </li>
            ))}
          </ul>
          <p>These shifts are added as open shifts so you can fill them.</p>
        </details>
      ) : null}
      {preview.removed.length ? (
        <details className="tpl-impact-detail is-danger" open={open && !preview.converted.length}>
          <summary><CalendarRange size={15} aria-hidden="true" />{plural(preview.removed.length, "shift")} removed from {weekStart ? weekLabel(weekStart) : "this week"}<ChevronDown size={15} aria-hidden="true" /></summary>
          <ul>
            {preview.removed.map((item, index) => (
              <li key={index}>
                <strong>{item.employee_name ?? "Open shift"}</strong>
                <span>{dayLabel(item.shift_day)} · {clock(item.start_time)}–{clock(item.end_time)} · {item.job_name}</span>
                <em>{item.location_name}</em>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {preview.skipped.length ? (
        <p className="tpl-impact-note">Archived labels are left off: {preview.skipped.map((item) => item.name).join(", ")}.</p>
      ) : null}
    </div>
  );
}

export type SaveSource = { kind: "session" } | { kind: "draft"; draftId: string } | { kind: "live" };

/** "Save this week as a template": what to save, its name, and whether names stay. */
export function SaveWeekForm({ session, drafts, initialDraftId, weekStart, onSaved, onCancel, autoFocus = true }: {
  readonly session: ScheduleEditSession | null;
  readonly drafts: readonly ScheduleDraftSummary[];
  readonly initialDraftId: string | null;
  readonly weekStart: string | null;
  readonly onSaved: (template: ScheduleTemplateSummary) => void;
  readonly onCancel?: () => void;
  readonly autoFocus?: boolean;
}) {
  const sources = useMemo(() => {
    const items: { value: string; label: string; source: SaveSource }[] = [];
    if (session) items.push({ value: "session", label: `The week you are editing (${weekLabel(session.week_start)})`, source: { kind: "session" } });
    items.push({ value: "live", label: `The live schedule (${weekStart ? weekLabel(weekStart) : "this week"})`, source: { kind: "live" } });
    for (const draft of drafts) items.push({ value: `draft:${draft.id}`, label: `Draft: ${draft.name}`, source: { kind: "draft", draftId: draft.id } });
    return items;
  }, [session, drafts, weekStart]);
  const [sourceValue, setSourceValue] = useState(initialDraftId ? `draft:${initialDraftId}` : sources[0]!.value);
  const [name, setName] = useState("");
  const [keepPeople, setKeepPeople] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);
  const source = sources.find((item) => item.value === sourceValue)?.source ?? sources[0]!.source;
  const submit = async () => {
    if (!name.trim() || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await call<{ template: ScheduleTemplateSummary }>("/prototype/templates/from-week", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          strip_assignments: !keepPeople,
          source: source.kind,
          session_id: session?.id,
          draft_id: source.kind === "draft" ? source.draftId : undefined,
          week_start: weekStart,
        }),
      });
      toast.success("Template saved", { dedupeKey: "schedule-template-saved", description: name.trim() });
      onSaved(result.template);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setPending(false);
    }
  };
  return (
    <form className="tpl-save" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <label className="tpl-field">
        <span>Template name</span>
        <input ref={input} id="tpl-save-name" value={name} maxLength={80} placeholder="e.g. Standard week" onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="tpl-field">
        <span>Save from</span>
        <select id="tpl-save-source" value={sourceValue} onChange={(event) => setSourceValue(event.target.value)}>
          {sources.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <fieldset className="tpl-mode is-compact">
        <legend>People</legend>
        <div>
          <label className={keepPeople ? "is-on" : ""}>
            <input type="radio" name="tpl-people" checked={keepPeople} onChange={() => setKeepPeople(true)} />
            <span><strong>Keep who works each shift</strong></span>
          </label>
          <label className={!keepPeople ? "is-on" : ""}>
            <input type="radio" name="tpl-people" checked={!keepPeople} onChange={() => setKeepPeople(false)} />
            <span><strong>Save as open shifts</strong></span>
          </label>
        </div>
      </fieldset>
      {error ? <p className="tpl-field-error" role="alert">{error}</p> : null}
      <div className="tpl-save-actions">
        {onCancel ? <button type="button" className="nf-button secondary-button" onClick={onCancel}>Cancel</button> : null}
        <button type="submit" className="nf-button" disabled={!name.trim() || pending}>{pending ? "Saving…" : "Save template"}</button>
      </div>
    </form>
  );
}

export function useDepartmentSelection(summary: WeekSummary | null) {
  const keys = useMemo(() => summary?.departments.map((department) => department.key) ?? [], [summary]);
  const [selected, setSelected] = useState<readonly string[]>(keys);
  useEffect(() => setSelected(keys), [keys]);
  const all = keys.every((key) => selected.includes(key));
  return { selected, setSelected, forApply: all ? null : selected };
}

export function Empty({ children }: { readonly children: ReactNode }) {
  return <div className="tpl-empty">{children}</div>;
}
