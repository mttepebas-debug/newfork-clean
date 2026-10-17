import type { MyLineup } from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, CheckCircle2, Clock, MapPin } from "lucide-react";
import { useState, type CSSProperties, type JSX } from "react";
import { Link, useLocation, useNavigate } from "react-router";

import { todayIn } from "../lib/today";
import { formatTime, type ScheduleTimeFormat } from "../schedule/lib/scheduleDateTime";
import { lineupKeys, useAcknowledgeLineup, useMyLineups } from "../schedule/lineup-data";
import { LineupDayHead, LineupDayPicker, LineupLocationSelect, LineupShiftTabs } from "../schedule/lineup-wheel-view";
import { LoadError, LoadingOutline, Skeleton } from "../shell/LoadState";
import { getEmployeeScheduleBoard } from "./employee-hub-data";
import "./employee-lineup.css";

// The employee's Lineup (KARARLAR 2026-10-17 "E · Çark tarih seçildi": the employee screen as in E, which is
// C's): the manager's date row (‹ date ›, the location), day wheel and shift tabs (her own lineups only), then
// the location and date, her own shift as a ticket, Team · Notes, Acknowledge at the bottom (Mert 2026-10-17,
// ~7–7:50 AM). She sees a lineup only while it is published (PLAN §3); otherwise "isn't published yet".
// Employee → Schedule → Lineup.

type Row = MyLineup["team"][number];

function range(row: { start_time: string; end_time: string }, format: ScheduleTimeFormat): string {
  return `${formatTime(row.start_time, format, "long")} – ${formatTime(row.end_time, format, "long")}`;
}

function longDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("");
}

/** Schedule and Lineup, the two pages under the employee's Schedule. */
export function EmployeeScheduleTabs(): JSX.Element {
  const location = useLocation();
  const onLineup = location.pathname.endsWith("/schedule/lineup");
  const date = new URLSearchParams(location.search).get("date");
  const search = date ? `?date=${date}` : "";
  return (
    <nav className="employee-schedule-tabs" aria-label="Schedule pages">
      <Link to={`/app/employee-hub/schedule${search}`} aria-current={onLineup ? undefined : "page"}>
        Schedule
      </Link>
      <Link to={`/app/employee-hub/schedule/lineup${search}`} aria-current={onLineup ? "page" : undefined}>
        Lineup
      </Link>
    </nav>
  );
}

export function EmployeeLineup({
  workspaceId,
  employeeId,
  date,
  timeFormat,
}: {
  readonly workspaceId: string;
  readonly employeeId: string;
  readonly date: string;
  readonly timeFormat: ScheduleTimeFormat;
}): JSX.Element {
  const today = todayIn();
  const navigate = useNavigate();
  const query = useMyLineups(workspaceId, date);
  // Her lineups in the day's order: by her own start, the same start by shift type name.
  const lineups = [...(query.data?.lineups ?? [])].sort((a, b) => {
    const start = (lineup: (typeof a)) => lineup.mine.map((row) => row.start_time).sort()[0] ?? "99:99";
    const at = start(a);
    const bt = start(b);
    return (at < bt ? -1 : at > bt ? 1 : 0) ||
      (a.shift_type_name ?? "").localeCompare(b.shift_type_name ?? "", "en-US", { sensitivity: "base" });
  });
  const [chosenLocation, setChosenLocation] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  // Not on a published lineup: is she working that day, so a lineup is still to come?
  const board = useQuery({
    queryKey: [...lineupKeys.allMine(workspaceId), "board", date],
    queryFn: () => getEmployeeScheduleBoard(workspaceId, date),
    enabled: Boolean(query.data) && lineups.length === 0,
  });
  const ownShifts = lineups.length
    ? []
    : (board.data?.shifts ?? [])
        .filter((s) => s.employee_id === employeeId && s.scheduled_date === date)
        .sort((a, b) => (a.start_time < b.start_time ? -1 : a.start_time > b.start_time ? 1 : 0));
  // The location row lists where she has a lineup that day, or, before it is published, where she works.
  const locations = unique(
    lineups.length
      ? lineups.map((item) => item.location)
      : ownShifts.flatMap((s) => board.data?.locations.filter((item) => item.id === s.location_id) ?? []),
  );
  const location = locations.find((item) => item.id === chosenLocation) ?? locations[0] ?? null;
  const loading = query.isLoading || (lineups.length === 0 && board.isLoading);

  let body: JSX.Element;
  if (loading) body = <LineupOutline />;
  else if (!query.data)
    body = (
      <LoadError
        title="We couldn't load your lineup"
        detail={`${longDate(date)} didn't load. Nothing was changed.`}
        retrying={query.isFetching}
        onRetry={() => void query.refetch()}
      />
    );
  else if (!lineups.length) {
    const own = ownShifts.find((s) => s.location_id === location?.id) ?? ownShifts[0];
    const type = own?.shift_type_id ? board.data?.shift_types.find((t) => t.id === own.shift_type_id)?.name : null;
    body = own ? (
      <Calm icon={<Clock size={26} aria-hidden />} title={`Your ${type ? `${type} ` : ""}lineup isn't published yet`}>
        You'll get a notification when it is.
      </Calm>
    ) : (
      <Calm icon={<CalendarDays size={26} aria-hidden />} title={`You're not on a lineup ${date === today ? "today" : "that day"}`}>
        When you are, it shows here.
      </Calm>
    );
  } else {
    const here = lineups.filter((item) => item.location.id === location?.id);
    const lineup = here.find((item) => item.id === chosen) ?? here[0]!;
    body = (
      <div className="employee-lineup">
        {/* Mert 2026-10-17 (~7:30 AM): the manager's shift tabs, with only her own lineups (she sees no other). */}
        <LineupShiftTabs
          shifts={here.map((item) => ({
            key: item.id,
            name: item.shift_type_name ?? "Shift",
            color: item.color,
            count: item.team.filter((row) => !row.called_off).length,
          }))}
          chosen={lineup.id}
          onChoose={setChosen}
        />
        <LineupView key={lineup.version_id} workspaceId={workspaceId} lineup={lineup} date={date} timeFormat={timeFormat} />
      </div>
    );
  }

  return (
    <div className="employee-lineup-page">
      <div className="employee-lineup-day">
        <LineupDayPicker
          date={date}
          today={today}
          onDate={(iso) => void navigate({ search: iso === today ? "" : `?date=${iso}` }, { replace: true })}
        >
          <LineupLocationSelect
            loading={loading}
            locations={locations}
            value={location?.id ?? ""}
            onChange={(id) => {
              setChosenLocation(id);
              setChosen(null);
            }}
          />
        </LineupDayPicker>
      </div>
      {body}
    </div>
  );
}

/** Each location once, in the order first met. */
function unique<T extends { readonly id: string; readonly name: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => !seen.has(item.id) && Boolean(seen.add(item.id)));
}

function LineupView({
  workspaceId,
  lineup,
  date,
  timeFormat,
}: {
  readonly workspaceId: string;
  readonly lineup: MyLineup;
  readonly date: string;
  readonly timeFormat: ScheduleTimeFormat;
}): JSX.Element {
  const [tab, setTab] = useState<"team" | "notes">("team");
  const acknowledge = useAcknowledgeLineup(workspaceId);
  const [acked, setAcked] = useState(Boolean(lineup.acknowledged_at));
  const name = lineup.shift_type_name ?? "Shift";
  const me = lineup.mine[0]!;
  const notes = ([
    ["Specials", lineup.notes.specials],
    ["86s", lineup.notes.n86],
    ["Shift notes", lineup.notes.shift_notes],
  ] as const).filter(([, text]) => text.trim());
  const live = lineup.team.filter((row) => !row.called_off);
  const style = { "--lineup-shift": lineup.color ?? "var(--theme-border-strong)" } as CSSProperties;
  const detail = [me.job_name, me.section_name, ...me.label_names].filter(Boolean).join(" · ");

  return (
    <section className="employee-lineup-view" style={style} aria-label={`${name} lineup`}>
      <LineupDayHead location={lineup.location.name} date={date} shift={name} />
      <div className="employee-lineup-ticket">
        <div className="employee-lineup-stub">
          <span className="employee-lineup-avatar is-large" style={{ "--job": me.job_color ?? "var(--theme-border-strong)" } as CSSProperties} aria-hidden>
            {initials(lineup.team.find((row) => row.is_me)?.name ?? "")}
          </span>
          <b>{name}</b>
        </div>
        <div className="employee-lineup-ticket-body">
          {me.called_off ? <p className="employee-lineup-called-off">You're called off.</p> : null}
          <p className="employee-lineup-time">{range(me, timeFormat)}</p>
          {detail ? <p>{detail}</p> : null}
          <p className="employee-lineup-place">
            <MapPin size={15} aria-hidden />
            {lineup.location.name}
          </p>
        </div>
      </div>

      {/* Tabs: ← → move between them, one tab stop (WAI-ARIA tabs). */}
      <div
        className="employee-lineup-tabs"
        role="tablist"
        aria-label={`${name} lineup`}
        onKeyDown={(event) => {
          if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
          event.preventDefault();
          const next = tab === "team" ? "notes" : "team";
          setTab(next);
          document.getElementById(`employee-lineup-${next}-tab`)?.focus();
        }}
      >
        <button type="button" role="tab" id="employee-lineup-team-tab" aria-selected={tab === "team"}
          tabIndex={tab === "team" ? 0 : -1} aria-controls="employee-lineup-panel" onClick={() => setTab("team")}>
          Team<span>{live.length}</span>
        </button>
        <button type="button" role="tab" id="employee-lineup-notes-tab" aria-selected={tab === "notes"}
          tabIndex={tab === "notes" ? 0 : -1} aria-controls="employee-lineup-panel" onClick={() => setTab("notes")}>
          Notes{notes.length ? <span>{notes.length}</span> : null}
        </button>
      </div>

      <div role="tabpanel" id="employee-lineup-panel" aria-labelledby={`employee-lineup-${tab}-tab`}>
        {tab === "notes" ? (
          notes.length ? (
            <div className="employee-lineup-notes">
              {notes.map(([title, text]) => (
                <div key={title}>
                  <b>{title}</b>
                  <p>{text}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="employee-lineup-none">No notes for this shift.</p>
          )
        ) : (
          <Team rows={lineup.team} timeFormat={timeFormat} />
        )}
      </div>

      {lineup.ask_ack ? (
        acked ? (
          <p className="employee-lineup-acked" role="status">
            <CheckCircle2 size={20} aria-hidden />
            Acknowledged.
          </p>
        ) : (
          <div className="employee-lineup-ack">
            <Button
              disabled={acknowledge.isPending}
              onClick={() => acknowledge.mutate(lineup.version_id, { onSuccess: () => setAcked(true) })}
            >
              {acknowledge.isPending ? "Acknowledging…" : "Acknowledge"}
            </Button>
            {acknowledge.isError ? (
              <p className="employee-lineup-error" role="alert">
                It didn't go through. Check your connection, then try again.
              </p>
            ) : null}
          </div>
        )
      ) : null}
    </section>
  );
}

function Team({ rows, timeFormat }: { readonly rows: readonly Row[]; readonly timeFormat: ScheduleTimeFormat }) {
  const departments = new Map<string, Map<string, Row[]>>();
  for (const row of rows) {
    const department = departments.get(row.department_name ?? "Other") ?? new Map<string, Row[]>();
    departments.set(row.department_name ?? "Other", department);
    const job = department.get(row.job_name ?? "Job") ?? [];
    department.set(row.job_name ?? "Job", job);
    job.push(row);
  }
  return (
    <>
      {[...departments.entries()].map(([department, jobs]) => (
        <section key={department} className="employee-lineup-department" aria-label={department}>
          <h3>
            {department}
            <span>{[...jobs.values()].reduce((sum, job) => sum + job.length, 0)}</span>
          </h3>
          <div className="employee-lineup-list">
            {[...jobs.entries()].map(([job, people]) => (
              <div key={job}>
                <p className="employee-lineup-job">
                  <i style={{ background: people[0]?.job_color ?? "var(--theme-border-strong)" }} aria-hidden />
                  {job}
                  <span>{people.length}</span>
                </p>
                <ul aria-label={job}>
                  {people.map((row) => (
                    <li key={`${row.employee_id}-${row.start_time}`} className={row.is_me ? "is-me" : undefined}>
                      <span className="employee-lineup-avatar" style={{ "--job": row.job_color ?? "var(--theme-border-strong)" } as CSSProperties} aria-hidden>
                        {initials(row.name ?? "")}
                      </span>
                      <span className="employee-lineup-mid">
                        <span className="employee-lineup-name">
                          {row.name ?? "Team member"}
                          {/* Mert 2026-10-14: the green row marks her, no "You" on screen; a screen reader still hears it. */}
                          {row.is_me ? <span className="sr-only">(you)</span> : null}
                        </span>
                        <span className="employee-lineup-row-time">
                          {row.called_off ? "Called off" : range(row, timeFormat)}
                        </span>
                      </span>
                      {row.section_name || row.label_names.length ? (
                        <span className="employee-lineup-tags">
                          {row.section_name ? <span className="employee-lineup-section">{row.section_name}</span> : null}
                          {row.label_names.map((label) => (
                            <i key={label} className="employee-lineup-chip">{label}</i>
                          ))}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function Calm({ icon, title, children }: { readonly icon: JSX.Element; readonly title: string; readonly children: string }) {
  return (
    <div className="employee-lineup-calm">
      {icon}
      <b>{title}</b>
      <span>{children}</span>
    </div>
  );
}

function LineupOutline() {
  return (
    <LoadingOutline label="Loading your lineup" className="employee-lineup">
      <Skeleton width="100%" height={112} style={{ borderRadius: 14, marginTop: 12 }} />
      <Skeleton width="100%" height={44} style={{ marginTop: 16 }} />
      {[0, 1, 2].map((index) => (
        <Skeleton key={index} width="100%" height={56} style={{ marginTop: 8, borderRadius: 10 }} />
      ))}
    </LoadingOutline>
  );
}
