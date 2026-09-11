import {
  employeeSectionSchema,
  type WeeklyPreferenceDay,
  type WeeklyTeamRead,
} from "@newfork/shared";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, RotateCcw, Search } from "lucide-react";
import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { loadWeeklyTeam } from "../availability/availability-data";
import { formatTime } from "../schedule/lib/scheduleDateTime";
import "../availability/weekly-team.css";

const EmployeeDrawer = lazy(() =>
  import("../employees/EmployeeDrawer").then((module) => ({
    default: module.EmployeeDrawer,
  })),
);
const weekdays = [
  [1, "Monday"],
  [2, "Tuesday"],
  [3, "Wednesday"],
  [4, "Thursday"],
  [5, "Friday"],
  [6, "Saturday"],
  [0, "Sunday"],
] as const;

export function AvailabilityPage() {
  const { context } = useAuth();
  const [search, setSearch] = useSearchParams();
  const workspaceId = context?.workspace.id ?? "";
  const locationId = search.get("location") ?? "all";
  const queryText = search.get("q") ?? "";
  const submission = search.get("submission") ?? "all";
  const query = useQuery({
    queryKey: ["weekly-preferences", workspaceId, "team"],
    queryFn: () => loadWeeklyTeam(workspaceId),
    enabled: Boolean(workspaceId),
    retry: false,
  });
  const status =
    query.error && "status" in query.error ? Number(query.error.status) : 0;
  const model = [401, 403, 404].includes(status) ? undefined : query.data;
  const term = queryText.trim().toLocaleLowerCase();
  const employees =
    model?.employees.filter(
      (employee) =>
        (locationId === "all" || employee.location_ids.includes(locationId)) &&
        (!term ||
          employee.display_name.toLocaleLowerCase().includes(term) ||
          employee.employee_code.toLocaleLowerCase().includes(term)) &&
        (submission !== "submitted" || employee.submitted) &&
        (submission !== "missing" || !employee.submitted),
    ) ?? [];
  const selectedEmployee = model?.employees.find(
    (employee) => employee.id === search.get("employeeId") && employee.can_open,
  );
  const parsedSection = employeeSectionSchema.safeParse(search.get("section"));
  const updateParams = (
    values: Record<string, string | null>,
    replace = true,
  ) => {
    const next = new URLSearchParams(search);
    next.delete("date");
    Object.entries(values).forEach(([key, value]) =>
      value ? next.set(key, value) : next.delete(key),
    );
    setSearch(next, { replace });
  };
  const openEmployee = (id: string) =>
    updateParams({ employeeId: id, section: "availability" }, false);

  return (
    <section
      className="availability-page weekly-team-page"
      aria-labelledby="availability-title"
    >
      <header className="page-header">
        <h1 id="availability-title">Availability</h1>
      </header>
      <div className="weekly-team-toolbar">
        <label className="search-field">
          <Search size={16} aria-hidden />
          <input
            aria-label="Search employees"
            placeholder="Search employees"
            value={queryText}
            onChange={(event) =>
              updateParams({ q: event.target.value || null })
            }
          />
        </label>
        <select
          className="toolbar-filter-select"
          aria-label="Location"
          value={locationId}
          onChange={(event) =>
            updateParams({
              location:
                event.target.value === "all" ? null : event.target.value,
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
        <div
          className="employee-status-tabs weekly-team-filters"
          role="group"
          aria-label="Submission status"
        >
          {(
            [
              ["all", "All"],
              ["submitted", "Submitted"],
              ["missing", "Not submitted"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={submission === value ? "active" : ""}
              aria-pressed={submission === value}
              onClick={() =>
                updateParams({ submission: value === "all" ? null : value })
              }
            >
              {label}
            </button>
          ))}
        </div>
        {model && (
          <span className="weekly-team-count" role="status">
            {employees.length} employees
          </span>
        )}
      </div>
      {query.isPending && <p role="status">Loading availability...</p>}
      {query.error && (
        <div className="weekly-team-error" role="alert">
          <span>
            {query.error.message || "Team availability could not be loaded."}
          </span>
          <button type="button" onClick={() => void query.refetch()}>
            <RotateCcw size={15} aria-hidden />
            Retry
          </button>
        </div>
      )}
      {model && employees.length === 0 && (
        <div className="settings-empty">
          <CalendarCheck size={22} aria-hidden />
          <strong>No employees match this view</strong>
        </div>
      )}
      {model && employees.length > 0 && (
        <div
          className="weekly-team-scroll"
          role="region"
          aria-label="Team availability"
          tabIndex={0}
        >
          <table className="weekly-team-table">
            <thead>
              <tr>
                <th scope="col">Employee</th>
                {weekdays.map(([day, name]) => (
                  <th key={day} scope="col">
                    {name.slice(0, 3)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee.id}>
                  <th scope="row">
                    <button
                      type="button"
                      className="weekly-team-person"
                      disabled={!employee.can_open}
                      onClick={() => openEmployee(employee.id)}
                    >
                      <strong>{employee.display_name}</strong>
                      <span>{employee.employee_code}</span>
                      <small>
                        {employee.submitted ? "Submitted" : "Not submitted"}
                      </small>
                    </button>
                  </th>
                  {weekdays.map(([day, name]) => {
                    const rule = employee.preference.days.find(
                      (item) => item.day === day,
                    )!;
                    const parts = dayLabels(rule, model);
                    const unavailable =
                      rule.all_day ||
                      Boolean(rule.range) ||
                      rule.shift_type_ids.length > 0;
                    return (
                      <td key={day} data-unavailable={unavailable}>
                        <button
                          type="button"
                          className="weekly-team-day"
                          disabled={!employee.can_open}
                          aria-label={
                            employee.display_name +
                            " " +
                            name +
                            ": " +
                            (parts.map((part) => part.label).join(", ") ||
                              "Available")
                          }
                          onClick={() => openEmployee(employee.id)}
                        >
                          {parts.length ? (
                            parts.map((part, index) => (
                              <span key={index} title={part.detail}>
                                {part.label}
                              </span>
                            ))
                          ) : (
                            <span className="weekly-team-available" aria-hidden>
                              &mdash;
                            </span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selectedEmployee && (
        <Suspense fallback={<p role="status">Loading employee...</p>}>
          <EmployeeDrawer
            key={workspaceId + ":" + selectedEmployee.id}
            employeeId={selectedEmployee.id}
            creating={false}
            section={
              parsedSection.success ? parsedSection.data : "availability"
            }
            onSectionChange={(section) => updateParams({ section })}
            onClose={() => updateParams({ employeeId: null, section: null })}
            onCreated={() => {}}
          />
        </Suspense>
      )}
    </section>
  );
}

function dayLabels(day: WeeklyPreferenceDay, model: WeeklyTeamRead) {
  const range = (start: string, end: string) =>
    formatTime(start, model.time_format) +
    " - " +
    formatTime(
      end === "24:00" && model.time_format === "12h" ? "00:00" : end,
      model.time_format,
    );
  if (day.all_day) return [{ label: "All day", detail: "Unavailable all day" }];
  if (day.range)
    return [
      { label: range(day.range.start, day.range.end), detail: "Unavailable" },
    ];
  return day.shift_type_ids.map((id) => {
    const type = model.shift_types.find((item) => item.id === id);
    return {
      label: type?.name ?? "Unavailable shift type",
      detail: type
        ? (type.start_time && type.end_time
            ? range(type.start_time, type.end_time)
            : "Default hours unavailable") +
          (type.archived ? " (archived)" : "")
        : "Shift type details unavailable",
    };
  });
}
