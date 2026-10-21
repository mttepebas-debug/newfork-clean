import type { EmployeeHubReadModel, EmployeeHubShift } from "@newfork/shared";
import { ZoneNote } from "../shell/ZoneNote";
import { useQuery } from "@tanstack/react-query";
import { useRef, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  Check,
  ChevronRight,
  CircleCheck,
  CircleX,
  FileText,
  MapPin,
  ArrowLeftRight,
} from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { can } from "../auth/can";
import { formatTime } from "../schedule/lib/scheduleDateTime";
import { dateInZone } from "../lib/today";
import { greeting, nextShift, shiftDate, shiftInstant, homeZone, shiftState, shiftZone } from "./dashboard-model";
import {
  ARC,
  arcNow,
  arcPath,
  arcPoint,
  arcSegments,
  countdown,
  daySlot,
  homeSubline,
  homeWeek,
  initials,
  managerOnFloor,
  type FloorManager,
  minutesOf,
} from "./home-model";
import { ago, useHomeData, type HomeNeed, type HomeUpdate } from "./home-data";
import { useHomeScroll } from "./home-motion";
import { HomeWeekStrip } from "./HomeWeekStrip";
import { HomeNoticeDeck } from "./HomeNoticeDeck";
import { HomeSection } from "./HomeSection";
import { ComingUpDates, useHubAnnouncements } from "./DashboardCommunications";
import { PersonalTasks } from "./PersonalReminders";
import { ShiftSheet, ShiftUnavailable } from "./ShiftSheet";
import { usePickupShifts } from "./shift-exchanges/pickup";
import { loadWeeklyPreferences } from "../availability/availability-data";
import { OwnAvailabilityFlag } from "./OwnAvailabilityFlag";
import { ownAvailabilityClash } from "./own-availability";
import { EmployeeAlertsEntry } from "../phone-alerts/EmployeeAlertsEntry";
import "./employee-dashboard.css";
import "./home-daylight.css";
import { useHubOnline } from "./useHubClock";
import { LinesOutline, LoadError, RefreshError } from "../shell/LoadState";
import { NotificationBell } from "../notifications/NotificationViews";
import { employeeAnnouncementsPath } from "../communications/announcement-paths";

const base = "/app/employee-hub";

/** Minutes after midnight on the wall clock of `zone`. */
function clockMinutes(now: Date, zone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return value("hour") * 60 + value("minute");
}

/**
 * The employee's Home, variant A "Gün ışığı" (Mert 2026-10-18; Employee
 * Home variants page, A). A big greeting that fades into the top bar as the
 * page scrolls, the day's arc, the next shift, the next seven days, then the
 * sections in one order: what needs an answer, what happened, the week, the
 * people, the open shifts, the team's notices, the dates, the reminders.
 */
export function EmployeeDashboard({
  model,
  now,
  stale,
  refreshing = false,
  onRefresh,
}: {
  model: EmployeeHubReadModel;
  now: Date;
  stale: boolean;
  /** True while a refresh is on its way. */
  refreshing?: boolean;
  onRefresh: () => Promise<unknown> | void;
}) {
  const { context } = useAuth();
  const readsPosts = can(context, "announcement.read");
  const online = useHubOnline();
  const root = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useSearchParams();
  const shift = nextShift(model, now);
  const zone = shift ? shiftZone(model, shift) : homeZone(model);
  const today = dateInZone(now, zone);
  const minute = clockMinutes(now, zone);
  // QA 38, S-151 (3): open shifts here are released shifts in the pool, as on Shift Hub.
  const pickups = usePickupShifts(model.workspace_id, homeZone(model));
  const week = homeWeek(model, today, pickups.map((item) => item.scheduled_date));
  const data = useHomeData(model, today);
  const far = useHomeScroll(root);
  const selected = model.shifts.find((item) => item.id === search.get("shift"));
  // The employee's own week, read where My Availability reads it: a shift on
  // hours they marked carries a small note (spec "Kurallar" 5). No week, no note.
  const ownWeek = useQuery({
    queryKey: ["weekly-preferences", model.workspace_id, "workspace", "self"],
    queryFn: () => loadWeeklyPreferences(model.workspace_id),
    retry: false,
  });
  const ownWeekPattern = ownWeek.data?.employee.submitted ? ownWeek.data.employee.preference : undefined;
  const clashOf = (item: { scheduled_date: string; start_time: string; end_time: string }) =>
    ownAvailabilityClash(ownWeekPattern, item, model.settings.time_format);
  const firstName = model.employee.display_name.trim().split(/\s+/)[0] ?? "";
  const closeDetail = () => {
    const params = new URLSearchParams(search);
    params.delete("shift");
    setSearch(params, { replace: true });
  };
  const state = shift ? shiftState(shift, now, zone).state : null;
  const startsIn = shift ? shiftInstant(shift, model) - now.getTime() : 0;
  const endsIn = shift ? shiftInstant({ ...shift, start_time: shift.end_time, scheduled_date: shift.end_time <= shift.start_time ? nextDay(shift.scheduled_date) : shift.scheduled_date }, model) - now.getTime() : 0;
  const todayShifts = week[0]!.shifts;
  const endedToday = todayShifts.filter((item) => shiftState(item, now, zone).state === "finished");
  const arcShifts = shift?.scheduled_date === today ? todayShifts : endedToday.length ? endedToday : [];
  const open = pickups
    .filter((item) => !item.starts_at || Date.parse(item.starts_at) > now.getTime())
    .sort((a, b) => (a.starts_at ?? a.scheduled_date).localeCompare(b.starts_at ?? b.scheduled_date))
    .slice(0, 8);
  const format = model.settings.time_format;
  // The next three shifts, as Home always looked at, whether or not they fall in the strip's seven days.
  const flagged = [...model.shifts]
    .filter((item) => shiftState(item, now, shiftZone(model, item)).state !== "finished")
    .sort((a, b) => shiftInstant(a, model) - shiftInstant(b, model))
    .slice(0, 3)
    .flatMap((item) => {
      const when = clashOf(item);
      return when ? [{ item, when }] : [];
    });
  const pill = shift ? (
    <Link
      className={`dl-pill${far ? " is-shown" : ""}`}
      to={`?shift=${shift.id}`}
      tabIndex={far ? 0 : -1}
      aria-hidden={!far}
      data-bar-shown={far ? "" : undefined}
    >
      <i className={`dl-pulse${state === "scheduled_now" ? " is-on" : ""}`} />
      {state === "scheduled_now" ? (
        <>
          On shift · <b>{countdown(endsIn)}</b> left
        </>
      ) : (
        <>
          {shift.scheduled_date === today ? "" : `${relDay(shift.scheduled_date, today)} `}
          {formatTime(shift.start_time, format, "long")} · in <b>{countdown(startsIn)}</b>
        </>
      )}
    </Link>
  ) : null;
  const phoneSlot = typeof document === "undefined" ? null : document.getElementById("mm-top-mid");

  return (
    <div className={`eh-dashboard dl-home${far ? " is-far" : ""}`} data-slot={daySlot(minute)} ref={root}>
      <div className="dl-sky" aria-hidden />
      {phoneSlot && pill ? createPortal(pill, phoneSlot) : null}
      {/* The desktop bar runs from the menu to the screen's edge: the next shift's
          pill in the middle, the bell and the profile at the right; the workspace's
          name is at the top of the menu (Mert 2026-10-19, CALISAN-HOME-HIZA). */}
      <div className="eh-context-bar">
        <div className="dl-desk-pill">{pill}</div>
        <div className="eh-context-actions">
          {can(context, "notifications.read_own") ? <NotificationBell workspaceId={model.workspace_id} className="eh-icon-button" /> : null}
          <Link className="eh-icon-button" to="/account/profile" aria-label="Your profile">
            <span className="eh-avatar">{firstName.slice(0, 1)}</span>
          </Link>
        </div>
      </div>
      <div className="dl-body">
        {!online ? (
          <div className="dl-offline" role="status">
            You’re offline. Showing your last loaded schedule.{" "}
            <button type="button" onClick={() => void onRefresh()}>
              Retry
            </button>
          </div>
        ) : stale ? (
          <RefreshError
            message="Your day didn't refresh. This is the last schedule that loaded."
            retrying={refreshing}
            onRetry={() => void onRefresh()}
          />
        ) : null}
        <section className="dl-hero" aria-label="Your day">
          <p className="dl-date">
            {new Date(`${today}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}
          </p>
          <ZoneNote zone={homeZone(model)} now={now} />
          <h1
            className="dl-greet"
            id="employee-hub-title"
            style={{ "--ch": `${greetingAt(minute, now)}, ${firstName}.`.length } as CSSProperties}
          >
            <span>{greetingAt(minute, now)},</span> <span className="dl-nm">{firstName}.</span>
          </h1>
          <p className="dl-sub">{homeSubline(model, now)}</p>
          {arcShifts.length ? <DayArc shifts={arcShifts} minute={minute} done={(item) => shiftState(item, now, zone).state === "finished"} /> : null}
          <HeroCard
            shift={shift}
            model={model}
            today={today}
            state={state}
            startsIn={startsIn}
            endsIn={endsIn}
            area={shift ? data.areaFor(shift) : null}
            manager={shift ? managerOnFloor(model, shift) : null}
            openCount={pickups.length}
          />
          <div className="dl-wh">
            <h2>Next 7 days</h2>
            <Link className="dl-lnk" to={`${base}/schedule`}>
              Full schedule <ChevronRight size={16} />
            </Link>
          </div>
          <HomeWeekStrip model={model} week={week} today={today} />
          {/* A coming shift on hours the employee marked unavailable carries a note (spec "Kurallar" 5). */}
          {flagged.length ? (
            <ul className="dl-flags" aria-label="Shifts on hours you marked unavailable">
              {flagged.map(({ item, when }) => (
                <li key={item.id}>
                  <Link className="dl-flag-shift" to={`?shift=${item.id}`}>
                    {relDay(item.scheduled_date, today)} · {formatTime(item.start_time, format, "long")} – {formatTime(item.end_time, format, "long")}
                  </Link>
                  <OwnAvailabilityFlag when={when} shiftId={item.id} />
                </li>
              ))}
            </ul>
          ) : null}
        </section>
        <div className="dl-secs">
          {/* Phone alerts' first offer, right under "Your day" on this device's first Home (TELEFON-TUR2, K26). */}
          <HomeSection name="alerts-first" bare>
            <EmployeeAlertsEntry place="first" hasShifts={week.some((day) => day.shifts.length > 0)} />
          </HomeSection>
          <HomeSection name="needs" title="Needs you" count={data.needs.length}>
            <NeedsList needs={data.needs} unknown={data.needsUnknown} />
          </HomeSection>
          {/* Updates, Your week and Pick up a shift stay with nothing in them, each with
              one quiet line (Mert 2026-10-19, CALISAN-HOME-HIZA). */}
          <HomeSection name="updates" title="Updates">
            <UpdatesList updates={data.updates} now={now} />
          </HomeSection>
          {/* Phone alerts' block after the first Home: one entry per opening (TELEFON-TUR2, K26). */}
          <HomeSection name="alerts" bare>
            <EmployeeAlertsEntry place="block" hasShifts={week.some((day) => day.shifts.length > 0)} />
          </HomeSection>
          <HomeSection
            name="week"
            title="Your week"
            link={
              <Link className="dl-lnk" to={`${base}/schedule`}>
                Schedule <ChevronRight size={16} />
              </Link>
            }
          >
            <WeekSummary week={week} today={today} />
          </HomeSection>
          <HomeSection
            name="open"
            title="Pick up a shift"
            count={open.length}
            link={
              <Link className="dl-lnk" to={`${base}/shift-hub?hub_view=available`} aria-label="All open shifts">
                All <ChevronRight size={16} />
              </Link>
            }
          >
            {open.length ? (
              <div className="dl-open" role="list" aria-label="Open shifts to pick up" data-own-drag="">
                {open.map((item) => (
                  <Link role="listitem" className="dl-oc" key={item.id} to={`${base}/shift-hub?hub_view=available`}>
                    <span className="dl-oc-d">{item.scheduled_date === nextDay(today) ? "Tomorrow" : shiftDate(item.scheduled_date)}</span>
                    <b>
                      {item.start_time && item.end_time
                        ? `${formatTime(item.start_time, format)} – ${formatTime(item.end_time, format)}`
                        : (item.shift_type_name ?? "")}
                    </b>
                    <span>
                      {item.location_name} · {item.job_name}
                    </span>
                    <em>See in Requests</em>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="dl-empty">No open shifts right now.</p>
            )}
          </HomeSection>
          {readsPosts ? <Notices workspaceId={model.workspace_id} now={now} /> : null}
          {readsPosts ? (
            <HomeSection name="dates" title="Coming up" hideEmpty>
              <ComingUpDates
                workspaceId={model.workspace_id}
                myLocationIds={model.locations.map((location) => location.id)}
                timeFormat={format}
              />
            </HomeSection>
          ) : null}
          <HomeSection name="rem" title="My reminders">
            <PersonalTasks
              key={`${model.workspace_id}:${model.employee.id}`}
              workspaceId={model.workspace_id}
              employeeId={model.employee.id}
              online={online}
            />
          </HomeSection>
        </div>
        <footer className="dl-end">
          <span className="dl-end-i">
            <Check size={20} />
          </span>
          <p>That’s everything for now</p>
          <small>Pull down at the top to refresh</small>
        </footer>
      </div>
      {selected && <ShiftSheet shift={selected} model={model} clash={clashOf(selected)} onClose={closeDetail} />}
      {search.has("shift") && !selected && <ShiftUnavailable onClose={closeDetail} />}
    </div>
  );
}

const nextDay = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
const relDay = (date: string, today: string) => (date === today ? "Today" : date === nextDay(today) ? "Tomorrow" : shiftDate(date));
/** The greeting follows the shift's place; past midnight it is "Up late". */
function greetingAt(minute: number, now: Date) {
  return minute < 5 * 60 ? "Up late" : greeting(new Date(now.getFullYear(), 0, 1, Math.floor(minute / 60)));
}

function DayArc({ shifts, minute, done }: { shifts: EmployeeHubShift[]; minute: number; done: (shift: EmployeeHubShift) => boolean }) {
  const segments = arcSegments(shifts);
  const [nx, ny] = arcPoint(arcNow(minute));
  const labels: [number, string][] = [
    [360, "6 AM"],
    [720, "Noon"],
    [1080, "6 PM"],
    [1440, "Midnight"],
  ];
  return (
    <div className="dl-arc" aria-hidden>
      <svg viewBox={`0 0 ${ARC.width} 74`}>
        <path className="dl-arc-base" d={arcPath(0, 1, 72)} />
        {segments.map((segment, index) => (
          <path key={shifts[index]!.id} className={`dl-arc-seg${done(shifts[index]!) ? " is-done" : ""}`} d={arcPath(segment.from, segment.to)} pathLength={1} />
        ))}
        {minute >= 360 ? (
          <g className="dl-arc-now" transform={`translate(${nx.toFixed(1)} ${ny.toFixed(1)})`}>
            <circle r="10" className="dl-arc-halo" />
            <circle r="5" className="dl-arc-dot" />
          </g>
        ) : null}
        {labels.map(([at, text], index) => (
          <text key={text} x={arcPoint((at - 360) / 1080)[0].toFixed(1)} y="70" className="dl-arc-lb" textAnchor={index === 0 ? "start" : index === 3 ? "end" : "middle"}>
            {text}
          </text>
        ))}
      </svg>
    </div>
  );
}

function HeroCard({
  shift,
  model,
  today,
  state,
  startsIn,
  endsIn,
  area,
  manager,
  openCount,
}: {
  shift: EmployeeHubShift | null;
  model: EmployeeHubReadModel;
  today: string;
  state: ReturnType<typeof shiftState>["state"] | null;
  startsIn: number;
  endsIn: number;
  area: string | null;
  manager: FloorManager | null;
  openCount: number;
}) {
  const format = model.settings.time_format;
  if (!shift) {
    return (
      <div className="dl-shift is-empty">
        <span className="dl-st">This week</span>
        <span className="dl-et">No shifts on your schedule yet.</span>
        <span className="dl-ea">
          <Link className="dl-btn" to={`${base}/my-availability?section=availability`}>
            Update availability
          </Link>
          {openCount ? (
            <Link className="dl-btn is-sec" to={`${base}/shift-hub?hub_view=available`}>
              See {openCount} open shift{openCount === 1 ? "" : "s"}
            </Link>
          ) : null}
        </span>
      </div>
    );
  }
  const on = state === "scheduled_now";
  const length = Math.max(1, startsIn < 0 ? endsIn - startsIn : 1);
  const progress = on ? Math.min(1, Math.max(0, -startsIn / length)) : 0;
  return (
    <Link
      className={`dl-shift${on ? " is-on" : ""}`}
      to={`?shift=${shift.id}`}
      aria-label={`Open details for your ${relDay(shift.scheduled_date, today).toLowerCase()} shift, ${formatTime(shift.start_time, format, "long")} to ${formatTime(shift.end_time, format, "long")}`}
    >
      <span className="dl-st">
        <i className={`dl-pulse${on ? " is-on" : ""}`} />
        <span>
          {on ? (
            <>
              On shift now · <b>{countdown(endsIn)}</b> left
            </>
          ) : (
            <>
              {relDay(shift.scheduled_date, today)} · Starts in <b>{countdown(startsIn)}</b>
            </>
          )}
        </span>
      </span>
      <span className="dl-time">
        {formatTime(shift.start_time, format, "long")}
        <span className="dl-dash">–</span>
        {formatTime(shift.end_time, format, "long")}
      </span>
      <span className="dl-meta">
        <span>
          <MapPin size={15} />
          {shift.location_name}
        </span>
        <span>{shift.job_name}</span>
        {area ? <span>{area}</span> : null}
        {minutesOf(shift.end_time) <= minutesOf(shift.start_time) ? <span>Ends next day</span> : null}
      </span>
      {manager ? (
        <span className="dl-mof">
          <span className="dl-av dl-av-sm" aria-hidden>
            {initials(manager.name)}
          </span>
          <span>
            <b>{manager.name}</b> · Manager on the floor
          </span>
        </span>
      ) : null}
      {on ? (
        <span className="dl-prog" style={{ "--f": progress.toFixed(3) } as CSSProperties}>
          <i />
        </span>
      ) : null}
    </Link>
  );
}

function NeedsList({ needs, unknown }: { needs: HomeNeed[]; unknown: boolean }) {
  if (!needs.length)
    return (
      <div className="dl-calm">
        <CircleCheck size={34} />
        <div>
          <b>{unknown ? "Requests couldn’t be checked" : "You’re all caught up"}</b>
          <span>{unknown ? "This section couldn’t be loaded." : "Nothing needs your answer right now."}</span>
        </div>
      </div>
    );
  return (
    <ul className="dl-rows">
      {needs.map((need) => (
        <li key={need.id}>
          <Link className="dl-row" to={need.href}>
            <span className={`dl-ri dl-ri-${need.kind}`}>{need.kind === "swap" ? <ArrowLeftRight size={20} /> : <FileText size={20} />}</span>
            <span className="dl-rt">
              <b>{need.title}</b>
              <small>{need.detail}</small>
              <em>{need.cta}</em>
            </span>
            <ChevronRight size={18} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function UpdatesList({ updates, now }: { updates: HomeUpdate[]; now: Date }) {
  if (!updates.length) return <p className="dl-empty">Nothing new yet.</p>;
  return (
    <ul className="dl-rows">
      {updates.map((update) => {
        const icon = update.kind === "no" ? <CircleX size={20} /> : update.kind === "cal" ? <CalendarDays size={20} /> : update.kind === "swap" ? <ArrowLeftRight size={20} /> : <CircleCheck size={20} />;
        const body = (
          <>
            <span className={`dl-ri dl-ri-${update.kind}`}>{icon}</span>
            <span className="dl-rt">
              <b>{update.title}</b>
              {update.detail ? <small>{update.detail}</small> : null}
            </span>
            <span className="dl-ago">{ago(update.at, now)}</span>
          </>
        );
        return (
          <li key={update.id}>
            {update.href ? (
              <Link className="dl-row" to={update.href}>
                {body}
              </Link>
            ) : (
              <div className="dl-row">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function WeekSummary({ week, today }: { week: ReturnType<typeof homeWeek>; today: string }) {
  const hours = Math.round(week.reduce((sum, day) => sum + day.hours, 0));
  const shifts = week.reduce((sum, day) => sum + day.shifts.length, 0);
  const daysOff = week.filter((day) => !day.shifts.length).length;
  const timeOff = week.filter((day) => day.timeOff).length;
  return (
    <div className="dl-ws">
      <div className="dl-ws-big">
        <b>
          {hours}
          <small>h</small>
        </b>
        <span>scheduled in the next 7 days</span>
      </div>
      <div className="dl-ws-bars" aria-hidden>
        {week.map((day) => (
          <div
            key={day.date}
            className={`dl-wb${day.date === today ? " is-today" : ""}${day.hours ? "" : " is-zero"}${day.timeOff ? " is-to" : ""}`}
            style={{ "--h": Math.min(1, day.hours / 9).toFixed(3) } as CSSProperties}
          >
            <i />
            <span>{day.weekday[0]}</span>
          </div>
        ))}
      </div>
      <div className="dl-ws-f">
        <span>
          <b>{shifts}</b> shift{shifts === 1 ? "" : "s"}
        </span>
        <span>
          <b>{daysOff}</b> day{daysOff === 1 ? "" : "s"} off
        </span>
        {timeOff ? (
          <span>
            <b>{timeOff}</b> time off
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Notices({ workspaceId, now }: { workspaceId: string; now: Date }) {
  const query = useHubAnnouncements(workspaceId);
  const items = (query.data?.announcements ?? [])
    // Past posts move to the Past tab; dated posts show under Coming up (EKRAN-08).
    .filter((item) => item.display_status === "published" && !item.on_important_dates)
    .slice(0, 5)
    .map((item) => ({
      id: item.id,
      title: item.title,
      body: item.body,
      author: item.author_name,
      when: item.published_at ? ago(item.published_at, now) : "",
      ack: item.asked_to_acknowledge ? (item.acknowledged_at && !item.content_changed_since_acknowledged ? ("done" as const) : ("asked" as const)) : null,
    }));
  return (
    <HomeSection
      name="notices"
      title="From your team"
      link={
        <Link className="dl-lnk" to={employeeAnnouncementsPath} aria-label="All team notices">
          All <ChevronRight size={16} />
        </Link>
      }
    >
      {query.isError && query.data ? (
        <RefreshError
          message="Team notices didn't refresh. These are the last ones that loaded."
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {query.isError && !query.data ? (
        <LoadError
          inset
          level={3}
          title="We couldn't load team notices"
          detail="Team notices didn't load. Nothing was changed."
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      ) : query.isLoading ? (
        <LinesOutline label="Loading team notices" lines={3} />
      ) : items.length ? (
        <HomeNoticeDeck notices={items} base={employeeAnnouncementsPath} />
      ) : (
        <p className="dl-empty">No new notices. Enjoy a little quiet.</p>
      )}
    </HomeSection>
  );
}
