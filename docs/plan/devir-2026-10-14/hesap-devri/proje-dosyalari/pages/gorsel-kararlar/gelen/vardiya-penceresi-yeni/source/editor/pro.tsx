// The new Add / Edit shift window. One window, two layouts switched from its
// header (or Alt+T): Form (today's fields, tightened) and Timeline (the day
// as a time line you drag on). Behavior comes from brain.tsx, which is main's
// own ShiftQuickEditor logic, so saving, deleting, the rule box and the note
// card work exactly as in main. Paste keeps main's window.
import type { ScheduleEmployee, ScheduleReadModel } from "@newfork/shared/schedule";
import { ConfirmButton } from "@newfork/ui";
import { ChartGantt, Rows3, Trash2, TriangleAlert, UsersRound, X } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { scheduleAvailabilityMarks, type AvailabilityRange } from "../../../src/schedule/lib/scheduleAvailabilityMark";
import { getLastSegment, TimeInput } from "../../../src/schedule/components/TimeInput";
import { useShiftEditorBrain, type EditorProps, type ShiftEditorBrain } from "./brain";
import { breakLabel, breakOptions, CountStepper, formatDay, initials, LabelsSelect, Select, StaleNotice, type Option } from "./parts";
import { setChoice, useChoices, type ClockFormat, type WindowLayout } from "./store";
import { formatClock, formatSpan, spanMinutes, toCanonical, toMinutes } from "./time";

const DAY = 1440;
const SNAP = 15;
// Widths: the roomy one, and the wide one used when the screen is too short
// for the rows stacked (the second column sits beside the first).
const WIDTH: Record<WindowLayout, { readonly stacked: number; readonly wide: number }> = {
  form: { stacked: 404, wide: 760 },
  timeline: { stacked: 720, wide: 1040 },
};
const SCREEN_PAD = 8;
const COLUMN_GAP = 6;
const LANE_MAX = 40;
const LANE_MIN = 28;
// Room kept for the yellow rule box, so it can appear without moving the window.
const PREVIEW_ROOM = 56;

/** "7a", "7:30a", "12p" (12-hour) or "07", "07:30" (24-hour), for tight spots. */
function shortClock(minutes: number, format: ClockFormat): string {
  const value = ((minutes % DAY) + DAY) % DAY;
  const hour = Math.floor(value / 60);
  const minute = value % 60;
  if (format === "24h") return `${String(hour).padStart(2, "0")}${minute ? `:${String(minute).padStart(2, "0")}` : ""}`;
  return `${hour % 12 === 0 ? 12 : hour % 12}${minute ? `:${String(minute).padStart(2, "0")}` : ""}${hour < 12 ? "a" : "p"}`;
}

/* ───────────────────────── facts about the day ───────────────────────── */

type Status = "free" | "busy" | "unavailable" | "time_off";
const statusText: Record<Status, string> = { free: "Free", busy: "Busy", unavailable: "Unavailable", time_off: "Time off" };

interface Span { readonly s: number; readonly e: number }

/** A shift's minutes on its own day; an end at or before the start is the next day. */
function shiftSpan(start: string | null | undefined, end: string | null | undefined): Span | null {
  const s = toMinutes(start);
  let e = toMinutes(end);
  if (s === null || e === null || s === e) return null;
  if (e <= s) e += DAY;
  return { s, e };
}

const overlaps = (a: Span, b: Span) => a.s < b.e && b.s < a.e;

function paidMinutes(shift: { start_time: string; end_time: string; unpaid_break_minutes?: number }): number {
  const span = shiftSpan(shift.start_time, shift.end_time);
  return span ? Math.max(0, span.e - span.s - (shift.unpaid_break_minutes ?? 0)) : 0;
}

interface Person {
  readonly employee: ScheduleEmployee;
  readonly weekMinutes: number;
  readonly dayShifts: ReadonlyArray<{ id: string; span: Span; job: string; color: string }>;
  readonly unavailable: readonly AvailabilityRange[];
  readonly timeOff: readonly AvailabilityRange[];
  readonly status: Status;
}

function usePeople(model: ScheduleReadModel, brain: ShiftEditorBrain, employees: readonly ScheduleEmployee[]): Person[] {
  const { value, shiftId } = brain;
  const mine = shiftSpan(value.start_time, value.end_time);
  return useMemo(() => employees.map((employee) => {
    const theirs = model.shifts.filter((shift) => shift.employee_id === employee.id && shift.id !== shiftId);
    const dayShifts = theirs
      .filter((shift) => shift.scheduled_date === value.scheduled_date)
      .flatMap((shift) => {
        const span = shiftSpan(shift.start_time, shift.end_time);
        const job = model.jobs.find((item) => item.id === shift.job_id);
        const type = model.shift_types.find((item) => item.id === shift.shift_type_id);
        return span ? [{ id: shift.id, span, job: job?.name ?? "Shift", color: type?.color ?? "#94a3b8" }] : [];
      });
    const projection = employee.weekly_availability?.find((item) => item.location_id === value.location_id);
    const mark = projection ? scheduleAvailabilityMarks(projection).get(value.scheduled_date) ?? null : null;
    const timeOff = mark?.kind === "time_off" ? mark.ranges : [];
    const unavailable = mark?.kind === "unavailable" ? mark.windows : [];
    const hit = (ranges: readonly AvailabilityRange[]) => !!mine && ranges.some((range) => overlaps(mine, { s: range.from, e: range.to }));
    const status: Status = hit(timeOff) ? "time_off"
      : hit(unavailable) ? "unavailable"
      : mine && dayShifts.some((shift) => overlaps(mine, shift.span)) ? "busy"
      : "free";
    return { employee, weekMinutes: theirs.reduce((sum, shift) => sum + paidMinutes(shift), 0), dayShifts, unavailable, timeOff, status };
  }), [employees, model.shifts, model.jobs, model.shift_types, shiftId, value.scheduled_date, value.location_id, mine?.s, mine?.e]);
}

const statusOrder: Record<Status, number> = { free: 0, busy: 1, unavailable: 2, time_off: 3 };

/* ───────────────────────── the window ───────────────────────── */

export function NewShiftWindow({ props }: { readonly props: EditorProps }) {
  const brain = useShiftEditorBrain(props);
  const { layout } = useChoices();
  const { model, onClose } = props;
  const format: ClockFormat = props.timeFormat;
  const laneTotal = layout === "timeline"
    ? (brain.showEmployeePicker ? 1 + brain.eligibleEmployees.length : brain.selectedEmployee ? 1 : 0)
    : 0;
  const fit = useFit(brain, layout, laneTotal);
  const viewportWidth = useViewportWidth();
  const width = Math.min(fit.wide ? WIDTH[layout].wide : WIDTH[layout].stacked, viewportWidth - SCREEN_PAD * 2);
  const place = usePlacement(brain, props.state, width, `${layout}|${fit.wide}`);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const startRef = useRef<HTMLInputElement>(null);
  const location = model.locations.find((item) => item.id === brain.value.location_id);
  // Switching keeps the cursor where it was: the same field in the other layout.
  const switchLayout = (next: WindowLayout) => {
    const root = brain.editorRef.current;
    const active = document.activeElement;
    const label = active instanceof HTMLElement && root?.contains(active) ? active.getAttribute("aria-label") : null;
    setChoice("layout", next);
    if (!label) return;
    window.requestAnimationFrame(() => {
      root?.querySelector<HTMLElement>(`[aria-label="${CSS.escape(label)}"]`)?.focus({ preventScroll: true });
    });
  };

  // The cursor starts in the time: type "9", "5p", Enter, done.
  useEffect(() => {
    const input = startRef.current;
    if (!input) return;
    input.dataset.autoSelectSegment = "hour";
    input.focus({ preventScroll: true });
  }, []);
  useCellMark(brain);

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.altKey && !event.ctrlKey && !event.metaKey && event.code === "KeyT") {
      event.preventDefault();
      switchLayout(layout === "form" ? "timeline" : "form");
    }
  };

  const who = brain.selectedEmployee?.display_name ?? (brain.count > 1 ? `${brain.count} open shifts` : "Open shift");
  return (
    <>
      <div
        ref={brain.editorRef}
        className="sw"
        data-layout={layout}
        data-kind={brain.kind}
        data-wide={fit.wide || undefined}
        data-compact-lanes={fit.laneH < 36 || undefined}
        data-ready={ready || undefined}
        data-side={place.dragged ? undefined : place.side}
        data-shift-quick-editor-content="true"
        role="dialog"
        aria-label={`${brain.title}, ${who}`}
        style={{ left: place.left, top: place.top, width, "--arrow-top": `${place.arrowTop}px`, "--lane-h": `${fit.laneH}px` } as CSSProperties}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.stopPropagation()}
      >
        <header className="sw-head" {...place.dragHandlers}>
          <span className="sw-avatar" data-open={!brain.selectedEmployee || undefined} aria-hidden>
            {brain.selectedEmployee ? initials(brain.selectedEmployee.display_name) : <UsersRound size={14} />}
          </span>
          <span className="sw-head-text">
            <strong>{brain.title}</strong>
            <small title={`${who} · ${formatDay(brain.date)}${location ? ` · ${location.name}` : ""}`}>
              <b>{who}</b>
              <i aria-hidden>·</i>
              {formatDay(brain.date)}
              {location ? <><i aria-hidden>·</i>{location.name}</> : null}
            </small>
          </span>
          <LayoutSwitch layout={layout} onChange={switchLayout} />
          <button type="button" className="sw-icon" onClick={onClose} aria-label="Close editor" title="Close (Esc)">
            <X size={16} aria-hidden />
          </button>
        </header>
        {brain.stale ? <StaleNotice onReload={props.onReload} /> : (
          <form className="sw-form" onSubmit={brain.submit} noValidate>
            <div className="sw-body" key={layout}>
              {layout === "form" ? (
                <FormLayout brain={brain} model={model} format={format} startRef={startRef} />
              ) : (
                <TimelineLayout brain={brain} model={model} format={format} startRef={startRef} cap={fit.cap} />
              )}
            </div>
            <Preview brain={brain} />
            <Footer brain={brain} onClose={onClose} />
          </form>
        )}
      </div>
      {brain.questions}
    </>
  );
}

function LayoutSwitch({ layout, onChange }: { readonly layout: WindowLayout; readonly onChange: (layout: WindowLayout) => void }) {
  const options: [WindowLayout, string, ReactNode][] = [
    ["form", "Form", <Rows3 key="f" size={15} aria-hidden />],
    ["timeline", "Timeline", <ChartGantt key="t" size={15} aria-hidden />],
  ];
  return (
    <span className="sw-switch" role="radiogroup" aria-label="Window layout (Alt+T)">
      {options.map(([value, label, icon]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={layout === value}
          aria-label={label}
          title={`${label} (Alt+T)`}
          tabIndex={layout === value ? 0 : -1}
          onClick={() => onChange(value)}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            const next = layout === "form" ? "timeline" : "form";
            onChange(next);
            window.requestAnimationFrame(() => {
              event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[aria-checked="true"]`)?.focus();
            });
          }}
        >
          {icon}
        </button>
      ))}
    </span>
  );
}

/* ───────────────────────── rows ───────────────────────── */

function Row({ label, changed, was, children, className, labelFor }: {
  readonly label: string;
  readonly changed?: boolean;
  readonly was?: string;
  readonly children: ReactNode;
  readonly className?: string;
  readonly labelFor?: string;
}) {
  const Label = labelFor ? "label" : "span";
  return (
    <div className={`sw-row ${className ?? ""}`} data-changed={changed || undefined}>
      <Label className="sw-label" htmlFor={labelFor} title={changed && was ? `Was: ${was}` : undefined}>
        {label}
        {changed ? <span className="sw-dot" aria-label={was ? `changed, was ${was}` : "changed"} /> : null}
      </Label>
      <div className="sw-value">{children}</div>
    </div>
  );
}

interface LayoutProps {
  readonly brain: ShiftEditorBrain;
  readonly model: ScheduleReadModel;
  readonly format: ClockFormat;
  readonly startRef: React.RefObject<HTMLInputElement | null>;
}

function useChanges(brain: ShiftEditorBrain, model: ScheduleReadModel, format: ClockFormat) {
  const initial = brain.kind === "edit" ? brain.initial : null;
  const value = brain.value;
  const name = <T extends { id: string; name: string }>(items: readonly T[], id: string | null | undefined) =>
    items.find((item) => item.id === id)?.name ?? "None";
  const clock = (start: string, end: string) => {
    const s = toMinutes(start);
    const e = toMinutes(end);
    return s === null || e === null ? "No time" : `${formatClock(s, format)} – ${formatClock(e, format)}`;
  };
  if (!initial) return {} as Record<string, string | undefined>;
  const out: Record<string, string | undefined> = {};
  if (initial.start_time !== value.start_time || initial.end_time !== value.end_time) out.time = clock(initial.start_time, initial.end_time);
  if (initial.shift_type_id !== value.shift_type_id) out.type = name(model.shift_types, initial.shift_type_id);
  if (initial.unpaid_break_minutes !== value.unpaid_break_minutes) out.break = breakLabel(initial.unpaid_break_minutes ?? 0);
  if (initial.job_id !== value.job_id) out.job = name(model.jobs, initial.job_id);
  if (JSON.stringify(initial.label_ids ?? []) !== JSON.stringify(value.label_ids ?? [])) out.labels = (initial.label_names ?? []).join(", ") || "No labels";
  if (initial.note !== value.note) out.note = initial.note ? `“${initial.note.slice(0, 60)}”` : "No note";
  if (initial.hide_time_on_badge !== value.hide_time_on_badge) out.badge = initial.hide_time_on_badge ? "Hidden" : "Shown";
  if (initial.employee_id !== value.employee_id) out.who = name(model.employees.map((e) => ({ id: e.id, name: e.display_name })), initial.employee_id);
  return out;
}

function TimeRow({ brain, model, format, startRef, changes, compact = false }: LayoutProps & { readonly changes: Record<string, string | undefined>; readonly compact?: boolean }) {
  const endRef = useRef<HTMLInputElement>(null);
  const span = shiftSpan(brain.value.start_time, brain.value.end_time);
  const week = useWeekLoad(model, brain);
  const [person] = usePeople(model, brain, brain.selectedEmployee ? [brain.selectedEmployee] : []);
  const breakMinutes = brain.value.unpaid_break_minutes ?? 0;
  const facts: ReactNode[] = [];
  // Their own marks for the day, said before saving rather than after.
  if (person && span && (person.status === "time_off" || person.status === "unavailable")) {
    const ranges = person.status === "time_off" ? person.timeOff : person.unavailable;
    const hit = ranges.find((range) => overlaps(span, { s: range.from, e: range.to })) ?? ranges[0]!;
    facts.push(
      <span key="mark" data-tone="warn">
        {person.status === "time_off" ? "Time off" : "Unavailable"} {shortClock(hit.from, format)}–{shortClock(hit.to, format)}
      </span>,
    );
  }
  if (span) {
    const paid = span.e - span.s - breakMinutes;
    if (breakMinutes) facts.push(paid > 0 ? <span key="paid">{formatSpan(paid)} paid</span> : <span key="paid" data-tone="warn">Break is as long as the shift</span>);
    if (span.e > DAY) facts.push(<span key="next">ends next day</span>);
  }
  if (week) {
    facts.push(
      <span key="week" data-tone={week.after > 40 * 60 ? "warn" : undefined} title="Paid hours this week, before → with this shift">
        Week {formatSpan(week.before) || "0h"} → {formatSpan(week.after) || "0h"}{week.after > 40 * 60 ? " · overtime" : ""}
      </span>,
    );
  }
  return (
    <Row label="Time" className="sw-row-time" changed={"time" in changes} was={changes.time} labelFor="sw-start">
      <div className="sw-time">
        <TimeInput
          ref={startRef}
          id="sw-start"
          value={brain.value.start_time}
          ariaLabel="Start time"
          timeFormat={format}
          density="compact"
          className="sw-time-input"
          onAutoAdvance={() => {
            if (endRef.current) {
              endRef.current.dataset.autoSelectSegment = "hour";
              endRef.current.focus();
            }
          }}
          onChange={(start) => brain.setTimes(start, brain.value.end_time)}
        />
        <span className="sw-dash" aria-hidden>–</span>
        <TimeInput
          ref={endRef}
          value={brain.value.end_time}
          ariaLabel="End time"
          timeFormat={format}
          density="compact"
          className="sw-time-input"
          onAutoRetreat={() => {
            if (startRef.current) {
              startRef.current.dataset.autoSelectSegment = getLastSegment(format);
              startRef.current.focus();
            }
          }}
          onBoundaryEnter={!brain.value.hide_time_on_badge ? () => void brain.attemptSubmit() : undefined}
          onChange={(end) => brain.setTimes(brain.value.start_time, end)}
        />
        <span className="sw-span" data-empty={!span || undefined}>{span ? formatSpan(span.e - span.s) : "–"}</span>
      </div>
      {brain.timeValidationMessage ? (
        <small className="sw-help" data-tone="error" role="alert">{brain.timeValidationMessage}</small>
      ) : facts.length && !compact ? (
        <small className="sw-help sw-facts" title={factsTitle(facts)}>{facts.flatMap((fact, index) => (index ? [<i key={`d${index}`} aria-hidden>·</i>, fact] : [fact]))}</small>
      ) : null}
    </Row>
  );
}

/** The facts line is one line high, so it never moves the window; its full text is the tooltip. */
function factsTitle(facts: ReactNode[]): string {
  const text = (node: ReactNode): string =>
    typeof node === "string" || typeof node === "number" ? String(node)
      : Array.isArray(node) ? node.map(text).join("")
      : node && typeof node === "object" && "props" in node ? text((node.props as { children?: ReactNode }).children)
      : "";
  return facts.map(text).join(" · ");
}

function useWeekLoad(model: ScheduleReadModel, brain: ShiftEditorBrain) {
  const employeeId = brain.value.employee_id;
  return useMemo(() => {
    if (!employeeId) return null;
    const before = model.shifts
      .filter((shift) => shift.employee_id === employeeId && shift.id !== brain.shiftId)
      .reduce((sum, shift) => sum + paidMinutes(shift), 0);
    return { before, after: before + paidMinutes(brain.value) };
  }, [model.shifts, employeeId, brain.shiftId, brain.value]);
}

function TypeChips({ brain, model }: { readonly brain: ShiftEditorBrain; readonly model: ScheduleReadModel }) {
  if (!model.shift_types.length) return <small className="sw-muted">No shift types</small>;
  return (
    <div className="sw-chips" role="group" aria-label="Shift type">
      {model.shift_types.map((type, index) => (
        <button
          key={type.id}
          type="button"
          aria-pressed={brain.value.shift_type_id === type.id}
          style={{ "--chip": type.color } as CSSProperties}
          onClick={() => brain.selectShiftType(type.id)}
          onKeyDown={(event) => {
            if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
            event.preventDefault();
            const buttons = [...(event.currentTarget.parentElement?.querySelectorAll("button") ?? [])];
            buttons[(index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
          }}
        >
          <span className="sw-chip-dot" aria-hidden />
          {type.name}
        </button>
      ))}
    </div>
  );
}

function BreakSegments({ brain }: { readonly brain: ShiftEditorBrain }) {
  return (
    <div className="sw-seg" role="radiogroup" aria-label="Unpaid break">
      {breakOptions.map((minutes, index) => {
        const on = (brain.value.unpaid_break_minutes ?? 0) === minutes;
        return (
          <button
            key={minutes}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => brain.update({ unpaid_break_minutes: minutes })}
            onKeyDown={(event) => {
              if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
              event.preventDefault();
              const next = breakOptions[(index + (event.key === "ArrowRight" ? 1 : -1) + breakOptions.length) % breakOptions.length]!;
              brain.update({ unpaid_break_minutes: next });
              const buttons = event.currentTarget.parentElement?.querySelectorAll("button");
              (buttons?.[breakOptions.indexOf(next)] as HTMLButtonElement | undefined)?.focus();
            }}
          >
            {minutes === 0 ? "None" : `${minutes}m`}
          </button>
        );
      })}
    </div>
  );
}

function NoteArea({ brain }: { readonly brain: ShiftEditorBrain }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const left = Math.max(0, brain.noteMaxLength - brain.value.note.length);
  useLayoutEffect(() => {
    const area = ref.current;
    if (!area) return;
    area.style.height = "auto";
    area.style.height = `${Math.min(area.scrollHeight + 2, 220)}px`;
  }, [brain.value.note, brain.count]);
  return (
    <div className="sw-note">
      <textarea
        ref={ref}
        id="sw-note"
        rows={1}
        maxLength={brain.noteMaxLength}
        placeholder={brain.count > 1 ? "Notes go on one shift at a time" : "Add a note"}
        disabled={brain.count > 1}
        value={brain.count > 1 ? "" : brain.value.note}
        aria-describedby="sw-note-count"
        onChange={(event) => brain.update({ note: brain.clampNote(event.target.value) })}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            void brain.attemptSubmit();
          }
        }}
      />
      <small id="sw-note-count" className="sw-note-count" data-show={left <= 80 || undefined}>
        {left} {left === 1 ? "character" : "characters"} left
      </small>
    </div>
  );
}

function BadgeSwitch({ brain }: { readonly brain: ShiftEditorBrain }) {
  const on = !brain.value.hide_time_on_badge;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className="sw-toggle"
      onClick={() => brain.update({ hide_time_on_badge: on })}
    >
      <span className="sw-toggle-track" aria-hidden><span /></span>
      Show times on the badge
    </button>
  );
}

function useRows(brain: ShiftEditorBrain, model: ScheduleReadModel, changes: Record<string, string | undefined>) {
  const jobOptions: Option[] = brain.eligibleJobs.map((job) => ({ value: job.id, label: job.name }));
  const labels = model.shift_labels ?? [];
  return {
    type: <Row label="Type" changed={"type" in changes} was={changes.type} className="sw-row-type"><TypeChips brain={brain} model={model} /></Row>,
    break: <Row label="Break" changed={"break" in changes} was={changes.break} className="sw-row-break"><BreakSegments brain={brain} /></Row>,
    job: (
      <Row label="Job" changed={"job" in changes} was={changes.job} className="sw-row-job">
        <Select label="Job" value={brain.value.job_id} options={jobOptions} onChange={(job_id) => brain.update({ job_id })} />
        {brain.value.job_id && brain.showEmployeePicker && brain.eligibleEmployees.length === 0 ? (
          <small className="sw-help">No employees qualified for this job.</small>
        ) : null}
      </Row>
    ),
    labels: labels.length ? (
      <Row label="Labels" changed={"labels" in changes} was={changes.labels} className="sw-row-labels"><LabelsSelect brain={brain} labels={labels} /></Row>
    ) : null,
    note: <Row label="Note" changed={"note" in changes} was={changes.note} className="sw-row-note" labelFor="sw-note"><NoteArea brain={brain} /></Row>,
    badge: <Row label="Badge" changed={"badge" in changes} was={changes.badge} className="sw-row-badge"><BadgeSwitch brain={brain} /></Row>,
  };
}

/* ───────────────────────── Form ───────────────────────── */

function FormLayout(props: LayoutProps) {
  const { brain, model } = props;
  const changes = useChanges(brain, model, props.format);
  const people = usePeople(model, brain, brain.showEmployeePicker ? brain.eligibleEmployees : []);
  const employeeOptions: Option[] = [
    { value: "", label: "Open", hint: "anyone qualified" },
    ...[...people]
      .sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || a.weekMinutes - b.weekMinutes)
      .map((person) => ({
        value: person.employee.id,
        label: person.employee.display_name,
        hint: `${statusText[person.status]} · ${formatSpan(person.weekMinutes) || "0h"}`,
      })),
  ];
  const rows = useRows(brain, model, changes);
  return (
    <>
    <div className="sw-rows sw-lead">{rows.type}</div>
    <div className="sw-cols">
      <div className="sw-col sw-col-a sw-rows">
      {brain.showEmployeePicker ? (
        <Row label="Who" changed={"who" in changes} was={changes.who} className="sw-row-who">
          <div className="sw-who">
            <Select
              label="Employee"
              value={brain.value.employee_id ?? ""}
              options={employeeOptions}
              disabled={brain.employeePickerDisabled}
              onChange={(employeeId) => brain.update({ employee_id: employeeId || null })}
            />
            {brain.showCountStepper ? <CountStepper brain={brain} /> : null}
          </div>
          {brain.employeePickerDisabled ? <small className="sw-help">Several open shifts stay unassigned.</small> : null}
        </Row>
      ) : null}
      <TimeRow {...props} changes={changes} />
      {rows.break}
      </div>
      <div className="sw-col sw-col-b sw-rows">
        {rows.job}
        {rows.labels}
        {rows.note}
        {rows.badge}
      </div>
    </div>
    </>
  );
}

/* ───────────────────────── Timeline ───────────────────────── */

function TimelineLayout(props: LayoutProps & { readonly cap: number }) {
  const { brain, model, format, cap } = props;
  const changes = useChanges(brain, model, format);
  const rows = useRows(brain, model, changes);
  return (
    <div className="sw-cols">
      <div className="sw-col sw-col-a">
      <div className="sw-rows sw-rows-top">
        {rows.type}
        <TimeRow {...props} changes={changes} />
        {brain.showCountStepper ? (
          <Row label="How many" className="sw-row-count">
            <span className="sw-count"><CountStepper brain={brain} /><small className="sw-muted">{brain.count > 1 ? "Several open shifts stay unassigned." : "Add more than one open shift at once."}</small></span>
          </Row>
        ) : null}
      </div>
      <DayTrack brain={brain} model={model} format={format} cap={cap} />
      </div>
      <div className="sw-col sw-col-b sw-rows sw-grid">
        {rows.job}
        {rows.labels}
        {rows.break}
        {rows.badge}
        {rows.note}
      </div>
    </div>
  );
}

type Drag =
  | { kind: "move"; pointer: number; x: number; span: Span }
  | { kind: "start" | "end"; pointer: number; x: number; span: Span }
  | { kind: "draw"; pointer: number; anchor: number };

function DayTrack({ brain, model, format, cap }: { readonly brain: ShiftEditorBrain; readonly model: ScheduleReadModel; readonly format: ClockFormat; readonly cap: number }) {
  const scaleRef = useRef<HTMLDivElement>(null);
  const mine = shiftSpan(brain.value.start_time, brain.value.end_time);
  // 5 AM to 5 AM, or midnight to midnight for a shift that starts before 5.
  const [origin] = useState(() => (mine && mine.s < 300 ? 0 : 300));
  const end = origin + DAY;
  const pct = (minutes: number) => `${((Math.min(Math.max(minutes, origin), end) - origin) / DAY) * 100}%`;
  const width = (span: Span) => `${((Math.min(span.e, end) - Math.max(span.s, origin)) / DAY) * 100}%`;
  // A very short bar is drawn at its smallest size without leaving its row.
  const inside = (span: Span) => `min(${pct(span.s)}, calc(100% - var(--bar-min)))`;
  const assignable = brain.showEmployeePicker;
  const candidates = usePeople(model, brain, assignable ? brain.eligibleEmployees : []);
  const person = usePeople(model, brain, !assignable && brain.selectedEmployee ? [brain.selectedEmployee] : []);
  const sorted = assignable
    ? [...candidates].sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || a.weekMinutes - b.weekMinutes)
    : person;
  // A very short screen: the rows that fit, and everyone else in one "more" list.
  let lanes = sorted;
  let hidden: Person[] = [];
  if (assignable && Number.isFinite(cap) && sorted.length + 1 > cap) {
    const room = Math.max(1, cap - 2);
    lanes = sorted.slice(0, room);
    const chosen = sorted.find((item) => item.employee.id === brain.value.employee_id);
    if (chosen && !lanes.includes(chosen)) lanes = [...lanes.slice(0, room - 1), chosen];
    hidden = sorted.filter((item) => !lanes.includes(item));
  }
  const shiftType = model.shift_types.find((type) => type.id === brain.value.shift_type_id);
  const color = shiftType?.color ?? "var(--theme-accent)";
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const toMinute = (clientX: number) => {
    const rect = scaleRef.current?.getBoundingClientRect();
    if (!rect) return origin;
    return origin + ((clientX - rect.left) / rect.width) * DAY;
  };
  const snap = (minutes: number) => Math.round(minutes / SNAP) * SNAP;
  // The start stays on the shift's own day (latest 11:45 PM); only the end may
  // run into the next morning.
  const lastStart = DAY - SNAP;
  const commit = (s: number, e: number) => {
    if (e - s < SNAP || e - s > 20 * 60 || s < origin || s > lastStart || e > end) return;
    brain.setTimes(toCanonical(s), toCanonical(e));
  };

  // Coverage: how many people are on shift at this location, every 15 minutes.
  const coverage = useMemo(() => {
    const spans = model.shifts
      .filter((shift) => shift.location_id === brain.value.location_id && shift.scheduled_date === brain.value.scheduled_date && shift.id !== brain.shiftId)
      .flatMap((shift) => shiftSpan(shift.start_time, shift.end_time) ?? []);
    const slots = Array.from({ length: DAY / SNAP }, (_, index) => {
      const at = origin + index * SNAP;
      return spans.filter((span) => span.s <= at && at < span.e).length;
    });
    const max = Math.max(0, ...slots);
    return { slots, max, peak: Math.max(1, max) };
  }, [model.shifts, brain.value.location_id, brain.value.scheduled_date, brain.shiftId, origin]);
  const coveragePath = useMemo(() => {
    const h = 24;
    let d = `M0 ${h}`;
    coverage.slots.forEach((count, index) => {
      const y = h - (count / coverage.peak) * (h - 3);
      d += ` L${index} ${y} L${index + 1} ${y}`;
    });
    return `${d} L${coverage.slots.length} ${h} Z`;
  }, [coverage]);
  const coverageAt = (minute: number) => coverage.slots[Math.floor((minute - origin) / SNAP)] ?? 0;
  const mineAt = (minute: number) => (mine && mine.s <= minute && minute < mine.e ? 1 : 0);

  // A time box keeps its own draft while focused; dragging hands focus to the
  // bar, so the box shows the dragged time and Enter cannot put the old one back.
  const focusBar = () => brain.editorRef.current?.querySelector<HTMLElement>(".sw-bar")?.focus({ preventScroll: true });
  const beginBar = (kind: "move" | "start" | "end") => (event: ReactPointerEvent<HTMLElement>) => {
    if (!mine || event.button > 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    (event.currentTarget.closest(".sw-track") as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
    setDrag({ kind, pointer: event.pointerId, x: toMinute(event.clientX), span: mine });
  };
  const beginLane = (laneId: string | null) => (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button > 0) return;
    const ownLane = laneId === (brain.value.employee_id ?? null) || !assignable;
    if (!ownLane) {
      if (!brain.employeePickerDisabled) brain.update({ employee_id: laneId });
      return;
    }
    event.preventDefault();
    if (document.activeElement instanceof HTMLElement && brain.editorRef.current?.contains(document.activeElement)) document.activeElement.blur();
    (event.currentTarget.closest(".sw-track") as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
    const anchor = snap(toMinute(event.clientX));
    setDrag({ kind: "draw", pointer: event.pointerId, anchor });
    if (!mine) commit(Math.min(anchor, lastStart), Math.min(anchor, lastStart) + 60);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const minute = toMinute(event.clientX);
    setHover(minute >= origin && minute <= end ? minute : null);
    if (!drag || drag.pointer !== event.pointerId) return;
    const at = snap(minute);
    if (drag.kind === "draw") {
      if (at === drag.anchor) return;
      commit(Math.min(at, drag.anchor, lastStart), Math.max(at, drag.anchor));
      return;
    }
    const delta = snap(minute - drag.x);
    if (drag.kind === "move") {
      const length = drag.span.e - drag.span.s;
      const s = Math.min(Math.max(drag.span.s + delta, origin), end - length, lastStart);
      commit(s, s + length);
      // Dragging the bar onto someone's row hands the shift to them.
      if (assignable && !brain.employeePickerDisabled) {
        const lane = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-lane]");
        const laneId = lane ? (lane.dataset.lane === "open" ? null : lane.dataset.lane!) : undefined;
        if (laneId !== undefined && laneId !== brain.value.employee_id) brain.update({ employee_id: laneId });
      }
      return;
    }
    if (drag.kind === "start") commit(Math.min(Math.max(drag.span.s + delta, origin), drag.span.e - SNAP, lastStart), drag.span.e);
    else commit(drag.span.s, Math.max(drag.span.e + delta, drag.span.s + SNAP));
  };
  const endDrag = () => {
    if (drag?.kind === "draw") focusBar();
    setDrag(null);
  };
  const nudge = (kind: "move" | "start" | "end") => (event: ReactKeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      brain.requestSubmit();
      return;
    }
    if (!mine) return;
    const sign = event.key === "ArrowRight" || event.key === "ArrowUp" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : 0;
    if (!sign) return;
    event.preventDefault();
    event.stopPropagation();
    const step = sign * (event.shiftKey ? 60 : SNAP);
    if (kind === "move") commit(mine.s + step, mine.e + step);
    else if (kind === "start") commit(Math.min(mine.s + step, mine.e - SNAP, lastStart), mine.e);
    else commit(mine.s, Math.max(mine.e + step, mine.s + SNAP));
  };

  const hours = Array.from({ length: 25 }, (_, index) => origin + index * 60);
  const label = (minutes: number) => {
    const text = formatClock(minutes, format);
    return format === "24h" ? text.slice(0, 2) : text.replace(":00", "").replace(" AM", "a").replace(" PM", "p");
  };
  const bar = mine ? (
    <span
      className="sw-bar"
      data-dragging={drag && drag.kind !== "draw" ? true : undefined}
      style={{ left: inside(mine), width: width(mine), "--bar": color } as CSSProperties}
      onPointerDown={beginBar("move")}
      role="slider"
      tabIndex={0}
      aria-label="Shift time. Arrows move it 15 minutes, Shift+arrows an hour"
      aria-valuemin={origin}
      aria-valuemax={end}
      aria-valuenow={mine.s}
      aria-valuetext={`${formatClock(mine.s, format)} to ${formatClock(mine.e, format)}`}
      onKeyDown={nudge("move")}
    >
      <span className="sw-grip" data-side="start" role="slider" tabIndex={0} aria-label="Start time"
        aria-valuemin={origin} aria-valuemax={mine.e} aria-valuenow={mine.s} aria-valuetext={formatClock(mine.s, format)}
        onPointerDown={beginBar("start")} onKeyDown={nudge("start")} />
      <b>{shortClock(mine.s, format)}–{shortClock(mine.e, format)}</b>
      <span className="sw-grip" data-side="end" role="slider" tabIndex={0} aria-label="End time"
        aria-valuemin={mine.s} aria-valuemax={end} aria-valuenow={mine.e} aria-valuetext={formatClock(mine.e, format)}
        onPointerDown={beginBar("end")} onKeyDown={nudge("end")} />
    </span>
  ) : null;
  const ghost = mine ? <span className="sw-bar-ghost" style={{ left: inside(mine), width: width(mine) }} aria-hidden /> : null;

  const laneBody = (person: Person | null, own: boolean) => (
    <>
      {person?.unavailable.map((range, index) => (
        <span key={`u${index}`} className="sw-block" data-kind="unavailable" style={{ left: pct(range.from), width: width({ s: range.from, e: range.to }) }}
          title={`Unavailable ${formatClock(range.from, format)} – ${formatClock(range.to, format)}`} />
      ))}
      {person?.timeOff.map((range, index) => (
        <span key={`t${index}`} className="sw-block" data-kind="time_off" style={{ left: pct(range.from), width: width({ s: range.from, e: range.to }) }}
          title={`Time off ${formatClock(range.from, format)} – ${formatClock(range.to, format)}`}><em>Time off</em></span>
      ))}
      {person?.dayShifts.map((shift) => (
        <span key={shift.id} className="sw-other" style={{ left: pct(shift.span.s), width: width(shift.span), "--bar": shift.color } as CSSProperties}
          title={`${shift.job} ${formatClock(shift.span.s, format)} – ${formatClock(shift.span.e, format)}`}>
          <em>{shift.job}</em>
        </span>
      ))}
      {own ? bar : assignable ? ghost : null}
    </>
  );

  const openSelected = brain.value.employee_id === null;
  return (
    <div className="sw-day" aria-label="The day as a time line">
      <div
        className="sw-track"
        data-drawing={drag?.kind === "draw" || undefined}
        data-busy={drag ? true : undefined}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => { if (!drag) setHover(null); }}
      >
        <div className="sw-lane sw-lane-scale">
          <span className="sw-lane-name"><small>{formatDay(brain.date)}</small></span>
          <div ref={scaleRef} className="sw-lane-body">
            {hours.map((minute, index) => (
              <span key={minute} className="sw-hour" data-major={index % 3 === 0 || undefined} style={{ left: pct(minute) }}>
                {index % 3 === 0 && index < 24 ? <em>{label(minute)}</em> : null}
              </span>
            ))}
          </div>
        </div>
        <div className="sw-lane sw-lane-coverage">
          <span className="sw-lane-name"><small>On shift{coverage.max ? ` · up to ${coverage.max}` : ""}</small></span>
          <div className="sw-lane-body">
            <svg viewBox={`0 0 ${coverage.slots.length} 24`} preserveAspectRatio="none" aria-hidden>
              <path d={coveragePath} />
            </svg>
          </div>
        </div>
        <div className="sw-lanes" role={assignable ? "radiogroup" : undefined} aria-label={assignable ? "Who works this shift" : undefined}>
          {assignable ? (
            <Lane
              id="open"
              selected={openSelected}
              disabled={brain.employeePickerDisabled}
              onSelect={() => brain.update({ employee_id: null })}
              onPointerDown={beginLane(null)}
              name={<><span className="sw-avatar sw-avatar-sm" data-open aria-hidden><UsersRound size={12} /></span><span className="sw-lane-text"><b>{brain.count > 1 ? `${brain.count} open shifts` : "Open"}</b><small>anyone qualified</small></span></>}
            >
              {openSelected ? bar : null}
            </Lane>
          ) : null}
          {lanes.map((person) => {
            const own = !assignable || brain.value.employee_id === person.employee.id;
            const after = own && mine ? person.weekMinutes + paidMinutes(brain.value) : person.weekMinutes;
            return (
              <Lane
                key={person.employee.id}
                id={person.employee.id}
                selected={own}
                radio={assignable}
                disabled={assignable && brain.employeePickerDisabled}
                onSelect={() => brain.update({ employee_id: person.employee.id })}
                onPointerDown={beginLane(person.employee.id)}
                status={person.status}
                name={(
                  <>
                    <span className="sw-avatar sw-avatar-sm" aria-hidden>{initials(person.employee.display_name)}</span>
                    <span className="sw-lane-text">
                      <b title={person.employee.display_name}>{person.employee.display_name}</b>
                      <small>
                        {assignable ? <span className="sw-status" data-status={person.status}>{statusText[person.status]}</span> : null}
                        <span data-tone={after > 40 * 60 ? "warn" : undefined} title="Paid hours this week">{formatSpan(after) || "0h"} wk</span>
                      </small>
                    </span>
                  </>
                )}
              >
                {laneBody(person, own)}
              </Lane>
            );
          })}
          {hidden.length ? (
            <div className="sw-lane sw-lane-more" data-lane="more">
              <span className="sw-lane-name">
                <Select
                  label="More people"
                  value=""
                  placeholder={`${hidden.length} more ${hidden.length === 1 ? "person" : "people"}`}
                  compact
                  disabled={brain.employeePickerDisabled}
                  options={hidden.map((item) => ({
                    value: item.employee.id,
                    label: item.employee.display_name,
                    hint: `${statusText[item.status]} · ${formatSpan(item.weekMinutes) || "0h"}`,
                  }))}
                  onChange={(employeeId) => brain.update({ employee_id: employeeId })}
                />
              </span>
              <div className="sw-lane-body sw-lane-body-note"><small>Pick someone to see their day here.</small></div>
            </div>
          ) : null}
          {assignable && sorted.length === 0 ? <p className="sw-muted sw-empty">No one is qualified for this job at this location.</p> : null}
        </div>
        {hover !== null ? (
          <span className="sw-guide" data-flip={(hover - origin) / DAY > 0.78 || undefined} style={{ left: `calc(var(--name-col) + (100% - var(--name-col)) * ${(hover - origin) / DAY})` }} aria-hidden>
            <em>
              {formatClock(snap(hover), format)}
              <span>{coverageAt(snap(hover)) + mineAt(snap(hover))} on shift</span>
            </em>
          </span>
        ) : null}
      </div>
      <p className="sw-track-hint">
        {assignable
          ? "Drag the bar or its ends · drop it on a person to give them the shift · draw on an empty spot"
          : "Drag the bar or its ends · draw on an empty spot · arrow keys move 15 minutes"}
      </p>
    </div>
  );
}

function Lane({ id, selected, radio = true, disabled, onSelect, onPointerDown, name, status, children }: {
  readonly id: string;
  readonly selected: boolean;
  readonly radio?: boolean;
  readonly disabled?: boolean;
  readonly onSelect: () => void;
  readonly onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly name: ReactNode;
  readonly status?: Status;
  readonly children: ReactNode;
}) {
  return (
    <div className="sw-lane" data-lane={id} data-selected={selected || undefined} data-status={status}>
      {radio ? (
        <button
          type="button"
          role="radio"
          aria-checked={selected}
          disabled={disabled}
          className="sw-lane-name"
          onClick={onSelect}
          onKeyDown={(event) => {
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
            event.preventDefault();
            const lanes = [...(event.currentTarget.closest(".sw-lanes")?.querySelectorAll<HTMLButtonElement>("button.sw-lane-name:not(:disabled)") ?? [])];
            const index = lanes.indexOf(event.currentTarget);
            const next = lanes[(index + (event.key === "ArrowDown" ? 1 : -1) + lanes.length) % lanes.length];
            next?.click();
            next?.focus();
          }}
        >
          {name}
        </button>
      ) : (
        <span className="sw-lane-name">{name}</span>
      )}
      <div className="sw-lane-body" onPointerDown={onPointerDown}>{children}</div>
    </div>
  );
}

/* ───────────────────────── bottom ───────────────────────── */

function Preview({ brain }: { readonly brain: ShiftEditorBrain }) {
  const messages = brain.previewMessages;
  if (!messages.length) return null;
  return (
    <div className="sw-preview" role="status">
      <TriangleAlert size={14} aria-hidden />
      <span>{messages[0]}</span>
      {messages.length > 1 ? <em>+{messages.length - 1} more</em> : null}
    </div>
  );
}

function Footer({ brain, onClose }: { readonly brain: ShiftEditorBrain; readonly onClose: () => void }) {
  return (
    <div className="sw-foot">
      {brain.kind === "edit" ? (
        <ConfirmButton
          unstyled
          className="sw-delete"
          aria-label="Delete shift"
          confirmLabel={<><Trash2 size={14} aria-hidden />Confirm delete</>}
          confirmName="Confirm delete"
          onConfirm={brain.deleteShift}
        >
          <Trash2 size={14} aria-hidden />
          Delete
        </ConfirmButton>
      ) : null}
      <span className="sw-foot-space" />
      <button type="button" className="sw-btn" onClick={onClose}>Cancel</button>
      <button ref={brain.submitRef} type="submit" className="sw-btn sw-btn-primary" disabled={brain.saveDisabled}>
        {brain.checkingAvailability ? "Checking…" : brain.saveButtonLabel}
      </button>
    </div>
  );
}

/* ───────────────────────── size ───────────────────────── */

interface Fit {
  /** Second column beside the first instead of under it. */
  readonly wide: boolean;
  /** Height of a person's row on the time line. */
  readonly laneH: number;
  /** How many person rows fit; the rest go into one "more" list. */
  readonly cap: number;
}
const ROOMY: Fit = { wide: false, laneH: LANE_MAX, cap: Number.POSITIVE_INFINITY };
const tightness = (fit: Fit) => (fit.wide ? 10_000 : 0) + (LANE_MAX - fit.laneH) * 100 + (Number.isFinite(fit.cap) ? 1_000 - fit.cap : 0);

/**
 * The window is never taller than the screen and never scrolls. It starts
 * roomy (rows stacked, 40 px person rows) and, only if that does not fit,
 * puts the second column beside the first, then makes person rows shorter,
 * then lists the people who do not fit in one "more" list. Within one opening
 * it only gets tighter, so it never flips back and forth under the pointer; a
 * new layout, another job's people or a resized screen start again from roomy.
 */
function useFit(brain: ShiftEditorBrain, layout: WindowLayout, laneTotal: number): Fit {
  const [fit, setFit] = useState<Fit>(ROOMY);
  const [screen, setScreen] = useState(0);
  useEffect(() => {
    const onResize = () => setScreen((value) => value + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  useLayoutEffect(() => {
    setFit(ROOMY);
  }, [layout, laneTotal, screen]);
  useLayoutEffect(() => {
    const element = brain.editorRef.current;
    if (!element) return undefined;
    const measure = () => {
      // Never change size while a bar is being dragged or the width is moving.
      if (element.querySelector("[data-busy]")) return;
      if (element.getAnimations().some((animation) => animation instanceof CSSTransition && animation.transitionProperty === "width")) return;
      const cols = element.querySelector<HTMLElement>(".sw-cols");
      const a = element.querySelector<HTMLElement>(".sw-col-a");
      const b = element.querySelector<HTMLElement>(".sw-col-b");
      if (!cols || !a || !b) return;
      const lanes = element.querySelector<HTMLElement>(".sw-lanes");
      const count = lanes ? laneTotal : 0;
      const fixed = element.offsetHeight - cols.offsetHeight;
      const top = a.offsetHeight - (lanes?.offsetHeight ?? 0);
      const side = b.offsetHeight;
      const reserve = element.querySelector(".sw-preview") ? 0 : PREVIEW_ROOM;
      const room = window.innerHeight - SCREEN_PAD * 2 - reserve - fixed;
      const stacked = (lane: number) => top + count * lane + COLUMN_GAP + side;
      const wide = (lane: number) => Math.max(top + count * lane, side);
      let next: Fit;
      if (stacked(LANE_MAX) <= room) next = ROOMY;
      else if (wide(LANE_MAX) <= room || count === 0) next = { wide: true, laneH: LANE_MAX, cap: Number.POSITIVE_INFINITY };
      else {
        const lane = Math.floor((room - top) / count);
        next = lane >= LANE_MIN
          ? { wide: true, laneH: Math.min(LANE_MAX, lane), cap: Number.POSITIVE_INFINITY }
          : { wide: true, laneH: LANE_MIN, cap: Math.max(3, Math.floor((room - top) / LANE_MIN)) };
      }
      setFit((current) => (tightness(next) > tightness(current) ? next : current));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    element.addEventListener("transitionend", measure);
    window.addEventListener("pointerup", measure);
    return () => {
      observer.disconnect();
      element.removeEventListener("transitionend", measure);
      window.removeEventListener("pointerup", measure);
    };
  }, [brain.editorRef, laneTotal, layout, screen]);
  return fit;
}

function useViewportWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}

/* ───────────────────────── placement and the grid mark ───────────────────────── */

function anchorRect(brain: ShiftEditorBrain, state: EditorProps["state"]): DOMRect {
  const element = brain.shiftId
    ? document.querySelector(`[data-shift-badge="true"][data-shift-id="${brain.shiftId}"]:not([data-ghost="true"])`)
    : document.querySelector('.schedule-cell[data-shift-editor-active-cell="true"]');
  if (element) return element.getBoundingClientRect();
  return new DOMRect(state.x ?? window.innerWidth / 2, state.y ?? window.innerHeight / 3, 1, 1);
}

/**
 * Beside the cell, never off the screen. The window keeps its place while it
 * is open: when its content grows it only moves up as far as it must to stay
 * on the screen, and it never moves back down when the content shrinks, so
 * nothing jumps while you type or drag. Room for the yellow rule box is kept
 * from the start.
 */
function usePlacement(brain: ShiftEditorBrain, state: EditorProps["state"], width: number, sizeKey: string) {
  const [rect, setRect] = useState<DOMRect>(() => anchorRect(brain, state));
  // Height and whether the rule box is showing, read together from the window itself.
  const [measured, setMeasured] = useState<{ key: string; h: number; preview: boolean } | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ id: number; x: number; y: number; ox: number; oy: number } | null>(null);
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const key = `${sizeKey}|${Math.round(rect.top)}|${Math.round(rect.left)}|${vw}|${vh}`;
  const keyRef = useRef(key);
  keyRef.current = key;
  const tallest = useRef({ key: "", h: 0 });
  useLayoutEffect(() => {
    const read = () => setRect(anchorRect(brain, state));
    const frame = window.requestAnimationFrame(read);
    window.addEventListener("resize", read);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", read);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brain.shiftId]);
  useLayoutEffect(() => {
    const element = brain.editorRef.current;
    if (!element) return undefined;
    const read = () => setMeasured({ key: keyRef.current, h: element.offsetHeight, preview: !!element.querySelector(".sw-preview") });
    const observer = new ResizeObserver(read);
    observer.observe(element);
    read();
    return () => observer.disconnect();
  }, [brain.editorRef]);
  const height = measured?.h ?? 440;
  if (tallest.current.key !== key) tallest.current = { key, h: 0 };
  let planned = height + (measured?.preview ? 0 : PREVIEW_ROOM);
  if (measured?.key === key) {
    planned = Math.max(tallest.current.h, planned);
    tallest.current.h = planned;
  }
  const pad = SCREEN_PAD;
  const gap = 10;
  let side: "right" | "left" | "below" = "right";
  let left = rect.right + gap;
  if (left + width > vw - pad) {
    side = "left";
    left = rect.left - gap - width;
  }
  if (left < pad) {
    side = "below";
    left = Math.max(pad, Math.min(vw - width - pad, rect.left + rect.width / 2 - width / 2));
  }
  let top = side === "below" ? rect.bottom + gap : rect.top + rect.height / 2 - 72;
  if (side === "below" && top + planned > vh - pad) top = Math.max(pad, rect.top - gap - planned);
  top = Math.max(pad, Math.min(vh - planned - pad, top));
  const arrowTop = Math.max(16, Math.min(height - 24, rect.top + rect.height / 2 - top));
  const dragged = offset.x !== 0 || offset.y !== 0;
  return {
    left: Math.max(pad, Math.min(vw - width - pad, left + offset.x)),
    top: Math.max(pad, Math.min(vh - height - pad, top + offset.y)),
    side: side === "below" ? undefined : side,
    arrowTop,
    dragged,
    dragHandlers: {
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
        if (event.button > 0) return;
        if (event.target instanceof Element && event.target.closest("button, input, select, textarea, [role='combobox']")) return;
        event.preventDefault();
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      },
      onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
        const current = drag.current;
        if (!current || current.id !== event.pointerId) return;
        setOffset({ x: current.ox + event.clientX - current.x, y: current.oy + event.clientY - current.y });
      },
      onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
        if (drag.current?.id === event.pointerId) drag.current = null;
      },
    },
  };
}

/** The badge being edited breathes softly; the cell getting a new shift is outlined. */
function useCellMark(brain: ShiftEditorBrain) {
  const { shiftId } = brain;
  useEffect(() => {
    const style = document.createElement("style");
    const badge = shiftId ? `[data-shift-badge="true"][data-shift-id="${shiftId}"]:not([data-ghost="true"])` : null;
    style.textContent = badge
      ? `${badge} { z-index: 3; box-shadow: 0 0 0 2px var(--theme-surface), 0 0 0 4px color-mix(in srgb, var(--theme-accent) 70%, transparent); }
         @media (prefers-reduced-motion: no-preference) { ${badge} { animation: sw-breathe 1.8s ease-in-out infinite; } }`
      : `.schedule-cell[data-shift-editor-active-cell="true"] { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--theme-accent) 75%, transparent);
           background: color-mix(in srgb, var(--theme-accent) 7%, var(--theme-surface)); }`;
    document.head.append(style);
    return () => style.remove();
  }, [shiftId]);
}
