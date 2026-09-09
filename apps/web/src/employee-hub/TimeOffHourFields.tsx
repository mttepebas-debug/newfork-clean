import type { TimeOffPeriodInput } from "@newfork/shared";
import { AvailabilityClockInput, formatAvailabilityClock } from "../availability/AvailabilityClockInput";
import type { AvailabilityClockPreset } from "../availability/AvailabilityClockInput";

export type TimeOffHours = Omit<TimeOffPeriodInput, "segment_date">;
export const defaultTimeOffHours: TimeOffHours = { start_time: "09:00", end_time: "17:00", ends_next_day: false };

export function TimeOffHourFields({ ranges, onChange, timeFormat, presets, date }: {
  ranges: TimeOffHours[];
  onChange: (ranges: TimeOffHours[]) => void;
  timeFormat: "12h" | "24h";
  presets: readonly AvailabilityClockPreset[];
  date?: string;
}) {
  const update = (index: number, patch: Partial<TimeOffHours>) => onChange(ranges.map((r, i) => i === index ? { ...r, ...patch } : r));
  const label = (value: string) => date ? `${value} on ${date}` : value;
  return <div className="time-off-hour-fields">
    <p>{date ? `These hours start on ${date}.` : "These hours apply to each selected date."} Use separate periods for a break between requested hours.</p>
    {presets.length ? <label>Replace hours with a shift type
      <select value="" aria-label={label("Time off hours from shift type")} onChange={(event) => {
        const preset = presets.find((p) => p.id === event.target.value);
        if (preset) onChange([{ start_time: preset.start_time, end_time: preset.end_time, ends_next_day: preset.end_time < preset.start_time }]);
      }}>
        <option value="">Choose hours…</option>
        {presets.map((p) => <option key={p.id} value={p.id}>{p.name}: {formatAvailabilityClock(p.start_time, timeFormat)}–{formatAvailabilityClock(p.end_time, timeFormat)}{p.end_time < p.start_time ? " (+1 day)" : ""}</option>)}
      </select>
      <small>Copies the current default hours. Later shift-type changes do not change this request.</small>
    </label> : null}
    {ranges.map((range, index) => <fieldset key={index}>
      <legend>Requested period {index + 1}</legend>
      <div className="date-pair">
        <label>Start time<AvailabilityClockInput value={range.start_time ?? ""} timeFormat={timeFormat} label={label(`Time off start ${index + 1}`)} onChange={(value) => update(index, { start_time: value })} /></label>
        <label>End time<AvailabilityClockInput value={range.end_time === "24:00" ? "00:00" : range.end_time ?? ""} timeFormat={timeFormat} label={label(`Time off end ${index + 1}`)} disabled={range.end_time === "24:00"} onChange={(value) => update(index, { end_time: value })} /></label>
      </div>
      <label><input type="checkbox" checked={range.ends_next_day} onChange={(event) => update(index, { ends_next_day: event.target.checked, ...(range.end_time === "24:00" ? { end_time: "02:00" } : {}) })} />Ends the next day (+1 day)</label>
      <label><input type="checkbox" checked={range.end_time === "24:00"} onChange={(event) => update(index, { end_time: event.target.checked ? "24:00" : "17:00", ends_next_day: false })} />End of day</label>
      <details><summary>Repeated clocks during daylight saving changes</summary>
        <p>If a clock occurs twice, choose which occurrence you mean. Nonexistent clock hours cannot be requested.</p>
        {(["start", "end"] as const).map((edge) => <label key={edge}>{edge === "start" ? "Start occurrence" : "End occurrence"}
          <select aria-label={label(`Time off ${edge} occurrence ${index + 1}`)} value={range[`${edge}_fold`] ?? ""} onChange={(event) => update(index, { [`${edge}_fold`]: event.target.value || undefined })}>
            <option value="">Ask if the clock repeats</option><option value="earlier">First occurrence</option><option value="later">Second occurrence</option>
          </select>
        </label>)}
      </details>
      {ranges.length > 1 ? <button type="button" onClick={() => onChange(ranges.filter((_, i) => i !== index))}>Remove period {index + 1}</button> : null}
    </fieldset>)}
    <button type="button" disabled={ranges.length >= 4} onClick={() => onChange([...ranges, { ...defaultTimeOffHours }])}>Add another period</button>
  </div>;
}
