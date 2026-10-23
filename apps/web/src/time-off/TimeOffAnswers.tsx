import type { TimeOffDeciderView } from "@newfork/shared";
import { Button, ConfirmButton } from "@newfork/ui";
import { Check } from "lucide-react";
import { useState, type ReactNode } from "react";
import { timeOffDeadlineAt, timeOffZoneName } from "../employee-hub/time-off-split";
import { CatalogDrawer } from "../settings/CatalogDrawer";
import { ConfirmDialog } from "../shell/ConfirmDialog";
import { ListOutline, LoadError } from "../shell/LoadState";
import { ListPagination, type ListPageSize } from "../views/ListPagination";
import { ListCards } from "../views/ListCards";
import { DrawerSection, RequestDrawer, type DrawerNotice } from "../views/RequestDrawer";
import { clockRange, KindIcon } from "../views/RequestsTable";
import { LeaveIcon } from "./leave-icon";
import {
  useAnswerTimeOff,
  useAnswerTimeOffCancellation,
  useTakeBackTimeOff,
  useTimeOffImpact,
  useTimeOffToAnswer,
} from "./time-off-data";
import {
  answerRefusalText,
  answerSentence,
  answerStatus,
  waitsUntil,
  dayText,
  edgeText,
  instantDay,
  leaveLabel,
  lengthText,
  monthDay,
  shiftsText,
  takeBackRefusalText,
  type TimeFormat,
} from "./time-off-text";
import "./time-off-answers.css";

// Requests → Time off with the new time off (time off rebuild D3, D7): the requests
// this person may answer, one sentence each (S-151), with the four words of S-161, paged by the server; and
// the answer drawer in the Requests drawers' language (Details · Shifts). Approving asks first when it opens
// shifts; declining takes two clicks; the answer is said in the drawer.
// D4: a cancellation is a request of its own ("… asks to cancel time off, …"), answered the same way without
// shifts; approved time off that is not over is revoked from its drawer with a note (two clicks).
// Mert 2026-10-23: the drawer's head says whose request it is, what it is and until when it waits; Details
// lists Name, Type, When (Start, End), Length, Asked.

const waiting = (request: TimeOffDeciderView) => answerStatus(request).label === "Needs decision";

function Sentence({ request, timeFormat }: { request: TimeOffDeciderView; timeFormat: TimeFormat }) {
  const parts = answerSentence(request, timeFormat);
  return (
    <>
      <b>{parts.name}</b>
      {parts.middle}
      <b>{parts.when}</b>
    </>
  );
}

function Expires({ request, timeFormat, phone = false }: { request: TimeOffDeciderView; timeFormat: TimeFormat; phone?: boolean }) {
  if (!waiting(request))
    return phone ? null : (
      <>
        <span className="request-expires request-expires--none" aria-hidden>
          —
        </span>
        <span className="sr-only">No expiry</span>
      </>
    );
  const at = timeOffDeadlineAt(waitsUntil(request), request.time_timezone, timeFormat);
  if (phone) return <span className="request-expires">Expires {at} {timeOffZoneName(request.time_timezone)}</span>;
  return (
    <span className="request-expires">
      <span>{at}</span>
      <small>{timeOffZoneName(request.time_timezone)}</small>
    </span>
  );
}

export function TimeOffAnswers({
  workspaceId,
  timeFormat,
  locationId,
  search,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  selectedId,
  onSelect,
}: {
  workspaceId: string;
  timeFormat: TimeFormat;
  locationId: string;
  search: string;
  page: number;
  pageSize: ListPageSize;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: ListPageSize) => void;
  /** The request whose drawer is open (the address's ?request=), or "". */
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const list = useTimeOffToAnswer(workspaceId, {
    view: "all",
    location_id: locationId || undefined,
    search: search.trim(),
    sort: "needs_decision",
    page,
    page_size: pageSize,
  });
  const rows = list.data?.requests ?? [];
  const listed = rows.find((row) => row.id === selectedId);
  // A link to a request this page does not show reads that one.
  const linked = useTimeOffToAnswer(workspaceId, { request_id: selectedId || undefined }, Boolean(selectedId && list.isSuccess && !listed));
  const selected = listed ?? linked.data?.requests.find((row) => row.id === selectedId) ?? null;
  const open = (row: TimeOffDeciderView) => onSelect(row.id);

  return (
    <>
      <div className="employee-table-wrap requests-table-wrap">
        {list.isSuccess && rows.length ? (
          <>
            <table className="employee-table requests-table">
              <colgroup>
                <col style={{ width: "64px" }} />
                <col />
                <col style={{ width: "190px" }} />
                <col style={{ width: "180px" }} />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">Type</span>
                  </th>
                  <th scope="col">Request</th>
                  <th scope="col">Status</th>
                  <th scope="col">Expires</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const status = answerStatus(row);
                  return (
                    <tr
                      key={row.id}
                      tabIndex={0}
                      aria-label={`Time off: ${answerSentence(row, timeFormat).text} ${status.label}`}
                      onClick={() => open(row)}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === " ") event.preventDefault();
                        if (event.key === "Enter" || event.key === " ") open(row);
                      }}
                    >
                      <td className="request-kind-cell">
                        <KindIcon kind="time_off" />
                        <span className="sr-only">Time off</span>
                      </td>
                      <td>
                        <span className="request-sentence">
                          <Sentence request={row} timeFormat={timeFormat} />
                        </span>
                      </td>
                      <td>
                        <span className="list-chip" data-tone={status.tone}>
                          {status.label}
                        </span>
                      </td>
                      <td>
                        <Expires request={row} timeFormat={timeFormat} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <ListCards label="Requests">
              {rows.map((row) => {
                const status = answerStatus(row);
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      className="list-card request-card"
                      aria-label={`Time off: ${answerSentence(row, timeFormat).text} ${status.label}`}
                      onClick={() => open(row)}
                    >
                      <KindIcon kind="time_off" />
                      <span className="request-sentence">
                        <Sentence request={row} timeFormat={timeFormat} />
                      </span>
                      <span className="request-card-foot">
                        <span className="list-chip" data-tone={status.tone}>
                          {status.label}
                        </span>
                        <Expires request={row} timeFormat={timeFormat} phone />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ListCards>
          </>
        ) : null}
        {list.isPending ? <ListOutline label="Loading requests" rows={6} columns={4} inset /> : null}
        {list.isError ? (
          <LoadError
            inset
            title="We couldn't load time off requests"
            detail="Time off requests didn't load. Nothing was changed."
            retrying={list.isFetching}
            onRetry={() => void list.refetch()}
          />
        ) : null}
        {list.isSuccess && !rows.length ? (
          <div className="catalog-table-empty">
            <span className="catalog-table-empty-icon" aria-hidden>
              <Check size={22} />
            </span>
            <h2>No requests</h2>
            <p>No time off requests match these filters.</p>
          </div>
        ) : null}
      </div>
      <ListPagination
        total={list.data?.total ?? 0}
        page={page}
        pageSize={pageSize}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
      {selected ? (
        <AnswerDrawerFrame
          key={selected.id}
          workspaceId={workspaceId}
          request={selected}
          timeFormat={timeFormat}
          onClose={() => onSelect("")}
        />
      ) : null}
    </>
  );
}

/** The answer drawer over a list: the Time off tab's, and the All tab's for a time off row (D7). */
export function AnswerDrawerFrame(props: { workspaceId: string; request: TimeOffDeciderView; timeFormat: TimeFormat; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <CatalogDrawer label="Review time off" className="requests-catalog-page requests-review-drawer" busy={busy} onClose={props.onClose}>
      <TimeOffAnswerDrawer {...props} onBusy={setBusy} />
    </CatalogDrawer>
  );
}

type Tab = "details" | "shifts";

/** One request in the answer drawer: who and when, the note, the shifts an approval opens, the answer. */
export function TimeOffAnswerDrawer({
  workspaceId,
  request,
  timeFormat,
  onClose,
  onBusy,
}: {
  workspaceId: string;
  request: TimeOffDeciderView;
  timeFormat: TimeFormat;
  onClose: () => void;
  onBusy?: (busy: boolean) => void;
}) {
  const isCancel = request.kind === "cancel";
  // A cancellation opens no shift: nothing to read before answering it.
  const impact = useTimeOffImpact(workspaceId, isCancel ? null : request.id);
  const answer = useAnswerTimeOff(workspaceId);
  const answerCancel = useAnswerTimeOffCancellation(workspaceId);
  const takeBack = useTakeBackTimeOff(workspaceId);
  const [answered, setAnswered] = useState<TimeOffDeciderView | null>(null);
  const [tab, setTab] = useState<Tab>("details");
  const [note, setNote] = useState("");
  const [why, setWhy] = useState("");
  const [notice, setNotice] = useState<DrawerNotice | null>(null);
  const [asking, setAsking] = useState(false);
  // The freshest copy: the answer's, then the drawer's own read, then the list's.
  const current = answered ?? impact.data?.request ?? request;
  const status = answerStatus(current);
  const open = waiting(current);
  const opens = open && !isCancel ? impact.data?.shift_count ?? null : null;
  const first = current.employee_name.split(" ")[0] ?? current.employee_name;
  const zone = current.time_timezone;
  const pending = answer.isPending || answerCancel.isPending || takeBack.isPending;
  // Approved time off that is not over may be revoked.
  const revocable = current.kind === "leave" && current.status === "approved" && new Date(current.ends_at) > new Date();

  function sendCancel(verdict: "approve" | "decline") {
    setAsking(false);
    setNotice(null);
    onBusy?.(true);
    answerCancel.mutate(
      { requestId: current.id, answer: { verdict, note: note.trim() || null, expected_revision: current.revision } },
      {
        onSuccess: (result) => {
          setAnswered(result);
          setNotice({ text: cancelAnsweredText(result) });
        },
        onError: (error) => {
          const reason = (error as { reason?: string }).reason;
          setNotice({ text: answerRefusalText(reason), tone: reason === "time_off.changed" || reason === "time_off.not_pending" ? "warning" : "error" });
        },
        onSettled: () => onBusy?.(false),
      },
    );
  }

  function sendTakeBack() {
    setNotice(null);
    onBusy?.(true);
    takeBack.mutate(
      { requestId: current.id, input: { note: why.trim(), expected_revision: current.revision } },
      {
        onSuccess: (result) => {
          setAnswered(result);
          setNotice({ text: `Revoked. ${first} is told.` });
        },
        onError: (error) => {
          const reason = (error as { reason?: string }).reason;
          setNotice({ text: takeBackRefusalText(reason), tone: reason === "time_off.changed" || reason === "time_off.not_approved" ? "warning" : "error" });
          if (reason === "time_off.changed" || reason === "time_off.not_approved") void impact.refetch();
        },
        onSettled: () => onBusy?.(false),
      },
    );
  }

  function send(verdict: "approve" | "decline") {
    if (isCancel) return sendCancel(verdict);
    setAsking(false);
    setNotice(null);
    onBusy?.(true);
    answer.mutate(
      {
        requestId: current.id,
        answer: {
          verdict,
          note: note.trim() || null,
          expected_revision: current.revision,
          expected_impact: verdict === "approve" ? (impact.data?.fingerprint ?? null) : null,
        },
      },
      {
        onSuccess: (result) => {
          setAnswered(result);
          setNotice({ text: answeredText(result) });
        },
        onError: (error) => {
          const reason = (error as { reason?: string }).reason;
          setNotice({ text: answerRefusalText(reason), tone: reason === "time_off.changed" || reason === "time_off.not_pending" ? "warning" : "error" });
          // The request or its shifts moved on: read them again; the lists are read again by the hook.
          if (reason === "time_off.changed" || reason === "time_off.not_pending") void impact.refetch();
        },
        onSettled: () => onBusy?.(false),
      },
    );
  }

  const shiftsTab = (
    <DrawerSection title={open ? "Shifts that go to open shifts" : "Shifts"}>
      {!open ? (
        <p className="rd-info">{shiftsText(current.shifts_opened, "went")}</p>
      ) : impact.isPending ? (
        <p className="rd-info">Checking shifts…</p>
      ) : impact.isError ? (
        <p className="rd-note warn">Couldn't check the shifts. Close and open this request again.</p>
      ) : impact.data.shift_count === 0 ? (
        <p className="rd-empty">No published shifts in these days.</p>
      ) : (
        <>
          {impact.data.locations.map((place) => (
            <div key={place.location_id} className="rd-group">
              <div className="rd-group-head">{place.location_name}</div>
              {place.shifts.map((shift) => (
                <div key={shift.id} className="rd-row toa-shift">
                  <div className="rd-row-main">
                    <b>{dayText(shift.scheduled_date)}</b>
                    <span>
                      {clockRange(shift.start_time, shift.end_time, timeFormat)} · {shift.job_name}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ))}
          {impact.data.hidden_shift_count ? (
            <p className="rd-info">
              {impact.data.hidden_shift_count === 1
                ? "1 more at a location whose schedule you don't see."
                : `${impact.data.hidden_shift_count} more at locations whose schedule you don't see.`}
            </p>
          ) : null}
        </>
      )}
    </DrawerSection>
  );

  const details = (
    <>
      <DrawerSection>
        <dl className="toa-facts">
          <div>
            <dt>Name</dt>
            <dd>{current.employee_name}</dd>
          </div>
          <div>
            <dt>Type</dt>
            <dd>
              <span className="toa-type">
                <LeaveIcon kind={current.kind_of_leave} size={15} />
                {leaveLabel(current.kind_of_leave)}
              </span>
            </dd>
          </div>
          <div className="toa-when">
            <dt>When</dt>
            <dd>
              <dl>
                <div>
                  <dt>Start</dt>
                  <dd>{edgeText(current, "start", timeFormat)}</dd>
                </div>
                <div>
                  <dt>End</dt>
                  <dd>{edgeText(current, "end", timeFormat)}</dd>
                </div>
              </dl>
            </dd>
          </div>
          <div>
            <dt>Length</dt>
            <dd>{lengthText(current)}</dd>
          </div>
          <div>
            <dt>{current.added_by_name ? "Added" : "Asked"}</dt>
            <dd>{monthDay(instantDay(current.created_at, zone))}</dd>
          </div>
        </dl>
      </DrawerSection>
      <DrawerSection title={isCancel ? `${first}'s reason` : current.added_by_name ? `${current.added_by_name}'s note` : `${first}'s note`}>
        {current.note ? <p className="rd-quote">{current.note}</p> : <p className="rd-empty">No note.</p>}
      </DrawerSection>
      {current.kind === "leave" && current.status === "approved" && current.cancellation?.status === "pending" ? (
        <DrawerSection>
          <p className="rd-note warn">{first} asked to cancel this time off. Answer it in the list.</p>
        </DrawerSection>
      ) : null}
      {open ? (
        <DrawerSection title="Your answer">
          <label className="toa-note">
            <span className="rd-label">
              Note to {first} <span className="toa-opt">Optional</span>
            </span>
            <textarea
              maxLength={1000}
              value={note}
              placeholder="Shown to them with your answer"
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
        </DrawerSection>
      ) : (
        <DrawerSection title="Answer">
          <p className="rd-info">{answerLine(current)}</p>
          {current.decision_note ? <p className="rd-quote">{current.decision_note}</p> : null}
          {current.kind === "leave" && current.status !== "declined" && current.status !== "expired" ? (
            <p className="rd-info">{shiftsText(current.shifts_opened, "went")}</p>
          ) : null}
          {current.status === "cancelled" || current.status === "revoked" ? (
            <p className="rd-info">{endLine(current)}</p>
          ) : null}
          {current.status === "revoked" && current.ended_note ? <p className="rd-quote">{current.ended_note}</p> : null}
        </DrawerSection>
      )}
      {revocable ? (
        <DrawerSection title="Revoke time off">
          <label className="toa-note">
            <span className="rd-label">
              Why are you revoking it? <span className="toa-opt">Required</span>
            </span>
            <textarea
              maxLength={1000}
              value={why}
              placeholder={`Shown to ${first}`}
              disabled={pending}
              onChange={(event) => setWhy(event.target.value)}
            />
          </label>
          <p className="rd-info">Only what has not started is removed. Shifts that went to open shifts stay open.</p>
        </DrawerSection>
      ) : null}
    </>
  );

  const footer: ReactNode = open ? (
    <div className="rd-foot-row">
      <p className="rd-foot-note">
        {isCancel
          ? "Approving removes the rest of this time off."
          : opens === null
            ? "Checking shifts…"
            : opens
              ? `Approving opens ${shiftsText(opens, "count")}.`
              : "No shift opens."}
      </p>
      <div className="rd-foot-actions">
        <ConfirmButton
          className="danger-button"
          confirmLabel="Confirm decline"
          disabled={pending}
          onConfirm={() => send("decline")}
        >
          Decline
        </ConfirmButton>
        <Button
          disabled={pending || (!isCancel && !impact.data)}
          onClick={() => (isCancel || (impact.data && impact.data.shift_count > 0) ? setAsking(true) : send("approve"))}
        >
          {pending ? "Saving…" : "Approve"}
        </Button>
      </div>
    </div>
  ) : revocable ? (
    <div className="rd-foot-row">
      <p className="rd-foot-note">{new Date(current.starts_at) <= new Date() ? "It has started: only the rest is removed." : "Revoking removes all of it."}</p>
      <div className="rd-foot-actions">
        <ConfirmButton className="danger-button" confirmLabel="Confirm revoke" disabled={pending || !why.trim()} onConfirm={sendTakeBack}>
          {takeBack.isPending ? "Revoking…" : "Revoke"}
        </ConfirmButton>
      </div>
    </div>
  ) : null;

  return (
    <>
      <RequestDrawer
        icon={<KindIcon kind="time_off" />}
        title={current.employee_name}
        kicker={isCancel ? "Time off cancellation" : "Time off request"}
        status={{ label: status.label, tone: status.drawer }}
        sub={open ? `Answer by: ${timeOffDeadlineAt(waitsUntil(current), zone, timeFormat)} ${timeOffZoneName(zone)}` : undefined}
        tabs={
          isCancel
            ? [{ key: "details", label: "Details" }]
            : [
                { key: "details", label: "Details" },
                { key: "shifts", label: "Shifts", count: open ? (impact.data?.shift_count ?? 0) : current.shifts_opened },
              ]
        }
        tab={tab}
        onTab={setTab}
        notice={notice}
        onClose={onClose}
        footer={footer}
      >
        {tab === "details" ? details : shiftsTab}
      </RequestDrawer>
      <ConfirmDialog
        open={asking}
        title={isCancel ? `Cancel ${first}'s time off?` : "Approve time off?"}
        description={
          isCancel
            ? "The rest of the time off is removed. Shifts that went to open shifts stay open."
            : `${shiftsText(opens ?? 0, "go")} to open shifts.`
        }
        confirmLabel="Approve"
        busy={pending}
        onConfirm={() => send("approve")}
        onCancel={() => setAsking(false)}
      />
    </>
  );
}

/**
 * "Approved by Rachel Adams, Oct 21", "Declined by …", "Expired: nobody answered before Nov 13"; time off
 * cancelled or revoked says who ended it (D4).
 */
function answerLine(request: TimeOffDeciderView): string {
  const day = (at: string | null) => (at ? `, ${monthDay(instantDay(at, request.time_timezone))}` : "");
  // D5: time off added for the person was approved by whoever added it.
  if (request.status === "approved" && request.added_by_name) return `Added by ${request.added_by_name}${day(request.created_at)}`;
  if (request.status === "approved") return `Approved by ${request.decided_by_name ?? "a manager"}${day(request.decided_at)}`;
  if (request.status === "declined") return `Declined by ${request.decided_by_name ?? "a manager"}${day(request.decided_at)}`;
  if (request.status === "cancelled") return `Cancelled by ${request.ended_by_name ?? "a manager"}${day(request.ended_at)}`;
  if (request.status === "revoked") return `Revoked by ${request.ended_by_name ?? "a manager"}${day(request.ended_at)}`;
  if (request.kind === "cancel") return "Expired: nobody answered before the time off ended.";
  return `Expired: nobody answered before ${monthDay(request.start_date)}.`;
}

/** D4: how much of time off cancelled or revoked was used. */
function endLine(request: TimeOffDeciderView): string {
  if (!request.used_until) return "None of it was used. Shifts that went to open shifts stay open.";
  return `Used until ${dayText(instantDay(request.used_until, request.time_timezone))}. Shifts that went to open shifts stay open.`;
}

/** D4: what the drawer says once a cancellation is answered. */
function cancelAnsweredText(result: TimeOffDeciderView): string {
  if (result.status === "approved") return "Approved. The rest of the time off is removed.";
  if (result.status === "declined") return "Declined. The time off stays.";
  return "This cancellation expired: the time off ended before it was answered.";
}

/** What the drawer says once the answer went through. */
function answeredText(result: TimeOffDeciderView): string {
  if (result.status === "approved") return result.shifts_opened ? `Approved. ${shiftsText(result.shifts_opened, "went")}` : "Approved.";
  if (result.status === "declined") return "Declined.";
  return "This request expired before it was answered.";
}
