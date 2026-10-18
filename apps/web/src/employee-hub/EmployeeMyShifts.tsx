import type { EmployeeHubReadModel } from "@newfork/shared";
import { useQuery } from "@tanstack/react-query";
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
  const hub = useQuery({
    queryKey: ["employee-hub", workspaceId, "my-shifts", start],
    queryFn: () => getEmployeeHub(workspaceId, start!, addDays(start!, 13)),
    enabled: Boolean(workspaceId && start),
    refetchInterval: 60_000,
  });
  const model = hub.data;
  const ownWeek = useQuery({
    queryKey: ["weekly-preferences", workspaceId, "workspace", "self"],
    queryFn: () => loadWeeklyPreferences(workspaceId),
    retry: false,
    enabled: Boolean(model),
  });

  // The page opens on the week of ?date= or of the shift it was sent to; This week otherwise.
  const shiftId = search.get("shift");
  const target = search.get("date") ?? model?.shifts.find((shift) => shift.id === shiftId)?.scheduled_date ?? null;
  const [page, setPage] = useState<0 | 1>(0);
  const pager = useRef<HTMLDivElement>(null);
  const seg = useRef<HTMLDivElement>(null);
  const placed = useRef(false);
  useEffect(() => {
    if (!start || !pager.current || placed.current) return;
    placed.current = true;
    const next = target && target >= addDays(start, 7) && target <= addDays(start, 13) ? 1 : 0;
    setPage(next);
    pager.current.scrollLeft = next * pager.current.clientWidth;
  }, [start, target, model]);
  // The white pill follows the pager while it slides, as in the lab page.
  useEffect(() => {
    const el = pager.current;
    if (!el) return;
    const sync = () => seg.current?.style.setProperty("--pos", (el.scrollLeft / Math.max(1, el.clientWidth)).toFixed(3));
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    const keep = () => { el.scrollLeft = page * el.clientWidth; sync(); };
    window.addEventListener("resize", keep);
    return () => { el.removeEventListener("scroll", sync); window.removeEventListener("resize", keep); };
  }, [page, model]);
  const go = (next: 0 | 1) => {
    setPage(next);
    const el = pager.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (typeof el.scrollTo === "function") el.scrollTo({ left: next * el.clientWidth, behavior: reduce ? "auto" : "smooth" });
    else el.scrollLeft = next * el.clientWidth;
  };
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = event.key === "ArrowRight" ? 1 : 0;
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
  if (!model || !start)
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
  const weeks = [weekDays(model, start), weekDays(model, addDays(start, 7))];
  const timeFormat = model.settings.time_format;
  return (
    <div className="ems">
      {hub.isError ? (
        <RefreshError
          message="Your shifts didn't refresh. This is the last schedule that loaded."
          retrying={hub.isFetching}
          onRetry={() => void hub.refetch()}
        />
      ) : null}
      <div className="ems-seg" role="tablist" aria-label="Week" ref={seg} style={{ "--pos": page } as CSSProperties}>
        {(["This week", "Next week"] as const).map((label, i) => (
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
      <div className="ems-pager" ref={pager}>
        {weeks.map((days, i) => (
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
                  <span className="ems-sr">{new Date(`${day.date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}</span>
                  {day.shifts.length ? (
                    day.shifts.map((shift) => (
                      <Link
                        key={shift.id}
                        id={`shift-${shift.id}`}
                        className={`ems-shift${shift.id === shiftId ? " flash" : ""}`}
                        to={`?shift=${shift.id}`}
                        replace
                      >
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
      {selected ? (
        <ShiftSheet shift={selected} model={model} clash={ownAvailabilityClash(pattern, selected, timeFormat)} onClose={closeDetail} />
      ) : shiftId && !hub.isFetching ? (
        <ShiftUnavailable onClose={closeDetail} />
      ) : null}
    </div>
  );
}
