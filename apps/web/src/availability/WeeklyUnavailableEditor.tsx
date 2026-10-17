import { useEffect, useRef, useState } from "react";
import { MessageSquare, Plus, X } from "lucide-react";
import { type WeeklyPreference, type WeeklyPreferenceDay } from "@newfork/shared";
import {
  AvailabilityClockInput,
  formatAvailabilityClock,
} from "./AvailabilityClockInput";
import "./weekly-preferences.css";

const weekdays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const displayDays = [1, 2, 3, 4, 5, 6, 0];

export function WeeklyUnavailableEditor({
  value,
  onChange,
  disabled = false,
  readOnly = false,
  notes,
  onNotesChange,
  timeFormat = "24h",
}: {
  value: WeeklyPreference;
  onChange?: (value: WeeklyPreference) => void;
  disabled?: boolean;
  readOnly?: boolean;
  notes?: readonly string[];
  onNotesChange?: (notes: string[]) => void;
  timeFormat?: "12h" | "24h";
}) {
  const [openNote, setOpenNote] = useState<number | null>(null);
  // WCAG 2.4.3: after a range comes or goes, focus lands on the control
  // named here once it has rendered, never on the page.
  const root = useRef<HTMLDivElement>(null);
  const focusNext = useRef<string | null>(null);
  useEffect(() => {
    if (!focusNext.current) return;
    root.current
      ?.querySelector<HTMLElement>(`[aria-label="${focusNext.current}"]`)
      ?.focus();
    focusNext.current = null;
  });
  const rangeLabel = (day: number, index: number) =>
    `${weekdays[day]} unavailable${index ? ` ${index + 1}` : ""}`;
  const removeLabel = (day: number, index: number) =>
    `Remove ${weekdays[day]} hours${index ? ` ${index + 1}` : ""}`;
  const manager = notes !== undefined;
  // Hours only, one range a day (Mert 2026-10-16); it is edited in place.
  const setRange = (
    row: WeeklyPreferenceDay,
    index: number,
    range: WeeklyPreferenceDay["ranges"][number] | null,
  ) =>
    update(row.day, {
      ranges: range
        ? row.ranges.map((item, at) => (at === index ? range : item))
        : row.ranges.filter((_, at) => at !== index),
    });
  const update = (day: number, patch: Partial<WeeklyPreferenceDay>) =>
    onChange?.({
      ...value,
      days: value.days.map((row) =>
        row.day === day ? { ...row, ...patch } : row,
      ),
    });
  // One range a day (Mert 2026-10-16, "kural da 1'e insin").
  const nextRange = (row: WeeklyPreferenceDay) =>
    row.ranges.length ? null : { start: "09:00", end: "17:00" };
  return (
    <div
      ref={root}
      className={`weekly-unavailable ${manager ? "has-notes" : ""} ${readOnly ? "read-only" : ""}`}
    >
      <div className="weekly-unavailable-legend">
        <span>
          <i />
          Available
        </span>
        <span>
          <i className="red" />
          Unavailable
        </span>
      </div>
      <div className="weekly-unavailable-table">
        <div className="weekly-unavailable-head">
          <span>Day</span>
          <span>Unavailable</span>
          {!readOnly && <span>All day</span>}
          {manager && <span>Note</span>}
        </div>
        {displayDays.map((day) => {
          const row = value.days.find((item) => item.day === day)!;
          const unavailable = row.all_day || row.ranges.length > 0;
          const locked = disabled || readOnly;
          return (
            <div
              key={day}
              className={`weekly-unavailable-day ${unavailable ? "marked" : ""} ${row.all_day ? "whole-day" : ""}`}
            >
              <strong className="weekly-day-name">
                <span className="weekly-day-full">{weekdays[day]}</span>
                <abbr className="weekly-day-short" title={weekdays[day]}>
                  {weekdays[day]!.slice(0, 3)}
                </abbr>
              </strong>
              <div className="weekly-unavailable-options">
                {readOnly ? (
                  row.all_day ? (
                    <span className="weekly-preference-tag">All day</span>
                  ) : row.ranges.length ? (
                    row.ranges.map((range) => (
                      <span key={range.start} className="weekly-preference-tag">
                        {formatAvailabilityClock(range.start, timeFormat)} –{" "}
                        {formatAvailabilityClock(range.end, timeFormat)}
                      </span>
                    ))
                  ) : (
                    <span className="weekly-empty">&mdash;</span>
                  )
                ) : row.all_day ? (
                  <span className="weekly-empty">All day unavailable</span>
                ) : (
                  <>
                  {row.ranges.map((range, index) => {
                    // Later ranges get a numbered label: "Monday unavailable 2 start".
                    const label = rangeLabel(day, index);
                    return (
                      <div key={index} className="weekly-time-range">
                        <AvailabilityClockInput
                          label={`${label} start`}
                          value={range.start}
                          timeFormat={timeFormat}
                          disabled={locked}
                          onChange={(start) => setRange(row, index, { start, end: range.end })}
                        />
                        <span>to</span>
                        <AvailabilityClockInput
                          label={`${label} end`}
                          value={range.end === "24:00" ? "00:00" : range.end}
                          timeFormat={timeFormat}
                          disabled={locked || range.end === "24:00"}
                          onChange={(end) => setRange(row, index, { start: range.start, end })}
                        />
                        <button
                          type="button"
                          className="weekly-icon"
                          aria-label={removeLabel(day, index)}
                          disabled={locked}
                          onClick={() => {
                            const left = row.ranges.length - 1;
                            focusNext.current = left
                              ? removeLabel(day, Math.min(index, left - 1))
                              : `Add hours on ${weekdays[day]}`;
                            setRange(row, index, null);
                          }}
                        >
                          <X size={15} />
                        </button>
                        <label className="weekly-end-day">
                          <input
                            type="checkbox"
                            checked={range.end === "24:00"}
                            disabled={locked}
                            onChange={(event) =>
                              setRange(row, index, {
                                start: range.start,
                                end: event.target.checked ? "24:00" : "17:00",
                              })
                            }
                          />
                          End of day
                        </label>
                      </div>
                    );
                  })}
                  {nextRange(row) && (
                    <button
                      type="button"
                      className="weekly-add-hours"
                      aria-label={`Add hours on ${weekdays[day]}`}
                      disabled={locked}
                      onClick={() => {
                        focusNext.current = `${rangeLabel(day, row.ranges.length)} start`;
                        update(day, { ranges: [...row.ranges, nextRange(row)!] });
                      }}
                    >
                      <Plus size={14} />
                      Add hours
                    </button>
                  )}
                  </>
                )}
              </div>
              {!readOnly && (
                <label className="weekly-all-day">
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label={`${weekdays[day]} all day unavailable`}
                    checked={row.all_day}
                    disabled={locked}
                    onChange={(event) =>
                      update(day, {
                        all_day: event.target.checked,
                        ranges: [],
                      })
                    }
                  />
                </label>
              )}
              {manager && (
                <button
                  type="button"
                  className={`weekly-icon weekly-note-action ${notes[day] ? "has-note" : ""}`}
                  aria-label={`${notes[day] ? "Edit" : "Add"} ${weekdays[day]} manager note`}
                  aria-expanded={openNote === day}
                  disabled={locked}
                  onClick={() => setOpenNote(openNote === day ? null : day)}
                >
                  <MessageSquare size={15} />
                </button>
              )}
              {manager &&
                (openNote === day ? (
                  <textarea
                    className="weekly-note"
                    aria-label={`${weekdays[day]} manager note`}
                    maxLength={1000}
                    disabled={locked}
                    value={notes[day]}
                    placeholder="Add a note for managers..."
                    onChange={(event) =>
                      onNotesChange?.(
                        notes.map((note, index) =>
                          index === day ? event.target.value : note,
                        ),
                      )
                    }
                  />
                ) : notes[day] ? (
                  <p className="weekly-note-summary" title={notes[day]}>
                    {notes[day]}
                  </p>
                ) : null)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
