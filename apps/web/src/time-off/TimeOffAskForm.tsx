import type { TimeOffAskInput } from "@newfork/shared";
import { AlertCircle, CalendarDays, Info } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { MiniCalendar } from "../schedule/components/MiniCalendar";
import { useCloseOnEscape } from "../schedule/lib/useCloseOnEscape";
import { LeaveIcon } from "./leave-icon";
import { useMyTimeOffShifts } from "./time-off-data";
import {
  clockText,
  dayText,
  draftProblems,
  leaveKinds,
  leaveLabel,
  monthDay,
  quickRange,
  refusalText,
  weekday,
  type AskDraft,
  type AskField,
  type TimeFormat,
} from "./time-off-text";
import { timeOffDayCount } from "@newfork/shared";

const QUICK = [
  ["tomorrow", "Tomorrow"],
  ["weekend", "This weekend"],
  ["nextweek", "Next week"],
] as const;

const CLOCKS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

export const blankDraft: AskDraft = { kind: null, start: "", end: "", allDay: true, from: "09:00", to: "17:00", note: "" };

export function FieldMessage({ id, text }: { id: string; text: string | undefined }) {
  if (!text) return null;
  return (
    <p className="tor-fmsg" id={id} role="alert">
      <AlertCircle size={14} aria-hidden />
      <span>{text}</span>
    </p>
  );
}

export function Field({ label, children, hint, message }: { label: ReactNode; children: ReactNode; hint?: ReactNode; message?: ReactNode }) {
  return (
    <div className="tor-field">
      <span className="tor-label">{label}</span>
      {children}
      {hint ? <p className="tor-fdesc">{hint}</p> : null}
      {message}
    </div>
  );
}

/**
 * Asking for time off (Karma, KARARLAR S-242). On a computer, B2's drawer: a summary card on top, the four
 * kinds as a described list, the days and hours, the note. On a phone, B1's panel: a Type list, the same days
 * and hours, the note. A refusal stays beside its field and the form keeps everything typed.
 */
export function TimeOffAskForm({
  workspaceId,
  formId,
  phone,
  zone,
  now,
  timeFormat,
  sending,
  onSend,
}: {
  workspaceId: string;
  formId: string;
  phone: boolean;
  zone: string | null;
  now: { date: string; time: string };
  timeFormat: TimeFormat;
  sending: boolean;
  /** Sends the request; resolves on success, rejects with the API's refusal. */
  onSend: (input: TimeOffAskInput) => Promise<unknown>;
}) {
  const ids = useId();
  const [draft, setDraft] = useState<AskDraft>(blankDraft);
  const [quick, setQuick] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [refusal, setRefusal] = useState<{ field: AskField | null; text: string } | null>(null);
  // One key per version of the form: sending it again after a failure is the same request, and any edit is
  // a new one (the database refuses a key used for other hours).
  const key = useRef(crypto.randomUUID());

  function change(next: Partial<AskDraft>) {
    key.current = crypto.randomUUID();
    setRefusal(null);
    setDraft((d) => ({ ...d, ...next }));
  }

  const problems = draftProblems(draft, now);
  // Missing answers wait for Send; a rule a range breaks shows as soon as the range is there.
  const shown: Partial<Record<AskField, string>> = {};
  for (const field of ["kind", "dates", "time"] as const) {
    const text = problems[field];
    const missing = text === "Choose a type." || text === "Choose the days you need off.";
    if (text && (tried || !missing)) shown[field] = text;
  }
  if (refusal?.field && !shown[refusal.field]) shown[refusal.field] = refusal.text;
  const end = draft.end || draft.start;
  // The phone's box (Karma): the shifts an approval would open, once the days and hours stand.
  const rangeReady = Boolean(draft.start) && !problems.dates && !problems.time;
  const shifts = useMyTimeOffShifts(
    workspaceId,
    phone && rangeReady
      ? { start: draft.start, end, ...(draft.allDay ? {} : { from: draft.from, to: draft.to }) }
      : null,
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    if (sending || Object.keys(problems).length || !draft.kind) return;
    if (!zone) {
      setRefusal(refusalText("time_off.no_location"));
      return;
    }
    try {
      await onSend({
        kind_of_leave: draft.kind,
        start_date: draft.start,
        end_date: end,
        all_day: draft.allDay,
        start_time: draft.allDay ? null : draft.from,
        end_time: draft.allDay ? null : draft.to,
        note: draft.note.trim() || null,
        expected_timezone: zone,
        client_key: key.current,
      });
    } catch (error) {
      const reason = (error as { reason?: string }).reason;
      if (reason === "time_off.key_reused") key.current = crypto.randomUUID();
      setRefusal(refusalText(reason));
    }
  }

  const msg = (field: AskField) => `${ids}-${field}-msg`;
  const described = (field: AskField) => (shown[field] ? msg(field) : undefined);

  const kindField = (
    <KindField ids={ids} phone={phone} kind={draft.kind} message={shown.kind} describedBy={described("kind")} onChange={(kind) => change({ kind })} />
  );

  const dates = (
    <RangeFields
      ids={ids}
      draft={draft}
      minDate={now.date}
      quick={quick}
      onQuick={setQuick}
      change={change}
      messages={shown}
      describedBy={described}
      timeFormat={timeFormat}
    />
  );

  const note = (
    <label className="tor-field" htmlFor={`${ids}-note`}>
      <span className="tor-label">{phone ? "Note" : "Note for your manager"} <span className="tor-opt">Optional</span></span>
      <textarea
        id={`${ids}-note`}
        maxLength={1000}
        placeholder="Anything your manager should know"
        value={draft.note}
        onChange={(event) => change({ note: event.target.value })}
      />
      <span className="tor-count">{draft.note.length} / 1000</span>
    </label>
  );

  return (
    <form id={formId} className="tor-form" noValidate onSubmit={submit} aria-busy={sending}>
      {phone ? null : <SummaryCard draft={draft} timeFormat={timeFormat} />}
      {kindField}
      {dates}
      {note}
      {phone && rangeReady && shifts.data?.count ? (
        <div className="tor-alert" role="note">
          <Info size={18} aria-hidden className="tor-i" />
          <div>
            <strong>
              {shifts.data.count === 1 ? "1 shift goes to open shifts if approved" : `${shifts.data.count} shifts go to open shifts if approved`}
            </strong>
            <ul>
              {shifts.data.shifts.map((shift) => (
                <li key={shift.id}>
                  {dayText(shift.scheduled_date)}, {clockText(shift.start_time, timeFormat)} to {clockText(shift.end_time, timeFormat)}{" "}
                  <span className="tor-loc">{shift.location_name}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
      {refusal && !refusal.field ? (
        <p className="tor-err" role="alert"><AlertCircle size={15} aria-hidden /><span>{refusal.text}</span></p>
      ) : null}
    </form>
  );
}

/** The top of the desktop drawer: the kind, the dates large, how long. */
export function SummaryCard({ draft, timeFormat }: { draft: AskDraft; timeFormat: TimeFormat }) {
  const end = draft.end || draft.start;
  let meta = "";
  if (draft.start && end >= draft.start) {
    const days = timeOffDayCount(draft.start, end);
    const when = draft.start === end ? weekday(draft.start) : `${weekday(draft.start)} to ${weekday(end)}`;
    meta = `${when}, ${draft.allDay ? (days === 1 ? "all day" : `${days} days, all day`) : `${clockText(draft.from, timeFormat)} to ${clockText(draft.to, timeFormat)}`}`;
  }
  return (
    <div className="tor-sumcard" aria-live="polite">
      {draft.kind ? (
        <span className="tor-tk-type"><LeaveIcon kind={draft.kind} size={15} />{leaveLabel(draft.kind)}</span>
      ) : (
        <span className="tor-tk-type is-empty">Choose a type</span>
      )}
      <p className={`tor-tk-dates${draft.start ? "" : " is-empty"}`}>
        {draft.start ? (draft.start === end || !end ? monthDay(draft.start) : `${monthDay(draft.start)} – ${monthDay(end)}`) : "Pick your days"}
      </p>
      {meta ? <p className="tor-tk-meta">{meta}</p> : null}
    </div>
  );
}

/** The kind: a select with its hint on a phone, the described radio list on a computer. */
export function KindField({
  ids,
  phone,
  kind,
  message,
  describedBy,
  onChange,
}: {
  ids: string;
  phone: boolean;
  kind: AskDraft["kind"];
  message: string | undefined;
  describedBy: string | undefined;
  onChange: (kind: AskDraft["kind"]) => void;
}) {
  const msgId = `${ids}-kind-msg`;
  return phone ? (
    <Field
      label={<label htmlFor={`${ids}-kind`}>Type</label>}
      hint={kind ? leaveKinds.find((k) => k.kind === kind)?.hint : "Sick covers you or someone you care for."}
      message={<FieldMessage id={msgId} text={message} />}
    >
      <select
        id={`${ids}-kind`}
        value={kind ?? ""}
        aria-invalid={message ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event) => onChange((event.target.value || null) as AskDraft["kind"])}
      >
        <option value="" disabled>Choose a type</option>
        {leaveKinds.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
      </select>
    </Field>
  ) : (
    <Field label={<span id={`${ids}-kind-l`}>What kind of time off?</span>} message={<FieldMessage id={msgId} text={message} />}>
      <div className="tor-radiolist" role="radiogroup" aria-labelledby={`${ids}-kind-l`} aria-describedby={describedBy}>
        {leaveKinds.map((k) => (
          <label key={k.kind}>
            <input type="radio" name={`${ids}-kind`} value={k.kind} checked={kind === k.kind} onChange={() => onChange(k.kind)} />
            <span><strong>{k.label}</strong><small>{k.hint}</small></span>
          </label>
        ))}
      </div>
    </Field>
  );
}

/** The days and hours: Tomorrow / This weekend / Next week, First day and Last day, All day, the clocks. */
export function RangeFields({
  ids,
  draft,
  minDate,
  quick,
  onQuick,
  change,
  messages,
  describedBy,
  timeFormat,
  label = "Which days?",
}: {
  ids: string;
  draft: AskDraft;
  /** The first day the date fields offer (today at the location). */
  minDate: string;
  quick: string | null;
  onQuick: (which: string | null) => void;
  change: (next: Partial<AskDraft>) => void;
  messages: Partial<Record<AskField, string>>;
  describedBy: (field: AskField) => string | undefined;
  timeFormat: TimeFormat;
  label?: string;
}) {
  const end = draft.end || draft.start;
  const multi = Boolean(draft.start && end && draft.start !== end);
  const msg = (field: AskField) => `${ids}-${field}-msg`;

  // One calendar picks both days (Mert 2026-10-23): a day clicked is the first day and the calendar waits for
  // the last, the days between banded under the pointer; a day before the first starts over. Last day opens it
  // waiting. Escape or a click outside closes it.
  const [calendar, setCalendar] = useState<"start" | "end" | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const box = useRef<HTMLDivElement | null>(null);
  useCloseOnEscape(calendar ? () => setCalendar(null) : null);
  useEffect(() => {
    if (!calendar) return;
    const away = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setCalendar(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [calendar]);
  const waiting = calendar === "end";
  function openAt(field: "start" | "end") {
    const next = field === "end" && draft.start ? "end" : "start";
    setHover(null);
    setCalendar(calendar === next ? null : next);
  }
  function pick(day: string) {
    onQuick(null);
    setHover(null);
    if (waiting && day >= draft.start) {
      change({ end: day });
      setCalendar(null);
    } else {
      change({ start: day, end: "" });
      setCalendar("end");
    }
  }
  const dayField = (field: "start" | "end", label: string, value: string) => (
    <div className="tor-field">
      <span className="tor-sublabel" id={`${ids}-${field}-l`}>{label}</span>
      <button
        type="button"
        id={`${ids}-${field}`}
        className="tor-day"
        aria-labelledby={`${ids}-${field}-l ${ids}-${field}`}
        aria-haspopup="dialog"
        aria-expanded={calendar === field}
        aria-describedby={describedBy("dates")}
        data-invalid={messages.dates ? "true" : undefined}
        onClick={() => openAt(field)}
      >
        <span className={value ? undefined : "tor-day-empty"}>{value ? dayText(value) : "Choose a day"}</span>
        <CalendarDays size={16} aria-hidden />
      </button>
    </div>
  );

  return (
    <>
      <Field label={label} message={<FieldMessage id={msg("dates")} text={messages.dates} />}>
        <div className="tor-quick" role="group" aria-label="Quick dates">
          {QUICK.map(([which, text]) => (
            <button
              key={which}
              type="button"
              aria-pressed={quick === which}
              onClick={() => {
                const range = quickRange(which, minDate);
                change({ start: range.start, end: range.end, allDay: true });
                onQuick(which);
              }}
            >
              {text}
            </button>
          ))}
        </div>
        <div className="tor-two tor-days" ref={box}>
          {dayField("start", "First day", draft.start)}
          {/* Waiting for the last day, it shows none until one is clicked. */}
          {dayField("end", "Last day", waiting && !draft.end ? "" : end)}
          {calendar ? (
            <div className="schedule-mini-calendar-panel tor-calendar" role="dialog" aria-label={waiting ? "Pick the last day" : "Pick the first day"}>
              <MiniCalendar
                selectedDate={draft.start || null}
                rangeEnd={draft.start ? (waiting && hover && hover >= draft.start ? hover : end) : null}
                weekStartDate={draft.start || minDate}
                weekStartDay="sunday"
                today={minDate}
                minDate={minDate}
                onDayHover={setHover}
                onDayPick={pick}
              />
            </div>
          ) : null}
        </div>
      </Field>
      <label className="tor-check">
        <input type="checkbox" checked={draft.allDay} onChange={(event) => change({ allDay: event.target.checked })} />
        All day
      </label>
      {draft.allDay ? null : (
        <div className="tor-field">
          <div className="tor-two">
            <label className="tor-field" htmlFor={`${ids}-from`}>
              <span className="tor-label">{multi ? `Starts ${monthDay(draft.start)} at` : "From"}</span>
              <select id={`${ids}-from`} value={draft.from} aria-describedby={describedBy("time")} onChange={(event) => change({ from: event.target.value })}>
                {CLOCKS.map((c) => <option key={c} value={c}>{clockText(c, timeFormat)}</option>)}
              </select>
            </label>
            <label className="tor-field" htmlFor={`${ids}-to`}>
              <span className="tor-label">{multi ? `Ends ${monthDay(end)} at` : "To"}</span>
              <select id={`${ids}-to`} value={draft.to} aria-describedby={describedBy("time")} onChange={(event) => change({ to: event.target.value })}>
                {CLOCKS.map((c) => <option key={c} value={c}>{clockText(c, timeFormat)}</option>)}
                <option value="24:00">End of day</option>
              </select>
            </label>
          </div>
          <FieldMessage id={msg("time")} text={messages.time} />
        </div>
      )}
    </>
  );
}
