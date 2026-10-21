// The Add / Edit / Paste shift window. One window, two layouts switched from
// its header (or Alt+T) and remembered: Form (the fields, row by row) and
// Timeline (the day as a line you drag the shift on). It sits beside the cell
// or shift it belongs to, takes the size its content needs and never scrolls
// (Mert, 2026-10-12). What saving does lives in useShiftEditor.
import type { ScheduleReadModel } from "@newfork/shared/schedule";
import { ConfirmButton } from "@newfork/ui";
import { ChartGantt, Rows3, Trash2, TriangleAlert, UsersRound, X } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";

import { formatHourTotal } from "../lib/scheduleHourTotals";
import { formatUnpaidBreakOption, unpaidBreakMinuteOptions } from "../lib/shiftEditorView";
import { usePersistentShiftWindowLayout, type ShiftWindowLayout } from "../store/scheduleUiStore";
import { ScheduleConflictNotice } from "./ScheduleConflictNotice";
import { getLastSegment, TimeInput } from "./TimeInput";
import { DayTrack } from "./shift-window/DayTrack";
import {
  byAvailability,
  DAY,
  formatClock,
  OVERTIME_MINUTES,
  overlaps,
  paidMinutes,
  personStatusText,
  shiftSpan,
  shortClock,
  toMinutes,
  usePeople,
} from "./shift-window/day";
import { CountStepper, FieldSelect, formatDay, initials, LabelsSelect, type FieldOption } from "./shift-window/fields";
import { SCREEN_PAD, useEditedBadgeMark, useFit, usePlacement, useViewportWidth, WINDOW_WIDTH } from "./shift-window/fit";
import {
  formatShiftNoteRemaining,
  shiftNoteMaxLength,
  useShiftEditor,
  type ShiftEditor,
  type ShiftEditorProps,
} from "./shift-window/useShiftEditor";
import "./shift-window/shift-window.css";
import { FieldNote, fieldNoteId } from "../../shell/FieldNote";

export { formatShiftNoteRemaining, shiftNoteMaxLength };

export function ShiftQuickEditor(props: ShiftEditorProps) {
  const editor = useShiftEditor(props);
  const [layout, setLayout] = usePersistentShiftWindowLayout();
  const { model, onClose, timeFormat } = props;
  const lanes = layout === "timeline"
    ? (editor.showEmployeePicker ? 1 + editor.eligibleEmployees.length : editor.selectedEmployee ? 1 : 0)
    : 0;
  const fit = useFit(editor.editorRef, layout, lanes);
  const viewportWidth = useViewportWidth();
  const width = Math.min(fit.wide ? WINDOW_WIDTH[layout].wide : WINDOW_WIDTH[layout].stacked, viewportWidth - SCREEN_PAD * 2);
  const place = usePlacement(editor.editorRef, editor.shiftId, { x: props.state.x, y: props.state.y }, width, `${layout}|${fit.wide}`);
  useEditedBadgeMark(editor.shiftId);
  // Size and place change smoothly only after the window has opened, so it
  // never visibly settles while appearing.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const startRef = useRef<HTMLInputElement>(null);
  // The cursor starts in the time: type "9", "5p", Enter, done.
  useEffect(() => {
    const input = startRef.current;
    if (!input) return;
    input.dataset.autoSelectSegment = "hour";
    input.focus({ preventScroll: true });
  }, []);
  // Switching keeps the cursor where it was: the same field in the other layout.
  const switchLayout = (next: ShiftWindowLayout) => {
    const root = editor.editorRef.current;
    const active = document.activeElement;
    const label = active instanceof HTMLElement && root?.contains(active) ? active.getAttribute("aria-label") : null;
    setLayout(next);
    if (!label) return;
    window.requestAnimationFrame(() => {
      root?.querySelector<HTMLElement>(`[aria-label="${label.replace(/"/g, '\\"')}"]`)?.focus({ preventScroll: true });
    });
  };
  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.altKey && !event.ctrlKey && !event.metaKey && event.code === "KeyT") {
      event.preventDefault();
      switchLayout(layout === "form" ? "timeline" : "form");
    }
  };
  const location = model.locations.find((item) => item.id === editor.value.location_id);
  const who = editor.selectedEmployee?.display_name ?? (editor.count > 1 ? `${editor.count} open shifts` : "Open shift");
  const context = [who, formatDay(editor.date), location?.name].filter(Boolean).join(" · ");
  const contextId = useId();

  return (
    <>
      <div
        ref={editor.editorRef}
        className="shift-window"
        data-layout={layout}
        data-wide={fit.wide || undefined}
        data-compact-lanes={fit.laneHeight < 36 || undefined}
        data-ready={ready || undefined}
        data-side={place.side}
        data-shift-quick-editor-content="true"
        role="dialog"
        aria-label={editor.title}
        aria-describedby={contextId}
        style={{
          left: place.left,
          top: place.top,
          width,
          "--arrow-top": `${place.arrowTop}px`,
          "--lane-h": `${fit.laneHeight}px`,
        } as CSSProperties}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.stopPropagation()}
      >
        <header className="shift-window-head" {...place.dragHandlers}>
          <span className="shift-window-avatar" data-open={!editor.selectedEmployee || undefined} aria-hidden>
            {editor.selectedEmployee ? initials(editor.selectedEmployee.display_name) : <UsersRound size={14} />}
          </span>
          <span className="shift-window-head-text">
            <strong>{editor.title}</strong>
            <small id={contextId} title={context}>{context}</small>
          </span>
          {editor.stale ? null : <LayoutSwitch layout={layout} onChange={switchLayout} />}
          <button type="button" className="shift-window-icon" onClick={onClose} aria-label="Close editor" title="Close (Esc)">
            <X size={16} aria-hidden />
          </button>
        </header>
        {editor.stale ? (
          <div className="shift-window-stale">
            <ScheduleConflictNotice
              title="Shift changed"
              description="Shift changed"
              messages={["This shift was changed by someone else. Reload to see the current version before editing."]}
              tone="warning"
            />
            <button type="button" className="shift-window-button" data-tone="primary" onClick={props.onReload}>
              Close & reload
            </button>
          </div>
        ) : (
          <form className="shift-window-form" onSubmit={editor.submit} noValidate>
            <div className="shift-window-body" key={layout}>
              {layout === "form" ? (
                <FormLayout editor={editor} model={model} timeFormat={timeFormat} startRef={startRef} />
              ) : (
                <TimelineLayout editor={editor} model={model} timeFormat={timeFormat} startRef={startRef} cap={fit.cap} />
              )}
            </div>
            <Preview editor={editor} />
            <Footer editor={editor} onClose={onClose} />
          </form>
        )}
      </div>
      {editor.questions}
    </>
  );
}

function LayoutSwitch({ layout, onChange }: { readonly layout: ShiftWindowLayout; readonly onChange: (layout: ShiftWindowLayout) => void }) {
  const options: ReadonlyArray<readonly [ShiftWindowLayout, string, ReactNode]> = [
    ["form", "Form", <Rows3 key="form" size={15} aria-hidden />],
    ["timeline", "Timeline", <ChartGantt key="timeline" size={15} aria-hidden />],
  ];
  return (
    <span className="shift-window-switch" role="radiogroup" aria-label="Window layout (Alt+T)">
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
            const group = event.currentTarget.parentElement;
            onChange(layout === "form" ? "timeline" : "form");
            window.requestAnimationFrame(() => group?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus());
          }}
        >
          {icon}
        </button>
      ))}
    </span>
  );
}

/* ───────────────────────── rows ───────────────────────── */

function Row({
  label,
  changed,
  was,
  children,
  className,
  labelFor,
}: {
  readonly label: string;
  readonly changed?: boolean;
  readonly was?: string;
  readonly children: ReactNode;
  readonly className?: string;
  readonly labelFor?: string;
}) {
  const Label = labelFor ? "label" : "span";
  return (
    <div className={`shift-window-row ${className ?? ""}`} data-changed={changed || undefined}>
      <Label className="shift-window-label" htmlFor={labelFor} title={changed && was ? `Was: ${was}` : undefined}>
        {label}
        {changed ? <span className="shift-window-dot" aria-hidden /> : null}
      </Label>
      <div className="shift-window-value">{children}</div>
    </div>
  );
}

interface LayoutProps {
  readonly editor: ShiftEditor;
  readonly model: ScheduleReadModel;
  readonly timeFormat: "12h" | "24h";
  readonly startRef: RefObject<HTMLInputElement | null>;
}

type Changes = Partial<Record<"time" | "type" | "break" | "job" | "labels" | "note" | "badge" | "who", string>>;

/** On an edit, what each changed row was when the window opened. */
function useChanges(editor: ShiftEditor, model: ScheduleReadModel, timeFormat: "12h" | "24h"): Changes {
  const initial = editor.kind === "edit" ? editor.initial : null;
  const value = editor.value;
  if (!initial) return {};
  const name = (items: ReadonlyArray<{ readonly id: string; readonly name: string }>, id: string | null | undefined) =>
    items.find((item) => item.id === id)?.name ?? "None";
  const clock = (start: string, end: string) => {
    const s = toMinutes(start);
    const e = toMinutes(end);
    return s === null || e === null ? "No time" : `${formatClock(s, timeFormat)} – ${formatClock(e, timeFormat)}`;
  };
  const changes: Changes = {};
  if (initial.start_time !== value.start_time || initial.end_time !== value.end_time) changes.time = clock(initial.start_time, initial.end_time);
  if (initial.shift_type_id !== value.shift_type_id) changes.type = name(model.shift_types, initial.shift_type_id);
  if (initial.unpaid_break_minutes !== value.unpaid_break_minutes) changes.break = formatUnpaidBreakOption(initial.unpaid_break_minutes ?? 0);
  if (initial.job_id !== value.job_id) changes.job = name(model.jobs, initial.job_id);
  if (JSON.stringify(initial.label_ids ?? []) !== JSON.stringify(value.label_ids ?? [])) changes.labels = (initial.label_names ?? []).join(", ") || "No labels";
  if (initial.note !== value.note) changes.note = initial.note ? `“${initial.note.slice(0, 60)}”` : "No note";
  if (initial.hide_time_on_badge !== value.hide_time_on_badge) changes.badge = initial.hide_time_on_badge ? "Times hidden" : "Times shown";
  if (initial.employee_id !== value.employee_id) {
    changes.who = name(model.employees.map((employee) => ({ id: employee.id, name: employee.display_name })), initial.employee_id);
  }
  return changes;
}

function useWeekLoad(model: ScheduleReadModel, editor: ShiftEditor) {
  const employeeId = editor.value.employee_id;
  const { shiftId, value } = editor;
  return useMemo(() => {
    if (!employeeId) return null;
    const before = model.shifts
      .filter((shift) => shift.employee_id === employeeId && shift.id !== shiftId)
      .reduce((sum, shift) => sum + paidMinutes(shift), 0);
    return { before, after: before + paidMinutes(value) };
  }, [model.shifts, employeeId, shiftId, value]);
}

function TimeRow({ editor, model, timeFormat, startRef, changes }: LayoutProps & { readonly changes: Changes }) {
  const endRef = useRef<HTMLInputElement>(null);
  const startId = useId();
  const span = shiftSpan(editor.value.start_time, editor.value.end_time);
  const week = useWeekLoad(model, editor);
  const [person] = usePeople(model, editor.value, editor.shiftId, editor.selectedEmployee ? [editor.selectedEmployee] : []);
  const breakMinutes = editor.value.unpaid_break_minutes ?? 0;
  const facts: string[] = [];
  const warnings = new Set<string>();
  // Their own marks for the day, said before saving rather than after.
  if (person && span && (person.status === "time_off" || person.status === "unavailable")) {
    const ranges = person.status === "time_off" ? person.timeOff : person.unavailable;
    const hit = ranges.find((range) => overlaps(span, { s: range.from, e: range.to })) ?? ranges[0]!;
    const fact = `${personStatusText[person.status]} ${shortClock(hit.from, timeFormat)}–${shortClock(hit.to, timeFormat)}`;
    facts.push(fact);
    warnings.add(fact);
  }
  if (span) {
    const paid = span.e - span.s - breakMinutes;
    if (breakMinutes && paid > 0) facts.push(`${formatHourTotal(paid)} paid`);
    if (breakMinutes && paid <= 0) {
      facts.push("Break is as long as the shift");
      warnings.add("Break is as long as the shift");
    }
    if (span.e > DAY) facts.push("ends next day");
  }
  if (week) {
    const overtime = week.after > OVERTIME_MINUTES;
    const fact = `Week ${formatHourTotal(week.before)} → ${formatHourTotal(week.after)}${overtime ? " · overtime" : ""}`;
    facts.push(fact);
    if (overtime) warnings.add(fact);
  }
  // Both times are described by the row's one note: its error, else its facts (UI-FIELDMSG-2).
  const timeNote = fieldNoteId("shift-window-time", editor.timeValidationMessage, facts.length ? facts.join(" · ") : null);
  return (
    <Row label="Time" className="shift-window-row-time" changed={"time" in changes} was={changes.time} labelFor={startId}>
      <div className="shift-window-time">
        <TimeInput
          ref={startRef}
          id={startId}
          value={editor.value.start_time}
          ariaLabel="Start time"
          ariaDescribedBy={timeNote}
          timeFormat={timeFormat}
          density="compact"
          className="shift-window-time-input"
          onAutoAdvance={() => {
            if (endRef.current) {
              endRef.current.dataset.autoSelectSegment = "hour";
              endRef.current.focus();
            }
          }}
          onChange={(start) => editor.setTimes(start, editor.value.end_time)}
        />
        <span className="shift-window-dash" aria-hidden>–</span>
        <TimeInput
          ref={endRef}
          value={editor.value.end_time}
          ariaLabel="End time"
          ariaDescribedBy={timeNote}
          timeFormat={timeFormat}
          density="compact"
          className="shift-window-time-input"
          onAutoRetreat={() => {
            if (startRef.current) {
              // Back onto Start's last segment: AM/PM, or minutes in 24h.
              startRef.current.dataset.autoSelectSegment = getLastSegment(timeFormat);
              startRef.current.focus();
            }
          }}
          onBoundaryEnter={!editor.value.hide_time_on_badge ? () => void editor.attemptSubmit() : undefined}
          onChange={(end) => editor.setTimes(editor.value.start_time, end)}
        />
        <span className="shift-window-span" data-empty={!span || undefined}>{span ? formatHourTotal(span.e - span.s) : "–"}</span>
      </div>
      {/* Under both times, one note for the row (UI-FIELDMSG-2): the error in
          the facts' place, said whole; nothing while there is neither. */}
      <FieldNote
        id="shift-window-time"
        className="shift-window-help"
        error={editor.timeValidationMessage}
        help={
          facts.length ? (
            <span className="shift-window-facts">
              {facts.flatMap((fact, index) => [
                ...(index ? [<i key={`dot-${index}`} aria-hidden>·</i>] : []),
                <span key={fact} data-tone={warnings.has(fact) ? "warn" : undefined}>{fact}</span>,
              ])}
            </span>
          ) : null
        }
      />
    </Row>
  );
}

function TypeChips({ editor, model }: { readonly editor: ShiftEditor; readonly model: ScheduleReadModel }) {
  if (!model.shift_types.length) return <small className="shift-window-muted">No shift types</small>;
  return (
    <div className="shift-window-chips" role="group" aria-label="Shift type">
      {model.shift_types.map((type) => (
        <button
          key={type.id}
          type="button"
          aria-pressed={editor.value.shift_type_id === type.id}
          style={{ "--chip": type.color } as CSSProperties}
          onClick={() => editor.selectShiftType(type.id)}
        >
          <span className="shift-window-chip-dot" aria-hidden />
          {type.name}
        </button>
      ))}
    </div>
  );
}

function BreakButtons({ editor }: { readonly editor: ShiftEditor }) {
  return (
    <div className="shift-window-segments" role="group" aria-label="Unpaid break">
      {unpaidBreakMinuteOptions.map((minutes) => (
        <button
          key={minutes}
          type="button"
          aria-pressed={(editor.value.unpaid_break_minutes ?? 0) === minutes}
          onClick={() => editor.update({ unpaid_break_minutes: minutes })}
        >
          {formatUnpaidBreakOption(minutes)}
        </button>
      ))}
    </div>
  );
}

const NOTE_COUNT_SHOWN_FROM = 80;

function NoteField({ editor, id }: { readonly editor: ShiftEditor; readonly id: string }) {
  const several = editor.count > 1;
  const left = Math.max(0, shiftNoteMaxLength - editor.value.note.length);
  return (
    <div className="shift-window-note">
      <textarea
        id={id}
        rows={1}
        maxLength={shiftNoteMaxLength}
        placeholder={several ? "" : "Add a note"}
        aria-describedby={`${id}-count`}
        // Adding several open shifts at once takes no note; the text comes
        // back if the count returns to one.
        disabled={several}
        value={several ? "" : editor.value.note}
        onChange={(event) => editor.update({ note: editor.clampNote(event.target.value) })}
        onKeyDown={(event) => {
          // Ctrl/Cmd+Enter saves from the note too.
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            void editor.attemptSubmit();
          }
        }}
      />
      {/* Read to a screen reader always; shown once the limit is near. */}
      <small id={`${id}-count`} className="shift-window-note-count" data-show={several || left <= NOTE_COUNT_SHOWN_FROM || undefined}>
        {several ? "Notes go on one shift at a time." : formatShiftNoteRemaining(editor.value.note)}
      </small>
    </div>
  );
}

function BadgeToggle({ editor }: { readonly editor: ShiftEditor }) {
  return (
    <label className="shift-window-toggle">
      <input
        type="checkbox"
        checked={!editor.value.hide_time_on_badge}
        onChange={(event) => editor.update({ hide_time_on_badge: !event.target.checked })}
      />
      Show times on badge
    </label>
  );
}

function useRows(editor: ShiftEditor, model: ScheduleReadModel, changes: Changes) {
  const noteId = useId();
  const jobOptions: FieldOption[] = editor.eligibleJobs.map((job) => ({ value: job.id, label: job.name }));
  const labels = model.shift_labels ?? [];
  return {
    type: (
      <Row label="Type" changed={"type" in changes} was={changes.type} className="shift-window-row-type">
        <TypeChips editor={editor} model={model} />
      </Row>
    ),
    break: (
      <Row label="Break" changed={"break" in changes} was={changes.break}>
        <BreakButtons editor={editor} />
      </Row>
    ),
    job: (
      <Row label="Job" changed={"job" in changes} was={changes.job}>
        <FieldSelect label="Job" value={editor.value.job_id} options={jobOptions} onChange={(job_id) => editor.update({ job_id })} />
        {editor.value.job_id && editor.eligibleEmployees.length === 0 ? (
          <small className="shift-window-help">No employees qualified for this job.</small>
        ) : null}
      </Row>
    ),
    labels: labels.length ? (
      <Row label="Labels" changed={"labels" in changes} was={changes.labels}>
        <LabelsSelect editor={editor} labels={labels} />
      </Row>
    ) : null,
    note: (
      <Row label="Note" changed={"note" in changes} was={changes.note} className="shift-window-row-note" labelFor={noteId}>
        <NoteField editor={editor} id={noteId} />
      </Row>
    ),
    badge: (
      <Row label="Badge" changed={"badge" in changes} was={changes.badge}>
        <BadgeToggle editor={editor} />
      </Row>
    ),
  };
}

/* ───────────────────────── Form ───────────────────────── */

function FormLayout(props: LayoutProps) {
  const { editor, model, timeFormat } = props;
  const changes = useChanges(editor, model, timeFormat);
  const people = usePeople(model, editor.value, editor.shiftId, editor.showEmployeePicker ? editor.eligibleEmployees : []);
  const employeeOptions: FieldOption[] = [
    { value: "", label: editor.openLabel, hint: "anyone qualified" },
    ...[...people].sort(byAvailability).map((person) => ({
      value: person.employee.id,
      label: person.employee.display_name,
      hint: `${personStatusText[person.status]} · ${formatHourTotal(person.weekMinutes)}`,
    })),
  ];
  const rows = useRows(editor, model, changes);
  return (
    <>
      <div className="shift-window-rows shift-window-lead">{rows.type}</div>
      <div className="shift-window-cols">
        <div className="shift-window-col shift-window-col-a shift-window-rows">
          {editor.showEmployeePicker ? (
            <Row label="Who" changed={"who" in changes} was={changes.who}>
              <div className="shift-window-who">
                <FieldSelect
                  label="Employee"
                  value={editor.value.employee_id ?? ""}
                  options={employeeOptions}
                  disabled={editor.employeePickerDisabled}
                  onChange={(employeeId) => editor.update({ employee_id: employeeId || null })}
                />
                {editor.showCountStepper ? <CountStepper editor={editor} /> : null}
              </div>
              {editor.employeePickerDisabled ? <small className="shift-window-help">Several open shifts stay unassigned.</small> : null}
            </Row>
          ) : null}
          <TimeRow {...props} changes={changes} />
          {rows.break}
        </div>
        <div className="shift-window-col shift-window-col-b shift-window-rows">
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
  const { editor, model, timeFormat, cap } = props;
  const changes = useChanges(editor, model, timeFormat);
  const rows = useRows(editor, model, changes);
  return (
    <div className="shift-window-cols">
      <div className="shift-window-col shift-window-col-a">
        <div className="shift-window-rows shift-window-rows-top">
          {rows.type}
          <TimeRow {...props} changes={changes} />
          {editor.showCountStepper ? (
            <Row label="How many">
              <span className="shift-window-count">
                <CountStepper editor={editor} />
                <small className="shift-window-muted">
                  {editor.count > 1 ? "Several open shifts stay unassigned." : "Add more than one open shift at once."}
                </small>
              </span>
            </Row>
          ) : null}
        </div>
        <DayTrack editor={editor} model={model} timeFormat={timeFormat} cap={cap} />
      </div>
      <div className="shift-window-col shift-window-col-b shift-window-rows shift-window-grid">
        {rows.job}
        {rows.labels}
        {rows.break}
        {rows.badge}
        {rows.note}
      </div>
    </div>
  );
}

/* ───────────────────────── bottom ───────────────────────── */

/** The rule box's first warning, said before Save is pressed. */
function Preview({ editor }: { readonly editor: ShiftEditor }) {
  const messages = editor.previewMessages;
  if (!messages.length) return null;
  return (
    <div className="shift-window-preview" role="status">
      <TriangleAlert size={14} aria-hidden />
      <span>{messages[0]}</span>
      {messages.length > 1 ? <em>+{messages.length - 1} more</em> : null}
    </div>
  );
}

function Footer({ editor, onClose }: { readonly editor: ShiftEditor; readonly onClose: () => void }) {
  return (
    <div className="shift-window-foot">
      {editor.kind === "edit" ? (
        // BL-707 (UI-12): deleting asks twice here, as the strip's Delete does.
        <ConfirmButton
          unstyled
          className="shift-window-delete"
          aria-label="Delete shift"
          confirmLabel={<><Trash2 size={14} aria-hidden />Confirm delete</>}
          confirmName="Confirm delete"
          onConfirm={editor.deleteShift}
        >
          <Trash2 size={14} aria-hidden />
          Delete
        </ConfirmButton>
      ) : null}
      <span className="shift-window-foot-space" />
      <button type="button" className="shift-window-button" onClick={onClose}>Cancel</button>
      <button ref={editor.submitRef} type="submit" className="shift-window-button" data-tone="primary" disabled={editor.saveDisabled}>
        {editor.checkingAvailability ? "Checking availability…" : editor.saveButtonLabel}
      </button>
    </div>
  );
}
