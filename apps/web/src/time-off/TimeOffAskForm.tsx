import type { TimeOffAskInput } from "@newfork/shared";
import { AlertCircle } from "lucide-react";
import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { LeaveIcon } from "./leave-icon";
import {
  clockText,
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

function FieldMessage({ id, text }: { id: string; text: string | undefined }) {
  if (!text) return null;
  return (
    <p className="tor-fmsg" id={id} role="alert">
      <AlertCircle size={14} aria-hidden />
      <span>{text}</span>
    </p>
  );
}

function Field({ label, children, hint, message }: { label: ReactNode; children: ReactNode; hint?: ReactNode; message?: ReactNode }) {
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
  formId,
  phone,
  zone,
  now,
  timeFormat,
  sending,
  onSend,
}: {
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

  const kindField = phone ? (
    <Field
      label={<label htmlFor={`${ids}-kind`}>Type</label>}
      hint={draft.kind ? leaveKinds.find((k) => k.kind === draft.kind)?.hint : "Sick covers you or someone you care for."}
      message={<FieldMessage id={msg("kind")} text={shown.kind} />}
    >
      <select
        id={`${ids}-kind`}
        value={draft.kind ?? ""}
        aria-invalid={shown.kind ? true : undefined}
        aria-describedby={described("kind")}
        onChange={(event) => change({ kind: (event.target.value || null) as AskDraft["kind"] })}
      >
        <option value="" disabled>Choose a type</option>
        {leaveKinds.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
      </select>
    </Field>
  ) : (
    <Field label={<span id={`${ids}-kind-l`}>What kind of time off?</span>} message={<FieldMessage id={msg("kind")} text={shown.kind} />}>
      <div className="tor-radiolist" role="radiogroup" aria-labelledby={`${ids}-kind-l`} aria-describedby={described("kind")}>
        {leaveKinds.map((k) => (
          <label key={k.kind}>
            <input type="radio" name={`${ids}-kind`} value={k.kind} checked={draft.kind === k.kind} onChange={() => change({ kind: k.kind })} />
            <span><strong>{k.label}</strong><small>{k.hint}</small></span>
          </label>
        ))}
      </div>
    </Field>
  );

  const multi = Boolean(draft.start && end && draft.start !== end);
  const dates = (
    <>
      <Field label="Which days?" message={<FieldMessage id={msg("dates")} text={shown.dates} />}>
        <div className="tor-quick" role="group" aria-label="Quick dates">
          {QUICK.map(([which, label]) => (
            <button
              key={which}
              type="button"
              aria-pressed={quick === which}
              onClick={() => {
                const range = quickRange(which, now.date);
                change({ start: range.start, end: range.end, allDay: true });
                setQuick(which);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="tor-two">
          <label className="tor-field" htmlFor={`${ids}-start`}>
            <span className="tor-sublabel">First day</span>
            <input
              id={`${ids}-start`}
              type="date"
              min={now.date}
              value={draft.start}
              aria-invalid={shown.dates ? true : undefined}
              aria-describedby={described("dates")}
              onChange={(event) => {
                setQuick(null);
                const start = event.target.value;
                change({ start, end: draft.end && draft.end < start ? start : draft.end });
              }}
            />
          </label>
          <label className="tor-field" htmlFor={`${ids}-end`}>
            <span className="tor-sublabel">Last day</span>
            <input
              id={`${ids}-end`}
              type="date"
              min={draft.start || now.date}
              value={end}
              aria-invalid={shown.dates ? true : undefined}
              aria-describedby={described("dates")}
              onChange={(event) => {
                setQuick(null);
                change({ end: event.target.value });
              }}
            />
          </label>
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
              <select id={`${ids}-from`} value={draft.from} aria-describedby={described("time")} onChange={(event) => change({ from: event.target.value })}>
                {CLOCKS.map((c) => <option key={c} value={c}>{clockText(c, timeFormat)}</option>)}
              </select>
            </label>
            <label className="tor-field" htmlFor={`${ids}-to`}>
              <span className="tor-label">{multi ? `Ends ${monthDay(end)} at` : "To"}</span>
              <select id={`${ids}-to`} value={draft.to} aria-describedby={described("time")} onChange={(event) => change({ to: event.target.value })}>
                {CLOCKS.map((c) => <option key={c} value={c}>{clockText(c, timeFormat)}</option>)}
                <option value="24:00">End of day</option>
              </select>
            </label>
          </div>
          <FieldMessage id={msg("time")} text={shown.time} />
        </div>
      )}
    </>
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
      {refusal && !refusal.field ? (
        <p className="tor-err" role="alert"><AlertCircle size={15} aria-hidden /><span>{refusal.text}</span></p>
      ) : null}
    </form>
  );
}

/** The top of the desktop drawer: the kind, the dates large, how long. */
function SummaryCard({ draft, timeFormat }: { draft: AskDraft; timeFormat: TimeFormat }) {
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
