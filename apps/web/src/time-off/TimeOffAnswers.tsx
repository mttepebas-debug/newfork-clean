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
import { DrawerField, DrawerSection, RequestDrawer, type DrawerNotice, type DrawerTone } from "../views/RequestDrawer";
import { clockRange, KindIcon } from "../views/RequestsTable";
import { LeaveIcon } from "./leave-icon";
import { useAnswerTimeOff, useTimeOffImpact, useTimeOffToAnswer } from "./time-off-data";
import {
  answerRefusalText,
  answerSentence,
  dayText,
  instantDay,
  leaveLabel,
  lengthText,
  monthDay,
  rangeText,
  shiftsText,
  type TimeFormat,
} from "./time-off-text";
import "./time-off-answers.css";

// Requests → Time off with the new time off (time off rebuild D3, behind the time-off-v2 flag): the requests
// this person may answer, one sentence each (S-151), with the four words of S-161, paged by the server; and
// the answer drawer in the Requests drawers' language (Details · Shifts). Approving asks first when it opens
// shifts; declining takes two clicks; the answer is said in the drawer.

type Status = { readonly label: string; readonly tone: "amber" | "green" | "red" | "gray"; readonly drawer: DrawerTone };

/** Waiting (and not started): Needs decision. A request whose start passed unanswered: Expired. */
export function answerStatus(request: TimeOffDeciderView, now: Date = new Date()): Status {
  if (request.status === "pending" && new Date(request.starts_at) > now) return { label: "Needs decision", tone: "amber", drawer: "warn" };
  if (request.status === "approved") return { label: "Approved", tone: "green", drawer: "ok" };
  if (request.status === "declined") return { label: "Declined", tone: "red", drawer: "red" };
  return { label: "Expired", tone: "gray", drawer: "grey" };
}

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
  const at = timeOffDeadlineAt(request.starts_at, request.time_timezone, timeFormat);
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

function AnswerDrawerFrame(props: { workspaceId: string; request: TimeOffDeciderView; timeFormat: TimeFormat; onClose: () => void }) {
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
  const impact = useTimeOffImpact(workspaceId, request.id);
  const answer = useAnswerTimeOff(workspaceId);
  const [answered, setAnswered] = useState<TimeOffDeciderView | null>(null);
  const [tab, setTab] = useState<Tab>("details");
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState<DrawerNotice | null>(null);
  const [asking, setAsking] = useState(false);
  // The freshest copy: the answer's, then the drawer's own read, then the list's.
  const current = answered ?? impact.data?.request ?? request;
  const status = answerStatus(current);
  const open = waiting(current);
  const opens = open ? impact.data?.shift_count ?? null : null;
  const first = current.employee_name.split(" ")[0] ?? current.employee_name;
  const zone = current.time_timezone;

  function send(verdict: "approve" | "decline") {
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
        <div className="rd-grid">
          <DrawerField label="Type">
            <span className="toa-type">
              <LeaveIcon kind={current.kind_of_leave} size={15} />
              {leaveLabel(current.kind_of_leave)}
            </span>
          </DrawerField>
          <DrawerField label="Length">{lengthText(current)}</DrawerField>
          <DrawerField label="When">{rangeText(current, timeFormat)}</DrawerField>
          <DrawerField label="Asked">{monthDay(instantDay(current.created_at, zone))}</DrawerField>
        </div>
      </DrawerSection>
      <DrawerSection title={`${first}'s note`}>
        {current.note ? <p className="rd-quote">{current.note}</p> : <p className="rd-empty">No note.</p>}
      </DrawerSection>
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
          {current.status === "approved" ? <p className="rd-info">{shiftsText(current.shifts_opened, "went")}</p> : null}
        </DrawerSection>
      )}
    </>
  );

  const footer: ReactNode = open ? (
    <div className="rd-foot-row">
      <p className="rd-foot-note">{opens === null ? "Checking shifts…" : opens ? `Approving opens ${shiftsText(opens, "count")}.` : "No shift opens."}</p>
      <div className="rd-foot-actions">
        <ConfirmButton
          className="danger-button"
          confirmLabel="Confirm decline"
          disabled={answer.isPending}
          onConfirm={() => send("decline")}
        >
          Decline
        </ConfirmButton>
        <Button
          disabled={answer.isPending || !impact.data}
          onClick={() => (impact.data && impact.data.shift_count > 0 ? setAsking(true) : send("approve"))}
        >
          {answer.isPending ? "Saving…" : "Approve"}
        </Button>
      </div>
    </div>
  ) : null;

  return (
    <>
      <RequestDrawer
        title={current.employee_name}
        type={leaveLabel(current.kind_of_leave)}
        status={{ label: status.label, tone: status.drawer }}
        sub={current.location_names.join(" · ")}
        tabs={[
          { key: "details", label: "Details" },
          { key: "shifts", label: "Shifts", count: open ? (impact.data?.shift_count ?? 0) : current.shifts_opened },
        ]}
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
        title="Approve time off?"
        description={`${shiftsText(opens ?? 0, "go")} to open shifts.`}
        confirmLabel="Approve"
        busy={answer.isPending}
        onConfirm={() => send("approve")}
        onCancel={() => setAsking(false)}
      />
    </>
  );
}

/** "Approved by Rachel Adams, Oct 21", "Declined by …", "Expired: nobody answered before Nov 13". */
function answerLine(request: TimeOffDeciderView): string {
  const when = request.decided_at ? `, ${monthDay(instantDay(request.decided_at, request.time_timezone))}` : "";
  if (request.status === "approved") return `Approved by ${request.decided_by_name ?? "a manager"}${when}`;
  if (request.status === "declined") return `Declined by ${request.decided_by_name ?? "a manager"}${when}`;
  return `Expired: nobody answered before ${monthDay(request.start_date)}.`;
}

/** What the drawer says once the answer went through. */
function answeredText(result: TimeOffDeciderView): string {
  if (result.status === "approved") return result.shifts_opened ? `Approved. ${shiftsText(result.shifts_opened, "went")}` : "Approved.";
  if (result.status === "declined") return "Declined.";
  return "This request expired before it was answered.";
}
