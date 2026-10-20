import { useQuery } from "@tanstack/react-query";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Eye,
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
import { can } from "../auth/can";
import { CatalogPageHeader, ListAddButton } from "../views/CatalogPageHeader";
import { useListPhoneWidth } from "../lib/usePhoneWidth";
import { DEFAULT_LIST_PAGE_SIZE, ListPagination } from "../views/ListPagination";
import { CatalogSortButton } from "../views/CatalogSortButton";
import { EmployeeDrawer } from "./EmployeeDrawer";
import { listEmployees } from "./employee-data";
import { EmployeeLocationCell, EmployeeLocationChips } from "./EmployeeLocationParts";
import { ListCard, ListCards } from "../views/ListCards";
import {
  employeeSectionSchema,
  type EmployeeDisplayStatus,
  type EmployeeSummary,
} from "@newfork/shared";

import { isNoAccess } from "../lib/no-access";
import { NoAccessState } from "../shell/NoAccessState";
import { noAccessHomePath } from "../auth/resolveLanding";
import { ListOutline, LoadError, RefreshError } from "../shell/LoadState";
// The location filter's value for people who work nowhere (K6); a location's
// value is its id.
const noLocation = "none";

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
  const phone = useListPhoneWidth();
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
  const canCreate = can(context, "employee.create");
  const [columnState, setColumnState] = useState(() => loadColumnState());
  const [sort, setSort] = useState<{
    key: EmployeeColumnKey;
    descending: boolean;
  }>({ key: "employee", descending: false });
  // Client-side pages over today's list (K-S9). A new filter or sort starts at page 1.
  const listKey = [archived, status, locationFilter, deferredSearch, sort.key, sort.descending].join("|");
  const [paging, setPaging] = useState({ key: listKey, page: 1, size: DEFAULT_LIST_PAGE_SIZE as number });
  const page = paging.key === listKey ? paging.page : 1;

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

  // Every location somebody works at, a second one too (BL-436). Names seen
  // in any tab, so a chosen location stays a choice on a tab with nobody there
  // instead of falling back to "All locations" (L11).
  const seenLocations = useRef(new Map<string, string>());
  const locationOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const employee of employees.data ?? []) {
      for (const location of employee.locations) {
        seenLocations.current.set(location.id, location.name);
        options.set(location.id, location.name);
      }
    }
    const chosen = seenLocations.current.get(locationFilter);
    if (chosen) options.set(locationFilter, chosen);
    return [...options.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [employees.data, locationFilter]);
  const visibleEmployees = useMemo(
    () =>
      [...(employees.data ?? [])]
        .filter(
          (employee) =>
            locationFilter === "all" ||
            (locationFilter === noLocation
              ? employee.locations.length === 0
              : employee.locations.some((location) => location.id === locationFilter)),
        )
        .sort(
          (left, right) =>
            compareEmployeeSortValues(
              employeeSortValue(left, sort.key),
              employeeSortValue(right, sort.key),
            ) * (sort.descending ? -1 : 1),
        ),
    [employees.data, locationFilter, sort],
  );
  const lastPage = Math.max(1, Math.ceil(visibleEmployees.length / paging.size));
  const shownPage = Math.min(page, lastPage);
  const pageEmployees = visibleEmployees.slice(
    (shownPage - 1) * paging.size,
    shownPage * paging.size,
  );
  const filtered =
    Boolean(search) || locationFilter !== "all" || status !== "all";

  const drawerOpen = creating || Boolean(employeeId);
  const addButton =
    !archived && canCreate ? (
      <ListAddButton
        label="Add employee"
        shortLabel="Add"
        onClick={() =>
          setParams(
            nextParams({
              mode: "create",
              employeeId: null,
              section: "profile",
            }),
          )
        }
      />
    ) : null;
  // The API's "no" gets the one no-access card, never its raw sentence.
  if (isNoAccess(employees.error))
    return (
      <NoAccessState
        homeHref={noAccessHomePath(context, "/app/employees")}
      />
    );
  return (
    <section className="employees-page list-page" aria-labelledby="employees-title">
      <CatalogPageHeader
        eyebrow="YOUR TEAM. CONNECTED AND READY."
        title="Employees"
        titleId="employees-title"
        description="Manage employee profiles, assignments, invitations, and workspace access."
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
                aria-pressed={status === value && !archived}
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
              aria-pressed={archived}
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
            <option value={noLocation}>No location</option>
          </select>
          {/* A phone puts "+ Add" beside the location list, the search under
              both (Mert 2026-10-14). */}
          {phone ? addButton : null}
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
          {phone ? null : addButton}
        </div>
      </div>

      {employees.error && employees.data ? (
        <RefreshError
          className="employees-refresh"
          message="The employee list didn't refresh. This is the last list that loaded."
          retrying={employees.isFetching}
          onRetry={() => void employees.refetch()}
        />
      ) : null}
      <div className="employee-table-wrap employee-people-wrap">
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
                <th
                  key={column.key}
                  aria-sort={
                    sort.key === column.key
                      ? sort.descending
                        ? "descending"
                        : "ascending"
                      : "none"
                  }
                >
                  <CatalogSortButton
                    label={column.label}
                    active={sort.key === column.key}
                    onClick={() =>
                      setSort({
                        key: column.key,
                        descending:
                          sort.key === column.key ? !sort.descending : false,
                      })
                    }
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageEmployees.map((employee) => (
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
                  // Enter or Space opens the row, as on a button (E3-17).
                  if (event.target !== event.currentTarget) return;
                  if (event.key === " ") event.preventDefault();
                  if (event.key === "Enter" || event.key === " ")
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
        <EmployeeCards
          employees={pageEmployees}
          onOpen={(id) =>
            updateParams({ employeeId: id, mode: null, section: "profile" })
          }
        />
        {employees.isLoading ? (
          <ListOutline
            label="Loading employees"
            rows={8}
            columns={Math.max(2, visibleColumns.length)}
            inset
          />
        ) : null}
        {employees.error && !employees.data ? (
          <LoadError
            inset
            title="We couldn't load employees"
            detail="The employee list didn't load. Nothing was changed."
            retrying={employees.isFetching}
            onRetry={() => void employees.refetch()}
          />
        ) : null}
        {employees.data && visibleEmployees.length === 0 ? (
          // A status tab with nobody in it is a filter too (L26).
          <div className="catalog-table-empty">
            <span className="catalog-table-empty-icon" aria-hidden>
              <Users size={22} />
            </span>
            <h2>
              {filtered
                ? "No matching employees"
                : archived
                  ? "No archived employees"
                  : "No employees yet"}
            </h2>
            <p>
              {filtered
                ? "Try a different name, location, or job."
                : archived
                  ? "Archived records will remain available here."
                  : "Add the first employee to establish the team directory."}
            </p>
          </div>
        ) : null}
      </div>
      <ListPagination
        total={visibleEmployees.length}
        page={shownPage}
        pageSize={paging.size}
        onPageChange={(next) =>
          setPaging((current) => ({ ...current, key: listKey, page: next }))
        }
        onPageSizeChange={(size) => setPaging({ key: listKey, page: 1, size })}
      />

      {drawerOpen ? (
        <EmployeeDrawer
          employeeId={employeeId}
          creating={creating}
          section={section}
          onSectionChange={(next) => updateParams({ section: next })}
          onClose={() =>
            updateParams({ employeeId: null, mode: null, section: null })
          }
          onCreated={(id, section) =>
            // Invited from Access, the new record opens on Access (Tur 4 B).
            updateParams({ employeeId: id, mode: null, section: section ?? "profile" })
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
  const triggerRef = useRef<HTMLButtonElement>(null);

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
    // Escape closes it and gives focus back to the button that opened it (L7).
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", dismissOutside, true);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside, true);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div className="employee-column-picker" ref={pickerRef}>
      <button
        ref={triggerRef}
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

const employeeStatusTones: Record<EmployeeDisplayStatus, string> = {
  not_invited: "gray",
  active: "green",
  invited: "amber",
  onboarding: "amber",
  needs_attention: "red",
  archived: "gray",
};

/** "Kadikoy +1", as in the list's location column, or "No location" (K6). */
function employeeLocationText(employee: EmployeeSummary): string {
  const [first, ...others] = employee.locations;
  if (first === undefined) return "No location";
  return others.length > 0 ? `${first.name} +${others.length}` : first.name;
}

function employeeJobText(employee: EmployeeSummary): string {
  const job = employee.primary_job_name ?? "Unassigned";
  return employee.job_count > 1 ? `${job} +${employee.job_count - 1}` : job;
}

/**
 * Phone: one card per person instead of the table (G2, Mert 2026-10-07): the
 * name, under it where and what they work ("Kadikoy +1 · Cook"), the status at
 * the right. The list then scrolls only up and down (Mert 2026-10-13: "scroll
 * aynı anda birden fazla yöne gidemesin"). list-cards.css shows it on a phone only.
 */
function EmployeeCards({
  employees,
  onOpen,
}: {
  readonly employees: readonly EmployeeSummary[];
  readonly onOpen: (id: string) => void;
}) {
  if (employees.length === 0) return null;
  return (
    <ListCards label="Employees">
      {employees.map((employee) => {
        const status = filterLabel(employee.display_status);
        const where = employeeLocationText(employee);
        const job = employeeJobText(employee);
        return (
          <ListCard
            key={employee.id}
            label={`${employee.display_name}, ${status}, ${where}, ${job}`}
            mark={employee.display_name.slice(0, 1).toUpperCase()}
            title={<span>{employee.display_name}</span>}
            status={
              <span
                className="list-chip"
                data-tone={employeeStatusTones[employee.display_status]}
              >
                {status}
              </span>
            }
            lines={[`${where} · ${job}`]}
            onOpen={() => onOpen(employee.id)}
          />
        );
      })}
    </ListCards>
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
            <EmployeeLocationChips employee={employee} />
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
        <EmployeeLocationCell employee={employee} />
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
    return <td key={key}>{accessLabel(employee)}</td>;
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

/**
 * The app a person reaches (KARARLAR S-179); their rank stays in the drawer.
 * The column sorts by these words, A to Z.
 */
function accessLabel(employee: EmployeeSummary): string {
  if (employee.management_access && employee.employee_access) return "Management + Employee";
  if (employee.management_access) return "Management";
  if (employee.employee_access) return "Employee";
  return "No access";
}

function employeeSortValue(
  employee: EmployeeSummary,
  key: EmployeeColumnKey,
): string {
  if (key === "status") return filterLabel(employee.display_status);
  if (key === "location") return employee.locations[0]?.name ?? "Unassigned";
  if (key === "job") return employee.primary_job_name ?? "Unassigned";
  if (key === "access") return accessLabel(employee);
  if (key === "start") return employee.start_date ?? "";
  if (key === "email") return employee.invitation_email ?? "";
  return employee.display_name;
}

function compareEmployeeSortValues(left: string, right: string): number {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  });
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
