import { timeOffOpenedShiftCount, type TimeOffImpactShift, type TimeOffRequest } from "@newfork/shared";
import { ConfirmButton } from "@newfork/ui";
import { useEffect, useState, type ReactNode } from "react";
import { formatAvailabilityClock } from "../availability/AvailabilityClockInput";
import { TimeOffPeriods } from "../employee-hub/TimeOffPeriods";
import { TimeOffReleasedAssignments } from "../employee-hub/TimeOffReleasedAssignments";
import { formatTimeOffDay, formatTimeOffDeadline } from "../employee-hub/time-off-split";
import { alsoOffDays, type AlsoOff } from "../schedule/time-off-overlap";
import { DrawerField, DrawerSection, RequestDrawer, type DrawerNotice, type DrawerTone } from "./RequestDrawer";

type Tab = "details" | "shifts" | "activity";

/**
 * Requests → a time off row (Mert, 2026-10-11). Details says when, why, who
 * approved where and what the Schedule loses; Shifts lists the shifts that
 * open; Activity is the history. The footer decides: Deny asks its reason in
 * place (optional, as the core has it), Approve keeps the confirm for the
 * approval that opens shifts.
 */
export function TimeOffReview({
  request,
  alsoOff,
  timeFormat,
  notice,
  busy,
  canRevoke,
  denyError,
  onClose,
  onApprove,
  onDeny,
  onRevoke,
  onHold,
  shorten,
  shortenError = null,
}: {
  request: TimeOffRequest;
  alsoOff: AlsoOff[];
  timeFormat: "12h" | "24h";
  notice: DrawerNotice | null;
  busy: boolean;
  canRevoke: boolean;
  denyError: string;
  onClose: () => void;
  onApprove: () => void;
  onDeny: (reason: string) => void;
  onRevoke: () => void;
  /** True while a reason is being written: the page keeps the drawer open (P26). */
  onHold?: (held: boolean) => void;
  shorten?: ReactNode;
  /** Shorten's server sentence, said in the drawer's band (UI-FIELDMSG-2). */
  shortenError?: string | null;
}) {
  const [tab, setTab] = useState<Tab>("details");
  const [denying, setDenying] = useState(false);
  const [reason, setReason] = useState("");
  const cancellation = request.request_type === "time_off_cancellation";
  const progress = request.progress;
  const canVote = Boolean(progress && (progress.can_vote || progress.can_decide_alone));
  const revocable = !cancellation && request.status === "approved" && canRevoke;
  const opening = progress ? timeOffOpenedShiftCount(progress) : 0;
  const zone = request.segments[0]?.time_timezone;
  const first = request.employee_name.split(" ")[0] ?? request.employee_name;
  const held = canVote && denying && reason.trim() !== "";
  useEffect(() => {
    onHold?.(held);
    return () => onHold?.(false);
  }, [held, onHold]);
  const tabs = [
    { key: "details" as const, label: "Details" },
    ...(progress?.impact ? [{ key: "shifts" as const, label: "Shifts", count: opening }] : []),
    { key: "activity" as const, label: "Activity" },
  ];
  const sub =
    request.status === "pending" && progress?.decide_by && zone
      ? `Decide by ${formatTimeOffDeadline(progress.decide_by, zone, timeFormat)}`
      : `Submitted ${formatDate(request.created_at)}`;

  let footer: ReactNode;
  if (canVote && denying) {
    footer = (
      // Esc in the reason goes back to the decision and keeps what was typed (P26).
      <div
        className="rd-step"
        onKeyDown={(event) => {
          if (event.key !== "Escape" || event.defaultPrevented || busy) return;
          event.preventDefault();
          setDenying(false);
        }}
      >
        {cancellation ? <p className="rd-foot-note">The time off stays in place.</p> : null}
        <label className="rd-field">
          <span className="rd-label">Reason for {first}</span>
          <textarea
            className="rd-textarea"
            rows={3}
            maxLength={1000}
            autoFocus
            value={reason}
            placeholder={`Optional. Only ${first} reads this.`}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <div className="rd-foot-row">
          <button type="button" className="nf-button secondary-button" disabled={busy} onClick={() => setDenying(false)}>
            Back
          </button>
          <div className="rd-foot-actions">
            <ConfirmButton
              className="danger-button"
              confirmLabel={cancellation ? "Confirm decline" : "Confirm deny"}
              disabled={busy}
              onConfirm={() => onDeny(reason.trim())}
            >
              {busy ? "Saving..." : cancellation ? "Decline cancellation" : "Deny request"}
            </ConfirmButton>
          </div>
        </div>
      </div>
    );
  } else if (canVote) {
    footer = (
      <div className="rd-foot-row">
        <p className="rd-foot-note">{approvalNote(progress!)}</p>
        <div className="rd-foot-actions">
          <button type="button" className="nf-button secondary-button" disabled={busy} onClick={() => setDenying(true)}>
            {cancellation ? "Decline" : "Deny"}
          </button>
          <button type="button" className="nf-button" disabled={busy || !progress?.impact} onClick={onApprove}>
            Approve
          </button>
        </div>
      </div>
    );
  } else if (revocable) {
    footer = (
      <div className="rd-foot-row">
        {shorten}
        <div className="rd-foot-actions">
          <button type="button" className="nf-button danger-button" disabled={busy} onClick={onRevoke}>
            Revoke
          </button>
        </div>
      </div>
    );
  } else {
    footer = <p className="view-only-note">View-only access</p>;
  }

  return (
    <RequestDrawer
      title={request.employee_name}
      type={cancellation ? "Cancellation" : "Time off"}
      status={statusChip(request)}
      sub={sub}
      scheduleHref={`/app/schedule?date=${request.start_date}&view=week`}
      tabs={tabs}
      tab={tab}
      onTab={setTab}
      notice={notice}
      onClose={onClose}
      footer={footer}
      footerAlert={[canVote && denying ? denyError : null, shortenError].filter(Boolean).join(" ") || null}
    >
      {tab === "details" ? (
        <Details request={request} first={first} alsoOff={alsoOff} opening={opening} timeFormat={timeFormat} onSeeShifts={() => setTab("shifts")} />
      ) : tab === "shifts" ? (
        <Shifts request={request} timeFormat={timeFormat} />
      ) : (
        <Activity events={request.events} timeFormat={timeFormat} />
      )}
    </RequestDrawer>
  );
}

function Details({ request, first, alsoOff, opening, timeFormat, onSeeShifts }: {
  request: TimeOffRequest; first: string; alsoOff: AlsoOff[]; opening: number; timeFormat: "12h" | "24h"; onSeeShifts: () => void;
}) {
  const cancellation = request.request_type === "time_off_cancellation";
  const progress = request.progress;
  const segments = [...request.segments].sort((a, b) => a.segment_date.localeCompare(b.segment_date));
  const days = dayCount(request.start_date, request.end_date);
  const startHours = hoursOf(segments.find((segment) => segment.segment_date === request.start_date), timeFormat);
  const endHours = hoursOf([...segments].reverse().find((segment) => segment.segment_date === request.end_date), timeFormat);
  // The periods list carries what Starts and Ends cannot: hours on a middle day,
  // given-back hours, a repeated clock hour.
  const detailed = cancellation || segments.some((segment) =>
    segment.start_time || segment.cancelled_intervals?.length || segment.fold_choices?.start_fold || segment.fold_choices?.end_fold);
  const approved = progress?.locations.filter((place) => place.approved_by).length ?? 0;
  const total = progress?.locations.length ?? 0;
  return (
    <>
      <DrawerSection>
        <div className="rd-grid">
          <DrawerField label="Starts">
            {formatTimeOffDay(request.start_date)}
            <small>{startHours}</small>
          </DrawerField>
          <DrawerField label="Ends">
            {formatTimeOffDay(request.end_date)}
            <small>{endHours} · {days} {days === 1 ? "day" : "days"}</small>
          </DrawerField>
        </div>
        {cancellation ? (
          <p className="rd-note">Cancellation of approved time off. The time off stays in place until this is approved.</p>
        ) : null}
        {request.cancellation?.pending_request_id ? (
          <p className="rd-note">A cancellation request is waiting. The time off is still in effect.</p>
        ) : null}
        {request.reason ? (
          <DrawerField label={`Note from ${first}`}>
            <blockquote className="rd-quote">{request.reason}</blockquote>
          </DrawerField>
        ) : null}
        {detailed ? (
          <DrawerField label="Requested periods">
            <TimeOffPeriods periods={request.segments} timeFormat={timeFormat} requestStatus={request.status} cancellation={cancellation} />
          </DrawerField>
        ) : null}
      </DrawerSection>
      {progress ? (
        <DrawerSection
          title="Approvals"
          aside={progress.fallback ? null : <span>{approved} of {total} {total === 1 ? "location" : "locations"}</span>}
        >
          {progress.fallback ? <p className="rd-note">No location manager can decide. An admin or owner decides.</p> : null}
          {progress.my_vote ? <p className="rd-note">Your vote: {progress.my_vote === "approve" ? "Approved" : "Denied"}</p> : null}
          {total ? (
            <table className="rd-locs">
              <thead>
                <tr>
                  <th scope="col">Location</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="rd-who">Who</th>
                </tr>
              </thead>
              <tbody>
                {progress.locations.map((place) => {
                  const who = place.approved_by ? `${place.approved_by_name} · ${formatInstant(place.approved_at!)}` : "Not yet";
                  return (
                    <tr key={place.id}>
                      <th scope="row">
                        {place.name}
                        <small className="rd-who-phone">{who}</small>
                      </th>
                      <td>
                        <span className={`rd-chip ${place.approved_by ? "ok" : "warn"}`}>{place.approved_by ? "Approved" : "Waiting"}</span>
                      </td>
                      <td className="rd-who">{who}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : null}
        </DrawerSection>
      ) : null}
      {progress?.impact ? (
        <DrawerSection
          title="On the Schedule"
          aside={opening ? (
            <button type="button" className="nf-button secondary-button rd-small" onClick={onSeeShifts}>
              See {opening} {opening === 1 ? "shift" : "shifts"}
            </button>
          ) : null}
        >
          <p className={opening ? "rd-note warn" : "rd-note"}>
            {opening ? `${opening} ${opening === 1 ? "shift becomes" : "shifts become"} open if you approve.` : "No published shifts change."}
          </p>
          {cancellation ? null : (
            <DrawerField label="Also off these days">
              {alsoOff.length ? alsoOff.map((entry) => `${entry.name} (${alsoOffDays(entry)})`).join(", ") : "Nobody else"}
            </DrawerField>
          )}
        </DrawerSection>
      ) : null}
    </>
  );
}

function Shifts({ request, timeFormat }: { request: TimeOffRequest; timeFormat: "12h" | "24h" }) {
  const impact = request.progress?.impact;
  // A shift can open at a location that is not asked to vote.
  const places = Object.entries(impact?.locations ?? {}).filter(([, place]) => place.shifts.length);
  const hidden = impact?.hidden_shift_count ?? 0;
  const count = places.reduce((sum, [, place]) => sum + place.shifts.length, hidden);
  return (
    <DrawerSection title="Shifts that become open" aside={<span>{count} {count === 1 ? "shift" : "shifts"}</span>}>
      <p className="rd-note">When you approve, these shifts become open shifts on the Schedule. Nobody is moved onto them for you.</p>
      {places.map(([id, place]) => (
        <div key={id} className="rd-group">
          <div className="rd-group-head">{place.shifts[0]!.location_name}</div>
          {place.shifts.map((shift) => (
            <div key={shift.id} className="rd-row">
              <span className="rd-avatar empty" aria-hidden />
              <span className="rd-row-main">
                <b>{formatTimeOffDay(shift.scheduled_date)} · {shiftHours(shift, timeFormat)}</b>
                <span>{shift.job_name}</span>
              </span>
              <span className="rd-chip warn">Becomes open</span>
            </div>
          ))}
        </div>
      ))}
      {!places.length && !hidden ? <p className="rd-note">No published shifts change.</p> : null}
      {hidden ? <p className="rd-note">{hidden} more shift{hidden === 1 ? "" : "s"} at locations you can't see</p> : null}
    </DrawerSection>
  );
}

function Activity({ events, timeFormat }: { events: TimeOffRequest["events"]; timeFormat: "12h" | "24h" }) {
  return (
    <DrawerSection title="Activity">
      {events.length ? (
        <ol className="rd-activity">
          {events.map((event) => (
            <li key={event.id}>
              <i aria-hidden />
              <div>
                <b>{statusLabel(event.action)}</b>
                <span>{event.actor_name} · {formatInstant(event.created_at)}</span>
                {event.note ? <p className="rd-quote">{event.note}</p> : null}
                <TimeOffReleasedAssignments assignments={event.released_assignments} timeFormat={timeFormat} />
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="rd-note">Nothing has happened yet.</p>
      )}
    </DrawerSection>
  );
}

function approvalNote(progress: NonNullable<TimeOffRequest["progress"]>) {
  if (progress.can_decide_alone) return "Your approval takes effect now.";
  if (progress.my_approval_finalizes) return "Yours is the last approval.";
  const after = Math.max(1, progress.remaining - 1);
  return `${after} more ${after === 1 ? "location approves" : "locations approve"} after you.`;
}

function statusChip(request: TimeOffRequest): { label: string; tone: DrawerTone } {
  const progress = request.progress;
  if (request.status === "pending")
    return progress && (progress.can_decide_alone || (progress.can_vote && !progress.my_vote))
      ? { label: "Needs review", tone: "warn" }
      : { label: "In progress", tone: "grey" };
  if (request.status === "approved") return { label: "Approved", tone: "ok" };
  if (request.status === "denied") return { label: "Denied", tone: "red" };
  return { label: statusLabel(request.status), tone: "grey" };
}

function hoursOf(segment: TimeOffRequest["segments"][number] | undefined, timeFormat: "12h" | "24h") {
  if (!segment?.start_time || !segment.end_time) return "Full day";
  return `${formatAvailabilityClock(segment.start_time, timeFormat)} – ${formatAvailabilityClock(segment.end_time, timeFormat)}`;
}
function shiftHours(shift: TimeOffImpactShift, timeFormat: "12h" | "24h") {
  if (shift.time_unknown || !shift.start_time || !shift.end_time) return "Hours need verification";
  return `${formatAvailabilityClock(shift.start_time, timeFormat)} – ${formatAvailabilityClock(shift.end_time, timeFormat)}`;
}
function dayCount(start: string, end: string) {
  return Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000) + 1;
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
function formatInstant(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
function statusLabel(value: string) {
  const text = value.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
