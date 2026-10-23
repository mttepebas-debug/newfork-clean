import { todayIn } from "../lib/today";
import { ZoneNote } from "../shell/ZoneNote";
import { homeZone } from "../employee-hub/dashboard-model";
import type { EmployeeHubReadModel } from "@newfork/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, CalendarOff } from "lucide-react";
import { useEffect } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { WeeklyPreferencesPanel } from "../availability/WeeklyPreferencesPanel";
import { requestAppNavigation } from "../shell/leave-guard";
import { useTabSwipe } from "../shell/useTabSwipe";
import { TimeOffRequests } from "../time-off/TimeOffRequests";
import { useAuth } from "../auth/AuthContext";
import { getEmployeeHub } from "../employee-hub/employee-hub-data";

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
          <ZoneNote zone={zone} now={now} />
        </div>
      ) : (
        <>
          <CatalogPageHeader
            {...(pageCopy[path.startsWith("shift-hub") ? "shift-hub" : path] ??
              fallbackCopy)}
            titleId="employee-hub-title"
          />
          <ZoneNote zone={zone} now={now} />
        </>
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
    { id: "time-off", label: "Time off", icon: CalendarOff },
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
          <TimeOffRequests workspaceId={model.workspace_id} timeFormat={model.settings.time_format} />
        ) : <WeeklyPreferencesPanel workspaceId={model.workspace_id} audience="employee" onSaved={refresh} />}
      </div>
    </div>
  );
}
function addDays(iso: string, count: number) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

interface HubMutationProps {
  model: EmployeeHubReadModel;
  refresh: () => void;
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

export default EmployeeHubPage;
