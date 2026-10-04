import { useState } from "react";
import { Check, Info, MessageSquare, Plus, X } from "lucide-react";
import {
  type PreferenceShiftType,
  type WeeklyPreference,
  type WeeklyPreferenceDay,
} from "@newfork/shared";
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
  shiftTypes,
  disabled = false,
  readOnly = false,
  notes,
  onNotesChange,
  timeFormat = "24h",
}: {
  value: WeeklyPreference;
  onChange?: (value: WeeklyPreference) => void;
  shiftTypes: readonly PreferenceShiftType[];
  disabled?: boolean;
  readOnly?: boolean;
  notes?: readonly string[];
  onNotesChange?: (notes: string[]) => void;
  timeFormat?: "12h" | "24h";
}) {
  const [openNote, setOpenNote] = useState<number | null>(null);
  const [showHours, setShowHours] = useState(false);
  const manager = notes !== undefined;
  // A day holds several hours in time-range mode (M4); one is edited in place.
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
  const typeHours = (type: PreferenceShiftType) =>
    type.start_time && type.end_time
      ? `${formatAvailabilityClock(type.start_time, timeFormat)} - ${formatAvailabilityClock(type.end_time, timeFormat)}${type.archived ? " (archived)" : ""}`
      : "Default hours need updating";
  const savedTypes = new Set(value.days.flatMap((day) => day.shift_type_ids));
  const options = shiftTypes.filter(
    (type) => type.selectable || savedTypes.has(type.id),
  );
  return (
    <div
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
        {value.input_mode === "shift_type" && (
          <button
            type="button"
            className="weekly-icon"
            aria-label="Shift default hours"
            aria-expanded={showHours}
            onClick={() => setShowHours(!showHours)}
          >
            <Info size={16} />
          </button>
        )}
      </div>
      {showHours && (
        <dl className="weekly-hours">
          {options.map((type) => (
            <div key={type.id}>
              <dt>{type.name}</dt>
              <dd>{typeHours(type)}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="weekly-unavailable-table">
        <div className="weekly-unavailable-head">
          <span>Day</span>
          <span>Unavailable</span>
          {!readOnly && <span>All day</span>}
          {manager && <span>Note</span>}
        </div>
        {displayDays.map((day) => {
          const row = value.days.find((item) => item.day === day)!;
          const unavailable =
            row.all_day || row.shift_type_ids.length > 0 || row.ranges.length > 0;
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
                  ) : value.input_mode === "shift_type" ? (
                    row.shift_type_ids.length ? (
                      row.shift_type_ids.map((id) => {
                        const type = shiftTypes.find((type) => type.id === id);
                        return (
                          <span
                            key={id}
                            className="weekly-preference-tag"
                            title={type ? typeHours(type) : "Saved shift type"}
                          >
                            {type?.name ?? "Saved shift type"}
                          </span>
                        );
                      })
                    ) : (
                      <span className="weekly-empty">&mdash;</span>
                    )
                  ) : row.ranges.length ? (
                    row.ranges.map((range) => (
                      <span key={range.start} className="weekly-preference-tag">
                        {formatAvailabilityClock(range.start, timeFormat)} -{" "}
                        {formatAvailabilityClock(range.end, timeFormat)}
                      </span>
                    ))
                  ) : (
                    <span className="weekly-empty">&mdash;</span>
                  )
                ) : value.input_mode === "shift_type" ? (
                  options.length ? (
                    options.map((type) => {
                      const selected = row.shift_type_ids.includes(type.id);
                      return (
                        <button
                          key={type.id}
                          type="button"
                          title={typeHours(type)}
                          className={`weekly-shift-option ${selected ? "selected" : ""}`}
                          aria-label={`${weekdays[day]} ${type.name} unavailable`}
                          aria-pressed={selected}
                          disabled={
                            locked ||
                            row.all_day ||
                            (!type.selectable && !selected)
                          }
                          onClick={() =>
                            update(day, {
                              shift_type_ids: selected
                                ? row.shift_type_ids.filter(
                                    (id) => id !== type.id,
                                  )
                                : [...row.shift_type_ids, type.id],
                            })
                          }
                        >
                          {selected ? <Check size={13} /> : <Plus size={13} />}
                          <span>{type.name}</span>
                          {!type.selectable && <small>Previous</small>}
                        </button>
                      );
                    })
                  ) : (
                    <span className="weekly-empty">
                      No shift types available
                    </span>
                  )
                ) : row.all_day ? (
                  <span className="weekly-empty">All day unavailable</span>
                ) : row.ranges.length ? (
                  row.ranges.map((range, index) => {
                    // ponytail: later ranges get a numbered label; C2 designs adding one.
                    const label = `${weekdays[day]} unavailable${index ? ` ${index + 1}` : ""}`;
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
                          aria-label={`Remove ${weekdays[day]} hours${index ? ` ${index + 1}` : ""}`}
                          disabled={locked}
                          onClick={() => setRange(row, index, null)}
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
                  })
                ) : (
                  <button
                    type="button"
                    className="weekly-add-hours"
                    disabled={locked}
                    onClick={() =>
                      update(day, { ranges: [{ start: "09:00", end: "17:00" }] })
                    }
                  >
                    <Plus size={14} />
                    Add hours
                  </button>
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
                        shift_type_ids: [],
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
