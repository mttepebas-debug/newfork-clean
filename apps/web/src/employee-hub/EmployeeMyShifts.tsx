import type { EmployeeHubReadModel } from "@newfork/shared";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarX2, ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
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
import { usePickupShifts } from "./shift-exchanges/pickup";

// Employee → Schedule → My shifts (CALISAN-SCHEDULE-LISTE; Mert 2026-10-17, "Zaman çizgisi, Home sayfasındaki,
// birebir"): This week and Next week, one card per day with a date tile. The week changes only from the switch
// and its arrows (Mert, same day; arrows QA 60, 2026-10-20): a sideways swipe belongs to the page tabs. The week
// switch's variant A (Mert 2026-10-23, "1-A"): the switch stays, This week brings it back to This week · Next week,
// and the labels and the list slide the way you went.
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const weekday = (iso: string) => WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()]!;
const dayOfMonth = (iso: string) => Number(iso.slice(8, 10));
const longDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

type Model = EmployeeHubReadModel;

/** The days of a week with what the list shows for each: the employee's shifts, approved time off, open shifts. */
export function weekDays(model: Model, start: string, openDates: readonly string[] = []) {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    const shifts = model.shifts
      .filter((shift) => shift.scheduled_date === date && (!shift.employee_id || shift.employee_id === model.employee.id))
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
    // The read's days with time off, old and new alike (time off rebuild D3, D7).
    const timeOff = model.leave_days.includes(date);
    // Released shifts in the pool, not unassigned ones (QA 38, S-151 (3)).
    const open = openDates.filter((day) => day === date).length;
    return { date, shifts, timeOff, open };
  });
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthDay = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${dayOfMonth(iso)}`;
/** "Oct 26 – Nov 1": a week that is neither this one nor the next. */
export const weekRange = (start: string) => `${monthDay(start)} – ${monthDay(addDays(start, 6))}`;
const isDay = (value: string | null): value is string => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)));

/** The two weeks the switch shows. This week and Next week; an address with a day in another week (an arrow, a
 *  notification about a week further on, or back) puts that week in the switch's place beside This week, on its
 *  side of it: Last week, then its dates, on the left; a week past Next week under its dates on the right. */
export function switchWeeks(thisStart: string, target: string | null, weekStartDay: "monday" | "sunday") {
  const next = addDays(thisStart, 7);
  const t = isDay(target) ? currentWeekStart(target, weekStartDay) : thisStart;
  if (t < thisStart) return { starts: [t, thisStart] as const, labels: [t === addDays(thisStart, -7) ? "Last week" : weekRange(t), "This week"] as const, open: 0 as const };
  if (t > next) return { starts: [thisStart, t] as const, labels: ["This week", weekRange(t)] as const, open: 1 as const };
  return { starts: [thisStart, next] as const, labels: ["This week", "Next week"] as const, open: (t === next ? 1 : 0) as 0 | 1 };
}

/** Two weeks' answers as one model (each week is asked on its own: the hub takes 62 days at most); a week still
 *  on its way leaves only its own days out. */
export function mergedWeeks(parts: (Model | undefined)[]): Model | undefined {
  const [a, b] = parts.filter((part): part is Model => Boolean(part));
  if (!a || !b) return a;
  const byId = <T extends { id: string }>(items: T[]) => [...new Map(items.map((item) => [item.id, item])).values()];
  return { ...a, shifts: byId([...a.shifts, ...b.shifts]), leave_days: [...new Set([...a.leave_days, ...b.leave_days])].sort() };
}

/** The days of one week as cards. */
function DayCards({ days, today, shiftId, timeFormat }: {
  readonly days: ReturnType<typeof weekDays>;
  readonly today: string;
  readonly shiftId: string | null;
  readonly timeFormat: Model["settings"]["time_format"];
}) {
  return days.map((day) => (
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
              {/* The type as on Home's card (QA 60, Mert 2026-10-20). */}
              <span>{[shift.location_name, shift.job_name, shift.shift_type_name].filter(Boolean).join(" · ")}</span>
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
  ));
}

/** A week still on its way. */
const WeekSkeleton = () => Array.from({ length: 5 }, (_, i) => <Skeleton key={i} width="100%" height={74} style={{ borderRadius: 16 }} />);

/** A switch label: when it changes, the old one leaves the way the week went and the new one comes in from the
 *  other side; `--dir` on the page says which way. */
function SlideLabel({ text, moving }: { readonly text: string; readonly moving: boolean }) {
  const [shown, setShown] = useState<{ text: string; old: string | null }>({ text, old: null });
  if (shown.text !== text) setShown({ text, old: moving ? shown.text : null });
  return (
    <span className="ems-lbl">
      {shown.old ? (
        <span key={`out-${shown.old}`} className="ems-lbl-out" aria-hidden="true" onAnimationEnd={() => setShown((now) => ({ ...now, old: null }))}>
          {shown.old}
        </span>
      ) : null}
      <span key={shown.text} className={shown.old ? "ems-lbl-in" : undefined}>
        {shown.text}
      </span>
    </span>
  );
}

/** An arrow's chevron gives a little the way it goes when pressed. */
function nudge(button: HTMLElement, dir: number) {
  const icon = button.querySelector("svg");
  if (!icon || typeof icon.animate !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  icon.animate([{ transform: "translateX(0)" }, { transform: `translateX(${dir * 4}px)` }, { transform: "translateX(0)" }], { duration: 220, easing: "ease-out" });
}

export function EmployeeMyShifts({ workspaceId, zone }: { readonly workspaceId: string; readonly zone: string }) {
  const [search, setSearch] = useSearchParams();
  const client = useQueryClient();
  const now = useHubClock();
  const today = todayIn(zone, now);
  const pickups = usePickupShifts(workspaceId, zone);
  // The workspace's own week (Settings → Scheduling): the Team schedule's read model carries it.
  const board = useQuery({
    queryKey: ["employee-schedule-board", workspaceId, today],
    queryFn: () => getEmployeeScheduleBoard(workspaceId, today),
    enabled: Boolean(workspaceId),
    staleTime: 60_000,
  });
  const start = board.data ? currentWeekStart(today, board.data.week_start_day) : null;
  const shiftId = search.get("shift");
  // "Open in my schedule" marks the shift without opening its sheet (?focus=).
  const marked = shiftId ?? search.get("focus");
  // The week on screen is the week of ?date= (the switch, the arrows, a notification, a shift's "Open in my
  // schedule"); This week without one.
  const target = search.get("date");
  const weeks = start && board.data ? switchWeeks(start, target, board.data.week_start_day) : null;
  const weekKey = (week: string | null) => ["employee-hub", workspaceId, "my-shifts", week] as const;
  const parts = useQueries({
    queries: [0, 1].map((i) => ({
      queryKey: weekKey(weeks?.starts[i] ?? null),
      queryFn: () => getEmployeeHub(workspaceId, weeks!.starts[i]!, addDays(weeks!.starts[i]!, 6)),
      enabled: Boolean(workspaceId && weeks),
      refetchInterval: 60_000,
    })),
  });
  const model = mergedWeeks(parts.map((part) => part.data));
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

  // The week before stays on screen while it slides out the other way: dir is 1 for a later week, -1 for an
  // earlier one, and the switch's labels slide the same way.
  const openWeek = weeks ? weeks.starts[weeks.open] : null;
  const [slide, setSlide] = useState<{ week: string | null; from: string | null; dir: number }>({ week: openWeek, from: null, dir: 0 });
  if (slide.week !== openWeek) {
    const moved = slide.week !== null && openWeek !== null;
    setSlide({ week: openWeek, from: moved ? slide.week : null, dir: moved && openWeek! > slide.week! ? 1 : moved ? -1 : slide.dir });
  }
  const seg = useRef<HTMLDivElement>(null);
  // Every way to a week goes through ?date= (This week leaves it out), so the switch and the list follow the
  // address alone: This week brings back This week · Next week, whatever week the arrows reached.
  const show = (week: string) => {
    const params = new URLSearchParams(search);
    if (week === start) params.delete("date");
    else params.set("date", week);
    params.delete("shift");
    params.delete("focus");
    setSearch(params, { replace: true });
  };
  const go = (i: 0 | 1) => {
    if (weeks && i !== weeks.open) show(weeks.starts[i]);
  };
  // The arrows beside the switch reach any week, back or on (QA 60, Mert 2026-10-20).
  const step = (dir: 1 | -1, button: HTMLElement) => {
    if (!openWeek) return;
    nudge(button, dir);
    show(addDays(openWeek, dir * 7));
  };
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
  if (!model || !weeks || !openWeek)
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
  const openDates = pickups.map((item) => item.scheduled_date);
  const timeFormat = model.settings.time_format;
  const openPart = parts[weeks.open]!;
  // The leaving week as it was shown: it may no longer be one of the switch's two weeks.
  const fromModel = slide.from ? client.getQueryData<Model>(weekKey(slide.from)) : undefined;
  return (
    <div className="ems" style={{ "--pos": weeks.open, "--dir": slide.dir } as CSSProperties}>
      {hub.isError && openPart.data ? (
        <RefreshError
          message="Your shifts didn't refresh. This is the last schedule that loaded."
          retrying={hub.isFetching}
          onRetry={() => void hub.refetch()}
        />
      ) : null}
      <div className="ems-nav">
        <button type="button" className="ems-step" aria-label="Previous week" title="Previous week" onClick={(event) => step(-1, event.currentTarget)}>
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <div className="ems-seg" role="tablist" aria-label="Week" ref={seg}>
          {weeks.labels.map((label, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              id={`ems-tab-${i}`}
              aria-selected={weeks.open === i}
              aria-controls="ems-week"
              tabIndex={weeks.open === i ? 0 : -1}
              onClick={() => go(i as 0 | 1)}
              onKeyDown={onTabKey}
            >
              <SlideLabel text={label} moving={slide.from !== null} />
            </button>
          ))}
          <i className="ems-seg-i" aria-hidden="true" />
        </div>
        <button type="button" className="ems-step" aria-label="Following week" title="Following week" onClick={(event) => step(1, event.currentTarget)}>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
      {/* The days scroll in their own frame on a phone, under the week switch (views/list-page-frozen.css). */}
      <div className="ems-frame">
        <div className="ems-pager">
          <div className="ems-track">
            {slide.from ? (
              <div
                key={`out-${slide.from}`}
                className="ems-week ems-week-out"
                aria-hidden="true"
                inert
                onAnimationEnd={(event) => {
                  if (event.target === event.currentTarget) setSlide((now) => ({ ...now, from: null }));
                }}
              >
                {fromModel ? <DayCards days={weekDays(fromModel, slide.from, openDates)} today={today} shiftId={marked} timeFormat={timeFormat} /> : <WeekSkeleton />}
              </div>
            ) : null}
            <div
              key={openWeek}
              className={slide.from ? "ems-week ems-week-in" : "ems-week"}
              id="ems-week"
              role="tabpanel"
              aria-labelledby={`ems-tab-${weeks.open}`}
              aria-busy={openPart.data ? undefined : true}
            >
              {openPart.data ? (
                <DayCards days={weekDays(model, openWeek, openDates)} today={today} shiftId={marked} timeFormat={timeFormat} />
              ) : openPart.isError ? (
                <LoadError
                  title="We couldn't load these shifts"
                  detail="The shifts of the week you chose didn't load. Nothing was changed."
                  retrying={openPart.isFetching}
                  onRetry={() => void openPart.refetch()}
                />
              ) : (
                <WeekSkeleton />
              )}
            </div>
          </div>
        </div>
      </div>
      {selected ? (
        <ShiftSheet
          shift={selected}
          model={model}
          clash={ownAvailabilityClash(pattern, selected, timeFormat)}
          scheduleLink={false}
          onClose={closeDetail}
        />
      ) : shiftId && !hub.isFetching ? (
        <ShiftUnavailable onClose={closeDetail} />
      ) : null}
    </div>
  );
}
