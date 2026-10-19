import type { EmployeeHubReadModel } from "@newfork/shared";
import { useQueries, useQuery } from "@tanstack/react-query";
import { CalendarX2 } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { loadWeeklyPreferences } from "../availability/availability-data";
import { todayIn } from "../lib/today";
import { addDays, currentWeekStart, formatTime } from "../schedule/lib/scheduleDateTime";
import { LoadError, LoadingOutline, RefreshError, Skeleton } from "../shell/LoadState";
import { getEmployeeHub, getEmployeeScheduleBoard } from "./employee-hub-data";
import { ownAvailabilityClash } from "./own-availability";
import { ShiftSheet, ShiftUnavailable } from "./ShiftSheet";
import { useHubClock } from "./useHubClock";
import "./employee-my-shifts.css";

// Employee → Schedule → My shifts (CALISAN-SCHEDULE-LISTE; Mert 2026-10-17, "Zaman çizgisi, Home sayfasındaki,
// birebir"): This week and Next week, one card per day with a date tile. The week changes only from the switch
// (Mert, same day): a sideways swipe belongs to the page tabs.
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const weekday = (iso: string) => WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()]!;
const dayOfMonth = (iso: string) => Number(iso.slice(8, 10));
const longDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

type Model = EmployeeHubReadModel;

/** The days of a week with what the list shows for each: the employee's shifts, approved time off, open shifts. */
export function weekDays(model: Model, start: string) {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    const shifts = model.shifts
      .filter((shift) => shift.scheduled_date === date && (!shift.employee_id || shift.employee_id === model.employee.id))
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
    const timeOff = model.requests.some(
      (request) =>
        request.kind === "time_off" &&
        request.request_type !== "time_off_cancellation" &&
        request.status !== "revoked" &&
        (request.periods ?? []).some(
          (period) =>
            period.segment_date === date &&
            period.status === "approved" &&
            !(period.cancelled_intervals?.length && !period.effective_intervals?.length),
        ),
    );
    const open = model.open_shifts.filter((shift) => shift.scheduled_date === date).length;
    return { date, shifts, timeOff, open };
  });
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthDay = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${dayOfMonth(iso)}`;
/** "Oct 26 – Nov 1": a week that is neither this one nor the next. */
export const weekRange = (start: string) => `${monthDay(start)} – ${monthDay(addDays(start, 6))}`;
const isDay = (value: string | null): value is string => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)));

/** The two weeks the switch shows. This week and Next week; an address with a day in another week (a
 *  notification about a week further on, or back) puts that week in the switch's place beside This week. */
export function switchWeeks(thisStart: string, target: string | null, weekStartDay: "monday" | "sunday") {
  const next = addDays(thisStart, 7);
  const t = isDay(target) ? currentWeekStart(target, weekStartDay) : thisStart;
  if (t < thisStart) return { starts: [t, thisStart] as const, labels: [weekRange(t), "This week"] as const, open: 0 as const };
  if (t > next) return { starts: [thisStart, t] as const, labels: ["This week", weekRange(t)] as const, open: 1 as const };
  return { starts: [thisStart, next] as const, labels: ["This week", "Next week"] as const, open: (t === next ? 1 : 0) as 0 | 1 };
}

/** Two weeks' answers as one model (each week is asked on its own: the hub takes 62 days at most). */
function merged(parts: (Model | undefined)[]): Model | undefined {
  const [a, b] = parts;
  if (!a || !b) return undefined;
  const byId = <T extends { id: string }>(items: T[]) => [...new Map(items.map((item) => [item.id, item])).values()];
  return { ...a, shifts: byId([...a.shifts, ...b.shifts]), open_shifts: byId([...a.open_shifts, ...b.open_shifts]), requests: byId([...a.requests, ...b.requests]) };
}

export function EmployeeMyShifts({ workspaceId }: { readonly workspaceId: string }) {
  const [search, setSearch] = useSearchParams();
  const now = useHubClock();
  const today = todayIn(undefined, now);
  // The workspace's own week (Settings → Scheduling): the Team schedule's read model carries it.
  const board = useQuery({
    queryKey: ["employee-schedule-board", workspaceId, today],
    queryFn: () => getEmployeeScheduleBoard(workspaceId, today),
    enabled: Boolean(workspaceId),
    staleTime: 60_000,
  });
  const start = board.data ? currentWeekStart(today, board.data.week_start_day) : null;
  const shiftId = search.get("shift");
  const target = search.get("date");
  const weeks = start && board.data ? switchWeeks(start, target, board.data.week_start_day) : null;
  const parts = useQueries({
    queries: [0, 1].map((i) => ({
      queryKey: ["employee-hub", workspaceId, "my-shifts", weeks?.starts[i] ?? null],
      queryFn: () => getEmployeeHub(workspaceId, weeks!.starts[i]!, addDays(weeks!.starts[i]!, 6)),
      enabled: Boolean(workspaceId && weeks),
      refetchInterval: 60_000,
    })),
  });
  const model = merged(parts.map((part) => part.data));
  const hub = {
    isLoading: parts.some((part) => part.isLoading),
    isError: parts.some((part) => part.isError),
    isFetching: parts.some((part) => part.isFetching),
    refetch: () => Promise.all(parts.map((part) => part.refetch())),
  };
  const ownWeek = useQuery({
    queryKey: ["weekly-preferences", workspaceId, "workspace", "self"],
    queryFn: () => loadWeeklyPreferences(workspaceId),
    retry: false,
    enabled: Boolean(model),
  });

  // The page opens on the week of ?date= (a notification, a shift's "Open in my schedule"); This week otherwise.
  // A new ?date= while the page is open moves it too.
  const [page, setPage] = useState<0 | 1>(0);
  const seg = useRef<HTMLDivElement>(null);
  const placedFor = useRef<string | null>(null);
  const place = weeks ? `${weeks.starts.join()}|${weeks.open}` : null;
  useEffect(() => {
    if (!weeks || placedFor.current === place) return;
    placedFor.current = place;
    setPage(weeks.open);
  }, [place, weeks]);
  // The two weeks slide as one track and the white pill with them (the lab's pager, drawn with a transform: a
  // scrolled pager pushed the app's own scroll area sideways on a phone).
  const go = (next: 0 | 1) => setPage(next);
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "ArrowRight" || event.key === "End" ? 1 : 0;
    go(next);
    seg.current?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus();
  };

  if ((board.isLoading || hub.isLoading) && !model)
    return (
      <LoadingOutline label="Loading your shifts" className="ems">
        <Skeleton width="100%" height={44} style={{ borderRadius: 13, marginBottom: 14 }} />
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} width="100%" height={74} style={{ borderRadius: 16, marginBottom: 8 }} />
        ))}
      </LoadingOutline>
    );
  if (!model || !weeks)
    return (
      <LoadError
        title="We couldn't load your shifts"
        detail="Your schedule didn't load. Nothing was changed."
        retrying={board.isFetching || hub.isFetching}
        onRetry={() => void (board.data ? hub.refetch() : board.refetch())}
      />
    );

  const pattern = ownWeek.data?.employee.submitted ? ownWeek.data.employee.preference : undefined;
  const selected = shiftId ? model.shifts.find((shift) => shift.id === shiftId) : undefined;
  const closeDetail = () => {
    const params = new URLSearchParams(search);
    params.delete("shift");
    setSearch(params, { replace: true });
  };
  const pages = [weekDays(model, weeks.starts[0]), weekDays(model, weeks.starts[1])];
  const timeFormat = model.settings.time_format;
  return (
    <div className="ems" style={{ "--pos": page } as CSSProperties}>
      {hub.isError ? (
        <RefreshError
          message="Your shifts didn't refresh. This is the last schedule that loaded."
          retrying={hub.isFetching}
          onRetry={() => void hub.refetch()}
        />
      ) : null}
      <div className="ems-seg" role="tablist" aria-label="Week" ref={seg}>
        {weeks.labels.map((label, i) => (
          <button
            key={label}
            type="button"
            role="tab"
            id={`ems-tab-${i}`}
            aria-selected={page === i}
            aria-controls={`ems-week-${i}`}
            tabIndex={page === i ? 0 : -1}
            onClick={() => go(i as 0 | 1)}
            onKeyDown={onTabKey}
          >
            {label}
          </button>
        ))}
        <i className="ems-seg-i" aria-hidden="true" />
      </div>
      {/* The days scroll in their own frame on a phone, under the week switch (views/list-page-frozen.css). */}
      <div className="ems-frame">
        <div className="ems-pager">
          <div className="ems-track">
          {pages.map((days, i) => (
            <div
              key={i}
              className="ems-week"
              id={`ems-week-${i}`}
              role="tabpanel"
              aria-labelledby={`ems-tab-${i}`}
              inert={page !== i ? true : undefined}
            >
              {days.map((day) => (
                <div key={day.date} className={`ems-day${day.date === today ? " today" : ""}`} data-day={day.date}>
                  <div className="ems-date" aria-hidden="true">
                    <span>{day.date === today ? "Today" : weekday(day.date)}</span>
                    <b>{dayOfMonth(day.date)}</b>
                  </div>
                  <div className="ems-body">
                    {day.shifts.length ? null : <span className="ems-sr">{longDay(day.date)}</span>}
                    {day.shifts.length ? (
                      day.shifts.map((shift) => (
                        <Link
                          key={shift.id}
                          id={`shift-${shift.id}`}
                          className={`ems-shift${shift.id === shiftId ? " flash" : ""}`}
                          to={`?date=${day.date}&shift=${shift.id}`}
                          replace
                        >
                          <span className="ems-sr">{longDay(day.date)}, </span>
                          <b>{formatTime(shift.start_time, timeFormat, "long")} – {formatTime(shift.end_time, timeFormat, "long")}</b>
                          <span>{shift.location_name} · {shift.job_name}</span>
                        </Link>
                      ))
                    ) : day.timeOff ? (
                      <div className="ems-to">
                        <CalendarX2 size={20} strokeWidth={1.8} aria-hidden="true" />
                        <span>Time off · Approved</span>
                      </div>
                    ) : (
                      <div className="ems-off">
                        Day off
                        {day.open && day.date >= today ? (
                          <>
                            {" · "}
                            <Link to={`/app/employee-hub/shift-hub?hub_view=available&from=${day.date}&to=${day.date}`}>
                              {day.open} open shift{day.open === 1 ? "" : "s"} to pick up
                            </Link>
                          </>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
          </div>
        </div>
      </div>
      {selected ? (
        <ShiftSheet shift={selected} model={model} clash={ownAvailabilityClash(pattern, selected, timeFormat)} onClose={closeDetail} />
      ) : shiftId && !hub.isFetching ? (
        <ShiftUnavailable onClose={closeDetail} />
      ) : null}
    </div>
  );
}
