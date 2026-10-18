import type { MyLineup } from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, CheckCircle2, Clock, MapPin } from "lucide-react";
import { useState, type CSSProperties, type JSX, type Ref } from "react";
import { Link, useLocation, useNavigate } from "react-router";

import { todayIn } from "../lib/today";
import { useListPhoneWidth } from "../lib/usePhoneWidth";
import { formatTime, type ScheduleTimeFormat } from "../schedule/lib/scheduleDateTime";
import { lineupKeys, useAcknowledgeLineup, useMyLineups } from "../schedule/lineup-data";
import { LineupDayPicker, LineupLocationSelect, LineupShiftTabs, type LineupShiftTab } from "../schedule/lineup-wheel-view";
import { LoadError, LoadingOutline, Skeleton } from "../shell/LoadState";
import { getEmployeeScheduleBoard } from "./employee-hub-data";
import "./employee-lineup.css";

// The employee's Lineup (KARARLAR 2026-10-17 "E · Çark tarih seçildi": the employee screen as in E, which is
// C's): the manager's date row (‹ date ›, the location), day wheel and shift tabs, then her own shift as a ticket
// (location, date, in – out, position · label · section), Team · Notes, Acknowledge at the bottom (Mert
// 2026-10-17, ~7–8:30 AM). She sees a lineup only while it is published (PLAN §3); otherwise "isn't published
// yet". Employee → Schedule → Lineup.

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

/** Where a page under Schedule opens, on the day the address has. */
export function employeeSchedulePath(page: "schedule" | "schedule/team" | "schedule/lineup", search: string): string {
  const date = new URLSearchParams(search).get("date");
  return `/app/employee-hub/${page}${date ? `?date=${date}` : ""}`;
}

/** The pages under the employee's Schedule (Mert 2026-10-17, "My shifts önce"): My shifts, Team schedule
 *  (the published board, not on a phone) and Lineup. */
export function EmployeeScheduleTabs({ tabsRef }: { readonly tabsRef?: Ref<HTMLElement> }): JSX.Element {
  const location = useLocation();
  const phone = useListPhoneWidth();
  const page = location.pathname.endsWith("/schedule/lineup") ? "schedule/lineup" : location.pathname.endsWith("/schedule/team") ? "schedule/team" : "schedule";
  const tabs: { id: "schedule" | "schedule/team" | "schedule/lineup"; label: string }[] = [
    { id: "schedule", label: "My shifts" },
    ...(phone ? [] : [{ id: "schedule/team" as const, label: "Team schedule" }]),
    { id: "schedule/lineup", label: "Lineup" },
  ];
  return (
    <nav className="employee-schedule-tabs" aria-label="Schedule pages" ref={tabsRef}>
      {tabs.map((tab) => (
        <Link key={tab.id} to={employeeSchedulePath(tab.id, location.search)} aria-current={page === tab.id ? "page" : undefined}>
          {tab.label}
        </Link>
      ))}
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
  // Her lineups in the day's order (by her own start): the location row lists their locations in it.
  const lineups = [...(query.data?.lineups ?? [])].sort((a, b) => {
    const start = (lineup: typeof a) => lineup.mine.map((row) => row.start_time).sort()[0] ?? "99:99";
    return start(a).localeCompare(start(b));
  });
  const [chosenLocation, setChosenLocation] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  // Her published schedule that day (the read her Schedule page makes): the shift types for the tabs, her
  // scheduled times for a changed time on the ticket, and, before a lineup is published, whether she works.
  const board = useQuery({
    queryKey: [...lineupKeys.allMine(workspaceId), "board", date],
    queryFn: () => getEmployeeScheduleBoard(workspaceId, date),
    enabled: Boolean(query.data),
  });
  const ownShifts = (board.data?.shifts ?? [])
    .filter((s) => s.employee_id === employeeId && s.scheduled_date === date)
    .sort((a, b) => (a.start_time < b.start_time ? -1 : a.start_time > b.start_time ? 1 : 0));
  // The location row lists where she has a lineup that day, or, before it is published, where she works.
  const locations = unique(
    lineups.length
      ? lineups.map((item) => item.location)
      : ownShifts.flatMap((s) => board.data?.locations.filter((item) => item.id === s.location_id) ?? []),
  );
  const location = locations.find((item) => item.id === chosenLocation) ?? locations[0] ?? null;
  const loading = query.isLoading || board.isLoading;
  // Mert 2026-10-17 (~8:35 AM): every shift type shows as a tab; only one whose published lineup has her on it
  // (called off too: it is still hers) can be pressed. The types are her schedule read's; the lineups are her own (she reads no other).
  const shifts = shiftTabs(board.data?.shift_types ?? [], lineups.filter((item) => item.location.id === location?.id));
  const open = shifts.filter((item) => item.lineup);
  const current = open.find((item) => item.key === chosen) ?? open[0] ?? null;
  const tabs = shifts.length ? (
    <LineupShiftTabs
      shifts={shifts.map(({ lineup: _lineup, ...tab }) => tab)}
      chosen={current?.key ?? null}
      onChoose={setChosen}
    />
  ) : null;

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
  else if (!current?.lineup) {
    const own = ownShifts.find((s) => s.location_id === location?.id) ?? ownShifts[0];
    const type = own?.shift_type_id ? board.data?.shift_types.find((t) => t.id === own.shift_type_id)?.name : null;
    body = (
      <div className="employee-lineup">
        {tabs}
        {own ? (
          <Calm icon={<Clock size={26} aria-hidden />} title={`Your ${type ? `${type} ` : ""}lineup isn't published yet`}>
            You'll get a notification when it is.
          </Calm>
        ) : (
          <Calm icon={<CalendarDays size={26} aria-hidden />} title={`You're not on a lineup ${date === today ? "today" : "that day"}`}>
            When you are, it shows here.
          </Calm>
        )}
      </div>
    );
  } else {
    const lineup = current.lineup;
    const scheduled = ownShifts.find(
      (s) => s.location_id === lineup.location.id && (s.shift_type_id ?? null) === lineup.shift_type_id,
    );
    body = (
      <div className="employee-lineup">
        {tabs}
        <LineupView
          key={lineup.version_id}
          workspaceId={workspaceId}
          lineup={lineup}
          date={date}
          scheduled={scheduled ? { start_time: scheduled.start_time, end_time: scheduled.end_time } : null}
          timeFormat={timeFormat}
        />
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

type ShiftTabWithLineup = LineupShiftTab & { readonly lineup: MyLineup | null };

/**
 * The shift tabs at a location: every shift type (and a lineup's type the catalog no longer has), by its start,
 * the same start by name. A tab opens on a published lineup she is on (called off too); the others stay grey.
 */
function shiftTabs(
  types: readonly { id: string; name: string; color: string; default_start_time: string | null }[],
  lineups: readonly MyLineup[],
): ShiftTabWithLineup[] {
  const tabs = new Map<string, { key: string; name: string; color: string | null; start: string; lineup: MyLineup | null }>();
  for (const type of types)
    tabs.set(type.id, { key: type.id, name: type.name, color: type.color, start: type.default_start_time ?? "99:99", lineup: null });
  for (const lineup of lineups) {
    const key = lineup.shift_type_id ?? "none";
    const known = tabs.get(key);
    tabs.set(key, {
      key,
      name: known?.name ?? lineup.shift_type_name ?? "Shift",
      color: known?.color ?? lineup.color,
      start: known?.start ?? lineup.mine.map((row) => row.start_time).sort()[0] ?? "99:99",
      lineup,
    });
  }
  return [...tabs.values()]
    .sort((a, b) => a.start.slice(0, 5).localeCompare(b.start.slice(0, 5)) || a.name.localeCompare(b.name, "en-US", { sensitivity: "base" }))
    .map(({ start: _start, lineup, ...tab }) => {
      const on = Boolean(lineup);
      return on
        ? { ...tab, count: lineup!.team.filter((row) => !row.called_off).length, lineup }
        : { ...tab, count: 0, disabled: true, title: `You're not on a published ${tab.name} lineup`, lineup: null };
    });
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
  scheduled,
  timeFormat,
}: {
  readonly workspaceId: string;
  readonly lineup: MyLineup;
  readonly date: string;
  /** Her times on the published schedule, when she has a shift there. */
  readonly scheduled: { readonly start_time: string; readonly end_time: string } | null;
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
  // Position · label · section (Mert 2026-10-17 ~8:30 AM), the empty ones left out.
  const detail = [me.job_name, ...me.label_names, me.section_name].filter(Boolean).join(" · ");
  const hm = (time: string) => time.slice(0, 5);
  const was = scheduled && (hm(scheduled.start_time) !== hm(me.start_time) || hm(scheduled.end_time) !== hm(me.end_time)) ? scheduled : null;

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
          <p className="employee-lineup-place">
            <MapPin size={15} aria-hidden />
            {lineup.location.name}
          </p>
          <p className="employee-lineup-date">{longDate(date)}</p>
          {was ? (
            <p className="employee-lineup-time is-changed">
              <TimeSwap was={was.start_time} now={me.start_time} format={timeFormat} />
              {" – "}
              <TimeSwap was={was.end_time} now={me.end_time} format={timeFormat} />
              <span className="sr-only">{`${range(me, timeFormat)}, changed today, was ${range(was, timeFormat)}`}</span>
            </p>
          ) : (
            <p className="employee-lineup-time">{range(me, timeFormat)}</p>
          )}
          {detail ? <p className="employee-lineup-detail">{detail}</p> : null}
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

/**
 * One end of a changed time (Mert 2026-10-17 ~8:30 AM): the old value is struck through, fades, and the new one
 * is written over it, every 5 s (employee-lineup.css). An end that didn't change is plain. Screen readers get
 * the sentence beside it instead.
 */
function TimeSwap({ was, now, format }: { readonly was: string; readonly now: string; readonly format: ScheduleTimeFormat }) {
  const value = formatTime(now, format, "long");
  if (was.slice(0, 5) === now.slice(0, 5)) return <span aria-hidden>{value}</span>;
  return (
    <span className="employee-lineup-swap" aria-hidden>
      <span className="employee-lineup-old">
        {formatTime(was, format, "long")}
        <i />
      </span>
      <span className="employee-lineup-new">{value}</span>
    </span>
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
