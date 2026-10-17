import {
  employeeSectionSchema,
  type WeeklyPreferenceDay,
  type WeeklyTeamRead,
} from "@newfork/shared";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, RotateCcw, Search } from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { can } from "../auth/can";
import { loadWeeklyTeam } from "../availability/availability-data";
import { formatTime } from "../schedule/lib/scheduleDateTime";
import { CatalogSortButton } from "./CatalogSortButton";
import { CatalogPageHeader } from "./CatalogPageHeader";
import "../availability/weekly-team.css";

import { isNoAccess } from "../lib/no-access";
import { NoAccessState } from "../shell/NoAccessState";
import { ListOutline, LoadError } from "../shell/LoadState";
import { noAccessHomePath } from "../auth/resolveLanding";
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
type AvailabilitySortKey = "employee";

export function AvailabilityPage() {
  const { context } = useAuth();
  const [search, setSearch] = useSearchParams();
  const workspaceId = context?.workspace.id ?? "";
  const locationId = search.get("location") ?? "all";
  const queryText = search.get("q") ?? "";
  const submission = search.get("submission") ?? "all";
  const [sort, setSort] = useState<{
    key: AvailabilitySortKey;
    descending: boolean;
  }>({ key: "employee", descending: false });
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
  const employees = useMemo(
    () =>
      [
        ...(model?.employees.filter(
          (employee) =>
            (locationId === "all" ||
              employee.location_ids.includes(locationId)) &&
            (!term ||
              employee.display_name.toLocaleLowerCase().includes(term) ||
              employee.employee_code.toLocaleLowerCase().includes(term)) &&
            (submission !== "submitted" || employee.submitted) &&
            (submission !== "missing" || !employee.submitted),
        ) ?? []),
      ].sort(
        (left, right) =>
          compareAvailabilityValues(
            availabilitySortValue(left, sort.key),
            availabilitySortValue(right, sort.key),
          ) * (sort.descending ? -1 : 1),
      ),
    [locationId, model?.employees, sort, submission, term],
  );
  // The drawer reads the person's record: only for a reader the core lets
  // read employees (BL-243).
  const opensEmployees = can(context, "employee.read");
  const selectedEmployee = opensEmployees
    ? model?.employees.find(
        (employee) =>
          employee.id === search.get("employeeId") && employee.can_open,
      )
    : undefined;
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

  // The API's "no" gets the one no-access card, never its raw sentence.
  if (isNoAccess(query.error))
    return (
      <NoAccessState
        homeHref={noAccessHomePath(context, "/app/availability")}
      />
    );
  return (
    <section
      className="availability-page weekly-team-page list-page"
      aria-labelledby="availability-title"
    >
      <CatalogPageHeader
        eyebrow="AVAILABILITY CLEAR. COVERAGE READY."
        title="Availability"
        titleId="availability-title"
        description="Track weekly availability submissions and identify coverage gaps."
      />
      <div className="weekly-team-toolbar catalog-toolbar">
        <div className="catalog-toolbar-status-row">
          <div
            className="catalog-status-tabs weekly-team-filters"
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
              {employees.length} {employees.length === 1 ? "employee" : "employees"}
            </span>
          )}
        </div>
        <div className="catalog-toolbar-filter-row">
          <select
            className="toolbar-filter-select list-filter-narrow"
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
          <label className="search-field toolbar-search">
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
        </div>
      </div>
      {query.isPending && (
        <ListOutline label="Loading availability" rows={8} columns={8} />
      )}
      {query.error && !model && (
        <LoadError
          title="We couldn't load team availability"
          detail="Team availability didn't load. Nothing was changed."
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.error && model && (
        <div className="weekly-team-error" role="alert">
          <span>Team availability didn't refresh. This is the last view that loaded.</span>
          <button type="button" disabled={query.isFetching} onClick={() => void query.refetch()}>
            <RotateCcw size={15} aria-hidden />
            Try again
          </button>
        </div>
      )}
      {model && (
        <div
          className="weekly-team-scroll"
          role="region"
          aria-label="Team availability"
          tabIndex={0}
        >
          <table className="weekly-team-table">
            <thead>
              <tr>
                <th
                  scope="col"
                  aria-sort={
                    sort.key === "employee"
                      ? sort.descending
                        ? "descending"
                        : "ascending"
                      : "none"
                  }
                >
                  <CatalogSortButton
                    label="Employee"
                    active={sort.key === "employee"}
                    onClick={() =>
                      setSort({
                        key: "employee",
                        descending:
                          sort.key === "employee" ? !sort.descending : false,
                      })
                    }
                  />
                </th>
                {weekdays.map(([day, name]) => (
                  <th key={day} scope="col">
                    <span className="weekly-team-day-heading">
                      {name.slice(0, 3)}
                    </span>
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
                      disabled={!opensEmployees || !employee.can_open}
                      onClick={() => openEmployee(employee.id)}
                    >
                      <strong>{employee.display_name}</strong>
                    </button>
                  </th>
                  {weekdays.map(([day, name]) => {
                    const rule = employee.preference.days.find(
                      (item) => item.day === day,
                    )!;
                    const parts = dayLabels(rule, model);
                    const unavailable =
                      rule.all_day || rule.ranges.length > 0;
                    return (
                      <td key={day} data-unavailable={unavailable}>
                        <button
                          type="button"
                          className="weekly-team-day"
                          disabled={!opensEmployees || !employee.can_open}
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
                            visibleParts(parts).map((part, index) => (
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
          {employees.length === 0 && (
            <div className="catalog-table-empty">
              <span className="catalog-table-empty-icon" aria-hidden>
                <CalendarCheck size={22} />
              </span>
              <h2>No employees match this view</h2>
              <p>Try another status or location, or clear your search.</p>
            </div>
          )}
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

function availabilitySortValue(
  employee: WeeklyTeamRead["employees"][number],
  _key: AvailabilitySortKey,
): string {
  return employee.display_name;
}

function compareAvailabilityValues(left: string, right: string): number {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

/** A day cell holds at most three lines (KARARLAR "Availability"): the
 * first two and a "+N more" line when there are more. */
function visibleParts<T extends { label: string; detail: string }>(
  parts: readonly T[],
): readonly { label: string; detail: string }[] {
  if (parts.length <= 3) return parts;
  return [
    ...parts.slice(0, 2),
    {
      label: `+${parts.length - 2} more`,
      detail: parts
        .slice(2)
        .map((part) => part.label)
        .join(", "),
    },
  ];
}

function dayLabels(day: WeeklyPreferenceDay, model: WeeklyTeamRead) {
  const range = (start: string, end: string) =>
    formatTime(start, model.time_format) +
    " – " +
    formatTime(
      end === "24:00" && model.time_format === "12h" ? "00:00" : end,
      model.time_format,
    );
  if (day.all_day) return [{ label: "All day", detail: "Unavailable all day" }];
  // Hours only (Mert 2026-10-16, "yalnız saat").
  return day.ranges.map((hours) => ({
    label: range(hours.start, hours.end),
    detail: "Unavailable",
  }));
}
