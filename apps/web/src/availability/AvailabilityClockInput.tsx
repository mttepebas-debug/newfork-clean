import { useEffect, useRef, useState } from "react";

export type AvailabilityClockPreset = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
};

export function formatAvailabilityClock(value: string, format: "12h" | "24h") {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return value;
  const hour = Number(match[1]);
  const seconds = match[3] && match[3] !== "00" ? `:${match[3]}` : "";
  if (format === "24h") return `${match[1]}:${match[2]}${seconds}`;
  return `${hour % 12 || 12}:${match[2]}${seconds} ${hour >= 12 && hour < 24 ? "PM" : "AM"}`;
}

function parseClock(text: string, format: "12h" | "24h") {
  const match = /^(\d{1,2})(?::(\d{2})(?::(\d{2}))?)?\s*(AM|PM)?$/i.exec(text.trim());
  if (!match) return "";
  if (!match[2] && !match[4]) return "";
  if (format === "12h" && !match[4]) return "";
  let hour = Number(match[1]);
  if (Number(match[2] ?? 0) > 59 || Number(match[3] ?? 0) > 59) return "";
  if (match[4]) {
    if (hour < 1 || hour > 12) return "";
    hour = hour % 12 + (match[4].toUpperCase() === "PM" ? 12 : 0);
  } else if (hour > 23) return "";
  return `${String(hour).padStart(2, "0")}:${match[2] ?? "00"}${match[3] && match[3] !== "00" ? `:${match[3]}` : ""}`;
}

// Invalid visible input must invalidate the parent immediately. Keeping the last
// valid canonical value would let a submit silently ignore unfinished typing.
export function AvailabilityClockInput({
  value, timeFormat, label, onChange, disabled = false, className, placeholder, invalid = false, describedBy, field,
}: {
  value: string;
  timeFormat: "12h" | "24h";
  label: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  /** The form already found a problem here; the box says so too. */
  invalid?: boolean;
  describedBy?: string;
  /** `data-field`, for a form that moves focus to its first problem. */
  field?: string;
}) {
  const [text, setText] = useState(() => formatAvailabilityClock(value, timeFormat));
  const emitted = useRef(value);
  const previousFormat = useRef(timeFormat);
  useEffect(() => {
    if (emitted.current !== value || previousFormat.current !== timeFormat) {
      if (value || emitted.current !== value) setText(formatAvailabilityClock(value, timeFormat));
      emitted.current = value;
      previousFormat.current = timeFormat;
    }
  }, [value, timeFormat]);
  return <input type="text" inputMode="text" aria-label={label} disabled={disabled} className={className}
    placeholder={placeholder ?? (timeFormat === "12h" ? "9:00 AM" : "09:00")}
    aria-invalid={invalid || Boolean(text && !parseClock(text, timeFormat))} aria-describedby={describedBy}
    data-field={field} value={text}
    onChange={(event) => {
      setText(event.target.value);
      emitted.current = parseClock(event.target.value, timeFormat);
      onChange(emitted.current);
    }} onBlur={() => {
      const canonical = parseClock(text, timeFormat);
      if (canonical) setText(formatAvailabilityClock(canonical, timeFormat));
    }} />;
}
