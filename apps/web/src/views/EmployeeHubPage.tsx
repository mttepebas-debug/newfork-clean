import { todayIn } from "../lib/today";
import { homeZone } from "../employee-hub/dashboard-model";
import { Button } from "@newfork/ui";
import { timeOffSubmitInputSchema, type EmployeeHubReadModel } from "@newfork/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, CalendarOff } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { WeeklyPreferencesPanel } from "../availability/WeeklyPreferencesPanel";
import { AvailabilityDraftScope, timeOffNavigationLabels, useAvailabilityNavigationGuard } from "../availability/availability-navigation";
import { requestAppNavigation } from "../shell/leave-guard";
import { useTabSwipe } from "../shell/useTabSwipe";
import { loadWeeklyPreferences } from "../availability/availability-data";
import { TimeOffHourFields, defaultTimeOffHours, type TimeOffHours } from "../employee-hub/TimeOffHourFields";
import { TimeOffDateFields, type TimeOffDateDraft, type TimeOffDateDrafts } from "../employee-hub/TimeOffDateFields";
import { TimeOffPeriods } from "../employee-hub/TimeOffPeriods";
import { TimeOffCancellation } from "../employee-hub/TimeOffCancellation";
import { TimeOffReleasedAssignments } from "../employee-hub/TimeOffReleasedAssignments";
import "../employee-hub/time-off.css";
import { formatTimeOffDeadline, timeOffWallParts, timeOffZoneName } from "../employee-hub/time-off-split";
import { isStaleTimeOff, useSubmitTimeOff } from "../schedule/requests-data";
import { useAuth } from "../auth/AuthContext";
import {
  actOnEmployeeRequest,
  getEmployeeHub,
} from "../employee-hub/employee-hub-data";

import { EmployeeDashboard } from "../employee-hub/EmployeeDashboard";
import { EmployeeScheduleBoard } from "../employee-hub/EmployeeScheduleBoard";
import { EmployeeLineup, EmployeeScheduleTabs, employeeSchedulePath } from "../employee-hub/EmployeeLineup";
import { EmployeeMyShifts } from "../employee-hub/EmployeeMyShifts";
import { useListPhoneWidth } from "../lib/usePhoneWidth";
import { useHubClock } from "../employee-hub/useHubClock";
import { ShiftExchangeHub } from "../employee-hub/shift-exchanges/ShiftExchangeHub";
import { CatalogPageHeader } from "./CatalogPageHeader";

import { isNoAccess } from "../lib/no-access";
import { NoAccessState } from "../shell/NoAccessState";
import { LoadError, LoadingOutline, RefreshError, Skeleton } from "../shell/LoadState";
import { noAccessHomePath } from "../auth/resolveLanding";
import { FieldNote } from "../shell/FieldNote";
// Navigation between these pages lives in the app sidebar. This map supplies
// the shared catalog header copy, written for the employee reading it.
const pageCopy: Record<
  string,
  { title: string; eyebrow: string; description: string }
> = {
  schedule: {
    title: "Schedule",
    eyebrow: "YOUR WEEK, WITHOUT SURPRISES.",
    description:
      "Your published shifts, with the hours, location and position for each one.",
  },
  "schedule/team": {
    title: "Team schedule",
    eyebrow: "YOUR TEAM'S WEEK.",
    description: "The published schedule for everyone at your locations.",
  },
  "schedule/lineup": {
    title: "Lineup",
    eyebrow: "THE RIGHT PEOPLE. IN THE RIGHT SPOT.",
    description: "Your shift, your team and the notes for the day.",
  },
  "shift-hub": {
    title: "Shift Hub",
    eyebrow: "WORK BETTER TOGETHER",
    description:
      "Ask for cover, pick up an open shift, or swap with a teammate.",
  },
  "my-availability": {
    title: "My Availability",
    eyebrow: "WHEN YOU CAN WORK.",
    description: "Set your weekly preferences and request time off.",
  },
};
// The swipe is a phone's, and a phone has My shifts · Lineup only: Team schedule is a desktop tab (S-153), so it
// is not a swipe stop (its address on a phone opens My shifts).
const SCHEDULE_PAGES = ["schedule", "schedule/lineup"] as const;
const AVAILABILITY_TABS = ["availability", "time-off"] as const;
const fallbackCopy = {
  title: "Employee Hub",
  eyebrow: "YOUR WORKSPACE.",
  description: "Your shifts, your team and your requests.",
};
export function EmployeeHubPage() {
  const { context } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();
  const workspaceId = context?.workspace.id ?? "";
  const path = location.pathname.split("/employee-hub/")[1]?.replace(/\/$/, "") ?? "";
  // More is a sheet over the page (CALISAN-MORE): the old More page's address,
  // and any other the hub does not know, opens Home.
  const knownPage =
    path === "" || path === "schedule" || path === "schedule/team" || path === "schedule/lineup" || path === "my-availability" || path === "shift-hub" || path.startsWith("shift-hub/");
  const now = useHubClock();
  const navigate = useNavigate();
  // My shifts and Lineup on a phone: a swipe sideways moves between them (KARARLAR §1.5, "the main tab first":
  // Lineup's own Team · Notes changes by its tabs only).
  const scheduleSwipe = useTabSwipe({
    tabs: SCHEDULE_PAGES,
    active: path,
    enabled: path === "schedule" || path === "schedule/lineup",
    onSelect: (page) => navigate(employeeSchedulePath(page, location.search)),
  });
  const phoneBars = useListPhoneWidth();
  // The hub's date range is asked before its locations load, so on the device's calendar: a day either side
  // of the location's is inside it, and My shifts asks for its own two weeks (the page reads only the model).
  const deviceToday = todayIn(undefined, now);
  const selectedScheduleDate = path === "schedule/team"
    ? scheduleDateFromSearch(location.search)
    : path === "schedule"
      ? deviceToday
      : null;
  const from = selectedScheduleDate ?? addDays(deviceToday, -2);
  const end = selectedScheduleDate ?? addDays(deviceToday, 42);
  const query = useQuery({
    queryKey: ["employee-hub", workspaceId, context?.userId, from, end],
    queryFn: () => getEmployeeHub(workspaceId, from, end),
    enabled: Boolean(workspaceId) && knownPage,
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
  // The API's "no" gets the one no-access card, never its raw sentence.
  if (isNoAccess(query.error))
    return (
      <NoAccessState
        homeHref={noAccessHomePath(context, "/app/employee-hub")}
      />
    );
  if (!knownPage) return <Navigate to="/app/employee-hub" replace />;
  // Loading and error in the "B" look (Mert 2026-10-14): never the server's sentence.
  if (query.isLoading)
    return (
      <LoadingOutline label="Loading Employee Hub" className="eh-loading">
        <Skeleton width={300} height={28} style={{ maxWidth: "100%", margin: "24px 0", borderRadius: 10 }} />
        <Skeleton width="100%" height={260} style={{ borderRadius: 20 }} />
      </LoadingOutline>
    );
  if (!query.data)
    return (
      <section className="employee-hub-page">
        <LoadError
          title="We couldn't load Employee Hub"
          detail="Your day didn't load. Nothing was changed."
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      </section>
    );
  const model = query.data;
  // Every page's own "today" is the primary location's (S-226).
  const zone = homeZone(model);
  const today = todayIn(zone, now);
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
          refreshing={query.isFetching}
          onRefresh={() => query.refetch()}
        />
      </section>
    );
  return (
    <section className="employee-hub-page" aria-labelledby="employee-hub-title" ref={scheduleSwipe.root}>
      {path === "schedule/lineup" ? (
        // Lineup: only the page header stays put, at its full size, as on the manager's phone Lineup (Mert
        // 2026-10-17 ~8:30 AM); the shell's frozen top leaves it alone (data-frozen-own).
        <div className="employee-lineup-pin" data-frozen-own="">
          <CatalogPageHeader {...pageCopy["schedule/lineup"]!} titleId="employee-hub-title" />
        </div>
      ) : (
        <CatalogPageHeader
          {...(pageCopy[path.startsWith("shift-hub") ? "shift-hub" : path] ??
            fallbackCopy)}
          titleId="employee-hub-title"
        />
      )}
      {query.isError ? (
        <RefreshError
          message="Employee Hub didn't refresh. This is the last information that loaded."
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {path === "schedule" ? (
        <>
          <EmployeeScheduleTabs tabsRef={scheduleSwipe.tabs} />
          <EmployeeMyShifts key={`${workspaceId}:${context?.userId}`} workspaceId={workspaceId} zone={zone} />
        </>
      ) : path === "schedule/team" ? (
        // The team's board is a desktop page (Mert 2026-10-17): a phone opens My shifts.
        phoneBars ? (
          <Navigate to={`/app/employee-hub/schedule${location.search}`} replace />
        ) : (
        <>
          <EmployeeScheduleTabs />
          <EmployeeScheduleBoard
            key={`${workspaceId}:${context?.userId}`}
            workspaceId={workspaceId}
            employeeId={model.employee.id}
            organizationName={context?.workspace.name ?? ""}
            zone={zone}
          />
        </>
        )
      ) : path === "schedule/lineup" ? (
        <>
          <EmployeeScheduleTabs tabsRef={scheduleSwipe.tabs} />
          <EmployeeLineup
            key={`${workspaceId}:${context?.userId}`}
            workspaceId={workspaceId}
            employeeId={model.employee.id}
            date={scheduleDateFromSearch(`?view=day&date=${new URLSearchParams(location.search).get("date") ?? ""}`) ?? today}
            timeFormat={model.settings.time_format}
            zone={zone}
          />
        </>
      ) : path.startsWith("shift-hub") ? (
        <ShiftExchangeHub key={`${workspaceId}:${context?.userId}`} workspaceId={workspaceId} zone={zone} />
      ) : (
        <AvailabilityView key={`${model.workspace_id}:${model.employee.id}`} model={model} refresh={refresh} />
      )}
    </section>
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
  const swipe = useTabSwipe({ tabs: AVAILABILITY_TABS, active, onSelect: select });
  function select(id: typeof active) {
    if (id === active) return;
    requestAppNavigation(() => {
      const search = new URLSearchParams(location.search);
      search.delete("tab");
      search.set("section", id);
      navigate({ pathname: location.pathname, search: `?${search}`, hash: "" });
      document.getElementById(`my-${id}-tab`)?.focus();
    });
  }
  return (
    <div className="employee-weekly-workspace" ref={swipe.root}>
      <div className="weekly-preferences-tabs" role="tablist" aria-label="My availability" ref={swipe.tabs}>
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
  // The primary location's zone, which the server checks the request against;
  // somebody who works nowhere has none and asks in the device's.
  const zone = model.time_off_timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [periodMode, setPeriodMode] = useState<"full_day" | "hours" | "per_date">("full_day");
  const [hours, setHours] = useState<TimeOffHours[]>([{ ...defaultTimeOffHours }]);
  const [dateDrafts,setDateDrafts] = useState<TimeOffDateDrafts>({});
  const [dateDefaults,setDateDefaults] = useState<TimeOffDateDraft>({mode:"full_day",hours:[{...defaultTimeOffHours}]});
  const dateDefaultsChosen = useRef(false);
  const [sent, setSent] = useState("");
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
  const today = todayIn(zone);
  const selectedDates = dateRange(start,end || start);
  const rangeTooLong = selectedDates.length > 31;
  const periods = selectedDates.flatMap(segment_date => {
    const choice = periodMode === "per_date" ? dateDrafts[segment_date] ?? dateDefaults : {mode:periodMode,hours};
    if (choice.mode === "skip") return [];
    return choice.mode === "full_day" ? [{segment_date,start_time:null,end_time:null,ends_next_day:false}]
      : choice.hours.map(range=>({...range,segment_date}));
  });
  const candidate = { periods, reason, expected_timezone: zone };
  const validation = timeOffSubmitInputSchema.safeParse({ ...candidate, operation_id: retry.current.key });
  const started = timeOffStarted(periods, zone);
  const urgent = !started && insideDecisionWindow(periods, zone, model.settings.time_off_lead_hours);
  const submit = useSubmitTimeOff(model.workspace_id);
  const timeOff = useMutation({
    mutationFn: () => {
      if (rangeTooLong) throw new Error("Choose a date range of at most 31 calendar days.");
      if (started) throw new Error("This time off has already started. Talk to your manager directly.");
      const signature = JSON.stringify(candidate);
      if (retry.current.signature !== signature) retry.current = { signature, key: crypto.randomUUID() };
      const command = timeOffSubmitInputSchema.safeParse({ ...candidate, operation_id: retry.current.key });
      if (!command.success) throw new Error(command.error.issues[0]?.message ?? "Check the requested dates and hours.");
      return submit.mutateAsync(command.data);
    },
    onSuccess: () => {
      setSent("Request sent.");
      setStart("");
      setEnd("");
      setReason("");
      setPeriodMode("full_day");
      setHours([{ ...defaultTimeOffHours }]);
      setDateDrafts({}); dateDefaultsChosen.current = false;
      retry.current = { signature: "", key: crypto.randomUUID() };
      refresh();
    },
  });
  const actionMutation = useMutation({
    mutationFn: (action: Parameters<typeof actOnEmployeeRequest>[1]) =>
      actOnEmployeeRequest(model.workspace_id, action),
    onSuccess: refresh,
    // BL-1043: the request changed meanwhile (the database's key): reload it.
    onError: (error) => { if (isStaleTimeOff(error)) refresh(); },
  });
  const currentTimeOffRequests = model.requests;
  const timeOffRequests = [...currentTimeOffRequests, ...[...cancellationDrafts.values()]
    .filter(request => !currentTimeOffRequests.some(current => current.id === request.id))
    .map(request => ({...request, cancellation:request.cancellation ? {...request.cancellation,can_request:false} : undefined}))];
  const navigationDialog = useAvailabilityNavigationGuard({
    dirty: Boolean(start || end || reason || periodMode !== "full_day" || Object.keys(dateDrafts).length),
    busy: timeOff.isPending || actionMutation.isPending,
    labels: timeOffNavigationLabels,
    onDiscard: () => {
      setStart(""); setEnd(""); setReason(""); setPeriodMode("full_day"); setHours([{...defaultTimeOffHours}]);
      setDateDrafts({}); dateDefaultsChosen.current = false;
      timeOff.reset();
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
          onSubmit={(event) => { event.preventDefault(); setSent(""); timeOff.mutate(); }}
        >
          <fieldset disabled={timeOff.isPending}>
          <legend className="sr-only">Time off details</legend>
          <p className="time-off-zone-note">Hours use {timeOffZoneName(zone)}.</p>
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
          {periodMode === "per_date" && !rangeTooLong ? <TimeOffDateFields dates={selectedDates} drafts={dateDrafts} defaults={dateDefaults} onChange={setDateDrafts} timeFormat={model.settings.time_format} presets={presets} /> : null}
          {Object.keys(dateDrafts).some(date=>!selectedDates.includes(date)) ? <p>Some customized dates are outside this range and will not be submitted. Their edits are kept if you restore those dates before submitting.</p> : null}
          {periodMode !== "per_date" && Object.keys(dateDrafts).length ? <p>Your per-date edits are kept if you switch back before submitting. The current time choice applies to every selected date.</p> : null}
          {periodMode === "per_date" && selectedDates.length && !rangeTooLong ? <p>{periods.length} requested period(s) across {new Set(periods.map(period=>period.segment_date)).size} date(s).</p> : null}
          {urgent ? <p className="time-off-urgent" role="status">This starts soon. Talk to your manager directly if it's urgent.</p> : null}
          <label>
            Note
            <textarea
              maxLength={1000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Optional context"
            />
          </label>
          {/* Why it can't be sent, above Submit: every reason that holds, each
              whole, none dropped (UI-FIELDMSG-2). */}
          <FieldNote
            id="time-off-check"
            error={
              [
                rangeTooLong ? "Choose a date range of at most 31 calendar days. No dates will be silently omitted." : null,
                started ? "This time off has already started. Talk to your manager directly." : null,
                !rangeTooLong && !started && start && !validation.success ? validation.error.issues[0]?.message : null,
              ]
                .filter(Boolean)
                .join(" ") || null
            }
          />
          <Button type="submit" disabled={timeOff.isPending || !validation.success || started || rangeTooLong}>
            Submit request
          </Button>
          </fieldset>
        </form>
        {sent ? <p className="time-off-sent" role="status">{sent}</p> : null}
        <InlineError id="time-off-submit" error={timeOff.error} />
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
                {request.display_status ?? statusLabel(request.status)} · Submitted{" "}
                {formatDate(request.created_at)}
                {request.status === "pending" && request.decide_by && request.periods?.[0]?.time_timezone
                  ? ` · Decision by ${formatTimeOffDeadline(request.decide_by, request.periods[0].time_timezone, model.settings.time_format)}` : ""}
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
        <InlineError
          id="time-off-action"
          error={isStaleTimeOff(actionMutation.error) ? new Error("This request changed. Review it again.") : actionMutation.error}
        />
      </HubSection>
    </div>
  );
}

// Rule 19: time off that has begun in the request's zone cannot be asked for.
function timeOffStarted(periods: readonly { segment_date: string; start_time: string | null }[], zone: string) {
  const first = periods[0];
  if (!first) return false;
  const now = timeOffWallParts(new Date().toISOString(), zone);
  if (first.segment_date !== now.date) return first.segment_date < now.date;
  return !first.start_time || first.start_time.slice(0, 5) <= now.clock.slice(0, 5);
}
// Rule 16: sent within the decision window, the decision is due when it starts.
// Wall-clock hours in the request's zone; a DST day may be an hour off, the
// server's decide_by is what counts.
function insideDecisionWindow(periods: readonly { segment_date: string; start_time: string | null }[], zone: string, leadHours: number | undefined) {
  const first = periods[0];
  if (!first || leadHours === undefined) return false;
  const now = timeOffWallParts(new Date().toISOString(), zone);
  const hours = (Date.parse(first.segment_date + "T" + (first.start_time ?? "00:00").slice(0, 5) + ":00Z") - Date.parse(now.date + "T" + now.clock + "Z")) / 3_600_000;
  return hours < leadHours;
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
function Empty({ text }: { text: string }) {
  return <p className="muted empty-inline">{text}</p>;
}
/** A section's own error, said whole, only while there is one (UI-FIELDMSG-2). */
function InlineError({ id, error }: { id: string; error: unknown }) {
  return (
    <FieldNote
      id={id}
      error={error ? (error instanceof Error ? error.message : "Operation failed") : null}
    />
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
  const label = status.replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
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
