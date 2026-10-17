import type { MyLineup } from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, CheckCircle2, Clock, MapPin } from "lucide-react";
import { useState, type CSSProperties, type JSX } from "react";
import { Link, useLocation } from "react-router";

import { todayIn } from "../lib/today";
import { formatTime, type ScheduleTimeFormat } from "../schedule/lib/scheduleDateTime";
import { lineupKeys, useAcknowledgeLineup, useMyLineups } from "../schedule/lineup-data";
import { LoadError, LoadingOutline, Skeleton } from "../shell/LoadState";
import { getEmployeeScheduleBoard } from "./employee-hub-data";
import "./employee-lineup.css";

// The employee's Lineup (KARARLAR 2026-10-17 "E · Çark tarih seçildi": the employee screen as in E, which is
// C's): her own shift as a ticket, the Team and Notes, Acknowledge at the bottom. She sees a lineup only
// while it is published (PLAN §3); otherwise "isn't published yet". Employee → Schedule → Lineup.

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
  const query = useMyLineups(workspaceId, date);
  const lineups = query.data?.lineups ?? [];
  const [chosen, setChosen] = useState<string | null>(null);
  // Not on a published lineup: is she working that day, so a lineup is still to come?
  const board = useQuery({
    queryKey: [...lineupKeys.allMine(workspaceId), "board", date],
    queryFn: () => getEmployeeScheduleBoard(workspaceId, date),
    enabled: Boolean(query.data) && lineups.length === 0,
  });

  if (query.isLoading) return <LineupOutline />;
  if (!query.data)
    return (
      <LoadError
        title="We couldn't load your lineup"
        detail={`${longDate(date)} didn't load. Nothing was changed.`}
        retrying={query.isFetching}
        onRetry={() => void query.refetch()}
      />
    );
  if (!lineups.length) {
    if (board.isLoading) return <LineupOutline />;
    const own = board.data?.shifts.find((s) => s.employee_id === employeeId && s.scheduled_date === date);
    const type = own?.shift_type_id ? board.data?.shift_types.find((t) => t.id === own.shift_type_id)?.name : null;
    return own ? (
      <Calm icon={<Clock size={26} aria-hidden />} title={`Your ${type ? `${type} ` : ""}lineup isn't published yet`}>
        You'll get a notification when it is.
      </Calm>
    ) : (
      <Calm icon={<CalendarDays size={26} aria-hidden />} title={`You're not on a lineup ${date === todayIn() ? "today" : "that day"}`}>
        When you are, it shows here.
      </Calm>
    );
  }
  const lineup = lineups.find((item) => item.id === chosen) ?? lineups[0]!;
  return (
    <div className="employee-lineup">
      {lineups.length > 1 ? (
        <div className="employee-lineup-shifts" role="group" aria-label="Your lineups">
          {lineups.map((item) => (
            <button key={item.id} type="button" aria-pressed={item.id === lineup.id} onClick={() => setChosen(item.id)}>
              {item.shift_type_name ?? "Shift"}
            </button>
          ))}
        </div>
      ) : null}
      <LineupView key={lineup.version_id} workspaceId={workspaceId} lineup={lineup} date={date} timeFormat={timeFormat} />
    </div>
  );
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

      <div className="employee-lineup-tabs" role="tablist" aria-label={`${name} lineup`}>
        <button type="button" role="tab" id="employee-lineup-team-tab" aria-selected={tab === "team"}
          aria-controls="employee-lineup-panel" onClick={() => setTab("team")}>
          Team<span>{live.length}</span>
        </button>
        <button type="button" role="tab" id="employee-lineup-notes-tab" aria-selected={tab === "notes"}
          aria-controls="employee-lineup-panel" onClick={() => setTab("notes")}>
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
          <>
            <div className="employee-lineup-teamhead">
              <h2>{lineup.location.name}</h2>
              <p>{longDate(date)} · {name}</p>
            </div>
            <Team rows={lineup.team} timeFormat={timeFormat} />
          </>
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
                          {row.is_me ? <span className="employee-lineup-you">You</span> : null}
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
