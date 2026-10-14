// The time part of every window, in the style the "Typing times" menu picks:
// - main: main's own two segment boxes (TimeInput), unchanged;
// - range: one box, "9-5" / "930-1430" / "9:30a-2p", arrows nudge by 15 min;
// - smart: two boxes with a list under each; type "9", Enter, "5", Enter.
// The window opens with the cursor already in the time, so a manager can
// type, press Enter and save without touching the mouse.
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { getLastSegment, TimeInput } from "../../../src/schedule/components/TimeInput";
import type { ShiftEditorBrain } from "./brain";
import { durationText } from "./parts";
import { useChoices, type ClockFormat } from "./store";
import {
  formatClock,
  formatRange,
  formatSpan,
  readRange,
  readToken,
  resolveEnd,
  resolveStart,
  spanMinutes,
  suggestTimes,
  toCanonical,
  toMinutes,
} from "./time";

export interface TimeFieldsProps {
  readonly brain: ShiftEditorBrain;
  readonly format: ClockFormat;
  readonly size?: "normal" | "big";
  readonly autoFocus?: boolean;
  /** Shift types' default start, used to pick AM or PM for a bare hour. */
  readonly hint?: number | null;
  readonly showDuration?: boolean;
}

export function TimeFields(props: TimeFieldsProps) {
  const { timeEntry } = useChoices();
  if (timeEntry === "range") return <RangeBox {...props} />;
  if (timeEntry === "smart") return <SmartPair {...props} />;
  return <MainPair {...props} />;
}

function startHint(brain: ShiftEditorBrain, hint: number | null | undefined): number | null {
  return toMinutes(brain.value.start_time) ?? hint ?? 9 * 60;
}

/** main's two boxes, exactly as ShiftQuickEditor wires them. */
function MainPair({ brain, format, showDuration = true }: TimeFieldsProps) {
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);
  const duration = durationText(brain);
  return (
    <div className="stx-time" data-entry="main">
      <div className="stx-time-pair">
        <label>
          <span>Start</span>
          <TimeInput
            ref={startRef}
            value={brain.value.start_time}
            ariaLabel="Start time"
            timeFormat={format}
            density="compact"
            onAutoAdvance={() => {
              if (endRef.current) {
                endRef.current.dataset.autoSelectSegment = "hour";
                endRef.current.focus();
              }
            }}
            onChange={(start) => brain.setTimes(start, brain.value.end_time)}
          />
        </label>
        <label>
          <span>End</span>
          <TimeInput
            ref={endRef}
            value={brain.value.end_time}
            ariaLabel="End time"
            timeFormat={format}
            density="compact"
            onAutoRetreat={() => {
              if (startRef.current) {
                startRef.current.dataset.autoSelectSegment = getLastSegment(format);
                startRef.current.focus();
              }
            }}
            onBoundaryEnter={!brain.value.hide_time_on_badge ? () => void brain.attemptSubmit() : undefined}
            onChange={(end) => brain.setTimes(brain.value.start_time, end)}
          />
        </label>
      </div>
      {showDuration ? <small className="stx-time-help">{brain.timeValidationMessage ?? duration}</small> : null}
    </div>
  );
}

/** One box for the whole range. */
function RangeBox({ brain, format, size = "normal", autoFocus = true, hint, showDuration = true }: TimeFieldsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const helpId = useId();
  const start = toMinutes(brain.value.start_time);
  const end = toMinutes(brain.value.end_time);
  const formatted = formatRange(start, end, format);
  const [text, setText] = useState(formatted);
  const [focused, setFocused] = useState(false);
  const [touched, setTouched] = useState(false);
  const hintRef = useRef<number | null>(startHint(brain, hint));
  const caretRef = useRef<number | null>(null);
  useEffect(() => {
    if (!focused) setText(formatted);
  }, [formatted, focused]);
  useLayoutEffect(() => {
    if (caretRef.current === null || !inputRef.current) return;
    inputRef.current.setSelectionRange(caretRef.current, caretRef.current);
    caretRef.current = null;
  });
  useEffect(() => {
    if (!autoFocus) return;
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [autoFocus]);
  const read = readRange(text, format, hintRef.current);
  const commit = (next: string) => {
    const result = readRange(next, format, hintRef.current);
    if (result.ok) brain.setTimes(toCanonical(result.start), toCanonical(result.end));
  };
  const nudge = (event: ReactKeyboardEvent<HTMLInputElement>, delta: number) => {
    if (start === null || end === null) return;
    const caret = event.currentTarget.selectionStart ?? 0;
    const dash = text.search(/\s*(?:-|–|—|\bto\b)/i);
    const onEnd = dash >= 0 && caret > dash;
    const nextStart = onEnd ? start : (start + delta + 1440) % 1440;
    const nextEnd = onEnd ? (end + delta + 1440) % 1440 : end;
    if (nextStart === nextEnd) return;
    const nextText = formatRange(nextStart, nextEnd, format);
    const nextDash = nextText.indexOf("–");
    caretRef.current = onEnd ? nextText.length : Math.max(0, nextDash - 1);
    setText(nextText);
    brain.setTimes(toCanonical(nextStart), toCanonical(nextEnd));
  };
  const message = touched && !read.ok ? read.message : null;
  return (
    <div className="stx-time" data-entry="range" data-size={size}>
      <label className="stx-range">
        <span>Time</span>
        <input
          ref={inputRef}
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          aria-label="Shift time"
          aria-describedby={helpId}
          aria-invalid={message ? true : undefined}
          placeholder={format === "12h" ? "9-5" : "9-17"}
          value={text}
          onFocus={(event) => {
            setFocused(true);
            hintRef.current = startHint(brain, hint);
            event.currentTarget.select();
          }}
          onBlur={() => {
            setFocused(false);
            if (read.ok) setText(formatRange(read.start, read.end, format));
          }}
          onChange={(event) => {
            setTouched(true);
            setText(event.target.value);
            commit(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              const step = event.shiftKey ? 60 : 15;
              nudge(event, event.key === "ArrowUp" ? step : -step);
            } else if (event.key === "Enter") {
              event.preventDefault();
              if (read.ok) {
                commit(text);
                // Saves after the new times land.
                brain.requestSubmit();
              } else setTouched(true);
            }
          }}
        />
      </label>
      {showDuration ? (
        <small id={helpId} className="stx-time-help" data-error={message ? true : undefined}>
          {message ?? durationText(brain)}
          {focused && !message ? <em> · ↑↓ moves 15 min · Enter saves</em> : null}
        </small>
      ) : (
        <small id={helpId} className="sr-only">{message ?? ""}</small>
      )}
    </div>
  );
}

/** Two boxes, each with a short list of times under it. */
function SmartPair({ brain, format, size = "normal", autoFocus = true, hint, showDuration = true }: TimeFieldsProps) {
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);
  const start = toMinutes(brain.value.start_time);
  const end = toMinutes(brain.value.end_time);
  useEffect(() => {
    if (!autoFocus) return;
    const frame = window.requestAnimationFrame(() => {
      startRef.current?.focus({ preventScroll: true });
      startRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [autoFocus]);
  return (
    <div className="stx-time" data-entry="smart" data-size={size}>
      <div className="stx-time-pair">
        <SmartBox
          label="Start"
          inputRef={startRef}
          value={start}
          format={format}
          around={startHint(brain, hint)}
          after={null}
          onPick={(minutes, how) => {
            // Keep the length when only the start moves (9-5 → 10-6).
            const length = start !== null && end !== null ? spanMinutes(start, end) : 8 * 60;
            const keepEnd = end !== null && end !== minutes && how === "list-keep";
            brain.setTimes(toCanonical(minutes), toCanonical(keepEnd ? end! : minutes + length));
          }}
          onDone={() => {
            endRef.current?.focus();
            endRef.current?.select();
          }}
        />
        <span className="stx-time-dash" aria-hidden>–</span>
        <SmartBox
          label="End"
          inputRef={endRef}
          value={end}
          format={format}
          around={end}
          after={start}
          onPick={(minutes) => brain.setTimes(brain.value.start_time || toCanonical(9 * 60), toCanonical(minutes))}
          onDone={() => brain.requestSubmit()}
          onBack={() => {
            startRef.current?.focus();
            startRef.current?.select();
          }}
        />
      </div>
      {showDuration ? <small className="stx-time-help">{brain.timeValidationMessage ?? durationText(brain)}<em> · type 9, Enter, 5, Enter</em></small> : null}
    </div>
  );
}

function SmartBox({
  label,
  inputRef,
  value,
  format,
  around,
  after,
  onPick,
  onDone,
  onBack,
}: {
  readonly label: string;
  readonly inputRef: React.RefObject<HTMLInputElement | null>;
  readonly value: number | null;
  readonly format: ClockFormat;
  readonly around: number | null;
  readonly after: number | null;
  readonly onPick: (minutes: number, how: "typed" | "list" | "list-keep") => void;
  readonly onDone: () => void;
  readonly onBack?: () => void;
}) {
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const formatted = formatClock(value, format);
  const [text, setText] = useState(formatted);
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (!typing) setText(formatted);
  }, [formatted, typing]);
  const items = typing ? suggestTimes(text, format, around, after) : suggestTimes("", format, value ?? around, after).slice(0, 48);
  const startIndex = !typing && value !== null ? Math.max(0, items.indexOf(value)) : 0;
  useLayoutEffect(() => {
    if (!open) return;
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, active]);
  const resolveTyped = (): number | null => {
    const token = readToken(text);
    if (!token) return null;
    return after !== null ? resolveEnd(token, format, after) : resolveStart(token, format, around);
  };
  const choose = (how: "enter" | "tab" | "blur") => {
    const fromList = open && items[active] !== undefined ? items[active]! : null;
    const picked = how === "blur" ? resolveTyped() ?? (typing ? null : value) : fromList ?? resolveTyped();
    setTyping(false);
    setOpen(false);
    if (picked === null) {
      setText(formatted);
      return false;
    }
    onPick(picked, fromList !== null && how !== "blur" ? "list" : "typed");
    setText(formatClock(picked, format));
    return true;
  };
  return (
    <div className="stx-smart" data-st-own-escape={open ? "true" : undefined}>
      <label>
        <span>{label}</span>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label={`${label} time`}
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          value={text}
          onFocus={(event) => {
            event.currentTarget.select();
            setActive(startIndex);
            setOpen(true);
          }}
          onBlur={() => {
            if (typing) choose("blur");
            setOpen(false);
          }}
          onChange={(event) => {
            // The first key after focus replaces the time shown, even if the
            // selection was lost when the other box moved this one.
            const inserted = (event.nativeEvent as InputEvent).data;
            const next = !typing && inserted ? inserted : event.target.value;
            if (label === "Start" && /[-–]$/.test(next)) {
              setText(next.replace(/[-–]$/, ""));
              choose("enter");
              onDone();
              return;
            }
            setText(next);
            setTyping(true);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (!open) {
                setOpen(true);
                setActive(startIndex);
                return;
              }
              setActive((current) => Math.max(0, Math.min(items.length - 1, current + (event.key === "ArrowDown" ? 1 : -1))));
            } else if (event.key === "Enter") {
              event.preventDefault();
              if (choose("enter")) onDone();
            } else if (event.key === "Tab") {
              if (typing || open) choose("tab");
            } else if (event.key === "Escape" && open) {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              setTyping(false);
              setText(formatted);
            } else if (event.key === "Backspace" && onBack && event.currentTarget.value === "") {
              event.preventDefault();
              onBack();
            }
          }}
        />
      </label>
      {open && items.length ? (
        <div ref={listRef} id={listId} role="listbox" aria-label={`${label} times`} className="stx-list stx-time-list">
          {items.map((minutes, index) => (
            <div
              key={minutes}
              role="option"
              data-index={index}
              aria-selected={minutes === value}
              data-active={index === active || undefined}
              onPointerEnter={() => setActive(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setTyping(false);
                setOpen(false);
                onPick(minutes, "list");
                setText(formatClock(minutes, format));
                onDone();
              }}
            >
              <span>{formatClock(minutes, format)}</span>
              {after !== null ? <small>{formatSpan(spanMinutes(after, minutes))}</small> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
