import type { EmployeeHubReadModel } from "@newfork/shared";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  CheckCheck,
  ChevronRight,
  CircleCheck,
  Clock3,
  MapPin,
  Plus,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { can } from "../auth/can";
import {
  addDays,
  formatTime,
  formatTimeRange,
} from "../schedule/lib/scheduleDateTime";
import { dateInZone, validZone } from "../lib/today";
import {
  greeting,
  nextShift,
  shiftDate,
  shiftInstant,
  shiftState,
  shiftZone,
} from "./dashboard-model";
import { CardHeading } from "./DashboardPrimitives";
import {
  NotificationBell,
  RecentChanges,
  Announcements,
  ComingUpDates,
} from "./DashboardCommunications";
import { PersonalTasks } from "./PersonalReminders";
import { ShiftSheet, ShiftUnavailable } from "./ShiftSheet";
import { CatalogPageHeader } from "../views/CatalogPageHeader";
import "./employee-dashboard.css";
import { getExchanges } from "./shift-exchanges/exchange-data";
import { useHubOnline } from "./useHubClock";
import { RefreshError } from "../shell/LoadState";
const base = "/app/employee-hub";
export function EmployeeDashboard({
  model,
  now,
  stale,
  onRefresh,
}: {
  model: EmployeeHubReadModel;
  now: Date;
  stale: boolean;
  onRefresh: () => void;
}) {
  const { context } = useAuth();
  const readsPosts = can(context, "announcement.read");
  const online = useHubOnline();
  const [search, setSearch] = useSearchParams();
  const shift = nextShift(model, now);
  const zone = shift
    ? shiftZone(model, shift)
    : validZone(model.locations[0]?.timezone);
  const today = dateInZone(now, zone);
  const exchanges = useQuery({
    queryKey: ["shift-exchanges", model.workspace_id, context?.userId, false],
    queryFn: () => getExchanges(model.workspace_id),
    enabled: Boolean(context?.userId),
    refetchInterval: 60_000,
  });
  // A failed check with nothing cached is unknown, not "nothing waiting".
  const exchangesUnknown = exchanges.isError && !exchanges.data;
  const activeExchanges = exchanges.data?.cases.filter((item) => item.status === "open") ?? [];
  const exchangeActions = activeExchanges.filter((item) => item.applications.some((a) => a.employee_id === model.employee.id && a.status === "invited"));
  const needsAction = [
    ...exchangeActions.map((item) => ({ id: item.id, title: item.kind === "swap" ? "Respond to a shift swap" : "A teammate asked for cover", detail: `${item.shift.scheduled_date} · ${item.shift.location_name} · ${item.shift.job_name}`, href: `${base}/shift-hub?case=${item.id}&hub_view=requests` })),
  ];
  const waiting = model.requests.filter(
    (request) => request.can_cancel || /pending|awaiting/.test(request.status),
  );
  const waitingCount = waiting.length + activeExchanges.filter((item) => !exchangeActions.includes(item) && (item.is_owner || item.applications.some((a) => a.employee_id === model.employee.id && a.status === "pending_manager"))).length;
  const upcoming = [...model.shifts]
    .filter(
      (item) =>
        shiftState(item, now, shiftZone(model, item)).state !== "finished",
    )
    .sort((a, b) => shiftInstant(a, model) - shiftInstant(b, model));
  const selected = model.shifts.find((item) => item.id === search.get("shift"));
  const firstName = model.employee.display_name.trim().split(/\s+/)[0];
  const scheduledToday = model.shifts.filter(
    (item) => item.scheduled_date === dateInZone(now, shiftZone(model, item)),
  );
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const closeDetail = () => {
    const params = new URLSearchParams(search);
    params.delete("shift");
    setSearch(params, { replace: true });
  };
  return (
    <div className="eh-dashboard">
      <div className="eh-context-bar">
        <Link to="/account/workspaces" className="eh-workspace-link">
          <span className="eh-workspace-mark">
            {context?.workspace.name?.slice(0, 1) || "N"}
          </span>
          <span>{context?.workspace.name ?? "Your workspace"}</span>
          <ChevronRight size={14} />
        </Link>
        <div className="eh-context-actions">
          <span className="eh-private">
            <ShieldCheck size={14} /> Your personal space
          </span>
          <Link
            className="eh-icon-button"
            to="/account/profile"
            aria-label="Your profile"
          >
            <span className="eh-avatar">{firstName?.slice(0, 1)}</span>
          </Link>
          {context?.permissions.includes("notifications.read") && (
            <NotificationBell workspaceId={model.workspace_id} />
          )}
        </div>
      </div>
      <CatalogPageHeader
        eyebrow="A LITTLE CLARITY FOR YOUR DAY"
        title={`${greeting(now)}, ${firstName}.`}
        titleId="employee-hub-title"
        description={
          scheduledToday.length
            ? `You have ${scheduledToday.length === 1 ? "a shift" : `${scheduledToday.length} shifts`} today. Let’s get you ready.`
            : "A clear view of what’s next. Make the day yours."
        }
        action={
          <div className="eh-date">
            <span>
              {now.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </span>
            <time dateTime={now.toISOString()}>
              {now.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                hour12: model.settings.time_format !== "24h",
              })}
            </time>
            <small>Local time</small>
          </div>
        }
      />
      {!online ? (
        <div className="eh-notice" role="status">
          You’re offline. Showing your last loaded schedule.{" "}
          <button onClick={onRefresh}>Refresh schedule</button>
        </div>
      ) : stale ? (
        <RefreshError
          message="Your day didn't refresh. This is the last schedule that loaded."
          onRetry={onRefresh}
        />
      ) : null}
      <div className="eh-dashboard-grid">
        <section className="eh-hero" aria-label="Your shift">
          <div className="eh-hero-top">
            <span className="eh-eyebrow">
              <span className="eh-status-dot" />
              {shift
                ? shiftState(shift, now, zone).state === "scheduled_now"
                  ? "SCHEDULED NOW"
                  : shift.scheduled_date === today
                    ? "TODAY’S SHIFT"
                    : "YOUR NEXT SHIFT"
                : "LOOKING AHEAD"}
            </span>
            <span className="eh-hero-icon">
              <Clock3 size={25} />
            </span>
          </div>
          {shift ? (
            <>
              <p className="eh-hero-date">
                {shift.scheduled_date === today
                  ? "Today"
                  : shiftDate(shift.scheduled_date, true)}
              </p>
              <h2 className="eh-shift-time">
                {formatTime(shift.start_time, model.settings.time_format)}
                <span>—</span>
                {formatTime(shift.end_time, model.settings.time_format)}
              </h2>
              <div className="eh-shift-meta">
                <span>
                  <MapPin size={15} />
                  {shift.location_name}
                </span>
                <span>{shift.job_name}</span>
              </div>
              <p className="eh-hero-note">
                {shiftState(shift, now, zone).state === "scheduled_now"
                  ? "Scheduled shift in progress"
                  : shift.scheduled_date === today
                    ? startsIn(shiftInstant(shift, model) - now.getTime())
                    : "Your next published shift"}
                <span>
                  {" "}
                  · {zone.replaceAll("_", " ")}
                  {!model.locations.find(
                    (item) => item.id === shift.location_id,
                  )?.timezone
                    ? " (device time)"
                    : ""}
                </span>
                {shift.end_time <= shift.start_time ? " · Ends next day" : ""}
              </p>
              <div className="eh-hero-actions">
                <Link className="eh-hero-button" to={`?shift=${shift.id}`}>
                  View shift
                  <ArrowUpRight size={18} />
                </Link>
              </div>
            </>
          ) : (
            <>
              <h2>A little room to plan ahead.</h2>
              <p className="eh-hero-sub">
                No upcoming shifts published in this range.
              </p>
              <p className="eh-hero-note">
                Keep your availability up to date. Your next shift will appear
                here when it’s published.
              </p>
              <Link
                className="eh-hero-button"
                to={`${base}/my-availability?section=availability`}
              >
                Update availability
                <ArrowUpRight size={18} />
              </Link>
            </>
          )}
        </section>
        <section
          className={`eh-card eh-attention${needsAction.length ? "" : " is-clear"}`}
          aria-labelledby="eh-attention-title"
        >
          <CardHeading
            icon={<CircleCheck size={18} />}
            title="On your radar"
            id="eh-attention-title"
          />
          <div className="eh-attention-lead">
            <span
              className={`eh-attention-number${needsAction.length ? " has-actions" : ""}`}
            >
              {needsAction.length ? (
                String(needsAction.length).padStart(2, "0")
              ) : (
                <CheckCheck size={34} />
              )}
            </span>
            <div>
              <strong>
                {needsAction.length
                  ? "Waiting on you"
                  : exchangesUnknown
                    ? "Requests couldn’t be checked"
                    : "You’re all caught up"}
              </strong>
              <p>
                {needsAction.length
                  ? "A quick response keeps things moving."
                  : exchangesUnknown
                    ? "This section couldn’t be loaded."
                    : "No requests need your response."}
              </p>
            </div>
          </div>
          {needsAction.slice(0, 2).map((request) => (
            <Link
              className="eh-list-link"
              key={request.id}
              to={request.href}
            >
              <span>
                <strong>{request.title}</strong>
                <small>{request.detail}</small>
              </span>
              <ArrowUpRight size={17} />
            </Link>
          ))}
          <Link className="eh-waiting" to={`${base}/shift-hub?hub_view=requests`}>
            <Clock3 size={16} />
            <span>
              {waitingCount
                ? `${waitingCount} request${waitingCount === 1 ? "" : "s"} awaiting a response`
                : "View your requests"}
            </span>
            <ChevronRight size={15} />
          </Link>
        </section>
        <nav className="eh-shortcuts" aria-label="Employee shortcuts">
          {[
            {
              label: "My schedule",
              detail: "Your week at a glance",
              icon: CalendarDays,
              to: "schedule",
            },
            {
              label: "Request time off",
              detail: "Make room for your plans",
              icon: ArrowDownLeft,
              to: "my-availability?section=time-off#time-off",
            },
            {
              label: "My availability",
              detail: "Let your team know",
              icon: Clock3,
              to: "my-availability?section=availability",
            },
            {
              label: "Open shifts",
              detail: "Find another opportunity",
              icon: Plus,
              to: "shift-hub?hub_view=available",
            },
          ].map(({ label, detail, icon: Icon, to }) => (
            <Link key={label} to={`${base}/${to}`}>
              <span className="eh-shortcut-icon">
                <Icon size={20} />
              </span>
              <span>
                <strong>{label}</strong>
                <small>{detail}</small>
              </span>
              <ArrowUpRight size={16} className="eh-shortcut-arrow" />
            </Link>
          ))}
        </nav>
        <section
          className="eh-card eh-upcoming"
          aria-labelledby="eh-upcoming-title"
        >
          <CardHeading
            icon={<CalendarDays size={18} />}
            title="Coming up"
            id="eh-upcoming-title"
            to={`${base}/schedule`}
          />
          <p className="eh-section-description">
            The next 7 days · dates in {zone.replaceAll("_", " ")}
          </p>
          <div className="eh-week" aria-label="Next seven days">
            {week.map((date) => {
              const count = model.shifts.filter(
                (item) => item.scheduled_date === date,
              ).length;
              return (
                <Link
                  key={date}
                  to={`${base}/schedule?date=${date}&view=day`}
                  className={date === today ? "is-today" : ""}
                  aria-label={`${shiftDate(date)}, ${count} scheduled shifts`}
                >
                  <span>
                    {new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
                      weekday: "short",
                      timeZone: "UTC",
                    })}
                  </span>
                  <strong>{Number(date.slice(-2))}</strong>
                  <i className={count ? "has-shift" : ""} />
                </Link>
              );
            })}
          </div>
          {upcoming.slice(0, 3).map((item) => (
            <Link
              className="eh-upcoming-row"
              to={`?shift=${item.id}`}
              key={item.id}
            >
              <span className="eh-date-tile">
                <small>
                  {new Date(
                    `${item.scheduled_date}T12:00:00Z`,
                  ).toLocaleDateString("en-US", {
                    month: "short",
                    timeZone: "UTC",
                  })}
                </small>
                <strong>{Number(item.scheduled_date.slice(-2))}</strong>
              </span>
              <span>
                <strong>
                  {formatTimeRange(
                    item.start_time,
                    item.end_time,
                    model.settings.time_format,
                    " – ",
                  )}
                </strong>
                <small>
                  {item.job_name} · {item.location_name}
                </small>
              </span>
              <ChevronRight size={17} />
            </Link>
          ))}
          {!upcoming.length && (
            <p className="eh-empty">
              Your next published shifts will appear here.
            </p>
          )}
          {readsPosts && (
            <ComingUpDates
              workspaceId={model.workspace_id}
              myLocationIds={model.locations.map((location) => location.id)}
              timeFormat={model.settings.time_format}
            />
          )}
        </section>
        <PersonalTasks
          key={`${model.workspace_id}:${model.employee.id}`}
          workspaceId={model.workspace_id}
          employeeId={model.employee.id}
          online={online}
        />
        {context?.permissions.includes("notifications.read") && (
          <RecentChanges workspaceId={model.workspace_id} />
        )}
        {readsPosts && <Announcements workspaceId={model.workspace_id} />}
        <section className="eh-card eh-team">
          <CardHeading icon={<Users size={18} />} title="Your team" />
          <p className="eh-section-description">
            People at your assigned locations
          </p>
          <div className="eh-team-list">
            {model.team.slice(0, 4).map((member) => (
              <div key={member.id}>
                <span className="eh-team-avatar">
                  {member.display_name
                    .split(/\s+/)
                    .map((name) => name[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <span>
                  <strong>{member.display_name}</strong>
                  <small>{member.job_names.join(" · ") || "Team member"}</small>
                </span>
              </div>
            ))}
          </div>
          {!model.team.length && (
            <p className="eh-empty">
              Your team will appear here once you share a location.
            </p>
          )}
        </section>
      </div>
      <footer className="eh-footer">
        <span>
          <Sparkles size={14} /> A clear day starts here.
        </span>
        <Link to="/account/preferences/notifications">
          Notification preferences
          <ArrowUpRight size={13} />
        </Link>
      </footer>
      {selected && (
        <ShiftSheet shift={selected} model={model} onClose={closeDetail} />
      )}
      {search.has("shift") && !selected && (
        <ShiftUnavailable onClose={closeDetail} />
      )}
    </div>
  );
}

function startsIn(milliseconds: number) {
  const minutes = Math.max(0, Math.ceil(milliseconds / 60_000));
  return minutes >= 60
    ? `Starts in ${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`
    : minutes
      ? `Starts in ${minutes} min`
      : "Starting now";
}
