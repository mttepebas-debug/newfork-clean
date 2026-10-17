import { Fragment } from "react";
import { CalendarX, Info, Lock, Sparkles } from "lucide-react";
import type { WeeklyPreference } from "@newfork/shared";
import {
  DAY_END,
  DAY_START,
  DISPLAY_DAYS,
  WEEKDAY_NAMES,
  dayState,
  dayTone,
  firstName,
  rangeOf,
  shortDay,
  updatedOn,
  weekPhrases,
  type TimeFormat,
} from "./day-availability";
import "./day-availability.css";
import "./week-read.css";

// A person's week as a manager reads it (KARARLAR "Müsaitlik giriş ekranı = 4 ·
// Gün gün": "çekmecede salt okunur gün kutuları"; M2: only the employee
// changes it). The Employees drawer and the Availability page draw the same
// boxes; green when the day is open, orange when any of it is not (Mert
// 2026-10-16, dayTone()).

type Props = {
  /** The person's full name; the screens call them by the first. */
  name: string;
  submitted: boolean;
  updatedAt: string | null;
  preference: WeeklyPreference;
  timeFormat: TimeFormat;
  /** The drawer: the lock bar with the save date, and the line under the boxes. */
  readOnlyBar?: boolean;
};

export function WeekRead({ name, submitted, updatedAt, preference, timeFormat, readOnlyBar = false }: Props) {
  const who = firstName(name);
  if (!submitted)
    return (
      <div className="avr-empty">
        <CalendarX size={24} aria-hidden />
        <b>{who} hasn't shared availability yet.</b>
        <span>It's optional. Until then, every time counts as available.</span>
      </div>
    );
  const updated = updatedOn(updatedAt);
  return (
    <div className="avr-week">
      {readOnlyBar && (
        <p className="avr-ro-bar">
          <Lock size={14} aria-hidden />
          <span>Read only. Only {who} can change this.</span>
          {updated && <span className="avr-ro-date">Updated {updated}</span>}
        </p>
      )}
      <WeekSentence who={who} preference={preference} timeFormat={timeFormat} />
      <WeekTiles who={who} preference={preference} timeFormat={timeFormat} />
      {readOnlyBar && (
        <p className="avr-mgr-note">
          <Info size={14} aria-hidden />
          <span>
            A preference, not a rule. You can still schedule anyone; the Schedule shows an orange ! where a shift
            doesn't fit.
          </span>
        </p>
      )}
    </div>
  );
}

function WeekSentence({ who, preference, timeFormat }: { who: string; preference: WeeklyPreference; timeFormat: TimeFormat }) {
  const phrases = weekPhrases(preference, timeFormat);
  return (
    <p className="avr-sum">
      <Sparkles size={15} aria-hidden />
      <span>
        {phrases.length ? (
          <>
            {who} prefers not to work{" "}
            {phrases.map((phrase, index) => (
              <Fragment key={phrase.days}>
                {index === 0 ? "" : index === phrases.length - 1 ? " and " : ", "}
                <b>{phrase.days}</b> {phrase.text}
              </Fragment>
            ))}
            .
          </>
        ) : (
          `${who} is open to work any time.`
        )}
      </span>
    </p>
  );
}

const percent = (minutes: number) => `${((minutes - DAY_START) / (DAY_END - DAY_START)) * 100}%`;

/** Seven boxes, Monday first; each with its tone, its words and a strip from 12 AM to 12 AM. */
export function WeekTiles({ who, preference, timeFormat }: { who: string; preference: WeeklyPreference; timeFormat: TimeFormat }) {
  return (
    <ul className="avr-tiles" aria-label={`${who}'s week`}>
      {DISPLAY_DAYS.map((weekday) => {
        const day = preference.days.find((item) => item.day === weekday)!;
        const tone = dayTone(day, timeFormat);
        const range = rangeOf(day);
        // "Unavailable after 6:00 PM" as two fixed lines in a box: the state
        // word, then the hours (capitalised by CSS); one line in a row.
        const [state, ...rest] = tone.label.split(" ");
        return (
          <li key={weekday} className={`avr-tile ${tone.className} is-${dayState(day)}`} data-weekday={weekday}>
            <span className="avr-tile-day">
              <i className="avr-dot" aria-hidden />
              <b aria-hidden>{shortDay(weekday)}</b>
              <span className="sr-only">{WEEKDAY_NAMES[weekday]}</span>
            </span>
            <small>
              <span className="avr-tile-state">{state}</span> <span className="avr-tile-detail">{rest.join(" ")}</span>
            </small>
            <span className="avr-rail" aria-hidden>
              {range && <i style={{ left: percent(range[0]), width: percent(range[1] - range[0] + DAY_START) }} />}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
