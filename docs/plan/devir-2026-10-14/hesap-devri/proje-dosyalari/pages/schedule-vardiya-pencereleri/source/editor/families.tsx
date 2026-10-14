// Five window families. Variant N of Edit shift, Add shift and Add shift
// (unassigned) all come from family N, so the three windows of one family
// share one design language; the menu still lets each window pick its own.
import type { ScheduleReadModel } from "@newfork/shared/schedule";
import { CalendarDays, ChevronDown, ChevronRight, Keyboard, MapPin, StickyNote, UserRound, UsersRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { EditorProps, ShiftEditorBrain } from "./brain";
import {
  Actions,
  BreakPicker,
  breakLabel,
  breakOptions,
  CloseButton,
  CountStepper,
  durationText,
  formatDay,
  initials,
  LabelsSelect,
  NoteField,
  placeBeside,
  Select,
  ShowTimesToggle,
  StaleNotice,
  timeText,
  TypeChips,
  useAnchorRect,
  useDragOffset,
  type Option,
} from "./parts";
import { TimeFields } from "./TimeFields";
import type { ClockFormat } from "./store";
import { formatClock, formatSpan, spanMinutes, toCanonical, toMinutes } from "./time";

export interface FamilyProps {
  readonly brain: ShiftEditorBrain;
  readonly props: EditorProps;
  readonly format: ClockFormat;
}

function Shell({
  brain,
  family,
  style,
  className = "",
  children,
  extra,
}: {
  readonly brain: ShiftEditorBrain;
  readonly family: number;
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly children: ReactNode;
  readonly extra?: Record<string, string | undefined>;
}) {
  return (
    <>
      <div
        ref={brain.editorRef}
        className={`stx stx-v${family} ${className}`}
        data-kind={brain.kind}
        data-shift-quick-editor-content="true"
        role="dialog"
        aria-label={brain.title}
        style={style}
        {...extra}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.stopPropagation()}
      >
        {children}
      </div>
      {brain.questions}
    </>
  );
}

function Field({ label, children, aside, className }: { readonly label: string; readonly children: ReactNode; readonly aside?: ReactNode; readonly className?: string }) {
  return (
    <div className={`stx-field ${className ?? ""}`}>
      <div className="stx-field-head">
        <span>{label}</span>
        {aside}
      </div>
      {children}
    </div>
  );
}

function useCatalog(model: ScheduleReadModel, brain: ShiftEditorBrain) {
  const jobOptions: Option[] = brain.eligibleJobs.map((job) => ({ value: job.id, label: job.name, color: (job as { color?: string }).color }));
  const employeeOptions: Option[] = [
    { value: "", label: "Unassigned", hint: "open shift" },
    ...brain.eligibleEmployees.map((employee) => ({ value: employee.id, label: employee.display_name })),
  ];
  const shiftType = model.shift_types.find((type) => type.id === brain.value.shift_type_id) ?? null;
  const location = model.locations.find((item) => item.id === brain.value.location_id) ?? null;
  const job = model.jobs.find((item) => item.id === brain.value.job_id) ?? null;
  const hint = toMinutes(shiftType?.default_start_time ?? null);
  return { jobOptions, employeeOptions, shiftType, location, job, hint };
}

const selectEmployee = (brain: ShiftEditorBrain) => (employeeId: string) => brain.update({ employee_id: employeeId || null });

/** Paid minutes of one shift. */
function paidMinutes(shift: { start_time: string; end_time: string; unpaid_break_minutes?: number }): number {
  const start = toMinutes(shift.start_time);
  const end = toMinutes(shift.end_time);
  if (start === null || end === null || start === end) return 0;
  return Math.max(0, spanMinutes(start, end) - (shift.unpaid_break_minutes ?? 0));
}

function useWeekContext(model: ScheduleReadModel, brain: ShiftEditorBrain, employeeId: string | null) {
  return useMemo(() => {
    const others = model.shifts.filter((shift) => shift.employee_id === employeeId && employeeId && shift.id !== brain.shiftId);
    const before = others.reduce((sum, shift) => sum + paidMinutes(shift), 0);
    const mine = paidMinutes(brain.value);
    const sameDay = others.filter((shift) => shift.scheduled_date === brain.value.scheduled_date);
    const openThatDay = model.shifts.filter((shift) => shift.employee_id === null && shift.scheduled_date === brain.value.scheduled_date
      && shift.location_id === brain.value.location_id && shift.id !== brain.shiftId);
    return { before, after: before + mine, sameDay, openThatDay };
  }, [model.shifts, brain.shiftId, brain.value, employeeId]);
}

function hoursText(minutes: number): string {
  return formatSpan(minutes) || "0h";
}

function whoText(brain: ShiftEditorBrain): string {
  return brain.selectedEmployee?.display_name ?? (brain.count > 1 ? `${brain.count} open shifts` : "Open shift");
}

/* ───────────────────────── 1 · Compact card ───────────────────────── */

export function FamilyCompact({ brain, props, format }: FamilyProps) {
  const { model, state } = props;
  const rect = useAnchorRect(brain, state);
  const width = 312;
  const place = placeBeside(rect, width, 470);
  const drag = useDragOffset();
  const moved = drag.offset.x !== 0 || drag.offset.y !== 0;
  const { jobOptions, employeeOptions, location, hint } = useCatalog(model, brain);
  const [noteOpen, setNoteOpen] = useState(Boolean(brain.value.note));
  const top = place.top + drag.offset.y;
  return (
    <Shell
      brain={brain}
      family={1}
      style={{ left: place.left + drag.offset.x, top, width, maxHeight: `calc(100dvh - ${top}px - 8px)` }}
      extra={{ "data-side": place.side }}
    >
      {!moved ? <span className="stx-arrow" style={{ top: place.arrowTop }} aria-hidden /> : null}
      <header className="stx-head" {...drag.handlers}>
        <span className="stx-avatar" data-open={!brain.selectedEmployee || undefined} aria-hidden>
          {brain.selectedEmployee ? initials(brain.selectedEmployee.display_name) : <UsersRound size={15} />}
        </span>
        <span className="stx-head-text">
          <strong>{brain.title}</strong>
          <small>{whoText(brain)} · {formatDay(brain.date)}{location ? ` · ${location.short_name ?? location.name}` : ""}</small>
        </span>
        <CloseButton onClose={props.onClose} />
      </header>
      {brain.stale ? <StaleNotice onReload={props.onReload} /> : (
        <form className="stx-body" onSubmit={brain.submit}>
          {brain.showEmployeePicker ? (
            <div className="stx-row" data-cols={brain.showCountStepper ? "2" : "1"}>
              <Field label="Employee">
                <Select label="Employee" value={brain.value.employee_id ?? ""} options={employeeOptions} disabled={brain.employeePickerDisabled} onChange={selectEmployee(brain)} />
              </Field>
              {brain.showCountStepper ? <Field label="How many"><CountStepper brain={brain} /></Field> : null}
            </div>
          ) : null}
          <TimeFields brain={brain} format={format} size="big" hint={hint} />
          <Field label="Shift type">
            <TypeChips brain={brain} shiftTypes={model.shift_types} />
          </Field>
          <Field label="Job">
            <Select label="Job" value={brain.value.job_id} options={jobOptions} onChange={(job_id) => brain.update({ job_id })} />
          </Field>
          <Field label="Unpaid break">
            <BreakPicker brain={brain} compact />
          </Field>
          {(model.shift_labels ?? []).length ? (
            <Field label="Labels">
              <LabelsSelect brain={brain} labels={model.shift_labels ?? []} />
            </Field>
          ) : null}
          {noteOpen || brain.value.note ? (
            <NoteField brain={brain} autoFocus={noteOpen && !brain.value.note} />
          ) : (
            <button type="button" className="stx-link" onClick={() => setNoteOpen(true)} disabled={brain.count > 1}>
              <StickyNote size={13} aria-hidden /> Add a note
            </button>
          )}
          <ShowTimesToggle brain={brain} />
          <Actions brain={brain} onClose={props.onClose} />
        </form>
      )}
    </Shell>
  );
}

/* ───────────────────────── 2 · Side panel ───────────────────────── */

function BadgePreview({ brain, model, format }: { readonly brain: ShiftEditorBrain; readonly model: ScheduleReadModel; readonly format: ClockFormat }) {
  const { shiftType, job } = useCatalog(model, brain);
  const labels = brain.value.label_names ?? [];
  const color = shiftType?.color ?? (job as { color?: string } | null)?.color ?? "#64748b";
  return (
    <div className="stx-preview" style={{ "--shift-color": color } as CSSProperties} aria-label="How the shift will look on the schedule">
      <strong>{[shiftType?.name, job?.name].filter(Boolean).join("-") || "Shift"}</strong>
      {labels.length ? <span>{labels.join(", ")}</span> : null}
      {brain.value.hide_time_on_badge ? null : <span>{timeText(brain, format).replace(" – ", " - ")}</span>}
    </div>
  );
}

export function FamilySidePanel({ brain, props, format }: FamilyProps) {
  const { model } = props;
  const { jobOptions, employeeOptions, location, hint } = useCatalog(model, brain);
  const week = useWeekContext(model, brain, brain.value.employee_id);
  return (
    <Shell brain={brain} family={2}>
      <header className="stx-head">
        <span className="stx-head-text">
          <strong>{brain.title}</strong>
          <small>{formatDay(brain.date, "long")}</small>
        </span>
        <CloseButton onClose={props.onClose} />
      </header>
      {brain.stale ? <StaleNotice onReload={props.onReload} /> : (
        <form className="stx-body" onSubmit={brain.submit}>
          <div className="stx-panel-top">
            <BadgePreview brain={brain} model={model} format={format} />
            <dl className="stx-facts">
              <div><dt><UserRound size={13} aria-hidden /> Who</dt><dd>{whoText(brain)}</dd></div>
              <div><dt><MapPin size={13} aria-hidden /> Where</dt><dd>{location?.name ?? "—"}</dd></div>
              {brain.value.employee_id ? (
                <div><dt><CalendarDays size={13} aria-hidden /> This week</dt><dd>{hoursText(week.before)} → <b>{hoursText(week.after)}</b></dd></div>
              ) : (
                <div><dt><CalendarDays size={13} aria-hidden /> Open that day</dt><dd>{week.openThatDay.length} other open {week.openThatDay.length === 1 ? "shift" : "shifts"}</dd></div>
              )}
            </dl>
            {week.sameDay.length ? (
              <p className="stx-callout">
                Also works {week.sameDay.map((shift) => `${formatClock(toMinutes(shift.start_time), format)}–${formatClock(toMinutes(shift.end_time), format)}`).join(", ")} this day.
              </p>
            ) : null}
          </div>
          {brain.showEmployeePicker ? (
            <section className="stx-section">
              <h3>Who</h3>
              <Field label="Employee">
                <Select label="Employee" value={brain.value.employee_id ?? ""} options={employeeOptions} disabled={brain.employeePickerDisabled} onChange={selectEmployee(brain)} />
              </Field>
              {brain.showCountStepper ? (
                <Field label="How many open shifts" aside={<small>same time, same job</small>}><CountStepper brain={brain} /></Field>
              ) : null}
            </section>
          ) : null}
          <section className="stx-section">
            <h3>When</h3>
            <TimeFields brain={brain} format={format} hint={hint} />
            <Field label="Unpaid break"><BreakPicker brain={brain} /></Field>
          </section>
          <section className="stx-section">
            <h3>What</h3>
            <Field label="Shift type"><TypeChips brain={brain} shiftTypes={model.shift_types} layout="grid" /></Field>
            <Field label="Job"><Select label="Job" value={brain.value.job_id} options={jobOptions} onChange={(job_id) => brain.update({ job_id })} /></Field>
            {(model.shift_labels ?? []).length ? <Field label="Labels"><LabelsSelect brain={brain} labels={model.shift_labels ?? []} /></Field> : null}
          </section>
          <section className="stx-section">
            <h3>Note and badge</h3>
            <NoteField brain={brain} rows={3} />
            <ShowTimesToggle brain={brain} />
          </section>
          <Actions brain={brain} onClose={props.onClose} />
        </form>
      )}
    </Shell>
  );
}

/* ───────────────────────── 3 · Keyboard first ───────────────────────── */

function Row({ k, label, children }: { readonly k: string; readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="stx-krow">
      <kbd aria-hidden>{k}</kbd>
      <span className="stx-krow-label">{label}</span>
      <div className="stx-krow-control">{children}</div>
    </div>
  );
}

export function FamilyKeyboard({ brain, props, format }: FamilyProps) {
  const { model, state } = props;
  const rect = useAnchorRect(brain, state);
  const width = 372;
  const place = placeBeside(rect, width, 440);
  const drag = useDragOffset();
  const { jobOptions, employeeOptions, location, hint } = useCatalog(model, brain);
  const formRef = useRef<HTMLFormElement>(null);
  const jobRef = useRef<HTMLButtonElement>(null);
  const employeeRef = useRef<HTMLButtonElement>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const focusIn = (selector: string) => {
    const element = formRef.current?.querySelector<HTMLElement>(selector);
    element?.focus();
    if (element instanceof HTMLInputElement) element.select();
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLFormElement>) => {
    if (event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement;
    const typing = target.matches("input[type='text'], textarea, [role='combobox']");
    if (typing && !event.altKey) return;
    const code = event.code;
    const digit = /^Digit([1-9])$/.exec(code);
    let done = true;
    if (digit) {
      const type = model.shift_types[Number(digit[1]) - 1];
      if (type) {
        brain.selectShiftType(type.id);
        setFlash(type.name);
      } else done = false;
    } else if (code === "KeyT") focusIn("[data-entry] input");
    else if (code === "KeyJ") jobRef.current?.focus();
    else if (code === "KeyE" && brain.showEmployeePicker) employeeRef.current?.focus();
    else if (code === "KeyB") {
      const index = breakOptions.indexOf(brain.value.unpaid_break_minutes as (typeof breakOptions)[number]);
      const next = breakOptions[(index + 1) % breakOptions.length]!;
      brain.update({ unpaid_break_minutes: next });
      setFlash(`Break ${breakLabel(next)}`);
    } else if (code === "KeyL") focusIn("[aria-label='Labels']");
    else if (code === "KeyN") focusIn("textarea");
    else if (code === "KeyC" && brain.showCountStepper) focusIn("[aria-label='Shift count']");
    else if (code === "KeyS" || (code === "Enter" && !typing)) brain.requestSubmit();
    else done = false;
    if (done) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  useEffect(() => {
    if (!flash) return undefined;
    const timer = window.setTimeout(() => setFlash(null), 900);
    return () => window.clearTimeout(timer);
  }, [flash]);
  const top = place.top + drag.offset.y;
  return (
    <Shell
      brain={brain}
      family={3}
      style={{ left: place.left + drag.offset.x, top, width, maxHeight: `calc(100dvh - ${top}px - 8px)` }}
    >
      <header className="stx-head" {...drag.handlers}>
        <Keyboard size={16} aria-hidden />
        <span className="stx-head-text">
          <strong>{brain.title}</strong>
          <small>{whoText(brain)} · {formatDay(brain.date)}{location ? ` · ${location.short_name ?? location.name}` : ""}</small>
        </span>
        <CloseButton onClose={props.onClose} />
      </header>
      {brain.stale ? <StaleNotice onReload={props.onReload} /> : (
        <form ref={formRef} className="stx-body" onSubmit={brain.submit} onKeyDown={onKeyDown}>
          {brain.showEmployeePicker ? (
            <Row k="E" label="Employee">
              <Select buttonRef={employeeRef} label="Employee" value={brain.value.employee_id ?? ""} options={employeeOptions} disabled={brain.employeePickerDisabled} onChange={selectEmployee(brain)} />
            </Row>
          ) : null}
          {brain.showCountStepper ? <Row k="C" label="How many"><CountStepper brain={brain} /></Row> : null}
          <Row k="T" label="Time"><TimeFields brain={brain} format={format} hint={hint} /></Row>
          <Row k={`1–${Math.min(9, model.shift_types.length)}`} label="Type"><TypeChips brain={brain} shiftTypes={model.shift_types} keys /></Row>
          <Row k="J" label="Job"><Select buttonRef={jobRef} label="Job" value={brain.value.job_id} options={jobOptions} onChange={(job_id) => brain.update({ job_id })} /></Row>
          <Row k="B" label="Break"><BreakPicker brain={brain} compact /></Row>
          {(model.shift_labels ?? []).length ? <Row k="L" label="Labels"><LabelsSelect brain={brain} labels={model.shift_labels ?? []} /></Row> : null}
          <Row k="N" label="Note"><NoteField brain={brain} rows={1} /></Row>
          <div className="stx-krow stx-krow-plain"><span /><span /><ShowTimesToggle brain={brain} /></div>
          {flash ? <div className="stx-flash" role="status">{flash}</div> : null}
          <Actions brain={brain} onClose={props.onClose} hint={<span className="stx-keys"><kbd>Enter</kbd> save <kbd>Esc</kbd> close <kbd>Alt</kbd>+letter jump</span>} />
        </form>
      )}
    </Shell>
  );
}

/* ───────────────────────── 4 · Day timeline ───────────────────────── */

const TRACK_START = 5 * 60; // 5 AM … 5 AM next day
const TRACK_SPAN = 24 * 60;
const pos = (minutes: number) => ((minutes - TRACK_START + 1440) % 1440) / TRACK_SPAN;

function DayTimeline({ brain, model, format, others }: {
  readonly brain: ShiftEditorBrain;
  readonly model: ScheduleReadModel;
  readonly format: ClockFormat;
  readonly others: ReadonlyArray<{ id: string; start_time: string; end_time: string; job_id: string }>;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const start = toMinutes(brain.value.start_time);
  const end = toMinutes(brain.value.end_time);
  const shiftType = model.shift_types.find((type) => type.id === brain.value.shift_type_id);
  const drag = useRef<{ part: "start" | "end" | "move"; x: number; s: number; e: number } | null>(null);
  const snap = (minutes: number) => Math.round(minutes / 15) * 15;
  const onMove = (event: React.PointerEvent) => {
    const current = drag.current;
    const track = trackRef.current;
    if (!current || !track) return;
    const delta = snap(((event.clientX - current.x) / track.getBoundingClientRect().width) * TRACK_SPAN);
    let s = current.s;
    let e = current.e;
    if (current.part === "start") s = current.s + delta;
    else if (current.part === "end") e = current.e + delta;
    else { s += delta; e += delta; }
    if (spanMinutes(s, e) < 15 || spanMinutes(s, e) > 20 * 60) return;
    brain.setTimes(toCanonical(s), toCanonical(e));
  };
  const begin = (part: "start" | "end" | "move") => (event: React.PointerEvent<HTMLElement>) => {
    if (start === null || end === null) return;
    event.preventDefault();
    event.stopPropagation();
    drag.current = { part, x: event.clientX, s: start, e: end };
    trackRef.current?.setPointerCapture?.(event.pointerId);
  };
  const keyNudge = (part: "start" | "end") => (event: React.KeyboardEvent) => {
    if (start === null || end === null) return;
    const step = event.key === "ArrowRight" || event.key === "ArrowUp" ? 15 : event.key === "ArrowLeft" || event.key === "ArrowDown" ? -15 : 0;
    if (!step) return;
    event.preventDefault();
    const s = part === "start" ? start + step : start;
    const e = part === "end" ? end + step : end;
    if (spanMinutes(s, e) < 15) return;
    brain.setTimes(toCanonical(s), toCanonical(e));
  };
  const ticks = Array.from({ length: 13 }, (_, index) => TRACK_START + index * 120);
  const left = start !== null ? pos(start) : null;
  const width = start !== null && end !== null && start !== end ? spanMinutes(start, end) / TRACK_SPAN : null;
  return (
    <div className="stx-timeline">
      <div
        ref={trackRef}
        className="stx-track"
        onPointerMove={onMove}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
      >
        {ticks.map((tick, index) => (
          <span key={index} className="stx-tick" style={{ left: `${(index * 120 / TRACK_SPAN) * 100}%` }}>
            {index % 2 === 0 ? <em>{formatClock(tick, format).replace(":00", "").replace(" ", "").toLowerCase()}</em> : null}
          </span>
        ))}
        {others.map((shift) => {
          const s = toMinutes(shift.start_time);
          const e = toMinutes(shift.end_time);
          if (s === null || e === null) return null;
          return (
            <span key={shift.id} className="stx-bar stx-bar-other" style={{ left: `${pos(s) * 100}%`, width: `${(spanMinutes(s, e) / TRACK_SPAN) * 100}%` }}
              title={`${model.jobs.find((job) => job.id === shift.job_id)?.name ?? "Shift"} ${formatClock(s, format)}–${formatClock(e, format)}`}>
              {model.jobs.find((job) => job.id === shift.job_id)?.name}
            </span>
          );
        })}
        {left !== null && width !== null ? (
          <span
            className="stx-bar stx-bar-this"
            style={{ left: `${left * 100}%`, width: `${Math.min(width, 1 - left + width) * 100}%`, "--shift-color": shiftType?.color ?? "#176954" } as CSSProperties}
            onPointerDown={begin("move")}
          >
            <span role="slider" tabIndex={0} aria-label="Start, arrows move 15 minutes" aria-valuetext={formatClock(start, format)}
              className="stx-handle" data-side="start" onPointerDown={begin("start")} onKeyDown={keyNudge("start")} />
            <b>{formatClock(start, format)} – {formatClock(end, format)}</b>
            <span role="slider" tabIndex={0} aria-label="End, arrows move 15 minutes" aria-valuetext={formatClock(end, format)}
              className="stx-handle" data-side="end" onPointerDown={begin("end")} onKeyDown={keyNudge("end")} />
          </span>
        ) : null}
      </div>
      <small className="stx-muted">Drag the bar or its edges; 15-minute steps.</small>
    </div>
  );
}

export function FamilyTimeline({ brain, props, format }: FamilyProps) {
  const { model } = props;
  const { jobOptions, employeeOptions, location, hint } = useCatalog(model, brain);
  const week = useWeekContext(model, brain, brain.value.employee_id);
  const candidates = useMemo(() => brain.eligibleEmployees.map((employee) => {
    const theirs = model.shifts.filter((shift) => shift.employee_id === employee.id && shift.id !== brain.shiftId);
    return {
      employee,
      hours: theirs.reduce((sum, shift) => sum + paidMinutes(shift), 0),
      sameDay: theirs.some((shift) => shift.scheduled_date === brain.value.scheduled_date),
    };
  }).sort((a, b) => Number(a.sameDay) - Number(b.sameDay) || a.hours - b.hours), [brain.eligibleEmployees, model.shifts, brain.shiftId, brain.value.scheduled_date]);
  return (
    <>
      <div className="stx-scrim" aria-hidden />
      <Shell brain={brain} family={4}>
        <header className="stx-head">
          <span className="stx-avatar" data-open={!brain.selectedEmployee || undefined} aria-hidden>
            {brain.selectedEmployee ? initials(brain.selectedEmployee.display_name) : <UsersRound size={15} />}
          </span>
          <span className="stx-head-text">
            <strong>{brain.title} · {whoText(brain)}</strong>
            <small>{formatDay(brain.date, "long")}{location ? ` · ${location.name}` : ""}</small>
          </span>
          <CloseButton onClose={props.onClose} />
        </header>
        {brain.stale ? <StaleNotice onReload={props.onReload} /> : (
          <form className="stx-body" onSubmit={brain.submit}>
            <div className="stx-day">
              <div className="stx-day-head">
                <strong>{formatDay(brain.date)}</strong>
                <span>{durationText(brain) || brain.timeValidationMessage}</span>
              </div>
              <DayTimeline brain={brain} model={model} format={format} others={week.sameDay} />
            </div>
            <div className="stx-columns">
              <div className="stx-col">
                <TimeFields brain={brain} format={format} hint={hint} />
                <Field label="Shift type"><TypeChips brain={brain} shiftTypes={model.shift_types} /></Field>
                <div className="stx-row" data-cols="2">
                  <Field label="Job"><Select label="Job" value={brain.value.job_id} options={jobOptions} onChange={(job_id) => brain.update({ job_id })} /></Field>
                  {(model.shift_labels ?? []).length ? <Field label="Labels"><LabelsSelect brain={brain} labels={model.shift_labels ?? []} /></Field> : <span />}
                </div>
                <Field label="Unpaid break"><BreakPicker brain={brain} /></Field>
                <NoteField brain={brain} rows={2} />
                <ShowTimesToggle brain={brain} />
              </div>
              <aside className="stx-col stx-side">
                {brain.showEmployeePicker ? (
                  <>
                    <div className="stx-side-head">
                      <strong>Who can take it</strong>
                      {brain.showCountStepper ? <span className="stx-inline">How many <CountStepper brain={brain} /></span> : null}
                    </div>
                    <div className="stx-people" role="radiogroup" aria-label="Employee">
                      <button type="button" role="radio" aria-checked={brain.value.employee_id === null} disabled={brain.employeePickerDisabled}
                        onClick={() => brain.update({ employee_id: null })}>
                        <span className="stx-avatar" data-open aria-hidden><UsersRound size={13} /></span>
                        <span><b>Leave open</b><small>anyone qualified can pick it up</small></span>
                      </button>
                      {candidates.map(({ employee, hours, sameDay }) => (
                        <button key={employee.id} type="button" role="radio" aria-checked={brain.value.employee_id === employee.id}
                          disabled={brain.employeePickerDisabled} onClick={() => brain.update({ employee_id: employee.id })}>
                          <span className="stx-avatar" aria-hidden>{initials(employee.display_name)}</span>
                          <span><b>{employee.display_name}</b><small>{hoursText(hours)} this week{sameDay ? " · works this day" : ""}</small></span>
                        </button>
                      ))}
                      {candidates.length === 0 ? <small className="stx-muted">No one qualified for this job.</small> : null}
                    </div>
                    {brain.employeePickerDisabled ? <small className="stx-muted">Several open shifts stay unassigned.</small> : null}
                    <span className="sr-only">
                      <Select label="Employee" value={brain.value.employee_id ?? ""} options={employeeOptions} disabled={brain.employeePickerDisabled} onChange={selectEmployee(brain)} />
                    </span>
                  </>
                ) : (
                  <>
                    <div className="stx-side-head"><strong>{brain.selectedEmployee?.display_name}</strong></div>
                    <dl className="stx-facts">
                      <div><dt>This week</dt><dd>{hoursText(week.before)} → <b>{hoursText(week.after)}</b></dd></div>
                      <div><dt>Other shifts this day</dt><dd>{week.sameDay.length || "None"}</dd></div>
                    </dl>
                    <WeekStrip model={model} brain={brain} />
                  </>
                )}
              </aside>
            </div>
            <Actions brain={brain} onClose={props.onClose} />
          </form>
        )}
      </Shell>
    </>
  );
}

function WeekStrip({ model, brain }: { readonly model: ScheduleReadModel; readonly brain: ShiftEditorBrain }) {
  const start = new Date(`${model.week_start}T12:00:00`);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date.toISOString().slice(0, 10);
  });
  const minutesOn = (iso: string) => {
    const others = model.shifts.filter((shift) => shift.employee_id === brain.value.employee_id && shift.scheduled_date === iso && shift.id !== brain.shiftId);
    return others.reduce((sum, shift) => sum + paidMinutes(shift), 0) + (iso === brain.value.scheduled_date ? paidMinutes(brain.value) : 0);
  };
  return (
    <div className="stx-week" aria-label="Hours each day this week">
      {days.map((iso) => {
        const minutes = minutesOn(iso);
        return (
          <div key={iso} data-today={iso === brain.value.scheduled_date || undefined}>
            <span className="stx-week-bar" style={{ height: `${Math.min(100, (minutes / 720) * 100)}%` }} />
            <small>{new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { weekday: "narrow" })}</small>
            <em>{minutes ? formatSpan(minutes) : "–"}</em>
          </div>
        );
      })}
    </div>
  );
}

/* ───────────────────────── 5 · Grows from the cell ───────────────────────── */

export function FamilyGrow({ brain, props, format }: FamilyProps) {
  const { model, state } = props;
  const rect = useAnchorRect(brain, state);
  const width = 300;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.max(8, Math.min(vw - width - 8, rect.left + rect.width / 2 - width / 2));
  const top = Math.max(8, Math.min(vh - 380, rect.top - 6));
  const originX = rect.left + rect.width / 2 - left;
  const originY = rect.top + rect.height / 2 - top;
  const { jobOptions, employeeOptions, hint } = useCatalog(model, brain);
  const [more, setMore] = useState(Boolean(brain.value.note) || (brain.value.label_ids ?? []).length > 0);
  const breakSelectOptions: Option[] = breakOptions.map((minutes) => ({ value: String(minutes), label: minutes ? `${minutes} min break` : "No break" }));
  return (
    <Shell
      brain={brain}
      family={5}
      style={{
        left,
        top,
        width,
        maxHeight: `calc(100dvh - ${top}px - 8px)`,
        transformOrigin: `${originX}px ${originY}px`,
        "--from-x": String(Math.max(0.2, rect.width / width)),
        "--from-y": String(Math.max(0.1, rect.height / 300)),
      } as CSSProperties}
    >
      {brain.stale ? <StaleNotice onReload={props.onReload} /> : (
        <form className="stx-body" onSubmit={brain.submit}>
          <div className="stx-grow-top">
            <span>
              <b>{whoText(brain)}</b> · {formatDay(brain.date)}
            </span>
            <span className="stx-grow-title">{brain.title}</span>
            <CloseButton onClose={props.onClose} />
          </div>
          {brain.showEmployeePicker ? (
            <div className="stx-row" data-cols={brain.showCountStepper ? "2" : "1"}>
              <Select label="Employee" value={brain.value.employee_id ?? ""} options={employeeOptions} disabled={brain.employeePickerDisabled} onChange={selectEmployee(brain)} compact />
              {brain.showCountStepper ? <CountStepper brain={brain} /> : null}
            </div>
          ) : null}
          <TimeFields brain={brain} format={format} size="big" hint={hint} />
          <TypeChips brain={brain} shiftTypes={model.shift_types} />
          <div className="stx-row" data-cols="2">
            <Select label="Job" value={brain.value.job_id} options={jobOptions} onChange={(job_id) => brain.update({ job_id })} compact />
            <Select label="Unpaid break" value={String(brain.value.unpaid_break_minutes ?? 0)} options={breakSelectOptions}
              onChange={(minutes) => brain.update({ unpaid_break_minutes: Number(minutes) as (typeof breakOptions)[number] })} compact />
          </div>
          <button type="button" className="stx-link" aria-expanded={more} onClick={() => setMore((current) => !current)}>
            {more ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />} Labels, note, badge
          </button>
          {more ? (
            <div className="stx-more">
              {(model.shift_labels ?? []).length ? <LabelsSelect brain={brain} labels={model.shift_labels ?? []} /> : null}
              <NoteField brain={brain} rows={2} />
              <ShowTimesToggle brain={brain} />
            </div>
          ) : null}
          <Actions brain={brain} onClose={props.onClose} compact />
        </form>
      )}
    </Shell>
  );
}
