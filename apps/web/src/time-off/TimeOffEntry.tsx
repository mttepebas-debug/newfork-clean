import type { TimeOffDeciderView } from "@newfork/shared";
import { Button } from "@newfork/ui";
import { AlertCircle, Info } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";
import { usePhoneWidth } from "../lib/usePhoneWidth";
import { blankDraft, Field, FieldMessage, KindField, RangeFields, SummaryCard } from "./TimeOffAskForm";
import { TimeOffSheet } from "./TimeOffSheet";
import { useEnterTimeOff, useTimeOffEntryImpact, useTimeOffEntryPeople } from "./time-off-data";
import { clockText, dayText, entryDraftProblems, entryRefusalText, shiftsText, type AskDraft, type AskField, type TimeFormat } from "./time-off-text";
import "./time-off-requests.css";

type EntryField = AskField | "person";

/**
 * Requests → Time off → Add time off (time off rebuild D5, KARARLAR S-239 (6)): whoever may answer a person's
 * time off adds approved time off for them. It is a record, not a request. The drawer speaks the employee
 * form's language (Karma): from the right on a computer, from the bottom on a phone; the person first, then
 * the summary, the kind, the days and hours, the note, and the shifts that go to open shifts. Adding asks
 * first when shifts open; a refusal stays beside its field and the form keeps everything.
 */
export function TimeOffEntry({
  workspaceId,
  timeFormat,
  onClose,
  onAdded,
}: {
  workspaceId: string;
  timeFormat: TimeFormat;
  onClose: () => void;
  onAdded: (entered: TimeOffDeciderView) => void;
}) {
  const phone = usePhoneWidth();
  const ids = useId();
  const formId = `${ids}-form`;
  const people = useTimeOffEntryPeople(workspaceId);
  const enter = useEnterTimeOff(workspaceId);
  const [personId, setPersonId] = useState("");
  const [draft, setDraft] = useState<AskDraft>(blankDraft);
  const [quick, setQuick] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [refusal, setRefusal] = useState<{ field: EntryField | null; text: string } | null>(null);
  const [asking, setAsking] = useState(false);
  // One key per version of the form: adding again after a failure is the same entry, any edit a new one.
  const key = useRef(crypto.randomUUID());

  const everyone = people.data?.people ?? [];
  const person = everyone.find((p) => p.employee_id === personId) ?? null;
  const first = person ? (person.name.split(" ")[0] ?? person.name) : "";
  const today = person?.today ?? everyone[0]?.today ?? new Date().toISOString().slice(0, 10);

  function change(next: Partial<AskDraft>) {
    key.current = crypto.randomUUID();
    setRefusal(null);
    setAsking(false);
    setDraft((d) => ({ ...d, ...next }));
  }

  const problems = entryDraftProblems(draft, today, Boolean(person));
  const end = draft.end || draft.start;
  const rangeReady = Boolean(person && draft.start) && !problems.dates && !problems.time;
  const impact = useTimeOffEntryImpact(
    workspaceId,
    rangeReady && person
      ? { employee_id: person.employee_id, start: draft.start, end, ...(draft.allDay ? {} : { from: draft.from, to: draft.to }) }
      : null,
  );
  const read = rangeReady ? impact.data : undefined;

  // Missing answers wait for Add; a rule a range breaks shows as soon as the range is there.
  const shown: Partial<Record<EntryField, string>> = {};
  for (const field of ["person", "kind", "dates", "time"] as const) {
    const text = problems[field];
    const missing = text === "Choose an employee." || text === "Choose a type." || text === "Choose the days off.";
    if (text && (tried || !missing)) shown[field] = text;
  }
  if (read?.overlap && !shown.dates)
    shown.dates = entryRefusalText(read.overlap === "pending" ? "time_off.pending_overlap" : "time_off.overlap", first).text;
  if (refusal?.field && !shown[refusal.field]) shown[refusal.field] = refusal.text;
  const msg = (field: EntryField) => `${ids}-${field}-msg`;
  const described = (field: EntryField) => (shown[field] ? msg(field) : undefined);

  async function send() {
    if (!person || !draft.kind || !read) return;
    setAsking(false);
    try {
      const result = await enter.mutateAsync({
        employee_id: person.employee_id,
        kind_of_leave: draft.kind,
        start_date: draft.start,
        end_date: end,
        all_day: draft.allDay,
        start_time: draft.allDay ? null : draft.from,
        end_time: draft.allDay ? null : draft.to,
        note: draft.note.trim() || null,
        expected_timezone: read.time_zone,
        expected_impact: read.fingerprint,
        client_key: key.current,
      });
      onAdded(result);
    } catch (error) {
      const reason = (error as { reason?: string }).reason;
      if (reason === "time_off.key_reused") key.current = crypto.randomUUID();
      // The shifts or the zone moved on: read them again before the next try.
      if (reason === "time_off.changed" || reason === "time_off.timezone_changed") void impact.refetch();
      setRefusal(entryRefusalText(reason, first));
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    if (enter.isPending || Object.keys(problems).length || !read || read.overlap) return;
    if (read.shift_count > 0) setAsking(true);
    else void send();
  }

  const shiftsBox = !rangeReady ? null : impact.isError ? (
    <p className="tor-err" role="alert"><AlertCircle size={15} aria-hidden /><span>Couldn't check the shifts in these days. Try again.</span></p>
  ) : !read ? (
    <p className="tor-fdesc toe-checking">Checking shifts…</p>
  ) : read.shift_count === 0 ? (
    <p className="tor-note-line"><Info size={15} aria-hidden /><span>No shift goes to open shifts.</span></p>
  ) : (
    <div className="tor-alert" role="note">
      <Info size={18} aria-hidden className="tor-i" />
      <div>
        <strong>{shiftsText(read.shift_count, "go")} to open shifts</strong>
        <ul>
          {read.locations.flatMap((place) =>
            place.shifts.map((shift) => (
              <li key={shift.id}>
                {dayText(shift.scheduled_date)}, {clockText(shift.start_time, timeFormat)} to {clockText(shift.end_time, timeFormat)} · {shift.job_name}{" "}
                <span className="tor-loc">{place.location_name}</span>
              </li>
            )),
          )}
        </ul>
        {read.hidden_shift_count ? (
          <p className="toe-hidden">
            {read.hidden_shift_count === 1
              ? "1 more at a location whose schedule you don't see."
              : `${read.hidden_shift_count} more at locations whose schedule you don't see.`}
          </p>
        ) : null}
      </div>
    </div>
  );

  const pending = enter.isPending;
  const addLabel = pending ? "Adding…" : "Add time off";
  const footer = asking && read ? (
    <div className="toe-confirm" role="alertdialog" aria-labelledby={`${ids}-ask`} aria-describedby={`${ids}-ask-text`}>
      <div className="toe-confirm-text">
        <strong id={`${ids}-ask`}>Add time off for {first}?</strong>
        <span id={`${ids}-ask-text`}>{shiftsText(read.shift_count, "go")} to open shifts.</span>
      </div>
      <div className="toe-confirm-actions">
        <Button className="secondary-button" disabled={pending} onClick={() => setAsking(false)}>
          Go back
        </Button>
        <Button disabled={pending} onClick={() => void send()}>
          {addLabel}
        </Button>
      </div>
    </div>
  ) : phone ? (
    <>
      <Button className="secondary-button" onClick={onClose} disabled={pending}>Cancel</Button>
      <Button type="submit" form={formId} disabled={pending}>{addLabel}</Button>
    </>
  ) : (
    <>
      <button type="button" className="tor-link tor-cancel" onClick={onClose} disabled={pending}>Cancel</button>
      <Button type="submit" form={formId} disabled={pending}>{addLabel}</Button>
    </>
  );

  return (
    <TimeOffSheet title="Add time off" phone={phone} busy={pending} onClose={onClose} footer={footer}>
      <form id={formId} className="tor-form" noValidate onSubmit={submit} aria-busy={pending}>
        <Field
          label={<label htmlFor={`${ids}-person`}>Employee</label>}
          hint={person ? person.location_names.join(" · ") : "Time off you add is approved at once."}
          message={<FieldMessage id={msg("person")} text={shown.person} />}
        >
          <select
            id={`${ids}-person`}
            value={personId}
            disabled={!people.isSuccess}
            aria-invalid={shown.person ? true : undefined}
            aria-describedby={described("person")}
            onChange={(event) => {
              setPersonId(event.target.value);
              change({});
            }}
          >
            <option value="" disabled>
              {people.isPending ? "Loading…" : "Choose an employee"}
            </option>
            {everyone.map((p) => (
              <option key={p.employee_id} value={p.employee_id}>
                {p.name}
              </option>
            ))}
          </select>
          {people.isError ? <FieldMessage id={`${ids}-people-msg`} text="Couldn't load the people. Close and try again." /> : null}
          {people.isSuccess && !everyone.length ? <p className="tor-fdesc">There is nobody you can add time off for.</p> : null}
        </Field>
        {phone ? null : <SummaryCard draft={draft} timeFormat={timeFormat} />}
        <KindField ids={ids} phone={phone} kind={draft.kind} message={shown.kind} describedBy={described("kind")} onChange={(kind) => change({ kind })} />
        <RangeFields
          ids={ids}
          draft={draft}
          minDate={today}
          quick={quick}
          onQuick={setQuick}
          change={change}
          messages={shown}
          describedBy={described}
          timeFormat={timeFormat}
        />
        <label className="tor-field" htmlFor={`${ids}-note`}>
          <span className="tor-label">
            {first ? `Note for ${first}` : "Note for the employee"} <span className="tor-opt">Optional</span>
          </span>
          <textarea
            id={`${ids}-note`}
            maxLength={1000}
            placeholder="Shown to them with the time off"
            value={draft.note}
            onChange={(event) => change({ note: event.target.value })}
          />
          <span className="tor-count">{draft.note.length} / 1000</span>
        </label>
        {shiftsBox}
        {refusal && !refusal.field ? (
          <p className="tor-err" role="alert"><AlertCircle size={15} aria-hidden /><span>{refusal.text}</span></p>
        ) : null}
      </form>
    </TimeOffSheet>
  );
}
