import { Button } from "@newfork/ui";
import { useQuery } from "@tanstack/react-query";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Eye,
  MapPin,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Users,
} from "lucide-react";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { CatalogPageHeader } from "../views/CatalogPageHeader";
import { EmployeeDrawer } from "./EmployeeDrawer";
import { listEmployees } from "./employee-data";
import {
  employeeSectionSchema,
  type EmployeeDisplayStatus,
  type EmployeeSummary,
} from "@newfork/shared";

const statusFilters = [
  "all",
  "invited",
  "onboarding",
  "needs_attention",
  "active",
] as const;

type EmployeeColumnKey =
  "employee" | "status" | "location" | "job" | "access" | "start" | "email";

interface EmployeeColumn {
  readonly key: EmployeeColumnKey;
  readonly label: string;
  readonly defaultVisible: boolean;
  readonly required?: boolean;
}

const employeeColumns: readonly EmployeeColumn[] = [
  { key: "employee", label: "Employee", defaultVisible: true, required: true },
  { key: "status", label: "Status", defaultVisible: true },
  { key: "location", label: "Primary location", defaultVisible: true },
  { key: "job", label: "Primary job", defaultVisible: true },
  { key: "access", label: "Access", defaultVisible: true },
  { key: "start", label: "Start date", defaultVisible: true },
  { key: "email", label: "Invite email", defaultVisible: false },
] as const;

const defaultColumnOrder = employeeColumns.map((column) => column.key);
const defaultVisibleColumns = employeeColumns
  .filter((column) => column.defaultVisible)
  .map((column) => column.key);
const employeeColumnStorageKey = "newfork.employee-table.columns";

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
  const locationFilter = params.get("location") ?? "all";
  const employeeId = params.get("employeeId");
  const creating = params.get("mode") === "create";
  const parsedSection = employeeSectionSchema.safeParse(params.get("section"));
  const section = parsedSection.success ? parsedSection.data : "profile";
  const canManage = context?.permissions.includes("employees.manage") ?? false;
  const [columnState, setColumnState] = useState(() => loadColumnState());

  const employees = useQuery({
    queryKey: ["employees", workspaceId, archived, deferredSearch, status],
    queryFn: () => listEmployees(workspaceId, archived, deferredSearch, status),
    enabled: Boolean(workspaceId),
  });

  const nextParams = (values: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    return next;
  };

  const updateParams = (values: Record<string, string | null>) => {
    setParams(nextParams(values), { replace: true });
  };

  const navigateEmployeeRoute = (
    pathname: "/app/employees" | "/app/employees/archive",
    values: Record<string, string | null>,
  ) => {
    const next = nextParams(values);
    const queryString = next.toString();
    navigate(
      {
        pathname,
        search: queryString ? `?${queryString}` : "",
      },
      { replace: true },
    );
  };

  useEffect(() => {
    try {
      window.localStorage.setItem(
        employeeColumnStorageKey,
        JSON.stringify(columnState),
      );
    } catch {
      // Column preferences are cosmetic; ignore storage failures.
    }
  }, [columnState]);

  const columnsByKey = useMemo(
    () => new Map(employeeColumns.map((column) => [column.key, column])),
    [],
  );
  const visibleKeySet = useMemo(
    () => new Set(columnState.visible),
    [columnState.visible],
  );
  const visibleColumns = useMemo(
    () =>
      columnState.order
        .map((key) => columnsByKey.get(key))
        .filter((column): column is EmployeeColumn => {
          if (!column) return false;
          return visibleKeySet.has(column.key);
        }),
    [columnState.order, columnsByKey, visibleKeySet],
  );
  const toggleColumn = (key: EmployeeColumnKey) => {
    const column = columnsByKey.get(key);
    if (!column || column.required) return;
    setColumnState((current) => {
      const nextVisible = new Set(current.visible);
      if (nextVisible.has(key)) nextVisible.delete(key);
      else nextVisible.add(key);
      return { ...current, visible: [...nextVisible] };
    });
  };
  const moveColumn = (key: EmployeeColumnKey, direction: -1 | 1) => {
    setColumnState((current) => {
      const visibleOrder = current.order.filter((item) =>
        current.visible.includes(item),
      );
      const currentVisibleIndex = visibleOrder.indexOf(key);
      const nextVisibleIndex = currentVisibleIndex + direction;
      if (currentVisibleIndex < 0 || nextVisibleIndex < 0) return current;
      if (nextVisibleIndex >= visibleOrder.length) return current;

      const nextOrder = [...current.order];
      const currentIndex = nextOrder.indexOf(
        visibleOrder[currentVisibleIndex]!,
      );
      const swapIndex = nextOrder.indexOf(visibleOrder[nextVisibleIndex]!);
      [nextOrder[currentIndex], nextOrder[swapIndex]] = [
        nextOrder[swapIndex]!,
        nextOrder[currentIndex]!,
      ];
      return { ...current, order: nextOrder };
    });
  };
  const showAllColumns = () =>
    setColumnState((current) => ({
      ...current,
      visible: [...defaultColumnOrder],
    }));
  const resetColumns = () =>
    setColumnState({
      order: [...defaultColumnOrder],
      visible: [...defaultVisibleColumns],
    });

  const locationOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const employee of employees.data ?? []) {
      if (employee.primary_location_id && employee.primary_location_name) {
        options.set(
          employee.primary_location_id,
          employee.primary_location_name,
        );
      }
    }
    return [...options.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [employees.data]);
  const visibleEmployees = useMemo(
    () =>
      (employees.data ?? []).filter(
        (employee) =>
          locationFilter === "all" ||
          employee.primary_location_id === locationFilter,
      ),
    [employees.data, locationFilter],
  );

  const drawerOpen = creating || Boolean(employeeId);
  return (
    <section className="employees-page" aria-labelledby="employees-title">
      <CatalogPageHeader
        eyebrow="YOUR TEAM. CONNECTED AND READY."
        title="Employees"
        titleId="employees-title"
        description="Manage employee profiles, assignments, invitations, and workspace access."
        action={
          !archived && canManage ? (
            <Button
              onClick={() =>
                setParams(
                  nextParams({
                    mode: "create",
                    employeeId: null,
                    section: "profile",
                  }),
                )
              }
            >
              <Plus size={17} aria-hidden />
              Add employee
            </Button>
          ) : null
        }
      />

      <div className="employees-toolbar catalog-toolbar">
        <div className="employee-toolbar-controls catalog-toolbar-status-row">
          <div
            className="catalog-status-tabs"
            role="group"
            aria-label="Employee status"
          >
            {statusFilters.map((value) => (
              <button
                type="button"
                key={value}
                className={status === value && !archived ? "active" : ""}
                onClick={() => {
                  const nextStatus = value === "all" ? null : value;
                  if (archived) {
                    navigateEmployeeRoute("/app/employees", {
                      status: nextStatus,
                      employeeId: null,
                      mode: null,
                      section: null,
                    });
                    return;
                  }
                  updateParams({ status: nextStatus });
                }}
              >
                {filterLabel(value)}
              </button>
            ))}
            <button
              type="button"
              className={archived ? "active" : ""}
              onClick={() =>
                navigateEmployeeRoute("/app/employees/archive", {
                  status: null,
                  employeeId: null,
                  mode: null,
                  section: null,
                })
              }
            >
              <Archive size={14} aria-hidden />
              Archived
            </button>
          </div>
          <EmployeeColumnPicker
            columns={employeeColumns}
            visibleKeySet={visibleKeySet}
            visibleOrder={visibleColumns.map((column) => column.key)}
            onToggleColumn={toggleColumn}
            onMoveColumn={moveColumn}
            onResetColumns={resetColumns}
            onShowAllColumns={showAllColumns}
          />
        </div>
        <div className="catalog-toolbar-filter-row">
          <select
            className="toolbar-filter-select"
            value={locationFilter}
            aria-label="Filter employees by location"
            onChange={(event) =>
              updateParams({
                location:
                  event.target.value === "all" ? null : event.target.value,
                employeeId: null,
                mode: null,
                section: null,
              })
            }
          >
            <option value="all">All locations</option>
            {locationOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
          <label className="employee-search toolbar-search">
            <Search size={17} aria-hidden />
            <span className="sr-only">Search employees</span>
            <input
              value={search}
              onChange={(event) =>
                updateParams({ q: event.target.value || null })
              }
              placeholder="Search name, location, or job"
            />
          </label>
        </div>
      </div>

      <div className="employee-table-wrap">
        <table className="employee-table">
          <colgroup>
            {visibleColumns.map((column) => (
              <col
                key={column.key}
                style={{ width: columnWidth(column.key) }}
              />
            ))}
          </colgroup>
          <thead>
            <tr>
              {visibleColumns.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleEmployees.map((employee) => (
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
                {visibleColumns.map((column) =>
                  renderEmployeeCell(employee, column.key, updateParams),
                )}
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
        visibleEmployees.length === 0 ? (
          <div className="employees-empty">
            <Users size={24} aria-hidden />
            <strong>
              {search || locationFilter !== "all"
                ? "No matching employees"
                : archived
                  ? "No archived employees"
                  : "No employees yet"}
            </strong>
            <p>
              {search || locationFilter !== "all"
                ? "Try a different name, location, or job."
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

function EmployeeColumnPicker({
  columns,
  visibleKeySet,
  visibleOrder,
  onToggleColumn,
  onMoveColumn,
  onResetColumns,
  onShowAllColumns,
}: {
  readonly columns: readonly EmployeeColumn[];
  readonly visibleKeySet: Set<EmployeeColumnKey>;
  readonly visibleOrder: readonly EmployeeColumnKey[];
  readonly onToggleColumn: (key: EmployeeColumnKey) => void;
  readonly onMoveColumn: (key: EmployeeColumnKey, direction: -1 | 1) => void;
  readonly onResetColumns: () => void;
  readonly onShowAllColumns: () => void;
}) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !pickerRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", dismissOutside, true);
    return () =>
      document.removeEventListener("pointerdown", dismissOutside, true);
  }, [open]);

  return (
    <div className="employee-column-picker" ref={pickerRef}>
      <button
        type="button"
        className="secondary-button compact employee-column-trigger"
        aria-label="Table column settings"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        <Settings2 size={16} aria-hidden />
      </button>
      {open ? (
        <div
          className="employee-column-popover"
          role="dialog"
          aria-label="Employee table columns"
        >
          <header>
            <strong>Columns</strong>
            <span>
              {visibleOrder.length} of {columns.length} visible
            </span>
          </header>
          <div className="employee-column-list">
            {columns.map((column) => {
              const visibleIndex = visibleOrder.indexOf(column.key);
              const isVisible = visibleKeySet.has(column.key);
              return (
                <div key={column.key} className="employee-column-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={isVisible}
                      disabled={column.required}
                      onChange={() => onToggleColumn(column.key)}
                    />
                    {column.label}
                  </label>
                  {isVisible ? (
                    <span className="employee-column-move">
                      <button
                        type="button"
                        aria-label={`Move ${column.label} left`}
                        disabled={visibleIndex <= 0}
                        onClick={() => onMoveColumn(column.key, -1)}
                      >
                        <ArrowLeft size={13} aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${column.label} right`}
                        disabled={
                          visibleIndex < 0 ||
                          visibleIndex >= visibleOrder.length - 1
                        }
                        onClick={() => onMoveColumn(column.key, 1)}
                      >
                        <ArrowRight size={13} aria-hidden />
                      </button>
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
          <footer>
            <button type="button" onClick={onShowAllColumns}>
              <Eye size={14} aria-hidden />
              Show all
            </button>
            <button type="button" onClick={onResetColumns}>
              <RotateCcw size={14} aria-hidden />
              Reset
            </button>
          </footer>
        </div>
      ) : null}
    </div>
  );
}

function renderEmployeeCell(
  employee: EmployeeSummary,
  key: EmployeeColumnKey,
  updateParams: (values: Record<string, string | null>) => void,
): ReactNode {
  if (key === "employee") {
    return (
      <td key={key}>
        <span className="employee-cell-identity">
          <span className="employee-table-avatar">
            {employee.display_name.slice(0, 1).toUpperCase()}
          </span>
          <span>
            <strong>{employee.display_name}</strong>
            <small>{employee.employee_code}</small>
          </span>
        </span>
      </td>
    );
  }
  if (key === "status") {
    return (
      <td key={key}>
        <span className={`employee-state state-${employee.display_status}`}>
          {filterLabel(employee.display_status)}
        </span>
      </td>
    );
  }
  if (key === "location") {
    return (
      <td
        key={key}
        onClick={(event) => {
          event.stopPropagation();
          updateParams({
            employeeId: employee.id,
            mode: null,
            section: "employment",
          });
        }}
      >
        <span className="employee-cell-with-icon">
          <MapPin size={15} aria-hidden />
          {employee.primary_location_name ?? "Unassigned"}
          {employee.location_count > 1 ? (
            <small>+{employee.location_count - 1}</small>
          ) : null}
        </span>
      </td>
    );
  }
  if (key === "job") {
    return (
      <td
        key={key}
        onClick={(event) => {
          event.stopPropagation();
          updateParams({
            employeeId: employee.id,
            mode: null,
            section: "employment",
          });
        }}
      >
        <span className="employee-cell-with-icon">
          <BriefcaseBusiness size={15} aria-hidden />
          {employee.primary_job_name ?? "Unassigned"}
          {employee.job_count > 1 ? (
            <small>+{employee.job_count - 1}</small>
          ) : null}
        </span>
      </td>
    );
  }
  if (key === "access") {
    return <td key={key}>{employee.role_name ?? "No app access"}</td>;
  }
  if (key === "email") {
    return <td key={key}>{employee.invitation_email ?? "No invite email"}</td>;
  }
  return (
    <td key={key}>
      {employee.start_date
        ? new Date(`${employee.start_date}T12:00:00`).toLocaleDateString()
        : "Not set"}
    </td>
  );
}

function columnWidth(key: EmployeeColumnKey): string {
  switch (key) {
    case "employee":
      return "24%";
    case "status":
      return "13%";
    case "location":
    case "job":
      return "17%";
    case "access":
      return "15%";
    case "email":
      return "20%";
    case "start":
      return "14%";
  }
}

function loadColumnState(): {
  readonly order: EmployeeColumnKey[];
  readonly visible: EmployeeColumnKey[];
} {
  try {
    const raw = window.localStorage.getItem(employeeColumnStorageKey);
    const parsed = raw ? JSON.parse(raw) : null;
    if (
      !parsed ||
      !Array.isArray(parsed.order) ||
      !Array.isArray(parsed.visible)
    ) {
      throw new Error("Missing employee table column preference");
    }
    const validKeys = new Set(defaultColumnOrder);
    const order = parsed.order.filter((key: string): key is EmployeeColumnKey =>
      validKeys.has(key as EmployeeColumnKey),
    );
    const visible = parsed.visible.filter(
      (key: string): key is EmployeeColumnKey =>
        validKeys.has(key as EmployeeColumnKey),
    );
    if (!visible.includes("employee")) visible.unshift("employee");
    for (const key of defaultColumnOrder) {
      if (!order.includes(key)) order.push(key);
    }
    return { order, visible: [...new Set<EmployeeColumnKey>(visible)] };
  } catch {
    return {
      order: [...defaultColumnOrder],
      visible: [...defaultVisibleColumns],
    };
  }
}

function filterLabel(
  value: EmployeeDisplayStatus | (typeof statusFilters)[number],
): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
