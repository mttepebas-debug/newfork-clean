import { Button } from "@newfork/ui";
import { useQuery } from "@tanstack/react-query";
import {
  Archive,
  BriefcaseBusiness,
  MapPin,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { useDeferredValue } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { EmployeeDrawer } from "./EmployeeDrawer";
import { listEmployees } from "./employee-data";
import {
  employeeSectionSchema,
  type EmployeeDisplayStatus,
} from "@newfork/shared";

const statusFilters = [
  "all",
  "invited",
  "onboarding",
  "needs_attention",
  "active",
] as const;

export default function EmployeesPage() {
  const { context } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const workspaceId = context?.workspace.id ?? "";
  const archived = location.pathname.endsWith("/archive");
  const search = params.get("q") ?? "";
  const deferredSearch = useDeferredValue(search);
  const status = archived ? "all" : (params.get("status") ?? "all");
  const employeeId = params.get("employeeId");
  const creating = params.get("mode") === "create";
  const parsedSection = employeeSectionSchema.safeParse(params.get("section"));
  const section = parsedSection.success ? parsedSection.data : "profile";
  const canManage = context?.permissions.includes("employees.manage") ?? false;

  const employees = useQuery({
    queryKey: ["employees", workspaceId, archived, deferredSearch, status],
    queryFn: () => listEmployees(workspaceId, archived, deferredSearch, status),
    enabled: Boolean(workspaceId),
  });

  const updateParams = (values: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true });
  };

  const drawerOpen = creating || Boolean(employeeId);
  return (
    <section className="employees-page" aria-labelledby="employees-title">
      <header className="employees-header">
        <div>
          <span className="eyebrow">People</span>
          <h1 id="employees-title">
            {archived ? "Archived employees" : "Employees"}
          </h1>
          <p>
            {archived
              ? "Inactive records retained for history and controlled restoration."
              : "Employee records, assignments, invitations, and onboarding status."}
          </p>
        </div>
        {!archived && canManage ? (
          <Button
            onClick={() =>
              updateParams({
                mode: "create",
                employeeId: null,
                section: "profile",
              })
            }
          >
            <Plus size={17} aria-hidden />
            Add employee
          </Button>
        ) : null}
      </header>

      <div className="employees-toolbar">
        <label className="employee-search">
          <Search size={17} aria-hidden />
          <span className="sr-only">Search employees</span>
          <input
            value={search}
            onChange={(event) =>
              updateParams({ q: event.target.value || null })
            }
            placeholder="Search name or employee code"
          />
        </label>
        <div
          className="employee-status-tabs"
          role="group"
          aria-label="Employee status"
        >
          {statusFilters.map((value) => (
            <button
              type="button"
              key={value}
              className={status === value && !archived ? "active" : ""}
              onClick={() => {
                if (archived) navigate("/app/employees");
                updateParams({ status: value === "all" ? null : value });
              }}
            >
              {filterLabel(value)}
            </button>
          ))}
          <button
            type="button"
            className={archived ? "active" : ""}
            onClick={() => navigate("/app/employees/archive")}
          >
            <Archive size={14} aria-hidden />
            Archived
          </button>
        </div>
      </div>

      <div className="employee-table-wrap">
        <table className="employee-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Status</th>
              <th>Primary location</th>
              <th>Primary job</th>
              <th>Access</th>
              <th>Start date</th>
            </tr>
          </thead>
          <tbody>
            {(employees.data ?? []).map((employee) => (
              <tr
                key={employee.id}
                onClick={() =>
                  updateParams({
                    employeeId: employee.id,
                    mode: null,
                    section: "profile",
                  })
                }
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter")
                    updateParams({
                      employeeId: employee.id,
                      mode: null,
                      section: "profile",
                    });
                }}
              >
                <td>
                  <span className="employee-table-avatar">
                    {employee.display_name.slice(0, 1).toUpperCase()}
                  </span>
                  <span>
                    <strong>{employee.display_name}</strong>
                    <small>{employee.employee_code}</small>
                  </span>
                </td>
                <td>
                  <span
                    className={`employee-state state-${employee.display_status}`}
                  >
                    {filterLabel(employee.display_status)}
                  </span>
                </td>
                <td
                  onClick={(event) => {
                    event.stopPropagation();
                    updateParams({
                      employeeId: employee.id,
                      mode: null,
                      section: "employment",
                    });
                  }}
                >
                  <MapPin size={15} aria-hidden />
                  {employee.primary_location_name ?? "Unassigned"}
                  {employee.location_count > 1 ? (
                    <small>+{employee.location_count - 1}</small>
                  ) : null}
                </td>
                <td
                  onClick={(event) => {
                    event.stopPropagation();
                    updateParams({
                      employeeId: employee.id,
                      mode: null,
                      section: "employment",
                    });
                  }}
                >
                  <BriefcaseBusiness size={15} aria-hidden />
                  {employee.primary_job_name ?? "Unassigned"}
                  {employee.job_count > 1 ? (
                    <small>+{employee.job_count - 1}</small>
                  ) : null}
                </td>
                <td>{employee.role_name ?? "No access"}</td>
                <td>
                  {employee.start_date
                    ? new Date(
                        `${employee.start_date}T12:00:00`,
                      ).toLocaleDateString()
                    : "Not set"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {employees.isLoading ? (
          <p className="employees-state">Loading employees...</p>
        ) : null}
        {employees.error ? (
          <p className="employees-state error" role="alert">
            {employees.error instanceof Error
              ? employees.error.message
              : "Employees unavailable"}
          </p>
        ) : null}
        {!employees.isLoading &&
        !employees.error &&
        employees.data?.length === 0 ? (
          <div className="employees-empty">
            <Users size={24} aria-hidden />
            <strong>
              {search
                ? "No matching employees"
                : archived
                  ? "No archived employees"
                  : "No employees yet"}
            </strong>
            <p>
              {search
                ? "Try a different name or employee code."
                : archived
                  ? "Archived records will remain available here."
                  : "Add the first employee to establish the team directory."}
            </p>
          </div>
        ) : null}
      </div>

      {drawerOpen ? (
        <EmployeeDrawer
          employeeId={employeeId}
          creating={creating}
          section={section}
          onSectionChange={(next) => updateParams({ section: next })}
          onClose={() =>
            updateParams({ employeeId: null, mode: null, section: null })
          }
          onCreated={(id) =>
            updateParams({ employeeId: id, mode: null, section: "profile" })
          }
        />
      ) : null}
    </section>
  );
}

function filterLabel(
  value: EmployeeDisplayStatus | (typeof statusFilters)[number],
): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
