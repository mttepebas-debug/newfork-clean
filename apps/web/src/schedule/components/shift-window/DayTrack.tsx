// The Timeline layout's day: 5 AM to 5 AM (or midnight to midnight for a
// shift that starts before 5), the shift as a bar you drag or stretch, the
// person's other shifts, unavailable hours and time off, and how many people
// are on shift at this location through the day. On an open shift every
// qualified person gets a row; pressing a row or dropping the bar on it gives
// them the shift.
import type { ScheduleReadModel } from "@newfork/shared/schedule";
import { UsersRound } from "lucide-react";
import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { formatHourTotal } from "../../lib/scheduleHourTotals";
import {
  byAvailability,
  DAY,
  formatClock,
  OVERTIME_MINUTES,
  paidMinutes,
  personStatusText,
  shiftSpan,
  shortClock,
  SNAP,
  toCanonical,
  usePeople,
  type Person,
  type PersonStatus,
  type Span,
} from "./day";
import { FieldSelect, formatDay, initials } from "./fields";
import type { ShiftEditor } from "./useShiftEditor";

// A shift is at most this long when drawn or stretched on the line.
const LONGEST_SHIFT = 20 * 60;
// The start stays on the shift's own day (latest 11:45 PM); only the end may
// run into the next morning.
const LAST_START = DAY - SNAP;

type Drag =
  | { readonly kind: "move" | "start" | "end"; readonly pointer: number; readonly x: number; readonly span: Span }
  | { readonly kind: "draw"; readonly pointer: number; readonly anchor: number };

/** The times a drag lands on, or null when the line refuses them. */
export function clampDrag(origin: number, s: number, e: number): Span | null {
  if (e - s < SNAP || e - s > LONGEST_SHIFT || s < origin || s > LAST_START || e > origin + DAY) return null;
  return { s, e };
}

export function DayTrack({
  editor,
  model,
  timeFormat,
  cap,
}: {
  readonly editor: ShiftEditor;
  readonly model: ScheduleReadModel;
  readonly timeFormat: "12h" | "24h";
  readonly cap: number;
}) {
  const scaleRef = useRef<HTMLDivElement>(null);
  const mine = shiftSpan(editor.value.start_time, editor.value.end_time);
  const [origin] = useState(() => (mine && mine.s < 300 ? 0 : 300));
  const end = origin + DAY;
  const pct = (minutes: number) => `${((Math.min(Math.max(minutes, origin), end) - origin) / DAY) * 100}%`;
  const width = (span: Span) => `${((Math.min(span.e, end) - Math.max(span.s, origin)) / DAY) * 100}%`;
  // A very short bar is drawn at its smallest size without leaving its row.
  const inside = (span: Span) => `min(${pct(span.s)}, calc(100% - var(--bar-min)))`;
  const assignable = editor.showEmployeePicker;
  const candidates = usePeople(model, editor.value, editor.shiftId, assignable ? editor.eligibleEmployees : []);
  const person = usePeople(model, editor.value, editor.shiftId, !assignable && editor.selectedEmployee ? [editor.selectedEmployee] : []);
  const sorted = assignable ? [...candidates].sort(byAvailability) : person;
  // A very short screen: the rows that fit, and everyone else in one "more" list.
  let lanes = sorted;
  let hidden: Person[] = [];
  if (assignable && Number.isFinite(cap) && sorted.length + 1 > cap) {
    const room = Math.max(1, cap - 2);
    lanes = sorted.slice(0, room);
    const chosen = sorted.find((item) => item.employee.id === editor.value.employee_id);
    if (chosen && !lanes.includes(chosen)) lanes = [...lanes.slice(0, room - 1), chosen];
    hidden = sorted.filter((item) => !lanes.includes(item));
  }
  const shiftType = model.shift_types.find((type) => type.id === editor.value.shift_type_id);
  const color = shiftType?.color ?? "var(--theme-accent)";
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const toMinute = (clientX: number) => {
    const rect = scaleRef.current?.getBoundingClientRect();
    if (!rect || !rect.width) return origin;
    return origin + ((clientX - rect.left) / rect.width) * DAY;
  };
  const snap = (minutes: number) => Math.round(minutes / SNAP) * SNAP;
  const commit = (s: number, e: number) => {
    const span = clampDrag(origin, s, e);
    if (span) editor.setTimes(toCanonical(span.s), toCanonical(span.e));
  };

  // Coverage: how many people are on shift at this location, every 15 minutes.
  const coverage = useMemo(() => {
    const spans = model.shifts
      .filter((shift) => shift.location_id === editor.value.location_id && shift.scheduled_date === editor.value.scheduled_date && shift.id !== editor.shiftId)
      .flatMap((shift) => shiftSpan(shift.start_time, shift.end_time) ?? []);
    const slots = Array.from({ length: DAY / SNAP }, (_, index) => {
      const at = origin + index * SNAP;
      return spans.filter((span) => span.s <= at && at < span.e).length;
    });
    const max = Math.max(0, ...slots);
    return { slots, max, peak: Math.max(1, max) };
  }, [model.shifts, editor.value.location_id, editor.value.scheduled_date, editor.shiftId, origin]);
  const coveragePath = useMemo(() => {
    const height = 24;
    let path = `M0 ${height}`;
    coverage.slots.forEach((count, index) => {
      const y = height - (count / coverage.peak) * (height - 3);
      path += ` L${index} ${y} L${index + 1} ${y}`;
    });
    return `${path} L${coverage.slots.length} ${height} Z`;
  }, [coverage]);
  const onShiftAt = (minute: number) =>
    (coverage.slots[Math.floor((minute - origin) / SNAP)] ?? 0) + (mine && mine.s <= minute && minute < mine.e ? 1 : 0);

  // A time box keeps its own draft while focused; dragging hands focus to the
  // bar, so the box shows the dragged time and Enter cannot put the old one back.
  const focusBar = () => editor.editorRef.current?.querySelector<HTMLElement>(".shift-window-bar")?.focus({ preventScroll: true });
  const beginBar = (kind: "move" | "start" | "end") => (event: ReactPointerEvent<HTMLElement>) => {
    if (!mine || event.button > 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.closest<HTMLElement>(".shift-window-track")?.setPointerCapture?.(event.pointerId);
    setDrag({ kind, pointer: event.pointerId, x: toMinute(event.clientX), span: mine });
  };
  const beginLane = (laneId: string | null) => (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button > 0) return;
    const ownLane = !assignable || laneId === (editor.value.employee_id ?? null);
    if (!ownLane) {
      if (!editor.employeePickerDisabled) editor.update({ employee_id: laneId });
      return;
    }
    event.preventDefault();
    const active = document.activeElement;
    if (active instanceof HTMLElement && editor.editorRef.current?.contains(active)) active.blur();
    event.currentTarget.closest<HTMLElement>(".shift-window-track")?.setPointerCapture?.(event.pointerId);
    const anchor = snap(toMinute(event.clientX));
    setDrag({ kind: "draw", pointer: event.pointerId, anchor });
    if (!mine) commit(Math.min(anchor, LAST_START), Math.min(anchor, LAST_START) + 60);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const minute = toMinute(event.clientX);
    setHover(minute >= origin && minute <= end ? minute : null);
    if (!drag || drag.pointer !== event.pointerId) return;
    const at = snap(minute);
    if (drag.kind === "draw") {
      if (at !== drag.anchor) commit(Math.min(at, drag.anchor, LAST_START), Math.max(at, drag.anchor));
      return;
    }
    const delta = snap(minute - drag.x);
    if (drag.kind === "move") {
      const length = drag.span.e - drag.span.s;
      const s = Math.min(Math.max(drag.span.s + delta, origin), end - length, LAST_START);
      commit(s, s + length);
      // Dragging the bar onto someone's row hands the shift to them.
      if (assignable && !editor.employeePickerDisabled) {
        const lane = document.elementFromPoint?.(event.clientX, event.clientY)?.closest<HTMLElement>("[data-lane]");
        const laneId = lane ? (lane.dataset.lane === "open" ? null : lane.dataset.lane) : undefined;
        if (laneId !== undefined && laneId !== "more" && laneId !== editor.value.employee_id) editor.update({ employee_id: laneId });
      }
      return;
    }
    if (drag.kind === "start") commit(Math.min(Math.max(drag.span.s + delta, origin), drag.span.e - SNAP, LAST_START), drag.span.e);
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
      editor.requestSubmit();
      return;
    }
    if (!mine) return;
    const sign = event.key === "ArrowRight" || event.key === "ArrowUp" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : 0;
    if (!sign) return;
    event.preventDefault();
    event.stopPropagation();
    const step = sign * (event.shiftKey ? 60 : SNAP);
    if (kind === "move") commit(mine.s + step, mine.e + step);
    else if (kind === "start") commit(Math.min(mine.s + step, mine.e - SNAP, LAST_START), mine.e);
    else commit(mine.s, Math.max(mine.e + step, mine.s + SNAP));
  };

  const hours = Array.from({ length: 25 }, (_, index) => origin + index * 60);
  const hourLabel = (minutes: number) => {
    const text = formatClock(minutes, timeFormat);
    return timeFormat === "24h" ? text.slice(0, 2) : text.replace(":00", "").replace(" AM", "a").replace(" PM", "p");
  };
  const bar = mine ? (
    <span
      className="shift-window-bar"
      data-dragging={drag && drag.kind !== "draw" ? true : undefined}
      style={{ left: inside(mine), width: width(mine), "--bar": color } as CSSProperties}
      onPointerDown={beginBar("move")}
      role="slider"
      tabIndex={0}
      aria-label="Shift time. Arrows move it 15 minutes, Shift+arrows an hour"
      aria-valuemin={origin}
      aria-valuemax={end}
      aria-valuenow={mine.s}
      aria-valuetext={`${formatClock(mine.s, timeFormat)} to ${formatClock(mine.e, timeFormat)}`}
      onKeyDown={nudge("move")}
    >
      <span
        className="shift-window-grip"
        data-side="start"
        role="slider"
        tabIndex={0}
        aria-label="Shift start"
        aria-valuemin={origin}
        aria-valuemax={mine.e}
        aria-valuenow={mine.s}
        aria-valuetext={formatClock(mine.s, timeFormat)}
        onPointerDown={beginBar("start")}
        onKeyDown={nudge("start")}
      />
      <b>{shortClock(mine.s, timeFormat)}–{shortClock(mine.e, timeFormat)}</b>
      <span
        className="shift-window-grip"
        data-side="end"
        role="slider"
        tabIndex={0}
        aria-label="Shift end"
        aria-valuemin={mine.s}
        aria-valuemax={end}
        aria-valuenow={mine.e}
        aria-valuetext={formatClock(mine.e, timeFormat)}
        onPointerDown={beginBar("end")}
        onKeyDown={nudge("end")}
      />
    </span>
  ) : null;
  const ghost = mine ? <span className="shift-window-bar-ghost" style={{ left: inside(mine), width: width(mine) }} aria-hidden /> : null;

  const laneBody = (lanePerson: Person, own: boolean) => (
    <>
      {lanePerson.unavailable.map((range, index) => (
        <span
          key={`u${index}`}
          className="shift-window-block"
          data-kind="unavailable"
          style={{ left: pct(range.from), width: width({ s: range.from, e: range.to }) }}
          title={`Unavailable ${formatClock(range.from, timeFormat)} – ${formatClock(range.to, timeFormat)}`}
        />
      ))}
      {lanePerson.timeOff.map((range, index) => (
        <span
          key={`t${index}`}
          className="shift-window-block"
          data-kind="time_off"
          style={{ left: pct(range.from), width: width({ s: range.from, e: range.to }) }}
          title={`Time off ${formatClock(range.from, timeFormat)} – ${formatClock(range.to, timeFormat)}`}
        >
          <em>Time off</em>
        </span>
      ))}
      {lanePerson.dayShifts.map((shift) => (
        <span
          key={shift.id}
          className="shift-window-other"
          style={{ left: pct(shift.span.s), width: width(shift.span), "--bar": shift.color } as CSSProperties}
          title={`${shift.job} ${formatClock(shift.span.s, timeFormat)} – ${formatClock(shift.span.e, timeFormat)}`}
        >
          <em>{shift.job}</em>
        </span>
      ))}
      {own ? bar : assignable ? ghost : null}
    </>
  );

  return (
    <div className="shift-window-day">
      <div
        className="shift-window-track"
        data-drawing={drag?.kind === "draw" || undefined}
        data-busy={drag ? true : undefined}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => {
          if (!drag) setHover(null);
        }}
      >
        <div className="shift-window-lane shift-window-lane-scale">
          <span className="shift-window-lane-name"><small>{formatDay(editor.date)}</small></span>
          <div ref={scaleRef} className="shift-window-lane-body">
            {hours.map((minute, index) => (
              <span key={minute} className="shift-window-hour" data-major={index % 3 === 0 || undefined} style={{ left: pct(minute) }}>
                {index % 3 === 0 && index < 24 ? <em>{hourLabel(minute)}</em> : null}
              </span>
            ))}
          </div>
        </div>
        <div className="shift-window-lane shift-window-lane-coverage">
          <span className="shift-window-lane-name"><small>On shift{coverage.max ? ` · up to ${coverage.max}` : ""}</small></span>
          <div className="shift-window-lane-body">
            <svg viewBox={`0 0 ${coverage.slots.length} 24`} preserveAspectRatio="none" aria-hidden>
              <path d={coveragePath} />
            </svg>
          </div>
        </div>
        <div className="shift-window-lanes" role={assignable ? "radiogroup" : undefined} aria-label={assignable ? "Who works this shift" : undefined}>
          {assignable ? (
            <Lane
              id="open"
              selected={editor.value.employee_id === null}
              disabled={editor.employeePickerDisabled}
              onSelect={() => editor.update({ employee_id: null })}
              onPointerDown={beginLane(null)}
              name={(
                <>
                  <span className="shift-window-avatar shift-window-avatar-small" data-open aria-hidden><UsersRound size={12} /></span>
                  <span className="shift-window-lane-text">
                    <b>{editor.count > 1 ? `${editor.count} open shifts` : editor.openLabel}</b>
                    <small>anyone qualified</small>
                  </span>
                </>
              )}
            >
              {editor.value.employee_id === null ? bar : null}
            </Lane>
          ) : null}
          {lanes.map((lanePerson) => {
            const own = !assignable || editor.value.employee_id === lanePerson.employee.id;
            const after = own && mine ? lanePerson.weekMinutes + paidMinutes(editor.value) : lanePerson.weekMinutes;
            return (
              <Lane
                key={lanePerson.employee.id}
                id={lanePerson.employee.id}
                selected={own}
                radio={assignable}
                disabled={assignable && editor.employeePickerDisabled}
                onSelect={() => editor.update({ employee_id: lanePerson.employee.id })}
                onPointerDown={beginLane(lanePerson.employee.id)}
                status={lanePerson.status}
                name={(
                  <>
                    <span className="shift-window-avatar shift-window-avatar-small" aria-hidden>{initials(lanePerson.employee.display_name)}</span>
                    <span className="shift-window-lane-text">
                      <b title={lanePerson.employee.display_name}>{lanePerson.employee.display_name}</b>
                      <small>
                        {assignable ? <span className="shift-window-status" data-status={lanePerson.status}>{personStatusText[lanePerson.status]}</span> : null}
                        <span className="shift-window-week" data-tone={after > OVERTIME_MINUTES ? "warn" : undefined} title="Paid hours this week">
                          {formatHourTotal(after)} wk
                        </span>
                      </small>
                    </span>
                  </>
                )}
              >
                {laneBody(lanePerson, own)}
              </Lane>
            );
          })}
          {hidden.length ? (
            <div className="shift-window-lane shift-window-lane-more" data-lane="more">
              <span className="shift-window-lane-name">
                <FieldSelect
                  label="More people"
                  value=""
                  placeholder={`${hidden.length} more ${hidden.length === 1 ? "person" : "people"}`}
                  compact
                  disabled={editor.employeePickerDisabled}
                  options={hidden.map((item) => ({
                    value: item.employee.id,
                    label: item.employee.display_name,
                    hint: `${personStatusText[item.status]} · ${formatHourTotal(item.weekMinutes)}`,
                  }))}
                  onChange={(employeeId) => editor.update({ employee_id: employeeId })}
                />
              </span>
              <div className="shift-window-lane-body shift-window-lane-note"><small>Pick someone to see their day here.</small></div>
            </div>
          ) : null}
          {assignable && sorted.length === 0 ? <p className="shift-window-muted shift-window-empty">No one is qualified for this job at this location.</p> : null}
        </div>
        {hover !== null ? (
          <span
            className="shift-window-guide"
            data-flip={(hover - origin) / DAY > 0.78 || undefined}
            style={{ left: `calc(var(--name-col) + (100% - var(--name-col)) * ${(hover - origin) / DAY})` }}
            aria-hidden
          >
            <em>
              {formatClock(snap(hover), timeFormat)}
              <span>{onShiftAt(snap(hover))} on shift</span>
            </em>
          </span>
        ) : null}
      </div>
      <p className="shift-window-track-hint">
        {assignable
          ? "Drag the bar or its ends · drop it on a person to give them the shift · draw on an empty spot"
          : "Drag the bar or its ends · draw on an empty spot · arrow keys move 15 minutes"}
      </p>
    </div>
  );
}

function Lane({
  id,
  selected,
  radio = true,
  disabled,
  onSelect,
  onPointerDown,
  name,
  status,
  children,
}: {
  readonly id: string;
  readonly selected: boolean;
  readonly radio?: boolean;
  readonly disabled?: boolean;
  readonly onSelect: () => void;
  readonly onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly name: ReactNode;
  readonly status?: PersonStatus;
  readonly children: ReactNode;
}) {
  return (
    <div className="shift-window-lane" data-lane={id} data-selected={selected || undefined} data-status={status}>
      {radio ? (
        <button
          type="button"
          role="radio"
          aria-checked={selected}
          disabled={disabled}
          className="shift-window-lane-name"
          onClick={onSelect}
          onKeyDown={(event) => {
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
            event.preventDefault();
            const buttons = [...(event.currentTarget.closest(".shift-window-lanes")?.querySelectorAll<HTMLButtonElement>("button.shift-window-lane-name:not(:disabled)") ?? [])];
            const index = buttons.indexOf(event.currentTarget);
            const next = buttons[(index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length];
            next?.click();
            next?.focus();
          }}
        >
          {name}
        </button>
      ) : (
        <span className="shift-window-lane-name">{name}</span>
      )}
      <div className="shift-window-lane-body" onPointerDown={onPointerDown}>{children}</div>
    </div>
  );
}
