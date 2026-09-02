import type {
  ScheduleEmployee,
  ScheduleReadModel,
  ScheduleShift,
  ScheduleView,
} from "@newfork/shared/schedule";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { getScheduleReadModel } from "../schedule/schedule-data";

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const weekdayNames = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export function AvailabilityPage() {
  const { context } = useAuth();
  const [search, setSearch] = useSearchParams();
  const today = new Date().toLocaleDateString("en-CA");
  const selectedDate = validDate(search.get("date")) ?? today;
  const locationId = search.get("location") ?? "all";
  const queryText = search.get("q") ?? "";
  const query = useQuery({
    queryKey: ["availability-board", context?.workspace.id, selectedDate],
    queryFn: () =>
      getScheduleReadModel(
        context!.workspace.id,
        selectedDate,
        "week" satisfies ScheduleView,
      ),
    enabled: Boolean(context),
  });

  const model = query.data;
  const visibleEmployees = useMemo(() => {
    if (!model) return [];
    const term = queryText.trim().toLowerCase();
    return model.employees.filter((employee) => {
      const matchesLocation =
        locationId === "all" || employee.location_ids.includes(locationId);
      const matchesSearch =
        term.length === 0 ||
        employee.display_name.toLowerCase().includes(term) ||
        employee.employee_code.toLowerCase().includes(term);
      return matchesLocation && matchesSearch;
    });
  }, [locationId, model, queryText]);

  const summaries = useMemo(
    () =>
      model
        ? visibleEmployees.map((employee) =>
            summarizeEmployeeAvailability(employee, model),
          )
        : [],
    [model, visibleEmployees],
  );

  const updateParams = (values: Record<string, string | null>) => {
    const next = new URLSearchParams(search);
    Object.entries(values).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    setSearch(next, { replace: true });
  };

  return (
    <section className="availability-page" aria-labelledby="availability-title">
      <header className="page-header">
        <div>
          <h1 id="availability-title">Availability</h1>
          <p>
            Review team availability, missing submissions, and schedule conflicts
            for the selected week.
          </p>
        </div>
        <div className="week-controls" aria-label="Availability week">
          <button
            className="icon-button"
            type="button"
            aria-label="Previous week"
            onClick={() => updateParams({ date: addDays(selectedDate, -7) })}
          >
            <ChevronLeft size={17} aria-hidden />
          </button>
          <input
            aria-label="Availability date"
            type="date"
            value={selectedDate}
            onChange={(event) => updateParams({ date: event.target.value })}
          />
          <button
            className="icon-button"
            type="button"
            aria-label="Next week"
            onClick={() => updateParams({ date: addDays(selectedDate, 7) })}
          >
            <ChevronRight size={17} aria-hidden />
          </button>
        </div>
      </header>

      <div className="availability-toolbar">
        <label className="search-field">
          <Search size={16} aria-hidden />
          <input
            aria-label="Search employees"
            placeholder="Search employees"
            value={queryText}
            onChange={(event) => updateParams({ q: event.target.value || null })}
          />
        </label>
        <label className="form-field compact-field">
          <span>Location</span>
          <select
            value={locationId}
            onChange={(event) =>
              updateParams({
                location: event.target.value === "all" ? null : event.target.value,
              })
            }
          >
            <option value="all">All locations</option>
            {model?.locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {model ? (
        <div className="availability-summary-grid">
          <AvailabilityMetric label="Employees" value={visibleEmployees.length} />
          <AvailabilityMetric
            label="Missing availability"
            value={summaries.filter((summary) => !summary.hasAvailability).length}
          />
          <AvailabilityMetric
            label="Schedule conflicts"
            value={summaries.reduce(
              (total, summary) => total + summary.conflicts.length,
              0,
            )}
          />
        </div>
      ) : null}

      {query.isLoading ? (
        <p className="settings-state">Loading availability...</p>
      ) : null}
      {query.error ? (
        <p className="settings-state error" role="alert">
          {query.error instanceof Error
            ? query.error.message
            : "Availability could not be loaded"}
        </p>
      ) : null}
      {model && summaries.length === 0 ? (
        <div className="settings-empty">
          <CalendarCheck size={22} aria-hidden />
          <strong>No employees match this view</strong>
          <p>Adjust search or location filters to review availability.</p>
        </div>
      ) : null}
      {model && summaries.length > 0 ? (
        <div className="availability-board-list" aria-label="Team availability">
          {summaries.map((summary) => (
            <article className="availability-card" key={summary.employee.id}>
              <div className="availability-person">
                <div className="avatar" aria-hidden>
                  {summary.employee.display_name.slice(0, 1)}
                </div>
                <div>
                  <strong>{summary.employee.display_name}</strong>
                  <span>{summary.employee.employee_code}</span>
                </div>
              </div>
              <div className="availability-week-grid">
                {summary.days.map((day) => (
                  <div
                    className="availability-day-cell"
                    data-mode={day.mode}
                    key={day.day}
                    title={`${weekdayNames[day.day]}: ${day.label}`}
                  >
                    <span>{weekdays[day.day]}</span>
                    <strong>{day.label}</strong>
                    {day.detail ? <small>{day.detail}</small> : null}
                  </div>
                ))}
              </div>
              <div className="availability-card-footer">
                {summary.hasAvailability ? (
                  <span>{summary.restrictedDays} restricted days</span>
                ) : (
                  <span>Availability not submitted</span>
                )}
                {summary.conflicts.length > 0 ? (
                  <span className="availability-warning">
                    <AlertTriangle size={14} aria-hidden />
                    {summary.conflicts.length} scheduled conflict
                  </span>
                ) : (
                  <span>No scheduled conflicts</span>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function AvailabilityMetric({
  label,
  value,
}: {
  readonly label: string;
  readonly value: number;
}) {
  return (
    <div className="availability-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function summarizeEmployeeAvailability(
  employee: ScheduleEmployee,
  model: ScheduleReadModel,
) {
  const shifts = model.shifts.filter((shift) => shift.employee_id === employee.id);
  const days = employee.availability
    ? employee.availability.map((day) => {
        const shiftsForDay = shifts.filter(
          (shift) => dayOfWeek(shift.scheduled_date) === day.day,
        );
        return {
          day: day.day,
          mode: day.mode,
          label: availabilityLabel(day),
          detail:
            day.mode === "windows"
              ? day.windows
                  .map((window) => `${window.start.slice(0, 5)}-${window.end.slice(0, 5)}`)
                  .join(", ")
              : shiftsForDay.length > 0
                ? `${shiftsForDay.length} shift${shiftsForDay.length === 1 ? "" : "s"}`
                : "",
        };
      })
    : [0, 1, 2, 3, 4, 5, 6].map((day) => ({
        day,
        mode: "missing" as const,
        label: "Missing",
        detail: "",
      }));
  const conflicts = employee.availability
    ? shifts.filter((shift) => shiftConflictsWithAvailability(shift, employee))
    : [];
  return {
    employee,
    days,
    conflicts,
    hasAvailability: Boolean(employee.availability),
    restrictedDays: days.filter(
      (day) => day.mode === "unavailable" || day.mode === "windows",
    ).length,
  };
}

function availabilityLabel(day: NonNullable<ScheduleEmployee["availability"]>[number]): string {
  if (day.mode === "unrestricted") return "Any time";
  if (day.mode === "unavailable") return "Unavailable";
  return "Windows";
}

function shiftConflictsWithAvailability(
  shift: ScheduleShift,
  employee: ScheduleEmployee,
): boolean {
  const availability = employee.availability?.find(
    (day) => day.day === dayOfWeek(shift.scheduled_date),
  );
  if (!availability) return true;
  if (availability.mode === "unrestricted") return false;
  if (availability.mode === "unavailable") return true;
  return !availability.windows.some(
    (window) =>
      timeValue(shift.start_time) >= timeValue(window.start) &&
      timeValue(shift.end_time) <= timeValue(window.end),
  );
}

function timeValue(value: string): number {
  const [hours = "0", minutes = "0"] = value.split(":");
  return Number(hours) * 60 + Number(minutes);
}

function dayOfWeek(isoDate: string): number {
  return new Date(`${isoDate}T12:00:00.000Z`).getUTCDay();
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function validDate(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}
