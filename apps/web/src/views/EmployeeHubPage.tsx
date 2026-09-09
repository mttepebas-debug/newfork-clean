import { employeeTimeOffInputSchema, type EmployeeHubReadModel, type EmployeeHubShift } from "@newfork/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowLeftRight, CalendarDays, CalendarOff, RefreshCw } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import { WeeklyPreferencesPanel } from "../availability/WeeklyPreferencesPanel";
import { AvailabilityDraftScope, requestAvailabilityNavigation, timeOffNavigationLabels, useAvailabilityNavigationGuard } from "../availability/availability-navigation";
import { loadWeeklyPreferences } from "../availability/availability-data";
import { TimeOffHourFields, defaultTimeOffHours, type TimeOffHours } from "../employee-hub/TimeOffHourFields";
import { TimeOffDateFields, type TimeOffDateDraft, type TimeOffDateDrafts } from "../employee-hub/TimeOffDateFields";
import { TimeOffPeriods } from "../employee-hub/TimeOffPeriods";
import { TimeOffCancellation } from "../employee-hub/TimeOffCancellation";
import { TimeOffReleasedAssignments } from "../employee-hub/TimeOffReleasedAssignments";
import "../employee-hub/time-off.css";
import { useAuth } from "../auth/AuthContext";
import {
  actOnEmployeeRequest,
  getEmployeeHub,
  submitEmployeeTimeOff,
} from "../employee-hub/employee-hub-data";
import { formatTimeRange } from "../schedule/lib/scheduleDateTime";
import { EmployeeTimeTrackingView } from "./EmployeeTimeTrackingView";
import { EmployeeLineup } from "../schedule/lineup/EmployeeLineup";
import { lineupDateWindow, parseLineupDate } from "../schedule/lineup/lineup-time";

import { EmployeeTeamView } from "../employee-hub/EmployeeTeamView";
import { EmployeeDashboard } from "../employee-hub/EmployeeDashboard";
import { useHubClock } from "../employee-hub/useHubClock";
import { EmployeeMorePage } from "../employee-hub/EmployeeMobileNav";
import { EarlierShiftRequests } from "../employee-hub/shift-exchanges/EarlierShiftRequests";
import { ShiftExchangeHub } from "../employee-hub/shift-exchanges/ShiftExchangeHub";

const tabs = [
  ["schedule", "Schedule"],
  ["time-tracking", "Time Tracking"],
  ["shift-hub", "Shift Hub"],
  ["my-team", "My Team"],
  ["my-availability", "My Availability"],
  ["lineup", "Line-up"],
] as const;
export function EmployeeHubPage() {
  const { context } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();
  const workspaceId = context?.workspace.id ?? "";
  const path = location.pathname.split("/employee-hub/")[1] ?? "";
  const independentPage = path === "more" || path === "time-tracking" || path === "my-team";
  const now = useHubClock();
  const today = now.toISOString().slice(0, 10);
  const selectedScheduleDate = path === "schedule"
    ? scheduleDateFromSearch(location.search)
    : null;
  const selectedLineupDate = path === "lineup"
    ? parseLineupDate(new URLSearchParams(location.search).get("date"))
    : null;
  const from = selectedScheduleDate ?? addDays(today, -2);
  const end = selectedScheduleDate ?? addDays(today, 42);
  const query = useQuery({
    queryKey: ["employee-hub", workspaceId, context?.userId, from, end],
    queryFn: () => getEmployeeHub(workspaceId, from, end),
    enabled: Boolean(workspaceId) && !independentPage,
    refetchInterval: 60_000,
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["employee-hub", workspaceId] });
  const hasHubData = Boolean(query.data);
  useEffect(() => {
    const id = location.hash.slice(1);
    if (!id || !hasHubData) return;
    const frame = requestAnimationFrame(() => {
      const element = document.getElementById(id);
      element?.scrollIntoView?.({ block: "start" });
      element?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [location.key, location.hash, hasHubData]);
  if (independentPage)
    return (
      <section
        className={`employee-hub-page${path === "my-team" ? " employee-team-page" : ""}`}
        aria-labelledby="employee-hub-title"
      >
        <header className="hub-header eh-subpage-header">
          <div>
            <p className="eyebrow">{context?.workspace.name}</p>
            <h1 id="employee-hub-title">
              {path === "more" ? "More" : path === "my-team" ? "My Team" : "Time Tracking"}
            </h1>
          </div>
          <Link className="eh-home-link" to="/app/employee-hub">
            <ArrowLeft size={15} />
            Home
          </Link>
        </header>
        {path === "more" ? (
          <EmployeeMorePage />
        ) : path === "my-team" ? (
          <EmployeeTeamView key={`${workspaceId}:${context?.userId}`} workspaceId={workspaceId} userId={context?.userId ?? ""} today={today} />
        ) : (
          <EmployeeTimeTrackingView
            key={`${workspaceId}:${context?.userId}`}
            workspaceId={workspaceId}
          />
        )}
      </section>
    );
  if (query.isLoading)
    return (
      <div
        className="eh-loading"
        role="status"
        aria-label="Loading Employee Hub"
      >
        <p>Getting your day ready…</p>
        <div className="eh-loading-bar" />
        <div className="eh-loading-block" />
      </div>
    );
  if (!query.data)
    return (
      <section className="employee-hub-page">
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
  const lineupDates = lineupDateWindow(now, model.locations.map((item) => item.timezone));
  if (!path)
    return (
      <section
        className="employee-hub-page"
        aria-labelledby="employee-hub-title"
      >
        <EmployeeDashboard
          key={`${workspaceId}:${context?.userId}`}
          model={model}
          now={now}
          stale={query.isError}
          onRefresh={() => void query.refetch()}
        />
      </section>
    );
  return (
    <section className="employee-hub-page" aria-labelledby="employee-hub-title">
      <header className="hub-header eh-subpage-header">
        <div>
          <p className="eyebrow">{context?.workspace.name}</p>
          <h1 id="employee-hub-title">
            {path === "more"
              ? "More"
              : (tabs.find(([to]) => to === path)?.[1] ?? "Employee Hub")}
          </h1>
        </div>
        <Link className="eh-home-link" to="/app/employee-hub">
          <ArrowLeft size={15} /> Home
        </Link>
        <div className="hub-today">
          <CalendarDays size={17} />
          {formatDate(path === "lineup" ? (selectedLineupDate ?? lineupDates.from) : (selectedScheduleDate ?? today))}
        </div>
      </header>
      <nav className="hub-tabs" aria-label="Employee Hub">
        <NavLink end to="/app/employee-hub">
          Home
        </NavLink>
        {tabs.map(([to, label]) => (
          <NavLink key={to} to={
            to === "lineup" && selectedScheduleDate
              ? `/app/employee-hub/lineup?date=${selectedScheduleDate}`
              : to === "schedule" && selectedLineupDate
                ? `/app/employee-hub/schedule?date=${selectedLineupDate}&view=day`
                : `/app/employee-hub/${to}`
          }>
            {label}
          </NavLink>
        ))}
      </nav>
      {path === "schedule" ? (
        <ScheduleView model={model} selectedDate={selectedScheduleDate} />
      ) : path === "time-tracking" ? (
        <EmployeeTimeTrackingView workspaceId={workspaceId} />
      ) : path.startsWith("shift-hub") ? (
        <><ShiftExchangeHub key={`${workspaceId}:${context?.userId}`} workspaceId={workspaceId} timeFormat={model.settings.time_format} /><EarlierShiftRequests model={model} refresh={refresh} /></>

      ) : path === "my-availability" ? (
        <AvailabilityView key={`${model.workspace_id}:${model.employee.id}`} model={model} refresh={refresh} />
      ) : path === "lineup" ? (
        <EmployeeLineup
          workspaceId={workspaceId}
          from={lineupDates.from}
          to={lineupDates.to}
          timeFormat={model.settings.time_format}
        />
      ) : (
        <EmployeeMorePage />
      )}
    </section>
  );
}

function ScheduleView({ model, selectedDate }: {
  model: EmployeeHubReadModel;
  selectedDate: string | null;
}) {
  const visibleShifts = selectedDate
    ? model.shifts.filter((shift) => shift.scheduled_date === selectedDate)
    : model.shifts;
  return (
    <HubSection
      title="My Schedule"
      subtitle={selectedDate ? `Your published shifts for ${formatDate(selectedDate)}.` : "Your recently published and upcoming shifts."}
    >
      <div className="hub-shift-list">
        {visibleShifts.map((shift) => (
          <article
            className="hub-shift-row"
            key={shift.id}
            id={`shift-${shift.id}`}
            tabIndex={-1}
          >
            <ShiftDetails
              shift={shift}
              timeFormat={model.settings.time_format}
            />
            <Link className="hub-exchange-link" to={`/app/employee-hub/shift-hub?offer=${shift.id}&from=${shift.scheduled_date}&to=${shift.scheduled_date}`}>
              <ArrowLeftRight size={16} aria-hidden="true" />
              Find cover or swap
            </Link>
          </article>
        ))}
      </div>
      {selectedDate && (
        <Link className="eh-home-link" to="/app/employee-hub/schedule">
          Show all upcoming shifts
        </Link>
      )}
      {!visibleShifts.length ? (
        <Empty text="No published shifts in this range." />
      ) : null}
    </HubSection>
  );
}

function AvailabilityView({ model, refresh }: HubMutationProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const timeOff = params.get("section") === "time-off" || params.get("tab") === "time-off-request"
    || location.hash === "#time-off" || location.hash.startsWith("#request-");
  const choices = [
    { id: "availability", label: "Availability", icon: CalendarDays },
    { id: "time-off", label: "Time Off Requests", icon: CalendarOff },
  ] as const;
  const active = timeOff ? "time-off" : "availability";
  function select(id: typeof active) {
    if (id === active) return;
    requestAvailabilityNavigation(() => {
      const search = new URLSearchParams(location.search);
      search.delete("tab");
      search.set("section", id);
      navigate({ pathname: location.pathname, search: `?${search}`, hash: "" });
      document.getElementById(`my-${id}-tab`)?.focus();
    });
  }
  return (
    <div className="employee-weekly-workspace">
      <div className="weekly-preferences-tabs" role="tablist" aria-label="My availability">
        {choices.map(({ id, label, icon: Icon }, index) => (
          <button key={id} type="button" role="tab" id={`my-${id}-tab`}
            aria-controls={`my-${id}-panel`} aria-selected={active === id}
            tabIndex={active === id ? 0 : -1} onClick={() => select(id)}
            onKeyDown={event => {
              const next = event.key === "Home" ? 0 : event.key === "End" ? 1
                : ["ArrowLeft", "ArrowRight"].includes(event.key) ? 1 - index : null;
              if (next === null) return;
              event.preventDefault();
              select(choices[next]!.id);
            }}>
            <Icon size={16} aria-hidden />{label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`my-${active}-panel`} aria-labelledby={`my-${active}-tab`}>
        {timeOff ? (
          <AvailabilityDraftScope labels={timeOffNavigationLabels}>
            <TimeOffView model={model} refresh={refresh} />
          </AvailabilityDraftScope>
        ) : <WeeklyPreferencesPanel workspaceId={model.workspace_id} audience="employee" onSaved={refresh} />}
      </div>
    </div>
  );
}
function TimeOffView({ model, refresh }: HubMutationProps) {
  const client = useQueryClient();
  const [location, setLocation] = useState(model.locations[0]?.id ?? "");
  const initialLocation = useRef(location);
  const [zone, setZone] = useState(model.locations[0]?.timezone);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [periodMode, setPeriodMode] = useState<"full_day" | "hours" | "per_date">("full_day");
  const [hours, setHours] = useState<TimeOffHours[]>([{ ...defaultTimeOffHours }]);
  const [dateDrafts,setDateDrafts] = useState<TimeOffDateDrafts>({});
  const [dateDefaults,setDateDefaults] = useState<TimeOffDateDraft>({mode:"full_day",hours:[{...defaultTimeOffHours}]});
  const dateDefaultsChosen = useRef(false);
  const [cancellationDrafts, setCancellationDrafts] = useState(new Map<string, EmployeeHubReadModel["requests"][number]>());
  const retry = useRef({ signature: "", key: crypto.randomUUID() });
  const availability = useQuery({
    queryKey: ["weekly-preferences", model.workspace_id, "workspace", "self"],
    queryFn: () => loadWeeklyPreferences(model.workspace_id),
    retry: false,
  });
  const presets = (availability.data?.shift_types ?? []).flatMap(type =>
    !type.archived && type.selectable && type.start_time && type.end_time
      ? [{ id: type.id, name: type.name, start_time: type.start_time, end_time: type.end_time }] : []);
  const latestZone = model.locations.find((item) => item.id === location)?.timezone;
  const staleZone = Boolean(zone && latestZone && zone !== latestZone);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: zone ?? "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const selectedDates = dateRange(start,end || start);
  const rangeTooLong = selectedDates.length > 31;
  const periods = selectedDates.flatMap(segment_date => {
    const choice = periodMode === "per_date" ? dateDrafts[segment_date] ?? dateDefaults : {mode:periodMode,hours};
    if (choice.mode === "skip") return [];
    return choice.mode === "full_day" ? [{segment_date,start_time:null,end_time:null,ends_next_day:false}]
      : choice.hours.map(range=>({...range,segment_date}));
  });
  const candidate = { location_id: location, reason, periods, expected_timezone: zone };
  const validation = employeeTimeOffInputSchema.safeParse({ ...candidate, request_id: retry.current.key });
  const timeOff = useMutation({
    mutationFn: () => {
      if (rangeTooLong) throw new Error("Choose a date range of at most 31 calendar days.");
      if (staleZone || !latestZone) throw new Error("Review the location time zone before submitting.");
      const signature = JSON.stringify(candidate);
      if (retry.current.signature !== signature) retry.current = { signature, key: crypto.randomUUID() };
      const command = employeeTimeOffInputSchema.safeParse({ ...candidate, request_id: retry.current.key });
      if (!command.success) throw new Error(command.error.issues[0]?.message ?? "Check the requested dates and hours.");
      return submitEmployeeTimeOff(model.workspace_id, command.data);
    },
    onSuccess: () => {
      setStart("");
      setEnd("");
      setReason("");
      setPeriodMode("full_day");
      setHours([{ ...defaultTimeOffHours }]);
      setDateDrafts({}); dateDefaultsChosen.current = false;
      initialLocation.current = location;
      retry.current = { signature: "", key: crypto.randomUUID() };
      void client.invalidateQueries({ queryKey: ["schedule-requests", model.workspace_id] });
      refresh();
    },
  });
  useEffect(() => {
    if (!start && !end && !reason && periodMode === "full_day" && !Object.keys(dateDrafts).length && !timeOff.isPending) setZone(latestZone);
  }, [latestZone, start, end, reason, periodMode, dateDrafts, timeOff.isPending]);
  const actionMutation = useMutation({
    mutationFn: (action: Parameters<typeof actOnEmployeeRequest>[1]) =>
      actOnEmployeeRequest(model.workspace_id, action),
    onSuccess: refresh,
  });
  const currentTimeOffRequests = model.requests.filter(
    (request) => request.kind === "time_off",
  );
  const timeOffRequests = [...currentTimeOffRequests, ...[...cancellationDrafts.values()]
    .filter(request => !currentTimeOffRequests.some(current => current.id === request.id))
    .map(request => ({...request, cancellation:request.cancellation ? {...request.cancellation,can_request:false} : undefined}))];
  const navigationDialog = useAvailabilityNavigationGuard({
    dirty: Boolean(start || end || reason || periodMode !== "full_day" || Object.keys(dateDrafts).length || location !== initialLocation.current),
    busy: timeOff.isPending || actionMutation.isPending,
    labels: timeOffNavigationLabels,
    onDiscard: () => {
      setStart(""); setEnd(""); setReason(""); setPeriodMode("full_day"); setHours([{...defaultTimeOffHours}]);
      setDateDrafts({}); dateDefaultsChosen.current = false;
      initialLocation.current = location; timeOff.reset();
    },
  });
  return (
    <div className="hub-two-column availability-workspace">
      {navigationDialog}
      <HubSection
        title="Request time off"
        subtitle="Request full days or specific hours. Published shifts stay your responsibility until an approved change updates the assignment."
        id="time-off"
      >
        <form
          className="time-off-form"
          onSubmit={(event) => { event.preventDefault(); timeOff.mutate(); }}
        >
          <fieldset disabled={timeOff.isPending}>
          <legend>Time off details</legend>
          <label>
            Location
            <select
              required
              value={location}
              onChange={(event) => {
                setLocation(event.target.value);
                setZone(model.locations.find((item) => item.id === event.target.value)?.timezone);
              }}
            >
              {model.locations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <p>{zone ? `Hours use ${zone}. Once submitted, these hours keep that time zone.` : "Refresh locations to choose the time zone for this request."}</p>
          {staleZone ? <p role="alert">The location time zone changed from {zone} to {latestZone}. Review your entered hours before continuing.
            {" "}<button type="button" onClick={() => setZone(latestZone)}>Use current location time zone</button>
          </p> : null}
          <div className="date-pair">
            <label>
              Start
              <input
                required
                min={today}
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
          <label>Requested time
            <select value={periodMode} onChange={(event) => {
              const next = event.target.value as typeof periodMode;
              if (next === "per_date" && !dateDefaultsChosen.current) {
                setDateDefaults({mode:periodMode === "hours" ? "hours" : "full_day",hours:hours.map(range=>({...range}))}); dateDefaultsChosen.current = true;
              }
              setPeriodMode(next);
            }}>
              <option value="full_day">Full day</option><option value="hours">Specific hours</option><option value="per_date">Different hours by date</option>
            </select>
          </label>
          {periodMode === "hours" ? <TimeOffHourFields ranges={hours} onChange={setHours} timeFormat={model.settings.time_format} presets={presets} /> : null}
          {rangeTooLong ? <p role="alert">Choose a date range of at most 31 calendar days. No dates will be silently omitted.</p> : null}
          {periodMode === "per_date" && !rangeTooLong ? <TimeOffDateFields dates={selectedDates} drafts={dateDrafts} defaults={dateDefaults} onChange={setDateDrafts} timeFormat={model.settings.time_format} presets={presets} /> : null}
          {Object.keys(dateDrafts).some(date=>!selectedDates.includes(date)) ? <p>Some customized dates are outside this range and will not be submitted. Their edits are kept if you restore those dates before submitting.</p> : null}
          {periodMode !== "per_date" && Object.keys(dateDrafts).length ? <p>Your per-date edits are kept if you switch back before submitting. The current time choice applies to every selected date.</p> : null}
          {periodMode === "per_date" && selectedDates.length && !rangeTooLong ? <p>{periods.length} requested period(s) across {new Set(periods.map(period=>period.segment_date)).size} date(s).</p> : null}
          {start && !validation.success ? <p role="alert">{validation.error.issues[0]?.message}</p> : null}
          <label>
            Note
            <textarea
              maxLength={1000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Optional context"
            />
          </label>
          <button className="primary-button" disabled={timeOff.isPending || !validation.success || staleZone || !latestZone || rangeTooLong}>
            Submit request
          </button>
          </fieldset>
        </form>
        {timeOff.error ? <InlineError error={timeOff.error} /> : null}
      </HubSection>
      <HubSection
        title="Time off requests"
        subtitle="Track submitted requests and cancel anything still under your control."
      >
        <div className="hub-action-list time-off-request-list">
          {timeOffRequests.map((request) => (
            <div key={request.id} id={`request-${request.id}`} tabIndex={-1}>
              <strong>{request.title}</strong>
              <span>{request.detail}</span>
              <small>
                {statusLabel(request.status)} · Submitted{" "}
                {formatDate(request.created_at)}
              </small>
              {request.periods ? <TimeOffPeriods periods={request.periods} timeFormat={model.settings.time_format} requestStatus={request.status} cancellation={request.request_type === "time_off_cancellation"} /> : null}
              <TimeOffCancellation request={request} workspaceId={model.workspace_id} timeFormat={model.settings.time_format} onChanged={refresh}
                onDraftChange={active => setCancellationDrafts(current => {
                  if (active === current.has(request.id)) return current;
                  const next = new Map(current); if (active) next.set(request.id,request); else next.delete(request.id); return next;
                })} />
              {request.decision_events?.length ? <ol aria-label="Manager decisions">
                {request.decision_events.map(event => <li key={event.id}>
                  <strong>{statusLabel(event.action)}</strong> · {formatDate(event.created_at)}
                  {event.note ? <p>Manager note: {event.note}</p> : null}
                  <TimeOffReleasedAssignments assignments={event.released_assignments} timeFormat={model.settings.time_format} />
                </li>)}
              </ol> : null}
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
                  {request.request_type === "time_off_cancellation" ? "Withdraw cancellation request" : "Cancel request"}
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

interface HubMutationProps {
  model: EmployeeHubReadModel;
  refresh: () => void;
}
function HubSection({
  id,
  title,
  subtitle,
  children,
}: {
  id?: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="hub-panel" id={id} tabIndex={id ? -1 : undefined}>
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
function ShiftDetails({
  shift,
  timeFormat = "12h",
}: {
  shift: EmployeeHubShift;
  timeFormat?: EmployeeHubReadModel["settings"]["time_format"];
}) {
  return (
    <div className="shift-details">
      <strong>
        {formatTimeRange(shift.start_time, shift.end_time, timeFormat)}
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
function scheduleDateFromSearch(search: string): string | null {
  const params = new URLSearchParams(search);
  const value = params.get("view") === "day" ? params.get("date") : null;
  if (!value || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T12:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
    ? value
    : null;
}
function formatDate(iso: string) {
  const calendarDay = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const date = new Date(calendarDay ? `${iso}T12:00:00` : iso);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(!calendarDay ? { year: "numeric" as const } : {}),
  });
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
  // Keep one excess day so validation rejects a long range instead of silently
  // truncating what the employee requested to the first 31 days.
  while (value <= end && result.length < 32) {
    result.push(value);
    value = addDays(value, 1);
  }
  return result;
}

export default EmployeeHubPage;
