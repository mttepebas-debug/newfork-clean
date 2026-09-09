import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { ArrowLeftRight, CalendarDays } from "lucide-react";
import { getEmployeeHub } from "./employee-hub-data";
import { parseLineupDate } from "../schedule/lineup/lineup-time";
import { formatTimeRange } from "../schedule/lib/scheduleDateTime";
import "./employee-team.css";

export function EmployeeTeamView({
  workspaceId,
  userId,
  today,
}: {
  workspaceId: string;
  userId: string;
  today: string;
}) {
  const [search, setSearch] = useSearchParams();
  const day = parseLineupDate(search.get("date")) ?? today;
  const [draft, setDraft] = useState<{ day: string; value: string } | null>(
    null,
  );
  if (draft && draft.day !== day) setDraft(null);
  const value = draft?.day === day ? draft.value : day;
  const query = useQuery({
    queryKey: ["employee-hub", workspaceId, userId, day, day],
    queryFn: () => getEmployeeHub(workspaceId, day, day),
    enabled: Boolean(workspaceId),
    refetchInterval: 60000,
  });
  const model = query.isError ? undefined : query.data;
  const shifts = [
    ...new Map(
      [...(model?.shifts ?? []), ...(model?.team_shifts ?? [])]
        .filter((shift) => shift.scheduled_date === day && shift.employee_id)
        .map((shift) => [shift.id, shift]),
    ).values(),
  ];
  const locations = [
    ...new Map(
      shifts.map((shift) => [shift.location_id, shift.location_name]),
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]));
  const chooseDay = (next: string) => {
    setDraft(null);
    setSearch((previous) => {
      const params = new URLSearchParams(previous);
      params.set("date", next);
      return params;
    });
  };
  return (
    <div className="employee-team-view">
      <section aria-labelledby="team-day-title">
        <header className="team-day-heading">
          <div>
            <p className="eyebrow">PUBLISHED SCHEDULE</p>
            <h2 id="team-day-title">Working together</h2>
            <p>
              See who is scheduled at your locations. Find cover or swap from
              your own shift.
            </p>
          </div>
        </header>
        <form
          className="team-day-controls"
          aria-label="Choose team schedule date"
          onSubmit={(event) => {
            event.preventDefault();
            const next = parseLineupDate(value);
            if (next) chooseDay(next);
          }}
        >
          <label>
            <span>Team schedule date</span>
            <input
              type="date"
              min="1000-01-01"
              max="9999-12-31"
              required
              value={value}
              onChange={(event) => setDraft({ day, value: event.target.value })}
            />
          </label>
          <button type="submit" disabled={!parseLineupDate(value)}>
            Show day
          </button>
          <button type="button" onClick={() => chooseDay(today)}>
            Today
          </button>
          <Link to={`/app/employee-hub/schedule?date=${day}&view=day`}>
            My schedule
          </Link>
        </form>
        <p className="team-day-summary">
          <CalendarDays size={17} aria-hidden />
          {new Date(day + "T12:00:00Z").toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          })}
          {model &&
            ` · ${shifts.length} scheduled ${shifts.length === 1 ? "shift" : "shifts"}`}
        </p>
        {query.isPending && <p role="status">Loading the team schedule…</p>}
        {query.isError && (
          <div className="team-day-error" role="alert">
            <p>
              The team schedule could not be refreshed. Try again to see current
              assignments.
            </p>
            <button type="button" onClick={() => void query.refetch()}>
              Try again
            </button>
          </div>
        )}
        {model && (
          <div className="team-day-groups" aria-busy={query.isFetching}>
            {locations.map(([locationId, name]) => (
              <section
                className="team-day-location"
                key={locationId}
                aria-label={name}
              >
                <header>
                  <h3>{name}</h3>
                  <span>
                    {model.locations.find(
                      (location) => location.id === locationId,
                    )?.timezone ?? "Local location time"}
                  </span>
                </header>
                {shifts
                  .filter((shift) => shift.location_id === locationId)
                  .sort(
                    (a, b) =>
                      a.start_time.localeCompare(b.start_time) ||
                      (a.employee_name ?? "").localeCompare(
                        b.employee_name ?? "",
                      ),
                  )
                  .map((shift) => {
                    const own = shift.employee_id === model.employee.id;
                    return (
                      <article
                        className={`team-day-shift ${own ? "team-day-own" : ""}`}
                        key={shift.id}
                        data-team-shift-id={shift.id}
                        data-team-employee-id={shift.employee_id}
                      >
                        <div className="team-day-person">
                          <strong>
                            {own
                              ? model.employee.display_name
                              : shift.employee_name || "Team member"}
                          </strong>
                          {own && <span className="team-day-you">You</span>}
                          <span>{shift.job_name}</span>
                        </div>
                        <strong className="team-day-hours">
                          {shift.time_basis === "unresolved" ||
                          !shift.start_time ||
                          !shift.end_time
                            ? "Hours need confirmation"
                            : formatTimeRange(
                                shift.start_time,
                                shift.end_time,
                                model.settings.time_format,
                              )}
                        </strong>
                        {own && (
                          <Link
                            className="hub-exchange-link"
                            to={`/app/employee-hub/shift-hub?offer=${shift.id}&from=${day}&to=${day}`}
                            aria-label={`Find cover or swap for your ${shift.job_name} shift at ${name}`}
                          >
                            <ArrowLeftRight size={16} aria-hidden />
                            Find cover or swap
                          </Link>
                        )}
                      </article>
                    );
                  })}
              </section>
            ))}
            {!shifts.length && (
              <div className="team-day-empty">
                <CalendarDays size={24} aria-hidden />
                <h3>No published shifts for this day</h3>
                <p>Choose another day to see your team’s schedule.</p>
              </div>
            )}
          </div>
        )}
      </section>
      {model && (
        <section
          className="team-directory"
          aria-labelledby="team-directory-title"
        >
          <header>
            <h2 id="team-directory-title">Team directory</h2>
            <p>People who share one of your assigned locations.</p>
          </header>
          <div className="team-grid">
            {model.team.map((member) => (
              <article className="team-row" key={member.id}>
                <div className="avatar" aria-hidden>
                  {member.display_name.slice(0, 1)}
                </div>
                <div>
                  <strong>{member.display_name}</strong>
                  <span>{member.job_names.join(", ") || "Team member"}</span>
                  <small>{member.location_names.join(" · ")}</small>
                </div>
              </article>
            ))}
          </div>
          {!model.team.length && (
            <p>No teammates are visible in your locations.</p>
          )}
        </section>
      )}
    </div>
  );
}
