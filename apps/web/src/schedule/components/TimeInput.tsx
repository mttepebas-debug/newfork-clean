import type { TimeFormat } from "../timeInput";
import {
  forwardRef,
  type CSSProperties,
  type MouseEvent,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import {
  formatCanonicalTime,
  getPeriodFromCanonical,
  isTimeDraftTextAllowed,
  parseTimeInputValue,
  type TimePeriod,
} from "../timeInput";

function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

type TimeSegment = "hour" | "minute" | "period";
type SegmentBuffers = { readonly hour: string; readonly minute: string };
type SegmentDisplayOverrides = Partial<Record<"hour" | "minute", string>>;
export type TimeInputAutoAdvanceReason = "typing" | "enter" | "tab";

export interface TimeInputProps {
  readonly value: string | null | undefined;
  readonly onChange: (value: string) => void;
  readonly timeFormat: TimeFormat;
  readonly ariaLabel: string;
  /** The note that speaks for this box (a row's help or error), by id. */
  readonly ariaDescribedBy?: string;
  readonly id?: string;
  readonly name?: string;
  readonly placeholder?: string;
  readonly density?: "default" | "compact";
  readonly disabled?: boolean;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly inputClassName?: string;
  readonly inputStyle?: CSSProperties;
  readonly onCommit?: (value: string) => void;
  readonly onAutoAdvance?: (reason: TimeInputAutoAdvanceReason) => void;
  readonly onAutoRetreat?: () => void;
  readonly onBoundaryEnter?: () => void;
}

export const TimeInput = forwardRef<HTMLInputElement, TimeInputProps>(function TimeInput(
  {
    value,
    onChange,
    timeFormat,
    ariaLabel,
    ariaDescribedBy,
    id,
    name,
    placeholder,
    density = "default",
    disabled = false,
    className,
    style,
    inputClassName,
    inputStyle,
    onCommit,
    onAutoAdvance,
    onAutoRetreat,
    onBoundaryEnter,
  },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const inputRef = useRef<HTMLInputElement>(null);
  const normalizedValue = value ?? "";
  const [draft, setDraft] = useState(() => formatCanonicalTime(normalizedValue, timeFormat));
  const [period, setPeriod] = useState<TimePeriod>(() => getPeriodFromCanonical(normalizedValue));
  const draftRef = useRef(draft);
  const periodRef = useRef(period);
  const [isInvalid, setIsInvalid] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [showSegmentHighlight, setShowSegmentHighlight] = useState(false);
  const [activeSegment, setActiveSegment] = useState<TimeSegment>("hour");
  const [segmentBuffers, setSegmentBuffers] = useState<SegmentBuffers>(() =>
    getSegmentBuffersFromDraft(
      formatCanonicalTime(normalizedValue, timeFormat),
      timeFormat,
      getPeriodFromCanonical(normalizedValue),
    ),
  );
  const [segmentDisplayOverrides, setSegmentDisplayOverrides] = useState<SegmentDisplayOverrides>(
    {},
  );
  const previousFormatRef = useRef(timeFormat);
  const lastTypingInteractionRef = useRef(false);
  const segmentBuffersRef = useRef<SegmentBuffers>(segmentBuffers);
  const replaceActiveSegmentRef = useRef(true);
  const hourSegmentRef = useRef<HTMLSpanElement>(null);
  const minuteSegmentRef = useRef<HTMLSpanElement>(null);
  const periodSegmentRef = useRef<HTMLSpanElement>(null);

  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    periodRef.current = period;
  }, [period]);

  useEffect(() => {
    const formatChanged = previousFormatRef.current !== timeFormat;
    previousFormatRef.current = timeFormat;
    if (document.activeElement === inputRef.current && !formatChanged) return;
    const formattedDraft = formatCanonicalTime(normalizedValue, timeFormat);
    setDraft(formattedDraft);
    draftRef.current = formattedDraft;
    const nextPeriod = getPeriodFromCanonical(normalizedValue);
    const nextDraft = formatCanonicalTime(normalizedValue, timeFormat);
    setPeriod(nextPeriod);
    periodRef.current = nextPeriod;
    setSegmentBuffers(getSegmentBuffersFromDraft(nextDraft, timeFormat, nextPeriod));
    segmentBuffersRef.current = getSegmentBuffersFromDraft(nextDraft, timeFormat, nextPeriod);
    setSegmentDisplayOverrides({});
    setIsInvalid(false);
    setActiveSegment("hour");
  }, [normalizedValue, timeFormat]);

  const displaySegments = isFocused
    ? getDisplaySegmentsFromBuffers(segmentBuffers, segmentDisplayOverrides)
    : getDisplaySegments(draft, timeFormat, period);

  function resetSegmentBuffers(nextDraft = draft): void {
    const nextBuffers = getSegmentBuffersFromDraft(nextDraft, timeFormat, period);
    segmentBuffersRef.current = nextBuffers;
    setSegmentBuffers(nextBuffers);
    setSegmentDisplayOverrides({});
    replaceActiveSegmentRef.current = true;
  }

  function activateSegmentSelection(segment: TimeSegment): void {
    setShowSegmentHighlight(true);
    setActiveSegment(segment);
    lastTypingInteractionRef.current = false;
    resetSegmentBuffers();
    const selectionRange = getSelectionRangeForSegment(segment, timeFormat);
    inputRef.current?.setSelectionRange(selectionRange.start, selectionRange.end);
  }

  function handleInputClick(event: MouseEvent<HTMLInputElement>): void {
    const clickedSegment = getSegmentFromClickPosition(
      event.clientX,
      timeFormat,
      hourSegmentRef.current,
      minuteSegmentRef.current,
      periodSegmentRef.current,
    );
    if (clickedSegment) {
      activateSegmentSelection(clickedSegment);
      return;
    }
    const caretIndex = event.currentTarget.selectionStart ?? 0;
    activateSegmentSelection(getSegmentFromCaretIndex(caretIndex, timeFormat));
  }

  const commitDraft = useCallback(
    (
      options: {
        readonly advance?: boolean;
        readonly advanceReason?: TimeInputAutoAdvanceReason;
      } = {},
    ) => {
      const currentDraft = draftRef.current;
      const currentPeriod = periodRef.current;
      if (!currentDraft.trim()) {
        setIsInvalid(false);
        onChange("");
        onCommit?.("");
        setActiveSegment("hour");
        setSegmentBuffers({ hour: "", minute: "" });
        segmentBuffersRef.current = { hour: "", minute: "" };
        setSegmentDisplayOverrides({});
        return "";
      }
      const parsed = parseTimeInputValue(currentDraft, { timeFormat, activePeriod: currentPeriod });
      if (!parsed) {
        setIsInvalid(true);
        return null;
      }
      setIsInvalid(false);
      setPeriod(parsed.period);
      periodRef.current = parsed.period;
      const nextDraft = formatCanonicalTime(parsed.canonical, timeFormat);
      setDraft(nextDraft);
      draftRef.current = nextDraft;
      const nextBuffers = getSegmentBuffersFromDraft(nextDraft, timeFormat, parsed.period);
      setSegmentBuffers(nextBuffers);
      segmentBuffersRef.current = nextBuffers;
      setSegmentDisplayOverrides({});
      setActiveSegment(timeFormat === "12h" ? "period" : "minute");
      onChange(parsed.canonical);
      onCommit?.(parsed.canonical);
      if (options.advance) onAutoAdvance?.(options.advanceReason ?? "typing");
      return parsed.canonical;
    },
    [onAutoAdvance, onChange, onCommit, timeFormat],
  );

  const applyPeriod = useCallback(
    (
      nextPeriod: TimePeriod,
      options: {
        readonly advance?: boolean;
        readonly advanceReason?: TimeInputAutoAdvanceReason;
      } = {},
    ): void => {
      setPeriod(nextPeriod);
      const periodDraft = `${draft.replace(/\s*(?:AM|PM)\s*$/i, "").trim()} ${
        nextPeriod === "AM" ? "a" : "p"
      }`;
      const parsed = parseTimeInputValue(periodDraft, { timeFormat, activePeriod: nextPeriod });
      if (!parsed) return;
      setIsInvalid(false);
      const nextDisplay = formatCanonicalTime(parsed.canonical, timeFormat);
      setDraft(nextDisplay);
      draftRef.current = nextDisplay;
      const nextBuffers = getSegmentBuffersFromDraft(nextDisplay, timeFormat, parsed.period);
      setSegmentBuffers(nextBuffers);
      segmentBuffersRef.current = nextBuffers;
      setSegmentDisplayOverrides({});
      setPeriod(parsed.period);
      periodRef.current = parsed.period;
      setActiveSegment("period");
      onChange(parsed.canonical);
      onCommit?.(parsed.canonical);
      const shouldAdvance =
        options.advance !== false &&
        parsed.shouldAutoAdvance &&
        (lastTypingInteractionRef.current || activeSegment === "period");
      lastTypingInteractionRef.current = false;
      if (shouldAdvance) {
        onAutoAdvance?.(options.advanceReason ?? "typing");
        return;
      }
      inputRef.current?.focus();
    },
    [activeSegment, draft, onAutoAdvance, onChange, onCommit, timeFormat],
  );

  function moveSegment(direction: 1 | -1): boolean {
    const order: readonly TimeSegment[] =
      timeFormat === "12h" ? ["hour", "minute", "period"] : ["hour", "minute"];
    const currentIndex = order.indexOf(activeSegment);
    const next = order[currentIndex + direction];
    if (!next) return false;
    setActiveSegment(next);
    replaceActiveSegmentRef.current = true;
    return true;
  }

  function applySegmentBuffers(
    buffers: SegmentBuffers,
    nextPeriod: TimePeriod,
    nextActiveSegment: TimeSegment,
    options: {
      readonly advance?: boolean;
      readonly advanceReason?: TimeInputAutoAdvanceReason;
    } = {},
  ): void {
    segmentBuffersRef.current = { hour: buffers.hour, minute: buffers.minute };
    setSegmentBuffers({ hour: buffers.hour, minute: buffers.minute });
    setSegmentDisplayOverrides({});
    setActiveSegment(nextActiveSegment);
    setPeriod(nextPeriod);

    if (!buffers.hour) {
      setDraft("");
      draftRef.current = "";
      setIsInvalid(false);
      onChange("");
      return;
    }

    const nextDraft = formatSegmentDraft(buffers, timeFormat, nextPeriod);
    setDraft(nextDraft);
    draftRef.current = nextDraft;
    const parsed = parseTimeInputValue(nextDraft, { timeFormat, activePeriod: nextPeriod });
    if (!parsed) {
      setIsInvalid(false);
      return;
    }

    setIsInvalid(false);
    setPeriod(parsed.period);
    periodRef.current = parsed.period;
    onChange(parsed.canonical);
    if (options.advance) {
      lastTypingInteractionRef.current = false;
      onAutoAdvance?.(options.advanceReason ?? "typing");
    }
  }

  function handleDigitKey(digit: string): void {
    const current = { ...segmentBuffersRef.current };
    const nextPeriod = period;
    let nextActiveSegment: TimeSegment = activeSegment;
    let minuteCompleted = false;

    if (activeSegment === "period") {
      current.hour = "";
      current.minute = "";
      nextActiveSegment = "hour";
      replaceActiveSegmentRef.current = true;
    }

    if (nextActiveSegment === "hour") {
      const shouldReplace = replaceActiveSegmentRef.current;
      const currentHour = shouldReplace ? "" : current.hour;
      const nextHourResult = applyHourDigit(currentHour, digit, timeFormat);
      current.hour = nextHourResult.hour;
      if (nextHourResult.minuteDigit !== null) {
        current.minute = nextHourResult.minuteDigit;
        nextActiveSegment = "minute";
        replaceActiveSegmentRef.current = false;
      } else {
        nextActiveSegment = nextHourResult.complete ? "minute" : "hour";
        replaceActiveSegmentRef.current = nextHourResult.complete;
      }
    } else {
      if (!current.hour) current.hour = timeFormat === "12h" ? "12" : "00";
      const shouldReplace = replaceActiveSegmentRef.current;
      const currentMinute = shouldReplace ? "" : current.minute;
      const nextMinute = applyMinuteDigit(currentMinute, digit);
      if (nextMinute === null) return;
      current.minute = nextMinute.minute;
      nextActiveSegment = nextMinute.complete ? getLastSegment(timeFormat) : "minute";
      replaceActiveSegmentRef.current = nextMinute.complete;
      minuteCompleted = nextMinute.complete;
    }

    lastTypingInteractionRef.current = true;
    // 24h has no AM/PM to wait for: the field moves on once both minute
    // digits are in, never after the hour alone (BL-613).
    const shouldAdvance = timeFormat === "24h" && minuteCompleted;
    applySegmentBuffers(current, nextPeriod, nextActiveSegment, { advance: shouldAdvance });
  }

  function handleBackspaceKey(): void {
    const current = { ...segmentBuffersRef.current };
    let nextActiveSegment = activeSegment;

    if (activeSegment === "period") {
      nextActiveSegment = "minute";
      current.minute = "";
    } else if (activeSegment === "minute") {
      if (current.minute) {
        current.minute = "";
        nextActiveSegment = "hour";
      } else {
        nextActiveSegment = "hour";
        current.hour = current.hour.slice(0, -1);
      }
    } else {
      current.hour = current.hour.slice(0, -1);
      if (!current.hour) current.minute = "";
    }

    replaceActiveSegmentRef.current = false;
    lastTypingInteractionRef.current = true;
    applySegmentBuffers(current, period, nextActiveSegment);
  }

  function handleDeleteKey(): void {
    const current = { ...segmentBuffersRef.current };

    if (activeSegment === "hour") {
      const emptyBuffers = { hour: "", minute: "" };
      segmentBuffersRef.current = emptyBuffers;
      setSegmentBuffers(emptyBuffers);
      setSegmentDisplayOverrides({});
      setPeriod("AM");
      periodRef.current = "AM";
      setActiveSegment("hour");
      setDraft("");
      draftRef.current = "";
      setIsInvalid(false);
      onChange("");
      return;
    }

    if (activeSegment === "period") {
      if (!current.hour) {
        setPeriod("AM");
        setActiveSegment("period");
        setDraft("");
        setIsInvalid(false);
        onChange("");
        return;
      }
      applyPeriod("AM", { advance: false });
      return;
    }

    if (activeSegment === "minute") {
      current.minute = "";
      segmentBuffersRef.current = { hour: current.hour, minute: "" };
      setSegmentBuffers({ hour: current.hour, minute: "" });
      setSegmentDisplayOverrides({});
      setActiveSegment("minute");
      const nextDraft = current.hour
        ? timeFormat === "12h"
          ? `${current.hour.padStart(2, "0").slice(-2)}: ${period}`
          : `${current.hour.padStart(2, "0").slice(-2)}:`
        : "";
      setDraft(nextDraft);
      draftRef.current = nextDraft;
      setIsInvalid(false);
      return;
    }

    replaceActiveSegmentRef.current = true;
    lastTypingInteractionRef.current = false;
    applySegmentBuffers(current, period, activeSegment);
  }

  function adjustActiveSegment(delta: 1 | -1): void {
    if (activeSegment === "period" && timeFormat === "12h") {
      applyPeriod(period === "AM" ? "PM" : "AM", { advance: false });
      return;
    }

    const current = { ...segmentBuffersRef.current };
    if (activeSegment === "hour") {
      current.hour = adjustHourBuffer(current.hour, delta, timeFormat);
      if (!current.minute) current.minute = "00";
    } else {
      if (!current.hour) current.hour = timeFormat === "12h" ? "12" : "00";
      current.minute = adjustMinuteBuffer(current.minute, delta);
    }

    replaceActiveSegmentRef.current = true;
    lastTypingInteractionRef.current = true;
    applySegmentBuffers(current, period, activeSegment);
  }

  const adjustActiveSegmentFromWheel = useCallback(
    (delta: 1 | -1): void => {
      if (!isFocused || !showSegmentHighlight) return;
      setShowSegmentHighlight(true);

      if (activeSegment === "period" && timeFormat === "12h") {
        if (!segmentBuffersRef.current.hour) {
          const basePeriod = period === "AM" ? "PM" : "AM";
          const baseHour = "12";
          const baseMinute = "00";
          const nextDraft = formatSegmentDraft(
            { hour: baseHour, minute: baseMinute },
            timeFormat,
            basePeriod,
          );
          const parsed = parseTimeInputValue(nextDraft, { timeFormat, activePeriod: basePeriod });
          if (!parsed) return;
          const nextBuffers = getSegmentBuffersFromDraft(nextDraft, timeFormat, parsed.period);
          segmentBuffersRef.current = nextBuffers;
          setSegmentBuffers(nextBuffers);
          setSegmentDisplayOverrides({});
          setDraft(nextDraft);
          setPeriod(parsed.period);
          setActiveSegment("period");
          setIsInvalid(false);
          onChange(parsed.canonical);
          return;
        }
        applyPeriod(period === "AM" ? "PM" : "AM", { advance: false });
        return;
      }

      const current = { ...segmentBuffersRef.current };
      const nextPeriod = period;
      let overrides: SegmentDisplayOverrides = {};

      if (activeSegment === "hour") {
        const nextHour = current.hour
          ? getWrappedWheelValue(
              getVisibleSegmentNumber(
                "hour",
                current.hour,
                segmentDisplayOverrides.hour,
                timeFormat,
              ),
              1,
              timeFormat === "12h" ? 12 : 24,
              delta,
            )
          : delta > 0
            ? 1
            : timeFormat === "12h"
              ? 12
              : 24;
        current.hour = mapWheelHourToCanonical(nextHour, timeFormat);
        overrides = getWheelDisplayOverrides("hour", nextHour, timeFormat);
        if (!current.minute) current.minute = "00";
      } else {
        if (!current.hour) current.hour = timeFormat === "12h" ? "12" : "00";
        const nextMinute = current.minute
          ? getWrappedWheelValue(
              getVisibleSegmentNumber(
                "minute",
                current.minute,
                segmentDisplayOverrides.minute,
                timeFormat,
              ),
              1,
              60,
              delta,
            )
          : delta > 0
            ? 1
            : 60;
        current.minute = mapWheelMinuteToCanonical(nextMinute);
        overrides = getWheelDisplayOverrides("minute", nextMinute, timeFormat);
      }

      segmentBuffersRef.current = { hour: current.hour, minute: current.minute };
      setSegmentBuffers({ hour: current.hour, minute: current.minute });
      setSegmentDisplayOverrides(overrides);
      setActiveSegment(activeSegment);
      setPeriod(nextPeriod);

      const nextDraft = formatSegmentDraft(current, timeFormat, nextPeriod);
      setDraft(nextDraft);
      const parsed = parseTimeInputValue(nextDraft, { timeFormat, activePeriod: nextPeriod });
      if (!parsed) {
        setIsInvalid(false);
        return;
      }
      setIsInvalid(false);
      setPeriod(parsed.period);
      onChange(parsed.canonical);
    },
    [
      activeSegment,
      applyPeriod,
      isFocused,
      onChange,
      period,
      segmentDisplayOverrides.hour,
      segmentDisplayOverrides.minute,
      showSegmentHighlight,
      timeFormat,
    ],
  );

  useEffect(() => {
    if (!isFocused || !showSegmentHighlight) return;

    function captureWheel(event: globalThis.WheelEvent): void {
      // Only a wheel over the field's own window turns the time; anywhere else the page scrolls as usual.
      const input = inputRef.current;
      const scope = input?.closest('[role="dialog"]') ?? input?.parentElement;
      if (scope && !(event.target instanceof Node && scope.contains(event.target))) return;
      event.preventDefault();
      adjustActiveSegmentFromWheel(event.deltaY < 0 ? 1 : -1);
    }

    document.addEventListener("wheel", captureWheel, { passive: false, capture: true });
    return () => {
      document.removeEventListener("wheel", captureWheel, { capture: true });
    };
  }, [adjustActiveSegmentFromWheel, isFocused, showSegmentHighlight]);

  return (
    <div
      className={cn("schedule-time-input schedule-time-input--segmented", className)}
      data-time-input
      data-segmented-time-input
      style={style}
    >
      <input
        ref={inputRef}
        id={inputId}
        name={name}
        type="text"
        inputMode="text"
        autoComplete="off"
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={isInvalid || undefined}
        value={draft}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={() => {
          setIsFocused(true);
          resetSegmentBuffers();
          const inputElement = inputRef.current;
          const autoSelectSegment = inputElement?.dataset.autoSelectSegment as
            | TimeSegment
            | undefined;
          if (
            inputElement &&
            (autoSelectSegment === "hour" ||
              autoSelectSegment === "minute" ||
              autoSelectSegment === "period")
          ) {
            delete inputElement.dataset.autoSelectSegment;
            activateSegmentSelection(autoSelectSegment);
          }
        }}
        onClick={handleInputClick}
        onBlur={() => {
          setIsFocused(false);
          setShowSegmentHighlight(false);
          commitDraft();
        }}
        onChange={(event) => {
          const nextDraft = event.target.value;
          if (!isTimeDraftTextAllowed(nextDraft, timeFormat)) return;
          lastTypingInteractionRef.current = true;
          setSegmentDisplayOverrides({});
          setDraft(nextDraft);
          // Now, not after the render: auto-advance below blurs this field
          // in the same handler, and that blur commits what the refs hold.
          draftRef.current = nextDraft;
          if (!nextDraft.trim()) {
            setIsInvalid(false);
            setActiveSegment("hour");
            setSegmentBuffers({ hour: "", minute: "" });
            segmentBuffersRef.current = { hour: "", minute: "" };
            setSegmentDisplayOverrides({});
            onChange("");
            return;
          }
          const parsed = parseTimeInputValue(nextDraft, { timeFormat, activePeriod: period });
          if (!parsed) {
            setIsInvalid(false);
            setActiveSegment(getActiveSegmentFromDraft(nextDraft, timeFormat));
            return;
          }
          setIsInvalid(false);
          setPeriod(parsed.period);
          periodRef.current = parsed.period;
          const nextBuffers = getSegmentBuffersFromDraft(nextDraft, timeFormat, parsed.period);
          setSegmentBuffers(nextBuffers);
          segmentBuffersRef.current = nextBuffers;
          onChange(parsed.canonical);
          const shouldAdvance = shouldAutoAdvanceFromDraft(nextDraft, timeFormat, parsed);
          setActiveSegment(
            shouldAdvance
              ? getLastSegment(timeFormat)
              : getNextSegmentFromDraft(nextDraft, timeFormat),
          );
          if (shouldAdvance) {
            setDraft(formatCanonicalTime(parsed.canonical, timeFormat));
            lastTypingInteractionRef.current = false;
            onAutoAdvance?.("typing");
          }
        }}
        onKeyDown={(event) => {
          if (/^\d$/.test(event.key)) {
            event.preventDefault();
            setShowSegmentHighlight(true);
            handleDigitKey(event.key);
            return;
          }
          if (event.key === "Backspace") {
            event.preventDefault();
            setShowSegmentHighlight(true);
            handleBackspaceKey();
            return;
          }
          if (event.key === "Delete") {
            event.preventDefault();
            setShowSegmentHighlight(true);
            handleDeleteKey();
            return;
          }
          if (timeFormat === "12h" && (event.key === "a" || event.key === "A")) {
            event.preventDefault();
            event.stopPropagation();
            setShowSegmentHighlight(true);
            applyPeriod("AM", {
              advance: lastTypingInteractionRef.current || !hasExplicitPeriod(draft),
              advanceReason: "typing",
            });
            return;
          }
          if (timeFormat === "12h" && (event.key === "p" || event.key === "P")) {
            event.preventDefault();
            event.stopPropagation();
            setShowSegmentHighlight(true);
            applyPeriod("PM", {
              advance: lastTypingInteractionRef.current || !hasExplicitPeriod(draft),
              advanceReason: "typing",
            });
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            const boundaryEnter = activeSegment === getLastSegment(timeFormat) && onBoundaryEnter;
            const committed = commitDraft({
              advance: !boundaryEnter,
              advanceReason: "enter",
            });
            if (boundaryEnter && committed !== null) {
              onBoundaryEnter();
            }
            return;
          }
          if (event.key === "Tab") {
            setShowSegmentHighlight(true);
            const movedInsideField = moveSegment(event.shiftKey ? -1 : 1);
            if (movedInsideField) {
              event.preventDefault();
              return;
            }
            // At the field's edge, Tab hands focus to the owner's handler; with
            // none, the browser moves on as usual, so the field is never a
            // keyboard trap (BL-199: End time swallowed Tab, Start time Shift+Tab).
            if (event.shiftKey && activeSegment === "hour" && onAutoRetreat) {
              event.preventDefault();
              commitDraft();
              onAutoRetreat();
              return;
            }
            if (
              !event.shiftKey &&
              activeSegment === getLastSegment(timeFormat) &&
              onAutoAdvance
            ) {
              event.preventDefault();
              commitDraft({ advance: true, advanceReason: "tab" });
              return;
            }
            commitDraft();
            return;
          }
          if (event.key === "ArrowRight") {
            setShowSegmentHighlight(true);
            if (moveSegment(1)) event.preventDefault();
            return;
          }
          if (event.key === "ArrowLeft") {
            setShowSegmentHighlight(true);
            if (moveSegment(-1)) event.preventDefault();
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setShowSegmentHighlight(true);
            adjustActiveSegment(1);
            return;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setShowSegmentHighlight(true);
            adjustActiveSegment(-1);
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setDraft(formatCanonicalTime(normalizedValue, timeFormat));
            const nextPeriod = getPeriodFromCanonical(normalizedValue);
            const nextDraft = formatCanonicalTime(normalizedValue, timeFormat);
            setPeriod(nextPeriod);
            const nextBuffers = getSegmentBuffersFromDraft(nextDraft, timeFormat, nextPeriod);
            setSegmentBuffers(nextBuffers);
            segmentBuffersRef.current = nextBuffers;
            setSegmentDisplayOverrides({});
            setIsInvalid(false);
            setActiveSegment("hour");
          }
        }}
        className={cn(
          "schedule-time-input__control",
          density === "compact" && "schedule-time-input__control--compact",
          isInvalid && "schedule-time-input__control--invalid",
          inputClassName,
        )}
        style={inputStyle}
      />
      <div
        aria-hidden="true"
        className={cn("schedule-time-input__segments", density === "compact" && "compact")}
      >
        <span
          ref={hourSegmentRef}
          data-time-segment="hour"
          data-active={showSegmentHighlight && activeSegment === "hour" ? "true" : undefined}
          className={segmentClassName(showSegmentHighlight && activeSegment === "hour", isInvalid)}
        >
          {displaySegments.hour}
        </span>
        <span data-time-segment="hour-separator" className="px-0.5 text-slate-500">
          :
        </span>
        <span
          ref={minuteSegmentRef}
          data-time-segment="minute"
          data-active={showSegmentHighlight && activeSegment === "minute" ? "true" : undefined}
          className={segmentClassName(
            showSegmentHighlight && activeSegment === "minute",
            isInvalid,
          )}
        >
          {displaySegments.minute}
        </span>
        {timeFormat === "12h" ? (
          <>
            <span className="w-1.5" />
            <span
              ref={periodSegmentRef}
              data-time-segment="period"
              data-active={showSegmentHighlight && activeSegment === "period" ? "true" : undefined}
              className={segmentClassName(
                showSegmentHighlight && activeSegment === "period",
                isInvalid,
              )}
            >
              {period}
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
});

function segmentClassName(active: boolean, invalid: boolean): string {
  return cn(
    "schedule-time-input__segment",
    active && !invalid && "active",
    active && invalid && "active invalid",
  );
}

function getSelectionRangeForSegment(
  segment: TimeSegment,
  timeFormat: TimeFormat,
): { readonly start: number; readonly end: number } {
  if (segment === "hour") return { start: 0, end: 2 };
  if (segment === "minute") return { start: 3, end: 5 };
  if (timeFormat === "12h") return { start: 6, end: 8 };
  return { start: 3, end: 5 };
}

function getSegmentFromCaretIndex(caretIndex: number, timeFormat: TimeFormat): TimeSegment {
  if (caretIndex <= 2) return "hour";
  if (caretIndex <= 5 || timeFormat === "24h") return "minute";
  return "period";
}

function getSegmentFromClickPosition(
  clientX: number,
  timeFormat: TimeFormat,
  hourElement: HTMLSpanElement | null,
  minuteElement: HTMLSpanElement | null,
  periodElement: HTMLSpanElement | null,
): TimeSegment | null {
  const bounds: {
    readonly segment: TimeSegment;
    readonly left: number;
    readonly right: number;
  }[] = [];
  if (hourElement) {
    const rect = hourElement.getBoundingClientRect();
    if (rect.right > rect.left)
      bounds.push({ segment: "hour", left: rect.left, right: rect.right });
  }
  if (minuteElement) {
    const rect = minuteElement.getBoundingClientRect();
    if (rect.right > rect.left)
      bounds.push({ segment: "minute", left: rect.left, right: rect.right });
  }
  if (timeFormat === "12h" && periodElement) {
    const rect = periodElement.getBoundingClientRect();
    if (rect.right > rect.left)
      bounds.push({ segment: "period", left: rect.left, right: rect.right });
  }
  if (bounds.length === 0) return null;

  for (const bound of bounds) {
    if (clientX >= bound.left && clientX <= bound.right) return bound.segment;
  }

  return (
    bounds.reduce(
      (closest, bound) => {
        const distance =
          clientX < bound.left
            ? bound.left - clientX
            : clientX > bound.right
              ? clientX - bound.right
              : 0;
        if (!closest || distance < closest.distance) return { segment: bound.segment, distance };
        return closest;
      },
      null as { readonly segment: TimeSegment; readonly distance: number } | null,
    )?.segment ?? null
  );
}

function getDisplaySegments(
  draft: string,
  timeFormat: TimeFormat,
  activePeriod: TimePeriod,
): { readonly hour: string; readonly minute: string } {
  const parsed = parseTimeInputValue(draft, { timeFormat, activePeriod });
  if (parsed) return splitDisplayTime(formatCanonicalTime(parsed.canonical, timeFormat));

  const raw = draft.trim();
  if (!raw) return { hour: "HH", minute: "MM" };

  const withoutPeriod = raw.replace(/\s*(?:AM|PM|A|P|A\.?M\.?|P\.?M\.?)\s*$/i, "").trim();
  if (withoutPeriod.includes(":")) {
    const [hour = "", minute = ""] = withoutPeriod.split(":");
    return {
      hour: hour ? hour.padStart(Math.min(hour.length + 1, 2), "0").slice(-2) : "HH",
      minute: minute ? minute.padEnd(2, "0").slice(0, 2) : "MM",
    };
  }

  const digits = withoutPeriod.replace(/\D/g, "");
  if (!digits) return { hour: "HH", minute: "MM" };
  if (digits.length <= 2) return { hour: digits.padStart(2, "0"), minute: "00" };
  if (digits.length === 3)
    return { hour: digits.slice(0, 1).padStart(2, "0"), minute: digits.slice(1) };
  return { hour: digits.slice(0, 2), minute: digits.slice(2, 4) };
}

function getDisplaySegmentsFromBuffers(
  buffers: SegmentBuffers,
  overrides: SegmentDisplayOverrides = {},
): {
  readonly hour: string;
  readonly minute: string;
} {
  return {
    hour: overrides.hour ?? (buffers.hour ? buffers.hour.padStart(2, "0").slice(-2) : "HH"),
    minute: overrides.minute ?? formatMinuteBuffer(buffers.minute),
  };
}

function getWrappedWheelValue(current: number, min: number, max: number, delta: 1 | -1): number {
  if (current + delta > max) return min;
  if (current + delta < min) return max;
  return current + delta;
}

function getVisibleSegmentNumber(
  segment: "hour" | "minute",
  canonicalValue: string,
  overrideValue: string | undefined,
  timeFormat: TimeFormat,
): number {
  if (overrideValue) return Number(overrideValue);
  if (segment === "hour") {
    const fallback = timeFormat === "12h" ? 12 : 1;
    if (!canonicalValue) return fallback;
    const numeric = Number(canonicalValue);
    if (!Number.isFinite(numeric)) return fallback;
    if (timeFormat === "24h" && numeric === 0) return 24;
    return numeric;
  }
  if (!canonicalValue) return 1;
  const numeric = Number(canonicalValue);
  if (!Number.isFinite(numeric)) return 1;
  return numeric === 0 ? 60 : numeric;
}

function mapWheelHourToCanonical(value: number, timeFormat: TimeFormat): string {
  if (timeFormat === "24h" && value === 24) return "00";
  return String(value).padStart(2, "0");
}

function mapWheelMinuteToCanonical(value: number): string {
  if (value === 60) return "00";
  return String(value).padStart(2, "0");
}

function getWheelDisplayOverrides(
  segment: "hour" | "minute",
  value: number,
  timeFormat: TimeFormat,
): SegmentDisplayOverrides {
  if (segment === "hour" && timeFormat === "24h" && value === 24) {
    return { hour: "24" };
  }
  if (segment === "minute" && value === 60) {
    return { minute: "60" };
  }
  return {};
}

function formatMinuteBuffer(minute: string): string {
  if (!minute) return "MM";
  if (minute.length === 1) return `${minute}M`;
  return minute.slice(0, 2);
}

function splitDisplayTime(value: string): { readonly hour: string; readonly minute: string } {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return { hour: "HH", minute: "MM" };
  return { hour: match[1]!.padStart(2, "0"), minute: match[2]! };
}

function getActiveSegmentFromDraft(value: string, timeFormat: TimeFormat): TimeSegment {
  const withoutPeriod = value.replace(/\s*(?:AM|PM|A|P|A\.?M\.?|P\.?M\.?)\s*$/i, "").trim();
  if (timeFormat === "12h" && hasExplicitPeriod(value)) return "period";
  if (withoutPeriod.includes(":")) {
    const [, minute = ""] = withoutPeriod.split(":");
    return minute.length > 0 ? "minute" : "hour";
  }
  const digits = withoutPeriod.replace(/\D/g, "");
  return digits.length >= 3 ? "minute" : "hour";
}

function getNextSegmentFromDraft(value: string, timeFormat: TimeFormat): TimeSegment {
  if (timeFormat === "12h" && hasExplicitPeriod(value)) return "period";
  const active = getActiveSegmentFromDraft(value, timeFormat);
  if (timeFormat === "12h" && active === "minute") return "period";
  return active;
}

/** The field's last segment: AM/PM in 12h, minutes in 24h. */
export function getLastSegment(timeFormat: TimeFormat): TimeSegment {
  return timeFormat === "12h" ? "period" : "minute";
}

function hasExplicitPeriod(value: string): boolean {
  return /\s*[ap](?:\.?\s*m\.?)?\s*$/i.test(value.trim());
}

function shouldAutoAdvanceFromDraft(
  value: string,
  timeFormat: TimeFormat,
  parsed: { readonly shouldAutoAdvance: boolean },
): boolean {
  if (!parsed.shouldAutoAdvance) return false;
  if (timeFormat === "24h") return true;
  return hasAdvancingPeriodSuffix(value);
}

function hasAdvancingPeriodSuffix(value: string): boolean {
  const trimmed = value.trim();
  if (/\s*(?:a\.?m\.?|p\.?m\.?)$/i.test(trimmed)) return true;
  return /^\d{1,2}:?\d{0,2}[ap]$/i.test(trimmed);
}

function getSegmentBuffersFromDraft(
  draft: string,
  timeFormat: TimeFormat,
  activePeriod: TimePeriod,
): { readonly hour: string; readonly minute: string } {
  const display = getDisplaySegments(draft, timeFormat, activePeriod);
  return {
    hour: display.hour === "HH" ? "" : display.hour.replace(/\D/g, ""),
    minute: display.minute === "MM" ? "" : display.minute.replace(/\D/g, ""),
  };
}

function formatSegmentDraft(
  buffers: { readonly hour: string; readonly minute: string },
  timeFormat: TimeFormat,
  period: TimePeriod,
): string {
  if (!buffers.hour) return "";
  const hour = buffers.hour.padStart(2, "0").slice(-2);
  const minute = (buffers.minute || "00").padEnd(2, "0").slice(0, 2);
  return timeFormat === "12h" ? `${hour}:${minute} ${period}` : `${hour}:${minute}`;
}

function applyHourDigit(
  currentHour: string,
  digit: string,
  timeFormat: TimeFormat,
): {
  readonly hour: string;
  readonly complete: boolean;
  readonly minuteDigit: string | null;
} {
  if (!currentHour) {
    if (timeFormat === "12h") {
      if (digit === "0" || digit === "1")
        return { hour: digit, complete: false, minuteDigit: null };
      return { hour: digit, complete: true, minuteDigit: null };
    }
    if (["0", "1", "2"].includes(digit)) {
      return { hour: digit, complete: false, minuteDigit: null };
    }
    return { hour: digit, complete: true, minuteDigit: null };
  }

  const candidate = `${currentHour}${digit}`;
  const numeric = Number(candidate);
  const maxHour = timeFormat === "12h" ? 12 : 23;
  const minHour = timeFormat === "12h" ? 1 : 0;
  if (numeric >= minHour && numeric <= maxHour) {
    return { hour: candidate, complete: true, minuteDigit: null };
  }

  if (Number(digit) <= 5) {
    return { hour: currentHour, complete: true, minuteDigit: digit };
  }

  return { hour: digit, complete: true, minuteDigit: null };
}

function applyMinuteDigit(
  currentMinute: string,
  digit: string,
): { readonly minute: string; readonly complete: boolean } | null {
  if (!currentMinute) {
    if (Number(digit) > 5) return null;
    return { minute: digit, complete: false };
  }
  return { minute: `${currentMinute}${digit}`.slice(0, 2), complete: true };
}

function adjustHourBuffer(currentHour: string, delta: 1 | -1, timeFormat: TimeFormat): string {
  const min = timeFormat === "12h" ? 1 : 0;
  const max = timeFormat === "12h" ? 12 : 23;
  const fallback = timeFormat === "12h" ? 12 : 0;
  const current = currentHour ? Number(currentHour) : fallback;
  if (!Number.isFinite(current)) return String(fallback).padStart(2, "0");
  if (current + delta > max) return String(min).padStart(2, "0");
  if (current + delta < min) return String(max).padStart(2, "0");
  return String(current + delta).padStart(2, "0");
}

function adjustMinuteBuffer(currentMinute: string, delta: 1 | -1): string {
  const current = currentMinute.length === 2 ? Number(currentMinute) : 0;
  if (!Number.isFinite(current)) return "00";
  if (current + delta > 59) return "00";
  if (current + delta < 0) return "59";
  return String(current + delta).padStart(2, "0");
}
