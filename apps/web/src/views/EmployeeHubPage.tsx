import type { EmployeeHubReadModel, EmployeeHubShift } from "@newfork/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Check, Clock3, RefreshCw } from "lucide-react";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { useAuth } from "../auth/AuthContext";
import {
  actOnEmployeeRequest,
  getEmployeeHub,
  saveEmployeeAvailability,
  submitEmployeeShiftRequest,
  submitEmployeeTimeOff,
} from "../employee-hub/employee-hub-data";
import { EmployeeTimeTrackingView } from "./EmployeeTimeTrackingView";

const tabs = [
  ["schedule", "Schedule"],
  ["time-tracking", "Time Tracking"],
  ["shift-hub", "Shift Hub"],
  ["my-team", "My Team"],
  ["my-availability", "My Availability"],
  ["lineup", "Line-up"],
] as const;
const weekdays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function EmployeeHubPage() {
  const { context } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();
  const workspaceId = context?.workspace.id ?? "";
  const today = new Date().toLocaleDateString("en-CA");
  const end = addDays(today, 42);
  const query = useQuery({
    queryKey: ["employee-hub", workspaceId, today, end],
    queryFn: () => getEmployeeHub(workspaceId, today, end),
    enabled: Boolean(workspaceId),
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["employee-hub", workspaceId] });
  const path = location.pathname.split("/employee-hub/")[1] ?? "";
  if (query.isLoading)
    return <main className="hub-loading" aria-label="Loading Employee Hub" />;
  if (query.isError || !query.data)
    return (
      <section className="workspace-page">
        <div className="empty-state">
          <h2>Employee Hub is unavailable</h2>
          <p>
            {query.error instanceof Error ? query.error.message : "Try again."}
          </p>
          <button className="secondary-button" onClick={() => query.refetch()}>
            <RefreshCw size={16} />
            Retry
          </button>
        </div>
      </section>
    );
  const model = query.data;
  return (
    <section className="employee-hub-page" aria-labelledby="employee-hub-title">
      <header className="hub-header">
        <div>
          <p className="eyebrow">{context?.workspace.name}</p>
          <h1 id="employee-hub-title">Employee Hub</h1>
        </div>
        <div className="hub-today">
          <CalendarDays size={17} />
          {formatDate(today)}
        </div>
      </header>
      <nav className="hub-tabs" aria-label="Employee Hub">
        <NavLink end to="/app/employee-hub">
          Overview
        </NavLink>
        {tabs.map(([to, label]) => (
          <NavLink key={to} to={`/app/employee-hub/${to}`}>
            {label}
          </NavLink>
        ))}
      </nav>
      {path === "schedule" ? (
        <ScheduleView model={model} refresh={refresh} />
      ) : path === "time-tracking" ? (
        <EmployeeTimeTrackingView workspaceId={workspaceId} />
      ) : path === "shift-hub" ? (
        <ShiftHubView model={model} refresh={refresh} />
      ) : path === "my-team" ? (
        <TeamView model={model} />
      ) : path === "my-availability" ? (
        <AvailabilityView model={model} refresh={refresh} />
      ) : path === "lineup" ? (
        <LineupView model={model} />
      ) : (
        <Overview model={model} />
      )}
    </section>
  );
}

function Overview({ model }: { model: EmployeeHubReadModel }) {
  const next = model.shifts[0];
  const today = new Date().toLocaleDateString("en-CA");
  const weekEnd = addDays(today, 6);
  const thisWeekShifts = model.shifts.filter(
    (shift) =>
      shift.scheduled_date >= today && shift.scheduled_date <= weekEnd,
  );
  const actions = model.requests.filter(
    (request) =>
      request.can_cancel ||
      request.can_respond ||
      request.status.includes("pending") ||
      request.status.includes("awaiting"),
  );
  return (
    <div className="hub-overview">
      <section className="hub-panel hub-next">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Next shift</p>
            <h2>
              {next ? formatDate(next.scheduled_date) : "No upcoming shift"}
            </h2>
          </div>
          <Clock3 size={22} />
        </div>
        {next ? (
          <ShiftDetails shift={next} />
        ) : (
          <p className="muted">
            Your published schedule is clear for the next six weeks.
          </p>
        )}
      </section>
      <section className="hub-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Open actions</p>
            <h2>{actions.length} items</h2>
          </div>
          <Check size={22} />
        </div>
        {actions.length ? (
          <div className="hub-action-list">
            {actions.slice(0, 5).map((request) => (
              <div key={request.id}>
                <strong>{request.title}</strong>
                <span>{request.detail}</span>
                <small>{statusLabel(request.status)}</small>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">Nothing needs your attention.</p>
        )}
      </section>
      <section className="hub-panel hub-quick-actions">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Quick actions</p>
            <h2>Get it done</h2>
          </div>
        </div>
        <div className="hub-action-buttons" aria-label="Employee shortcuts">
          <Link className="secondary-button" to="/app/employee-hub/schedule">
            My Schedule
          </Link>
          <Link
            className="secondary-button"
            to="/app/employee-hub/my-availability"
          >
            Request time off
          </Link>
          <Link
            className="secondary-button"
            to="/app/employee-hub/my-availability"
          >
            Update availability
          </Link>
          <Link className="secondary-button" to="/app/employee-hub/shift-hub">
            Shift Hub
          </Link>
        </div>
      </section>
      <section className="hub-panel hub-week-strip">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">This week</p>
            <h2>{thisWeekShifts.length} shifts</h2>
          </div>
        </div>
        {thisWeekShifts.length ? (
          <div className="hub-week-list">
            {thisWeekShifts.map((shift) => (
              <div key={shift.id}>
                <time>{formatDate(shift.scheduled_date)}</time>
                <strong>
                  {shift.start_time.slice(0, 5)}-{shift.end_time.slice(0, 5)}
                </strong>
                <span>
                  {shift.job_name} · {shift.location_name}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No shifts are published for this week.</p>
        )}
      </section>
    </div>
  );
}

function ScheduleView({ model, refresh }: HubMutationProps) {
  const pendingShiftIds = new Set(
    model.requests
      .filter((request) => request.can_cancel && request.shift_id)
      .map((request) => request.shift_id),
  );
  const mutation = useMutation({
    mutationFn: (shift: EmployeeHubShift) =>
      submitEmployeeShiftRequest(model.workspace_id, {
        action: "release",
        shift_id: shift.id,
        note: "",
      }),
    onSuccess: refresh,
  });
  return (
    <HubSection
      title="My Schedule"
      subtitle="Published shifts for the next six weeks."
    >
      <div className="hub-shift-list">
        {model.shifts.map((shift) => (
          <article className="hub-shift-row" key={shift.id}>
            <ShiftDetails shift={shift} />
            <button
              className="secondary-button"
              disabled={mutation.isPending || pendingShiftIds.has(shift.id)}
              onClick={() => mutation.mutate(shift)}
            >
              {pendingShiftIds.has(shift.id) ? "Requested" : "Request release"}
            </button>
          </article>
        ))}
      </div>
      {!model.shifts.length ? (
        <Empty text="No published shifts in this range." />
      ) : null}
      {mutation.error ? <InlineError error={mutation.error} /> : null}
    </HubSection>
  );
}

function ShiftHubView({ model, refresh }: HubMutationProps) {
  const [own, setOwn] = useState(model.shifts[0]?.id ?? "");
  const [target, setTarget] = useState("");
  const pendingShiftIds = new Set(
    model.requests
      .filter((request) => request.can_cancel && request.shift_id)
      .map((request) => request.shift_id),
  );
  const shiftMutation = useMutation({
    mutationFn: (request: Parameters<typeof submitEmployeeShiftRequest>[1]) =>
      submitEmployeeShiftRequest(model.workspace_id, request),
    onSuccess: refresh,
  });
  const actionMutation = useMutation({
    mutationFn: (action: Parameters<typeof actOnEmployeeRequest>[1]) =>
      actOnEmployeeRequest(model.workspace_id, action),
    onSuccess: refresh,
  });
  return (
    <div className="hub-two-column">
      <HubSection
        title="Open shifts"
        subtitle="Pickup requests require manager approval."
      >
        {model.open_shifts.map((shift) => (
          <article className="hub-shift-row" key={shift.id}>
            <ShiftDetails shift={shift} />
            <button
              className="primary-button"
              disabled={pendingShiftIds.has(shift.id)}
              onClick={() =>
                shiftMutation.mutate({
                  action: "pickup",
                  shift_id: shift.id,
                  note: "",
                })
              }
            >
              {pendingShiftIds.has(shift.id) ? "Requested" : "Request shift"}
            </button>
          </article>
        ))}
        {!model.open_shifts.length ? (
          <Empty text="No open shifts right now." />
        ) : null}
        <div className="hub-swap-form">
          <h3>Propose a swap</h3>
          <select
            aria-label="Your shift"
            value={own}
            onChange={(event) => setOwn(event.target.value)}
          >
            {model.shifts.map((shift) => (
              <option key={shift.id} value={shift.id}>
                {formatShiftOption(shift)}
              </option>
            ))}
          </select>
          <select
            aria-label="Teammate shift"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
          >
            <option value="">Choose teammate shift</option>
            {model.team_shifts.map((shift) => (
              <option key={shift.id} value={shift.id}>
                {shift.employee_name} · {formatShiftOption(shift)}
              </option>
            ))}
          </select>
          <button
            className="secondary-button"
            disabled={!own || !target || shiftMutation.isPending}
            onClick={() =>
              shiftMutation.mutate({
                action: "swap",
                shift_id: own,
                requested_shift_id: target,
                note: "",
              })
            }
          >
            Send swap request
          </button>
        </div>
      </HubSection>
      <HubSection
        title="My requests"
        subtitle="Track approvals and teammate responses."
      >
        <div className="hub-action-list">
          {model.requests.map((request) => (
            <div key={request.id}>
              <strong>{request.title}</strong>
              <span>{request.detail}</span>
              <small>{statusLabel(request.status)}</small>
              <div className="row-actions">
                {request.can_respond ? (
                  <>
                    <button
                      className="primary-button"
                      onClick={() =>
                        actionMutation.mutate({
                          request_id: request.id,
                          kind: "shift_change",
                          action: "accept",
                          expected_revision: request.revision,
                        })
                      }
                    >
                      Accept
                    </button>
                    <button
                      className="secondary-button"
                      onClick={() =>
                        actionMutation.mutate({
                          request_id: request.id,
                          kind: "shift_change",
                          action: "decline",
                          expected_revision: request.revision,
                        })
                      }
                    >
                      Decline
                    </button>
                  </>
                ) : null}
                {request.can_cancel ? (
                  <button
                    className="text-button"
                    onClick={() =>
                      actionMutation.mutate({
                        request_id: request.id,
                        kind:
                          request.kind === "time_off"
                            ? "time_off"
                            : "shift_change",
                        action: "cancel",
                        expected_revision: request.revision,
                      })
                    }
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        {!model.requests.length ? <Empty text="No requests yet." /> : null}
        {shiftMutation.error ? (
          <InlineError error={shiftMutation.error} />
        ) : actionMutation.error ? (
          <InlineError error={actionMutation.error} />
        ) : null}
      </HubSection>
    </div>
  );
}

function TeamView({ model }: { model: EmployeeHubReadModel }) {
  return (
    <HubSection
      title="My Team"
      subtitle="People who share one of your assigned locations."
    >
      <div className="team-grid">
        {model.team.map((member) => (
          <article className="team-row" key={member.id}>
            <div className="avatar" aria-hidden>
              {member.display_name.slice(0, 1)}
            </div>
            <div>
              <strong>{member.display_name}</strong>
              <span>{member.job_names.join(", ") || "Team member"}</span>
              <small>{member.location_names.join(" · ")}</small>
            </div>
          </article>
        ))}
      </div>
      {!model.team.length ? (
        <Empty text="No teammates are visible in your locations." />
      ) : null}
    </HubSection>
  );
}

function AvailabilityView({ model, refresh }: HubMutationProps) {
  const initial = useMemo(
    () =>
      model.availability?.days ??
      weekdays.map((_, day) => ({
        day,
        mode: "unrestricted" as const,
        windows: [],
      })),
    [model.availability],
  );
  const [days, setDays] = useState(initial);
  const [location, setLocation] = useState(model.locations[0]?.id ?? "");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const availability = useMutation({
    mutationFn: () =>
      saveEmployeeAvailability(model.workspace_id, {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        days,
      }),
    onSuccess: refresh,
  });
  const timeOff = useMutation({
    mutationFn: (event: FormEvent) => {
      event.preventDefault();
      return submitEmployeeTimeOff(model.workspace_id, {
        location_id: location,
        reason,
        dates: dateRange(start, end || start),
      });
    },
    onSuccess: () => {
      setStart("");
      setEnd("");
      setReason("");
      refresh();
    },
  });
  const actionMutation = useMutation({
    mutationFn: (action: Parameters<typeof actOnEmployeeRequest>[1]) =>
      actOnEmployeeRequest(model.workspace_id, action),
    onSuccess: refresh,
  });
  const timeOffRequests = model.requests.filter(
    (request) => request.kind === "time_off",
  );
  return (
    <div className="hub-two-column">
      <HubSection
        title="Weekly availability"
        subtitle="Changes create a new version without rewriting onboarding history."
      >
        <div className="availability-list">
          {days.map((day, index) => (
            <label key={day.day}>
              <span>{weekdays[day.day]}</span>
              <select
                value={day.mode}
                onChange={(event) =>
                  setDays((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index
                        ? {
                            ...item,
                            mode: event.target.value as
                              "unavailable" | "unrestricted" | "windows",
                            windows:
                              event.target.value === "windows"
                                ? [{ start: "09:00", end: "17:00" }]
                                : [],
                          }
                        : item,
                    ),
                  )
                }
              >
                <option value="unrestricted">Any time</option>
                <option value="unavailable">Unavailable</option>
                <option value="windows">09:00–17:00</option>
              </select>
            </label>
          ))}
        </div>
        <button
          className="primary-button"
          disabled={availability.isPending}
          onClick={() => availability.mutate()}
        >
          Save availability
        </button>
        {availability.error ? <InlineError error={availability.error} /> : null}
      </HubSection>
      <HubSection
        title="Request time off"
        subtitle="Managers review each date and may approve part of a request."
      >
        <form
          className="time-off-form"
          onSubmit={(event) => timeOff.mutate(event)}
        >
          <label>
            Location
            <select
              required
              value={location}
              onChange={(event) => setLocation(event.target.value)}
            >
              {model.locations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <div className="date-pair">
            <label>
              Start
              <input
                required
                min={new Date().toLocaleDateString("en-CA")}
                type="date"
                value={start}
                onChange={(event) => setStart(event.target.value)}
              />
            </label>
            <label>
              End
              <input
                min={start}
                type="date"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
              />
            </label>
          </div>
          <label>
            Note
            <textarea
              maxLength={1000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Optional context"
            />
          </label>
          <button className="primary-button" disabled={timeOff.isPending}>
            Submit request
          </button>
        </form>
        {timeOff.error ? <InlineError error={timeOff.error} /> : null}
      </HubSection>
      <HubSection
        title="Time off requests"
        subtitle="Track submitted requests and cancel anything still under your control."
      >
        <div className="hub-action-list time-off-request-list">
          {timeOffRequests.map((request) => (
            <div key={request.id}>
              <strong>{request.title}</strong>
              <span>{request.detail}</span>
              <small>
                {statusLabel(request.status)} · Submitted{" "}
                {formatDate(request.created_at)}
              </small>
              {request.can_cancel ? (
                <button
                  className="text-button"
                  disabled={actionMutation.isPending}
                  onClick={() =>
                    actionMutation.mutate({
                      request_id: request.id,
                      kind: "time_off",
                      action: "cancel",
                      expected_revision: request.revision,
                    })
                  }
                >
                  Cancel request
                </button>
              ) : null}
            </div>
          ))}
        </div>
        {!timeOffRequests.length ? (
          <Empty text="No time off requests submitted yet." />
        ) : null}
        {actionMutation.error ? (
          <InlineError error={actionMutation.error} />
        ) : null}
      </HubSection>
    </div>
  );
}

function LineupView({ model }: { model: EmployeeHubReadModel }) {
  const grouped = model.lineup.reduce<
    Record<string, EmployeeHubReadModel["lineup"]>
  >((groups, row) => {
    const key = `${row.lineup_date}|${row.location_name}`;
    (groups[key] ??= []).push(row);
    return groups;
  }, {});
  return (
    <HubSection
      title="Line-up"
      subtitle="Latest shared line-ups for your assigned locations."
    >
      <div className="lineup-days">
        {Object.entries(grouped).map(([key, rows]) => {
          const [lineupDate, locationName] = key.split("|") as [string, string];
          return (
            <section key={key}>
              <h3>
                {formatDate(lineupDate)}
                <span>{locationName}</span>
              </h3>
              {rows?.map((row) => (
                <div className="lineup-employee-row" key={row.id}>
                  <strong>{row.employee_name}</strong>
                  <span>{row.job_name ?? "Open row"}</span>
                  <span>{row.station || row.section_name || "-"}</span>
                  <time>
                    {row.start_time && row.end_time
                      ? `${row.start_time}–${row.end_time}`
                      : "-"}
                  </time>
                </div>
              ))}
            </section>
          );
        })}
      </div>
      {!model.lineup.length ? (
        <Empty text="No shared line-up is available in this range." />
      ) : null}
    </HubSection>
  );
}

interface HubMutationProps {
  model: EmployeeHubReadModel;
  refresh: () => void;
}
function HubSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="hub-panel">
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
function ShiftDetails({ shift }: { shift: EmployeeHubShift }) {
  return (
    <div className="shift-details">
      <strong>
        {shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)}
      </strong>
      <span>
        {shift.job_name} · {shift.location_name}
      </span>
      <small>{formatDate(shift.scheduled_date)}</small>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <p className="muted empty-inline">{text}</p>;
}
function InlineError({ error }: { error: unknown }) {
  return (
    <p className="form-error" role="alert">
      {error instanceof Error ? error.message : "Operation failed"}
    </p>
  );
}
function formatDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
function formatShiftOption(shift: EmployeeHubShift) {
  return `${formatDate(shift.scheduled_date)} · ${shift.start_time.slice(0, 5)} · ${shift.location_name}`;
}
function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}
function addDays(iso: string, count: number) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}
function dateRange(start: string, end: string) {
  if (!start) return [];
  const result: string[] = [];
  let value = start;
  while (value <= end && result.length < 31) {
    result.push(value);
    value = addDays(value, 1);
  }
  return result;
}

export default EmployeeHubPage;
