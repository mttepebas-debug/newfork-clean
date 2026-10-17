import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  Ban,
  Check,
  ChevronDown,
  CircleCheck,
  Clock,
  Moon,
  Sun,
  Sunrise,
  Sunset,
} from "lucide-react";
import type {
  PreferenceShiftType,
  WeeklyPreference,
  WeeklyPreferenceDay,
} from "@newfork/shared";
import {
  DAY_END,
  DAY_START,
  DISPLAY_DAYS,
  STEP,
  WEEKDAY_NAMES,
  applyDay,
  clamp,
  compactClock,
  dayState,
  dayStatusText,
  fullClock,
  rangeOf,
  rangeText,
  setDayState,
  shortClock,
  shortDay,
  snap,
  toMinutes,
  toggleCopy,
  toggleShiftType,
  withRange,
  type Copies,
  type DayState,
  type MinuteRange,
  type TimeFormat,
} from "./day-availability";
import "./day-availability.css";

// One day of the employee's week (Mert 2026-10-16, "A · Alt sayfa"; the same
// body on the desktop panel and in the phone's sheet): three cards, a strip of
// hours that always shows the day as it is (or the shift types), From / Until
// and "Copy <day> to".

type Props = {
  week: WeeklyPreference;
  /** 0 = Sunday. */
  weekday: number;
  copies: Copies;
  onChange: (week: WeeklyPreference, copies: Copies) => void;
  shiftTypes: readonly PreferenceShiftType[];
  timeFormat: TimeFormat;
  /** The phone's sheet: shorter names in the time fields, tighter cards. */
  phone?: boolean;
  disabled?: boolean;
};

export function DayEditor({
  week,
  weekday,
  copies,
  onChange,
  shiftTypes,
  timeFormat,
  phone = false,
  disabled = false,
}: Props) {
  const day = week.days.find((item) => item.day === weekday)!;
  const name = WEEKDAY_NAMES[weekday]!;
  const mode = week.input_mode;
  const types = mode === "shift_type";
  const state = dayState(day);
  const put = (rule: WeeklyPreferenceDay) => onChange(applyDay(week, weekday, rule, copies), copies);
  const selectable = shiftTypes.filter((type) => type.selectable);

  const cards: { value: DayState; title: string; detail: string; Icon: typeof Ban }[] = [
    { value: "free", title: "Available", detail: "All day", Icon: CircleCheck },
    { value: "off", title: "Unavailable", detail: "All day", Icon: Ban },
    {
      value: "some",
      title: types ? "Some shifts" : "Some hours",
      detail: types ? "Not certain shifts" : "Not at certain hours",
      Icon: Clock,
    },
  ];
  const cardsRef = useRef<HTMLDivElement>(null);
  const choose = (value: DayState) => put(setDayState(day, value, mode, shiftTypes));
  const cardKey = (event: KeyboardEvent, index: number) => {
    const move = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
    if (!move) return;
    event.preventDefault();
    const next = cards[(index + move + cards.length) % cards.length]!;
    if (next.value === "some" && types && !selectable.length) return;
    choose(next.value);
    cardsRef.current?.querySelector<HTMLElement>(`[data-card="${next.value}"]`)?.focus();
  };

  return (
    <div className={`dav-day${phone ? " is-phone" : ""}`}>
      <div className="dav-cards" role="radiogroup" aria-label={name} ref={cardsRef}>
        {cards.map(({ value, title, detail, Icon }, index) => (
          <button
            key={value}
            type="button"
            role="radio"
            data-card={value}
            className={`dav-card-option is-${value}`}
            aria-checked={state === value}
            tabIndex={state === value ? 0 : -1}
            disabled={disabled || (value === "some" && types && !selectable.length)}
            onClick={() => choose(value)}
            onKeyDown={(event) => cardKey(event, index)}
          >
            <span className="dav-card-icon" aria-hidden>
              <Icon size={phone ? 18 : 20} />
            </span>
            <span className="dav-card-text">
              <b>{title}</b>
              <small>{detail}</small>
            </span>
          </button>
        ))}
      </div>
      <div className="dav-tool">
        {types ? (
          <ShiftTypeCards day={day} shiftTypes={shiftTypes} timeFormat={timeFormat} disabled={disabled} onChange={put} />
        ) : (
          <>
            <TimeStrip
              dayName={name}
              range={rangeOf(day)}
              timeFormat={timeFormat}
              disabled={disabled}
              onCommit={(range) => put(withRange(day, range))}
            />
            <TimeFields
              range={rangeOf(day)}
              timeFormat={timeFormat}
              phone={phone}
              disabled={disabled}
              onCommit={(range) => put(withRange(day, range))}
            />
          </>
        )}
      </div>
      <div className="dav-copy">
        <span className="dav-copy-heading" id={`dav-copy-${weekday}-${phone ? "p" : "d"}`}>
          Copy {name} to
        </span>
        <div className="dav-chips" role="group" aria-label={`Copy ${name} to`}>
          {DISPLAY_DAYS.filter((item) => item !== weekday).map((item) => {
            const pressed = copies.days.includes(item);
            const other = week.days.find((rule) => rule.day === item)!;
            return (
              <button
                key={item}
                type="button"
                className="dav-chip"
                aria-pressed={pressed}
                aria-label={`${WEEKDAY_NAMES[item]}, ${pressed ? `same as ${name}` : `now ${dayStatusText(other, shiftTypes, timeFormat)}`}`}
                disabled={disabled}
                onClick={() => {
                  const next = toggleCopy(week, weekday, item, copies);
                  onChange(next.week, next.copies);
                }}
              >
                <span className="dav-chip-mark" aria-hidden>
                  {pressed ? <Check size={14} /> : <i className={`dav-dot is-${dayState(other)}`} />}
                </span>
                <span>{shortDay(item)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const TICKS = [0, 240, 480, 720, 960, 1200, 1440];
const percent = (minutes: number) => ((minutes - DAY_START) / (DAY_END - DAY_START)) * 100;
const endText = (minutes: number, format: TimeFormat, end: 0 | 1) =>
  end === 0 && minutes <= DAY_START ? "Midnight" : end === 1 && minutes >= DAY_END ? "End of day" : fullClock(minutes, format);

type Drag = { anchor: number | null; end: 0 | 1 | null; range: [number, number]; pointer: number };

/** The day from 12 AM to 12 AM. Drag an end; drag across an empty strip to block hours; a tap beside the band moves its nearest end there. */
function TimeStrip({
  dayName,
  range,
  timeFormat,
  disabled,
  onCommit,
}: {
  dayName: string;
  range: MinuteRange | null;
  timeFormat: TimeFormat;
  disabled: boolean;
  onCommit: (range: MinuteRange) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const band = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  // The band says its hours only where they fit; a narrow band on a phone stays plain, never cut off.
  useLayoutEffect(() => {
    const element = band.current;
    if (!element) return;
    element.classList.remove("is-cramped");
    const label = element.firstElementChild as HTMLElement | null;
    if (label && label.scrollWidth > element.clientWidth) element.classList.add("is-cramped");
  });
  const [live, setLive] = useState<Drag | null>(null);
  const shown = live ? live.range : range;
  const at = (x: number) => {
    const box = track.current!.getBoundingClientRect();
    const share = box.width ? (x - box.left) / box.width : 0;
    return clamp(snap(DAY_START + share * (DAY_END - DAY_START)), DAY_START, DAY_END);
  };
  const follow = (minutes: number, current: Drag): Drag => {
    const [start, end] = current.range;
    if (current.anchor !== null)
      return { ...current, range: [Math.min(current.anchor, minutes), Math.max(current.anchor, minutes)] };
    if (current.end === 0) return { ...current, range: [clamp(minutes, DAY_START, end - STEP), end] };
    return { ...current, range: [start, clamp(minutes, start + STEP, DAY_END)] };
  };

  const down = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    const knob = (event.target as HTMLElement).closest<HTMLElement>("[data-end]");
    const minutes = at(event.clientX);
    let next: Drag;
    if (knob) {
      next = { anchor: null, end: Number(knob.dataset.end) as 0 | 1, range: [...range!], pointer: event.pointerId };
      knob.focus();
    } else if (!range) next = { anchor: minutes, end: null, range: [minutes, minutes], pointer: event.pointerId };
    else {
      const end = Math.abs(minutes - range[0]) <= Math.abs(minutes - range[1]) ? 0 : 1;
      next = follow(minutes, { anchor: null, end, range: [...range], pointer: event.pointerId });
    }
    track.current?.setPointerCapture?.(event.pointerId);
    drag.current = next;
    setLive(next);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    drag.current = follow(at(event.clientX), current);
    setLive(drag.current);
  };
  const up = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    drag.current = null;
    setLive(null);
    let [start, end] = current.range;
    // A tap, or a stroke too short to read, blocks two hours around it.
    if (current.anchor !== null && end - start < 60) {
      start = clamp(snap(current.anchor - 60, 60), DAY_START, DAY_END - 120);
      end = start + 120;
    }
    onCommit([start, end]);
  };
  const cancel = () => {
    drag.current = null;
    setLive(null);
  };

  const key = (event: KeyboardEvent<HTMLElement>, end: 0 | 1) => {
    if (!range || disabled) return;
    const delta = { ArrowLeft: -STEP, ArrowDown: -STEP, ArrowRight: STEP, ArrowUp: STEP }[event.key];
    if (delta === undefined && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    let [start, finish] = range;
    if (end === 0)
      start = event.key === "Home" ? DAY_START : event.key === "End" ? finish - STEP : clamp(start + delta!, DAY_START, finish - STEP);
    else
      finish = event.key === "End" ? DAY_END : event.key === "Home" ? start + STEP : clamp(finish + delta!, start + STEP, DAY_END);
    onCommit([start, finish]);
  };

  return (
    <div className="dav-strip">
      <div
        ref={track}
        className={`dav-track${disabled ? " is-disabled" : ""}`}
        role="group"
        aria-label={`${dayName} hours, 12 AM to 12 AM`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={cancel}
      >
        {!shown || shown[1] <= shown[0] ? (
          !live && <span className="dav-hint">Drag across to block hours</span>
        ) : (
          <div ref={band} className="dav-band" style={{ left: `${percent(shown[0])}%`, width: `${percent(shown[1]) - percent(shown[0])}%` }}>
            <span>{rangeText(shown, timeFormat)}</span>
          </div>
        )}
        {shown && shown[1] > shown[0] &&
          ([0, 1] as const).map((end) => (
            <span
              key={end}
              data-end={end}
              role="slider"
              tabIndex={disabled ? -1 : 0}
              aria-disabled={disabled || undefined}
              aria-label={end ? "End of unavailable hours" : "Start of unavailable hours"}
              aria-valuemin={DAY_START}
              aria-valuemax={DAY_END}
              aria-valuenow={shown[end]}
              aria-valuetext={endText(shown[end], timeFormat, end)}
              className={`dav-knob${live && (live.end === null || live.end === end) ? " is-live" : ""}`}
              style={{ left: `${percent(shown[end])}%` }}
              onKeyDown={(event) => key(event, end)}
            >
              <em>{shortClock(shown[end], timeFormat)}</em>
            </span>
          ))}
      </div>
      <div className="dav-scale" aria-hidden>
        {TICKS.map((tick) => (
          <span key={tick} style={{ left: `${percent(tick)}%` }}>
            {shortClock(tick, timeFormat)}
          </span>
        ))}
      </div>
    </div>
  );
}

const TIMES = Array.from({ length: DAY_END / STEP + 1 }, (_, index) => index * STEP);

function TimeFields({
  range,
  timeFormat,
  phone,
  disabled,
  onCommit,
}: {
  range: MinuteRange | null;
  timeFormat: TimeFormat;
  phone: boolean;
  disabled: boolean;
  onCommit: (range: MinuteRange) => void;
}) {
  // The two ends of the day by name, never "12:00 AM" twice: short on the phone, where the field is half as wide.
  const label = (minutes: number) => {
    const clock = timeFormat === "24h" ? fullClock(minutes, timeFormat) : "12 AM";
    if (minutes === DAY_START) return phone ? (timeFormat === "24h" ? clock : "Midnight") : `Midnight (${clock})`;
    if (minutes === DAY_END) return phone ? (timeFormat === "24h" ? clock : "End of day") : `End of day (${clock})`;
    return fullClock(minutes, timeFormat);
  };
  const change = (end: 0 | 1, value: string) => {
    if (value === "") return;
    const minutes = Number(value);
    const next: [number, number] = range ? [range[0], range[1]] : end === 0 ? [minutes, DAY_END] : [DAY_START, minutes];
    next[end] = minutes;
    if (next[0] >= next[1]) {
      if (end === 0) next[1] = Math.min(DAY_END, next[0] + 60);
      else next[0] = Math.max(DAY_START, next[1] - 60);
    }
    onCommit(next);
  };
  const field = (end: 0 | 1, title: string, from: number, to: number) => (
    <label className={`dav-field${range ? "" : " is-empty"}`}>
      <span>{title}</span>
      <select
        aria-label={title}
        value={range ? String(range[end]) : ""}
        disabled={disabled}
        onChange={(event) => change(end, event.target.value)}
      >
        {!range && <option value="">—</option>}
        {TIMES.filter((minutes) => minutes >= from && minutes <= to).map((minutes) => (
          <option key={minutes} value={minutes}>
            {label(minutes)}
          </option>
        ))}
      </select>
      <ChevronDown size={14} aria-hidden />
    </label>
  );
  return (
    <div className="dav-fields">
      {field(0, "From", DAY_START, DAY_END - STEP)}
      {field(1, "Until", DAY_START + STEP, DAY_END)}
    </div>
  );
}

const typeIcon = (type: PreferenceShiftType) => {
  const start = type.start_time ? toMinutes(type.start_time) : 720;
  return start < 11 * 60 ? Sunrise : start < 16 * 60 ? Sun : start < 20 * 60 ? Sunset : Moon;
};

function ShiftTypeCards({
  day,
  shiftTypes,
  timeFormat,
  disabled,
  onChange,
}: {
  day: WeeklyPreferenceDay;
  shiftTypes: readonly PreferenceShiftType[];
  timeFormat: TimeFormat;
  disabled: boolean;
  onChange: (day: WeeklyPreferenceDay) => void;
}) {
  // A type no longer offered still shows while the day holds it, so it can be taken off.
  const shown = shiftTypes.filter((type) => type.selectable || day.shift_type_ids.includes(type.id));
  if (!shown.length) return <p className="dav-empty">No shift types available</p>;
  return (
    <div className="dav-types">
      {shown.map((type) => {
        const pressed = (day.all_day && type.selectable) || day.shift_type_ids.includes(type.id);
        const Icon = typeIcon(type);
        return (
          <button
            key={type.id}
            type="button"
            className="dav-type"
            aria-pressed={pressed}
            disabled={disabled || (!type.selectable && !pressed)}
            onClick={() => onChange(toggleShiftType(day, type.id, shiftTypes))}
          >
            <Icon size={18} aria-hidden className="dav-type-icon" />
            <b>{type.name}</b>
            <small>
              {type.start_time && type.end_time
                ? `${compactClock(toMinutes(type.start_time), timeFormat)} – ${compactClock(toMinutes(type.end_time), timeFormat)}`
                : "Default hours need updating"}
              {type.selectable ? "" : " · Previous"}
            </small>
            <span className="dav-type-mark" aria-hidden>
              {pressed ? <Ban size={14} /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
