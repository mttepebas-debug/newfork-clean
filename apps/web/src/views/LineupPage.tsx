import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useMemo, useRef, useState, type CSSProperties } from "react";
import { useSearchParams } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { can } from "../auth/can";
import { noAccessHomePath } from "../auth/resolveLanding";
import { isNoAccess } from "../lib/no-access";
import { clockIn, todayIn } from "../lib/today";
import { usePhoneWidth } from "../lib/usePhoneWidth";
import { useScheduleQuery } from "../schedule/hooks/useScheduleQuery";
import { useScheduleRealtime } from "../schedule/hooks/useScheduleRealtime";
import {
  lineupDay,
  lineupWeek,
  unpublishedCount,
  type LineupLocation,
  type LineupShift,
} from "../schedule/lineup";
import { useLineupDay } from "../schedule/lineup-data";
import { LineupPublishButton, LineupPublishWindow, publishedAt } from "../schedule/LineupPublishWindow";
import { LineupReadPanel } from "../schedule/LineupReadList";
import { addDays, formatTime, type ScheduleTimeFormat } from "../schedule/lib/scheduleDateTime";
import { LoadError, LoadingOutline, Skeleton } from "../shell/LoadState";
import { NoAccessState } from "../shell/NoAccessState";
import { CatalogPageHeader } from "./CatalogPageHeader";
import { PhoneLineupPage } from "./LineupPhone";
import "./lineup-page.css";

// Lineup (Mert 2026-10-13), read-only first stage: who works each shift today,
// per location, straight from the published Schedule. Editing, sections, call
// off and publishing come in later stages (PLAN.md section 12). On a phone
// (Mert 2026-10-14, "B") a manager sees one location and one shift at a time:
// the shifts are tabs, a summary card, then the team.

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

  const phone = usePhoneWidth();

  // The catalog around the lineups (shift types, the week, the time format) is the Schedule read's; the
  // lineups themselves, their rows and publish state, are the lineup day read (LINEUP-PUBLISH-WEB).
  const schedule = useScheduleQuery(workspaceId, date, "day");
  const day = useLineupDay(workspaceId, date);
  const model = schedule.data;
  const query = {
    isLoading: schedule.isLoading || day.isLoading,
    isFetching: schedule.isFetching || day.isFetching,
    error: schedule.error ?? day.error,
    refetch: () => Promise.all([schedule.error ? schedule.refetch() : null, day.error ? day.refetch() : null]),
  };
  const [publishOpen, setPublishOpen] = useState(false);
  const closePublish = useCallback(() => setPublishOpen(false), []);
  useScheduleRealtime({
    workspaceId,
    weekStart: model?.week_start ?? "",
    locationIds: model?.locations.map((location) => location.id) ?? [],
  });

  const lineups = useMemo(
    () => (day.data ? lineupDay(day.data, model ?? null, phone ? {} : { locationId, shiftTypeId }) : []),
    [day.data, model, locationId, shiftTypeId, phone],
  );
  // A phone shows one location: the chosen one, else the first.
  const phoneLocation = phone ? lineups.find((location) => location.id === locationId) ?? lineups[0] ?? null : null;

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
  const goTo = (day: string) => {
    setPublishOpen(false);
    setParam("date", day === today ? "" : day);
  };

  // The Publish window lists every lineup of the day, whatever the filters show (PLAN §3).
  const allLineups = useMemo(() => (day.data ? lineupDay(day.data, model ?? null) : []), [day.data, model]);
  const canShare = context ? can(context, "lineup.share") : false;
  const waiting = unpublishedCount(allLineups);
  const anyPublished = allLineups.some((location) => location.shifts.some((shift) => shift.publish.published));
  const publishControl = canShare && day.data ? (
    <div className="lineup-publish-anchor">
      <LineupPublishButton
        waiting={waiting}
        anyPublished={anyPublished}
        open={publishOpen}
        onToggle={() => setPublishOpen(!publishOpen)}
      />
      {publishOpen ? (
        <LineupPublishWindow
          workspaceId={workspaceId}
          date={date}
          dateLabel={shortDate(date)}
          locations={allLineups}
          timeFormat={model?.settings.time_format ?? "12h"}
          onClose={closePublish}
        />
      ) : null}
    </div>
  ) : null;

  const timeFormat = model?.settings.time_format ?? "12h";
  // A phone: E · Çark tarih (KARARLAR Lineup, Mert 2026-10-17), its own page.
  if (phone && !(query.error && isNoAccess(query.error))) {
    return (
      <PhoneLineupPage
        header={
          <CatalogPageHeader
            eyebrow="THE RIGHT PEOPLE. IN THE RIGHT SPOT."
            title="Lineup"
            titleId="lineup-title"
            description="Today's lineups, live from the Schedule."
          />
        }
        date={date}
        today={today}
        onDate={goTo}
        loading={query.isLoading}
        error={
          query.error ? (
            <LoadError
              title="We couldn't load the lineup"
              detail={`${dayName(date)} didn't load. Nothing was changed.`}
              retrying={query.isFetching}
              onRetry={() => void query.refetch()}
            />
          ) : null
        }
        locations={lineups}
        location={phoneLocation}
        onLocation={(id) => setParam("location", id)}
        chosen={shiftTypeId}
        onShift={(key) => setParam("shift", key)}
        now={date === today ? clockIn() : null}
        timeFormat={timeFormat}
        publish={
          canShare && day.data
            ? {
                waiting,
                anyPublished,
                open: publishOpen,
                onToggle: () => setPublishOpen(!publishOpen),
                window: (
                  <LineupPublishWindow
                    workspaceId={workspaceId}
                    date={date}
                    dateLabel={shortDate(date)}
                    locations={allLineups}
                    timeFormat={timeFormat}
                    onClose={closePublish}
                    className="is-sheet"
                  />
                ),
              }
            : null
        }
      />
    );
  }

  const header = (
    <CatalogPageHeader
      eyebrow="THE RIGHT PEOPLE. IN THE RIGHT SPOT."
      title="Lineup"
      titleId="lineup-title"
      description="Today's lineups, live from the Schedule."
      action={publishControl}
    />
  );

  // No access: the card alone, nothing of the page around it (Mert 2026-10-14).
  if (query.error && isNoAccess(query.error))
    return <NoAccessState homeHref={noAccessHomePath(context, "/app/schedule/lineup")} />;

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
      {/* The whole head folds the shift (one button stretched over it); the Read count opens its own panel
          above that button, so neither sits inside the other. */}
      <div className="lineup-shift-head is-toggle" data-open={open}>
        <button
          type="button"
          className="lineup-shift-toggle"
          aria-expanded={open}
          aria-label={`${shift.name}, ${shift.count} ${shift.count === 1 ? "person" : "people"}`}
          onClick={() => setOpen(!open)}
        />
        <span className="lineup-shift-title">
          <h3>{shift.name}</h3>
          <ShiftStatus shift={shift} timeFormat={timeFormat} />
        </span>
        <span className="lineup-shift-meta">
          {shift.count} {shift.count === 1 ? "person" : "people"}
        </span>
        <ChevronDown size={16} aria-hidden className="lineup-shift-chevron" />
      </div>
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

/** Under the shift's name (Mert 2026-10-13): green "Published 2:10 PM" and, when staff were asked, "Read 7/11". */
function ShiftStatus({ shift, timeFormat }: { readonly shift: LineupShift; readonly timeFormat: ScheduleTimeFormat }) {
  const { publish } = shift;
  const [reading, setReading] = useState(false);
  const close = useCallback(() => setReading(false), []);
  const count = useRef<HTMLButtonElement | null>(null);
  const backToCount = useCallback(() => count.current?.focus(), []);
  if (!publish.published) return null;
  return (
    <span className="lineup-shift-status">
      <span className="lineup-shift-published">Published {publishedAt(publish.sharedAt, timeFormat)}</span>
      {publish.askAck ? (
        // Mert 2026-10-17: the count opens who read it and who hasn't.
        <span className="lineup-shift-read-anchor">
          <button
            type="button"
            ref={count}
            className="lineup-shift-read"
            aria-label={`Read by ${publish.acknowledged} of ${publish.withApp} with the app`}
            aria-haspopup="dialog"
            aria-expanded={reading}
            onClick={() => setReading(!reading)}
          >
            Read {publish.acknowledged}/{publish.withApp}
          </button>
          {reading ? <LineupReadPanel shift={shift} timeFormat={timeFormat} onClose={close} returnFocus={backToCount} /> : null}
        </span>
      ) : null}
    </span>
  );
}

export default LineupPage;
