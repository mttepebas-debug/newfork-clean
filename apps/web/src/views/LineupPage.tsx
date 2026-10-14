import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";
import { useSearchParams } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { noAccessHomePath } from "../auth/resolveLanding";
import { isNoAccess } from "../lib/no-access";
import { todayIn } from "../lib/today";
import { useScheduleQuery } from "../schedule/hooks/useScheduleQuery";
import { useScheduleRealtime } from "../schedule/hooks/useScheduleRealtime";
import { lineupDay, lineupWeek, type LineupLocation, type LineupShift } from "../schedule/lineup";
import { addDays, formatTime, type ScheduleTimeFormat } from "../schedule/lib/scheduleDateTime";
import { LoadError, LoadingOutline, Skeleton } from "../shell/LoadState";
import { NoAccessState } from "../shell/NoAccessState";
import { CatalogPageHeader } from "./CatalogPageHeader";
import "./lineup-page.css";

// Lineup (Mert 2026-10-13), read-only first stage: who works each shift today,
// per location, straight from the published Schedule. Editing, sections, call
// off and publishing come in later stages (PLAN.md section 12).

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function longDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function dayName(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function stripDay(iso: string) {
  const date = new Date(`${iso}T12:00:00Z`);
  return {
    weekday: date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
    day: date.getUTCDate(),
  };
}

function range(start: string, end: string, format: ScheduleTimeFormat): string {
  if (!start || !end) return "";
  return `${formatTime(start, format, "long")} – ${formatTime(end, format, "long")}`;
}

export function LineupPage() {
  const { context } = useAuth();
  const workspaceId = context?.workspace.id ?? null;
  const today = todayIn();
  const [params, setParams] = useSearchParams();
  const requested = params.get("date") ?? "";
  const date = isoDate.test(requested) ? requested : today;
  const locationId = params.get("location") ?? "";
  const shiftTypeId = params.get("shift") ?? "";

  const query = useScheduleQuery(workspaceId, date, "day");
  const model = query.data;
  useScheduleRealtime({
    workspaceId,
    weekStart: model?.week_start ?? "",
    locationIds: model?.locations.map((location) => location.id) ?? [],
  });

  const lineups = useMemo(
    () => (model ? lineupDay(model, date, { locationId, shiftTypeId }) : []),
    [model, date, locationId, shiftTypeId],
  );

  function setParam(key: string, value: string) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  }
  const goTo = (day: string) => setParam("date", day === today ? "" : day);

  const header = (
    <CatalogPageHeader
      eyebrow="THE RIGHT PEOPLE. IN THE RIGHT SPOT."
      title="Lineup"
      titleId="lineup-title"
      description="Today's lineups, live from the Schedule."
    />
  );

  if (query.error && isNoAccess(query.error)) {
    return (
      <section className="lineup-page list-page" aria-labelledby="lineup-title">
        {header}
        <NoAccessState subject="the lineup" homeHref={noAccessHomePath(context, "/app/schedule/lineup")} />
      </section>
    );
  }

  const timeFormat = model?.settings.time_format ?? "12h";
  const week = model ? lineupWeek(model.week_start) : [];

  return (
    <section className="lineup-page list-page" aria-labelledby="lineup-title">
      {header}

      <div className="lineup-toolbar">
        <div className="lineup-date" role="group" aria-label="Day">
          <button type="button" className="lineup-step" aria-label="Previous day" onClick={() => goTo(addDays(date, -1))}>
            <ChevronLeft size={16} aria-hidden />
          </button>
          <button
            type="button"
            className="lineup-date-label"
            data-other-day={date !== today ? "true" : undefined}
            title={date !== today ? "Back to today" : undefined}
            onClick={() => goTo(today)}
          >
            {shortDate(date)}
          </button>
          <button type="button" className="lineup-step" aria-label="Next day" onClick={() => goTo(addDays(date, 1))}>
            <ChevronRight size={16} aria-hidden />
          </button>
        </div>
        <select
          className="toolbar-filter-select"
          value={locationId}
          aria-label="Filter by location"
          onChange={(event) => setParam("location", event.target.value)}
        >
          <option value="">All locations</option>
          {model?.locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
        <select
          className="toolbar-filter-select"
          value={shiftTypeId}
          aria-label="Filter by shift"
          onChange={(event) => setParam("shift", event.target.value)}
        >
          <option value="">All shifts</option>
          {model?.shift_types.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
      </div>

      {query.isLoading ? (
        <div className="lineup-days" aria-hidden>
          {Array.from({ length: 7 }, (_, index) => (
            <span key={index} className="lineup-days-outline">
              <Skeleton width={26} height={9} className="on-page" />
              <Skeleton width={14} height={11} className="on-page" />
            </span>
          ))}
        </div>
      ) : week.length ? (
        <nav className="lineup-days" aria-label="Days of the week">
          {week.map((day) => {
            const { weekday, day: number } = stripDay(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={day === date}
                aria-label={longDate(day)}
                data-today={day === today ? "true" : undefined}
                onClick={() => goTo(day)}
              >
                <span>{weekday}</span>
                <strong>{number}</strong>
              </button>
            );
          })}
        </nav>
      ) : null}

      {query.isLoading ? (
        <LineupOutline />
      ) : query.error ? (
        <LoadError
          title="We couldn't load the lineup"
          detail={`${dayName(date)} didn't load. Nothing was changed.`}
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      ) : !lineups.length ? (
        <p className="lineup-state">No locations to show.</p>
      ) : (
        <div className="lineup-locations">
          {lineups.map((location) => (
            <LocationLineup key={location.id} location={location} date={date} timeFormat={timeFormat} />
          ))}
        </div>
      )}
    </section>
  );
}

/** The lineup's loading outline: one location frame at the real sizes. */
function LineupOutline() {
  return (
    <LoadingOutline label="Loading lineups" className="lineup-locations">
      <article className="lineup-location lineup-outline">
        <header className="lineup-location-head">
          <Skeleton width={190} height={15} className="lineup-outline-title" />
          <Skeleton width={150} height={9} className="lineup-outline-date" />
        </header>
        <OutlineShift rows={0} />
        <OutlineShift rows={3} />
        <OutlineShift rows={0} />
      </article>
    </LoadingOutline>
  );
}

function OutlineShift({ rows }: { readonly rows: number }) {
  return (
    <section className="lineup-shift lineup-outline-shift">
      <div className="lineup-shift-head">
        <Skeleton width={64} height={14} />
        <Skeleton width={58} />
      </div>
      {rows ? (
        <div className="lineup-departments">
          <div className="lineup-outline-department">
            <Skeleton width={110} height={9} />
            <span />
          </div>
          <div className="lineup-table-wrap">
            <div className="lineup-outline-head" />
            {Array.from({ length: rows }, (_, row) => (
              <div className="lineup-outline-row" key={row}>
                <Skeleton width={`${52 - row * 6}%`} />
                <Skeleton width="48%" />
                <Skeleton width="56%" />
                <Skeleton width="70%" />
                <Skeleton width="30%" />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function LocationLineup({
  location,
  date,
  timeFormat,
}: {
  readonly location: LineupLocation;
  readonly date: string;
  readonly timeFormat: ScheduleTimeFormat;
}) {
  const headingId = `lineup-location-${location.id}`;
  return (
    <article className="lineup-location" aria-labelledby={headingId}>
      <header className="lineup-location-head">
        <h2 id={headingId}>{location.name}</h2>
        <p>{longDate(date)}</p>
      </header>
      {location.closed ? (
        <p className="lineup-closed">Closed today · {location.closed.title}</p>
      ) : (
        <>
          {location.shortHours?.opens && location.shortHours.closes ? (
            <p className="lineup-short" role="note">
              Short hours today: open {range(location.shortHours.opens, location.shortHours.closes, timeFormat)} (
              {location.shortHours.title}).
            </p>
          ) : null}
          {location.shifts.length ? (
            location.shifts.map((shift) => <ShiftLineup key={shift.key} shift={shift} timeFormat={timeFormat} />)
          ) : (
            <p className="lineup-empty-shift">No shifts for this filter.</p>
          )}
        </>
      )}
    </article>
  );
}

function ShiftLineup({ shift, timeFormat }: { readonly shift: LineupShift; readonly timeFormat: ScheduleTimeFormat }) {
  const [open, setOpen] = useState(true);
  const style = { "--lineup-shift": shift.color ?? "var(--theme-border-strong)" } as CSSProperties;
  if (!shift.count) {
    return (
      <section className="lineup-shift empty" style={style} aria-label={shift.name}>
        <div className="lineup-shift-head">
          <h3>{shift.name}</h3>
          <span className="lineup-shift-meta">No one is scheduled.</span>
        </div>
      </section>
    );
  }
  return (
    <section className="lineup-shift" style={style} aria-label={shift.name}>
      <button type="button" className="lineup-shift-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <h3>{shift.name}</h3>
        <span className="lineup-shift-meta">
          {shift.count} {shift.count === 1 ? "person" : "people"}
        </span>
        <ChevronDown size={16} aria-hidden className="lineup-shift-chevron" />
      </button>
      {open ? (
        <div className="lineup-departments">
          {shift.departments.map((department) => (
            <div className="lineup-department" key={department.id ?? "other"}>
              <h4>{department.name}</h4>
              <div className="lineup-table-wrap">
                <table className="lineup-table">
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col">Shift</th>
                      <th scope="col">Position</th>
                      <th scope="col">In – Out</th>
                      <th scope="col">Label</th>
                    </tr>
                  </thead>
                  {department.jobs.map((job) => (
                    <tbody key={job.id}>
                      <tr className="lineup-job-row">
                        <th scope="rowgroup" colSpan={5}>
                          <i style={{ background: job.color ?? "var(--theme-border-strong)" }} aria-hidden />
                          {job.name}
                        </th>
                      </tr>
                      {job.rows.map((row) => (
                        <tr key={row.shiftId}>
                          <td className="lineup-name">{row.name}</td>
                          <td>{shift.name}</td>
                          <td>{row.jobName}</td>
                          <td className="lineup-time">{range(row.startTime, row.endTime, timeFormat)}</td>
                          <td>{row.labels.join(", ") || <span className="lineup-none" aria-label="No label">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  ))}
                </table>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export default LineupPage;
