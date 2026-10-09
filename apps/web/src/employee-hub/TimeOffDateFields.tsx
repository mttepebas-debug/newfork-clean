import type { AvailabilityClockPreset } from "../availability/AvailabilityClockInput";
import { TimeOffHourFields, type TimeOffHours } from "./TimeOffHourFields";

export type TimeOffDateDraft = { mode:"full_day" | "hours" | "skip"; hours:TimeOffHours[] };
export type TimeOffDateDrafts = Record<string,TimeOffDateDraft>;
export function TimeOffDateFields({ dates, drafts, defaults, onChange, timeFormat, presets }: {
  dates:string[]; drafts:TimeOffDateDrafts; defaults:TimeOffDateDraft;
  onChange:(drafts:TimeOffDateDrafts)=>void; timeFormat:"12h"|"24h"; presets:readonly AvailabilityClockPreset[];
}) {
  return <div className="time-off-date-fields">
    <p>Choose full days, specific hours or no leave for each date. Overnight hours continue into the following day.</p>
    {dates.map(date => {
      const draft = drafts[date] ?? defaults;
      const update = (patch:Partial<TimeOffDateDraft>) => onChange({...drafts,[date]:{...draft,...patch}});
      return <fieldset key={date} aria-label={`Time off on ${date}`}>
        <legend>{new Intl.DateTimeFormat("en-US",{timeZone:"UTC",weekday:"short",month:"short",day:"numeric",year:"numeric"}).format(new Date(`${date}T12:00:00Z`))}</legend>
        <label>Leave for this date
          <select aria-label={`Requested time on ${date}`} value={draft.mode} onChange={event=>update({mode:event.target.value as TimeOffDateDraft["mode"]})}>
            <option value="full_day">Full day</option><option value="hours">Specific hours</option><option value="skip">No leave on this date</option>
          </select>
        </label>
        {draft.mode === "hours" ? <TimeOffHourFields date={date} ranges={draft.hours} onChange={hours=>update({hours})} timeFormat={timeFormat} presets={presets} /> : null}
        {draft.mode === "skip" ? <p>This date will not add a leave period. Hours continuing from the previous date still apply.</p> : null}
      </fieldset>;
    })}
    {!dates.length ? <p>Choose a start and end date to customize hours.</p> : null}
  </div>;
}
