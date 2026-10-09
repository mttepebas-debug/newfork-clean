import { useDeferredValue, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import {
  BriefcaseBusiness,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Folder,
  Plus,
  Search,
  Users,
  X,
} from "lucide-react";
import type { Department, Job } from "@newfork/shared";
import { useAuth } from "../auth/AuthContext";
import { errorText, SettingsHeader } from "./GeneralSettingsPage";
import {
  loadDepartmentsAndJobs,
  setDepartmentArchived,
  setJobArchived,
} from "./organization-data";
import { loadJobCounts } from "./jobs-management-data";
import { JobCatalogEditor, type CatalogEditor } from "./JobCatalogEditor";
import { JobAssignmentsDrawer } from "./JobAssignmentsDrawer";
import "./jobs-settings.css";
import { CatalogRowMenu as RowMenu } from "./CatalogRowMenu";

import { isNoAccess } from "../lib/no-access";
import { NoAccessState } from "../shell/NoAccessState";
import { noAccessHomePath } from "../auth/resolveLanding";
type View = "hierarchy" | "departments" | "jobs";
type SortKey = "name" | "department" | "jobs" | "employees";
/** "1 job", "2 jobs". */
function countLabel(count: number, one: string): string {
  return `${count} ${count === 1 ? one : `${one}s`}`;
}

export default function JobsSettingsPage() {
  const { context } = useAuth();
  const canEdit =
    context?.permissions.includes("settings.jobs.manage") ?? false;
  const workspaceId = context?.workspace.id ?? "";
  const readEmployees = Boolean(
    context?.permissions.includes("employees.read"),
  );
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const view: View =
    params.get("view") === "jobs"
      ? "jobs"
      : params.get("view") === "departments"
        ? "departments"
        : "hierarchy";
  const search = params.get("q") ?? "";
  const match = useDeferredValue(search.trim().toLowerCase());
  const archived = params.get("archived") === "1";
  const requestedSort = params.get("sort");
  const sortKey: SortKey | null =
    view !== "hierarchy" &&
    (requestedSort === "name" ||
      requestedSort === "employees" ||
      (view === "jobs" && requestedSort === "department") ||
      (view === "departments" && requestedSort === "jobs"))
      ? requestedSort
      : null;
  const sortDescending = params.get("direction") === "desc";
  const [editor, setEditor] = useState<CatalogEditor | null>(null);
  const [transientJob, setTransientJob] = useState<Job | null>(null);
  useEffect(() => {
    setEditor(null);
  }, [view]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [formError, setFormError] = useState<string | null>(null);
  const queryKey = ["organization-jobs", workspaceId];
  const data = useQuery({
    queryKey,
    enabled: Boolean(workspaceId),
    queryFn: () => loadDepartmentsAndJobs(workspaceId),
  });
  const counts = useQuery({
    queryKey: ["organization-job-counts", workspaceId],
    enabled: Boolean(workspaceId && readEmployees),
    queryFn: () => loadJobCounts(workspaceId),
  });
  const departments = data.data?.departments ?? [];
  const jobs = data.data?.jobs ?? [];
  const departmentMap = new Map(departments.map((item) => [item.id, item]));
  const jobCounts = new Map(
    counts.data?.jobs.map((item) => [item.id, item.employee_count]),
  );
  const departmentCounts = new Map(
    counts.data?.departments.map((item) => [item.id, item.employee_count]),
  );
  const activeJobs = jobs.filter((item) => !item.archived_at);
  const selectedJob =
    jobs.find((item) => item.id === params.get("jobId")) ??
    (transientJob?.id === params.get("jobId") ? transientJob : undefined);
  function updateParams(
    changes: Record<string, string | null>,
    replace = false,
  ) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        Object.entries(changes).forEach(([key, value]) =>
          value === null ? next.delete(key) : next.set(key, value),
        );
        return next;
      },
      { replace, preventScrollReset: true },
    );
  }
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({
        queryKey: ["organization-job-counts", workspaceId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["employee-reference-data", workspaceId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["schedule-read", workspaceId],
      }),
    ]);
  };
  const mutation = useMutation({
    mutationFn: async (
      action: {
        kind: "archive";
        type: "departments" | "jobs";
        item: Department | Job;
      },
    ) => {
      if (!canEdit) throw new Error("Jobs edit access required");
      if (action.type === "departments")
        await setDepartmentArchived(
          workspaceId,
          action.item.id,
          !action.item.archived_at,
        );
      else
        await setJobArchived(
          workspaceId,
          action.item.id,
          !action.item.archived_at,
        );
    },
    onSuccess: async () => {
      setFormError(null);
      await refresh();
    },
    onError: (cause) => setFormError(errorText(cause)),
  });
  function openEditor(next: CatalogEditor) {
    setFormError(null);
    if (next.type === "jobs" && next.item) {
      openJob(next.item as Job);
      return;
    }
    updateParams({ jobId: null }, true);
    setTransientJob(null);
    setEditor(next);
  }
  function openJob(job: Job) {
    setEditor(null);
    updateParams({ jobId: job.id });
  }
  function countText(value: number | undefined) {
    return !readEmployees || counts.isError
      ? "—"
      : counts.isPending
        ? "…"
        : (value ?? 0);
  }
  // Departments and jobs come A to Z from the server; nothing moves them by
  // hand (BL-475).
  function menu(item: Job | Department, type: "departments" | "jobs") {
    const jobCount = jobs.filter(
      (job) => job.department_id === item.id && !job.archived_at,
    ).length;
    return (
      <RowMenu name={item.name}>
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => openEditor({ type, item })}
        >
          Edit {type === "jobs" ? "job" : "department"}
        </button>
        {type === "jobs" && readEmployees && (
          <button type="button" onClick={() => openJob(item as Job)}>
            Manage employees
          </button>
        )}
        <button
          type="button"
          className={!item.archived_at ? "job-danger-text" : undefined}
          disabled={
            mutation.isPending ||
            (type === "departments" && !item.archived_at && jobCount > 0)
          }
          title={
            type === "departments" && jobCount > 0
              ? "Archive active jobs first"
              : undefined
          }
          onClick={() => mutation.mutate({ kind: "archive", type, item })}
        >
          {item.archived_at ? "Restore" : "Archive"}
        </button>
      </RowMenu>
    );
  }
  function jobRow(job: Job, nested = false) {
    return (
      <div
        className={`job-catalog-row${nested ? " job-nested-row" : ""}`}
        key={job.id}
        data-archived={Boolean(job.archived_at)}
        onClick={(event) => {
          if (
            (event.target as HTMLElement).closest("button, a, summary, details")
          )
            return;
          event.currentTarget
            .querySelector<HTMLButtonElement>(".job-row-identity")
            ?.focus({ preventScroll: true });
          openJob(job);
        }}
      >
        <button
          className="job-row-identity"
          type="button"
          onClick={() => openJob(job)}
        >
          <span
            className="job-color-dot"
            style={{ backgroundColor: job.color }}
          />
          <span className="job-name-stack">
            <span className="job-row-name" title={job.name}>
              {job.name}
            </span>
            {!nested && (
              <span className="job-mobile-meta">
                {departmentMap.get(job.department_id ?? "")?.name ??
                  "No department"}
              </span>
            )}
          </span>
          {job.archived_at && (
            <span className="job-archived-label">Archived</span>
          )}
        </button>
        {!nested && (
          <span
            className="job-department-cell"
            title={departmentMap.get(job.department_id ?? "")?.name}
          >
            {departmentMap.get(job.department_id ?? "")?.name ??
              "No department"}
          </span>
        )}
        <button
          className="job-count-button"
          type="button"
          disabled={!readEmployees}
          onClick={() => openJob(job)}
          aria-label={`Manage employees for ${job.name}`}
        >
          <Users size={14} />
          {countText(jobCounts.get(job.id))}
        </button>
        {menu(job, "jobs")}
      </div>
    );
  }
  function sortCatalog<T extends Job | Department>(items: T[]): T[] {
    if (!sortKey) return items;
    const value = (item: T): string | number => {
      if (sortKey === "employees")
        return (
          ("department_id" in item ? jobCounts : departmentCounts).get(
            item.id,
          ) ?? 0
        );
      if (sortKey === "jobs")
        return activeJobs.filter((job) => job.department_id === item.id).length;
      if (sortKey === "department")
        return (
          departmentMap.get((item as Job).department_id ?? "")?.name ??
          "No department"
        );
      return item.name;
    };
    return [...items].sort((a, b) => {
      const av = value(a),
        bv = value(b);
      const order =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv), undefined, {
              numeric: true,
              sensitivity: "base",
            });
      return (
        (sortDescending ? -order : order) ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id)
      );
    });
  }
  function column(key: SortKey, label: string) {
    const active = sortKey === key;
    const Icon = active ? (sortDescending ? ArrowDown : ArrowUp) : ArrowUpDown;
    return (
      <button
        type="button"
        className="job-sort-button"
        aria-label={`Sort by ${label}`}
        aria-pressed={active}
        title={
          active
            ? `Sorted ${sortDescending ? "descending" : "ascending"}. Click to reverse.`
            : "Sort ascending"
        }
        disabled={key === "employees" && (!readEmployees || !counts.data)}
        onClick={() =>
          updateParams({
            sort: key,
            direction: active && !sortDescending ? "desc" : "asc",
          })
        }
      >
        {label}
        <Icon size={12} aria-hidden />
      </button>
    );
  }
  const resetSort = sortKey ? (
    <button
      type="button"
      className="job-icon-button"
      aria-label="Clear column sorting"
      title="Restore manual order"
      onClick={() => updateParams({ sort: null, direction: null })}
    >
      <X size={13} />
    </button>
  ) : (
    <span />
  );
  const visibleJobs = sortCatalog(
    jobs.filter(
      (job) =>
        (archived || !job.archived_at) &&
        (!match ||
          job.name.toLowerCase().includes(match) ||
          departmentMap
            .get(job.department_id ?? "")
            ?.name.toLowerCase()
            .includes(match)),
    ),
  );
  const visibleDepartments = sortCatalog(
    departments.filter(
      (dep) =>
        (archived || !dep.archived_at) &&
        (!match ||
          dep.name.toLowerCase().includes(match) ||
          visibleJobs.some((job) => job.department_id === dep.id)),
    ),
  );
  const groups: { id: string; department?: Department; rows: Job[] }[] =
    departments
      .map((department) => ({
        id: department.id,
        department,
        rows: visibleJobs.filter((job) => job.department_id === department.id),
      }))
      .filter(
        (group) =>
          group.rows.length > 0 ||
          visibleDepartments.some((dep) => dep.id === group.id),
      );
  const ungrouped = visibleJobs.filter(
    (job) => !job.department_id || !departmentMap.has(job.department_id),
  );
  // The API's "no" gets the one no-access card, never its raw sentence.
  if (isNoAccess(data.error))
    return (
      <NoAccessState
        subject="positions"
        homeHref={noAccessHomePath(context, "/app/settings/jobs")}
      />
    );
  if (ungrouped.length) groups.push({ id: "none", rows: ungrouped });
  const noRows =
    view === "jobs"
      ? visibleJobs.length === 0
      : view === "departments"
        ? visibleDepartments.length === 0
        : groups.length === 0;
  return (
    <section
      className="settings-page jobs-settings-page"
      aria-labelledby="jobs-&-departments-settings-title"
    >
      <SettingsHeader
        icon={<BriefcaseBusiness size={21} />}
        title="Jobs & departments"
        description="Organize your jobs. Connect the right people to each one."
        action={
          <div className="job-create-actions">
            {view === "hierarchy" ? (
              <RowMenu name="Create" create>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => openEditor({ type: "departments" })}
                >
                  <Folder size={15} />
                  Department
                </button>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => openEditor({ type: "jobs" })}
                >
                  <BriefcaseBusiness size={15} />
                  Job
                </button>
              </RowMenu>
            ) : (
              <button
                className="job-primary-button"
                type="button"
                disabled={!canEdit}
                onClick={() =>
                  openEditor({ type: view === "jobs" ? "jobs" : "departments" })
                }
              >
                <Plus size={16} />
                Add {view === "jobs" ? "job" : "department"}
              </button>
            )}
          </div>
        }
      />
      <div className="job-catalog-toolbar">
        <div
          className="job-view-control"
          role="tablist"
          aria-label="Jobs settings view"
        >
          {(
            [
              ["hierarchy", "All"],
              ["departments", "Departments"],
              ["jobs", "Jobs"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={view === value}
              onClick={() => {
                setEditor(null);
                updateParams({ view: value });
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="job-search">
          <Search size={16} />
          <input
            aria-label="Search jobs and departments"
            placeholder="Search jobs or departments"
            value={search}
            onChange={(event) =>
              updateParams({ q: event.target.value || null }, true)
            }
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => updateParams({ q: null }, true)}
            >
              <X size={14} />
            </button>
          )}
        </label>
        <label className="job-archive-filter">
          <input
            type="checkbox"
            checked={archived}
            onChange={(event) =>
              updateParams({ archived: event.target.checked ? "1" : null })
            }
          />
          Show archived
        </label>
      </div>
      {editor?.type === "jobs" && !editor.item && !editor.departmentId ? (
        <JobAssignmentsDrawer
          key="new-job"
          workspaceId={workspaceId}
          initialJob={{ name: "", color: "#4478A8", department_id: null }}
          departments={departments}
          onClose={() => setEditor(null)}
          onCreatedJob={(job) => {
            setTransientJob(job);
            setEditor(null);
            openJob(job);
          }}
        />
      ) : editor ? (
        <JobCatalogEditor
          key={`${editor.type}:${editor.item?.id ?? "new"}:${editor.departmentId ?? ""}`}
          editor={editor}
          workspaceId={workspaceId}
          departments={departments}
          jobs={jobs}
          onClose={() => setEditor(null)}
          onSaved={refresh}
          onCreatedJob={(job) => {
            setTransientJob(job);
            setEditor(null);
            openJob(job);
          }}
        />
      ) : null}
      {formError && (
        <p className="job-error" role="alert">
          {formError}
        </p>
      )}
      {counts.isError && (
        <p className="job-error" role="alert">
          Employee counts could not load.{" "}
          <button type="button" onClick={() => void counts.refetch()}>
            Retry
          </button>
        </p>
      )}
      {data.isPending ? (
        <div className="job-empty-state" role="status">
          Loading your team structure…
        </div>
      ) : data.isError ? (
        <div className="job-error" role="alert">
          {errorText(data.error)}{" "}
          <button type="button" onClick={() => void data.refetch()}>
            Try again
          </button>
        </div>
      ) : noRows ? (
        <div className="job-empty-state">
          <BriefcaseBusiness size={26} />
          <h2>{match ? "No matches found" : "Build your team structure"}</h2>
          <p>
            {match
              ? "Try another name or clear your search."
              : "Start with a department, then add the jobs your team does."}
          </p>
        </div>
      ) : (
        <div className="job-catalog">
          {view === "hierarchy" ? (
            <>
              <div className="job-catalog-caption">
                <span>
                  {countLabel(groups.length, "group")} ·{" "}
                  {countLabel(visibleJobs.length, "job")}
                </span>
                <button
                  className="job-text-button"
                  type="button"
                  onClick={() =>
                    setCollapsed((current) =>
                      current.size
                        ? new Set()
                        : new Set(groups.map((group) => group.id)),
                    )
                  }
                >
                  {collapsed.size ? "Expand all" : "Collapse all"}
                </button>
              </div>
              {groups.map((group) => {
                const dep = group.department;
                const open =
                  Boolean(match || sortKey) || !collapsed.has(group.id);
                return (
                  <section
                    className="job-group"
                    key={group.id}
                    aria-label={dep?.name ?? "No department"}
                  >
                    <div className="job-group-heading">
                      <button
                        type="button"
                        className="job-group-toggle"
                        aria-expanded={open}
                        onClick={() =>
                          setCollapsed((current) => {
                            const next = new Set(current);
                            if (next.has(group.id)) next.delete(group.id);
                            else next.add(group.id);
                            return next;
                          })
                        }
                      >
                        {open ? (
                          <ChevronDown size={16} />
                        ) : (
                          <ChevronRight size={16} />
                        )}
                        <Folder size={16} style={{ color: dep?.color }} />
                        <span className="job-row-name" title={dep?.name}>
                          {dep?.name ?? "No department"}
                        </span>
                        {dep?.archived_at && (
                          <span className="job-archived-label">Archived</span>
                        )}
                        <span className="job-group-count">
                          {countLabel(
                            jobs.filter(
                              (job) =>
                                (dep
                                  ? job.department_id === dep.id
                                  : !job.department_id) && !job.archived_at,
                            ).length,
                            "job",
                          )}
                        </span>
                      </button>
                      {dep && (
                        <span className="job-group-people">
                          <Users size={14} />
                          {countText(departmentCounts.get(dep.id))}
                        </span>
                      )}
                      {!dep?.archived_at && (
                        <button
                          type="button"
                          className="job-text-button job-group-add"
                          aria-label={`Add job to ${dep?.name ?? "No department"}`}
                          onClick={() =>
                            openEditor({
                              type: "jobs",
                              ...(dep ? { departmentId: dep.id } : {}),
                            })
                          }
                        >
                          <Plus size={14} />
                          <span>Add job</span>
                        </button>
                      )}
                      {dep && menu(dep, "departments")}
                    </div>
                    {open && (
                      <div>
                        {group.rows.map((job) => jobRow(job, true))}
                        {!group.rows.length && (
                          <p className="job-group-empty">
                            No jobs in this department yet.
                          </p>
                        )}
                      </div>
                    )}
                  </section>
                );
              })}
            </>
          ) : view === "jobs" ? (
            <>
              <div className="job-column-headings">
                {column("name", "Job")}
                {column("department", "Department")}
                {column("employees", "Employees")}
                {resetSort}
              </div>
              {visibleJobs.map((job) => jobRow(job))}
            </>
          ) : (
            <>
              <div className="job-column-headings job-department-columns">
                {column("name", "Department")}
                {column("jobs", "Jobs")}
                {column("employees", "Employees")}
                {resetSort}
              </div>
              {visibleDepartments.map((dep) => (
                <div
                  className="job-catalog-row job-department-columns"
                  key={dep.id}
                  data-archived={Boolean(dep.archived_at)}
                >
                  <button
                    type="button"
                    className="job-row-identity"
                    onClick={() =>
                      openEditor({ type: "departments", item: dep })
                    }
                  >
                    <span
                      className="job-color-dot"
                      style={{ backgroundColor: dep.color }}
                    />
                    <span className="job-row-name" title={dep.name}>
                      {dep.name}
                    </span>
                    {dep.archived_at && (
                      <span className="job-archived-label">Archived</span>
                    )}
                  </button>
                  <button
                    className="job-text-button"
                    type="button"
                    aria-label={`Show jobs in ${dep.name}`}
                    onClick={() => {
                      setCollapsed((current) => {
                        const next = new Set(current);
                        next.delete(dep.id);
                        return next;
                      });
                      updateParams({ view: "hierarchy", q: dep.name });
                    }}
                  >
                    {(() => {
                      const count = activeJobs.filter(
                        (job) => job.department_id === dep.id,
                      ).length;
                      return (
                        <>
                          {count}
                          <span className="job-mobile-meta">
                            {count === 1 ? " job" : " jobs"}
                          </span>
                        </>
                      );
                    })()}
                  </button>
                  <span className="job-count-button">
                    <Users size={14} />
                    {countText(departmentCounts.get(dep.id))}
                  </span>
                  {menu(dep, "departments")}
                </div>
              ))}
            </>
          )}
        </div>
      )}
      {params.get("jobId") && data.isSuccess && !selectedJob && (
        <p className="job-error" role="alert">
          This job is no longer available.{" "}
          <button type="button" onClick={() => updateParams({ jobId: null })}>
            Dismiss
          </button>
        </p>
      )}
      {selectedJob && !editor && (
        <JobAssignmentsDrawer
          key={`${workspaceId}:${selectedJob.id}`}
          workspaceId={workspaceId}
          job={selectedJob}
          departments={departments}
          onClose={() => {
            setTransientJob(null);
            updateParams({ jobId: null });
          }}
        />
      )}
    </section>
  );
}
