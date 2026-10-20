import { employeeSectionSchema, type WeeklyTeamRead } from "@newfork/shared";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@newfork/ui";
import { ArrowRight, CalendarCheck, ChevronLeft, ChevronRight, Lock, RotateCcw, Search } from "lucide-react";
import { lazy, Suspense, useMemo } from "react";
import { useSearchParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { can } from "../auth/can";
import { loadWeeklyTeam } from "../availability/availability-data";
import { WeekRead } from "../availability/WeekRead";
import { WeeklyPreferencesPanel } from "../availability/WeeklyPreferencesPanel";
import { DISPLAY_DAYS, dayState, updatedOn } from "../availability/day-availability";
import { useListPhoneWidth } from "../lib/usePhoneWidth";
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

// Sidebar → Availability (KARARLAR "Müsaitlik giriş ekranı = 4 · Gün gün":
// "Availability sayfasında kişi listesi ve seçilen kişinin haftası"). The
// heading, the status tabs, the filters and the legend stay; the people on
// the left, the chosen person's week on the right. On a phone (720 px and
// below) the people are a list of everyone, without the status tabs (Mert,
// 2026-10-17), and a tap opens the person's page with the drawer's two tabs.
// Only employees are listed (S-32).

type Person = WeeklyTeamRead["employees"][number];
const STATUSES = [
  ["all", "All"],
  ["submitted", "Submitted"],
  ["missing", "Not submitted"],
] as const;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toLocaleUpperCase())
    .join("");
const byName = (left: Person, right: Person) =>
  left.display_name.localeCompare(right.display_name, undefined, { numeric: true, sensitivity: "base" });

export function AvailabilityPage() {
  const { context } = useAuth();
  const phone = useListPhoneWidth();
  const [search, setSearch] = useSearchParams();
  const workspaceId = context?.workspace.id ?? "";
  const locationId = search.get("location") ?? "all";
  const queryText = search.get("q") ?? "";
  // A phone has no status tabs, so a status left in the address (say, from a
  // narrowed window) never hides anyone there.
  const submission = phone ? "all" : (search.get("submission") ?? "all");
  const query = useQuery({
    queryKey: ["weekly-preferences", workspaceId, "team"],
    queryFn: () => loadWeeklyTeam(workspaceId),
    enabled: Boolean(workspaceId),
    retry: false,
  });
  const status = query.error && "status" in query.error ? Number(query.error.status) : 0;
  const model = [401, 403, 404].includes(status) ? undefined : query.data;
  const term = queryText.trim().toLocaleLowerCase();
  // Location and search narrow everyone; the tab then picks a status. The
  // tabs count what the location and the search leave.
  const found = useMemo(
    () =>
      (model?.employees ?? [])
        .filter(
          (employee) =>
            (locationId === "all" || employee.location_ids.includes(locationId)) &&
            (!term ||
              employee.display_name.toLocaleLowerCase().includes(term) ||
              employee.employee_code.toLocaleLowerCase().includes(term)),
        )
        .sort(byName),
    [locationId, model?.employees, term],
  );
  const employees = found.filter(
    (employee) =>
      (submission !== "submitted" || employee.submitted) && (submission !== "missing" || !employee.submitted),
  );
  const counts = {
    all: found.length,
    submitted: found.filter((employee) => employee.submitted).length,
    missing: found.filter((employee) => !employee.submitted).length,
  };
  const chosenId = search.get("person");
  const chosen = employees.find((employee) => employee.id === chosenId) ?? employees[0];
  // The phone opens a person's page only when one is asked for.
  const phonePerson = phone ? model?.employees.find((employee) => employee.id === chosenId) : undefined;
  // The drawer reads the person's record: only for a reader the core lets
  // read employees (BL-243).
  const opensEmployees = can(context, "employee.read");
  const selectedEmployee = opensEmployees
    ? model?.employees.find((employee) => employee.id === search.get("employeeId") && employee.can_open)
    : undefined;
  const parsedSection = employeeSectionSchema.safeParse(search.get("section"));
  const updateParams = (values: Record<string, string | null>, replace = true) => {
    const next = new URLSearchParams(search);
    next.delete("date");
    Object.entries(values).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
    setSearch(next, { replace });
  };
  const openEmployee = (id: string) => updateParams({ employeeId: id, section: "availability" }, false);

  // The API's "no" gets the one no-access card, never its raw sentence.
  if (isNoAccess(query.error))
    return <NoAccessState homeHref={noAccessHomePath(context, "/app/availability")} />;

  if (phonePerson && model)
    return (
      <section className="availability-page weekly-team-page list-page avt-person-page" aria-labelledby="avt-person-name">
        <div className="avt-person-top">
          <button type="button" className="avt-back" onClick={() => updateParams({ person: null })}>
            <ChevronLeft size={16} aria-hidden />
            Availability
          </button>
          <div className="avt-person">
            <span className="avt-avatar is-large" aria-hidden>
              {initials(phonePerson.display_name)}
            </span>
            <div>
              <h1 id="avt-person-name">{phonePerson.display_name}</h1>
              <small>{[phonePerson.job_name, phonePerson.employee_code].filter(Boolean).join(" · ")}</small>
            </div>
          </div>
        </div>
        <div className="avt-person-body">
          {phonePerson.can_open ? (
            // The drawer's two tabs: the employee's week, read only, and the manager's notes.
            <WeeklyPreferencesPanel workspaceId={workspaceId} employeeId={phonePerson.id} audience="manager" short />
          ) : (
            <div className="avt-person-read">
              <WeekRead
                name={phonePerson.display_name}
                submitted={phonePerson.submitted}
                updatedAt={phonePerson.updated_at}
                preference={phonePerson.preference}
                timeFormat={model.time_format}
                readOnlyBar
                header={false}
              />
            </div>
          )}
        </div>
      </section>
    );

  const count = model && (
    <span className="weekly-team-count" role="status">
      {employees.length} {employees.length === 1 ? "employee" : "employees"}
    </span>
  );

  const personRow = (employee: Person) => (
    <button
      key={employee.id}
      type="button"
      className="avt-row"
      aria-current={phone ? undefined : employee.id === chosen?.id}
      onClick={() => updateParams({ person: employee.id }, !phone)}
    >
      <span className="avt-avatar" aria-hidden>
        {initials(employee.display_name)}
      </span>
      <span className="avt-row-text">
        <b>{employee.display_name}</b>
        <small>{employee.submitted ? employee.job_name : "Not submitted yet"}</small>
      </span>
      {employee.submitted && (
        <span className="avt-dots" aria-hidden>
          {DISPLAY_DAYS.map((weekday) => (
            <i key={weekday} className={`is-${dayState(employee.preference.days.find((day) => day.day === weekday)!)}`} />
          ))}
        </span>
      )}
      {phone && <ChevronRight size={16} aria-hidden />}
    </button>
  );

  return (
    <section className="availability-page weekly-team-page list-page" aria-labelledby="availability-title">
      <CatalogPageHeader
        eyebrow="Team availability"
        title="Availability"
        titleId="availability-title"
        description="Your team's weekly preferences. They guide the schedule; you can still schedule anyone."
      />
      <div className="weekly-team-toolbar catalog-toolbar">
        {/* A phone has no status tabs (Mert 2026-10-17); its count sits under the
            search, at the legend's right end (Mert 2026-10-20). */}
        {!phone && (
          <div className="catalog-toolbar-status-row">
            <div className="catalog-status-tabs weekly-team-filters" role="group" aria-label="Submission status">
              {STATUSES.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={submission === value ? "active" : ""}
                  aria-pressed={submission === value}
                  onClick={() => updateParams({ submission: value === "all" ? null : value })}
                >
                  {label}
                  {model && <span className="avt-count">{counts[value]}</span>}
                </button>
              ))}
            </div>
            {count}
          </div>
        )}
        <div className="catalog-toolbar-filter-row">
          <select
            className="toolbar-filter-select list-filter-narrow"
            aria-label="Location"
            value={locationId}
            onChange={(event) => updateParams({ location: event.target.value === "all" ? null : event.target.value })}
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
              onChange={(event) => updateParams({ q: event.target.value || null })}
            />
          </label>
          <ul className="avt-legend" aria-label="Legend">
            <li>
              <i className="is-free" aria-hidden />
              Available
            </li>
            <li>
              <i className="is-blocked" aria-hidden />
              Prefers not to work
            </li>
          </ul>
          {phone && count}
        </div>
      </div>
      {query.isPending && <ListOutline label="Loading availability" rows={8} columns={3} />}
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
      {model &&
        (employees.length === 0 ? (
          <div className="avt-empty catalog-table-empty">
            <span className="catalog-table-empty-icon" aria-hidden>
              <CalendarCheck size={22} />
            </span>
            <h2>No employees match this view</h2>
            <p>
              {phone
                ? "Try another location, or clear your search."
                : "Try another status or location, or clear your search."}
            </p>
          </div>
        ) : (
          <div className={`avt-split${phone ? " is-phone" : ""}`}>
            <nav className="avt-list" aria-label="Employees">
              {employees.map(personRow)}
            </nav>
            {!phone && chosen && (
              <section className="avt-detail" aria-label={`Availability of ${chosen.display_name}`}>
                <header className="avt-detail-head">
                  <span className="avt-avatar is-large" aria-hidden>
                    {initials(chosen.display_name)}
                  </span>
                  <div className="avt-detail-name">
                    <h2>{chosen.display_name}</h2>
                    <small>
                      {[chosen.job_name, chosen.submitted ? `Updated ${updatedOn(chosen.updated_at)}` : "Not submitted"]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </div>
                  {opensEmployees && chosen.can_open && (
                    <Button className="secondary-button avt-open" onClick={() => openEmployee(chosen.id)}>
                      Open profile
                      <ArrowRight size={14} aria-hidden />
                    </Button>
                  )}
                </header>
                <WeekRead
                  name={chosen.display_name}
                  submitted={chosen.submitted}
                  updatedAt={chosen.updated_at}
                  preference={chosen.preference}
                  timeFormat={model.time_format}
                />
              </section>
            )}
          </div>
        ))}
      {model && (
        <p className="avt-foot">
          <Lock size={13} aria-hidden />
          <span>Employees set their own availability. Managers can read it and keep private notes in each person's profile.</span>
        </p>
      )}

      {selectedEmployee && (
        <Suspense fallback={<p role="status">Loading employee...</p>}>
          <EmployeeDrawer
            key={workspaceId + ":" + selectedEmployee.id}
            employeeId={selectedEmployee.id}
            creating={false}
            section={parsedSection.success ? parsedSection.data : "availability"}
            onSectionChange={(section) => updateParams({ section })}
            onClose={() => updateParams({ employeeId: null, section: null })}
            onCreated={() => {}}
          />
        </Suspense>
      )}
    </section>
  );
}
