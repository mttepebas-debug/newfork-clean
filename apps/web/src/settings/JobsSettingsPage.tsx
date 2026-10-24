import { tabLineRef } from "../shell/useTabSwipe";
import { useDeferredValue, useState, type ReactNode } from "react";
import { SettingsListHeader } from "./SettingsListHeader";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { Archive, BriefcaseBusiness, Folder, Plus, Search, X } from "lucide-react";
import type { Department, Job } from "@newfork/shared";
import { useAuth } from "../auth/AuthContext";
import { errorText } from "./GeneralSettingsPage";
import { isGoneMeanwhile } from "../lib/catalog-refusals";
import { loadDepartmentsAndJobs, setDepartmentArchived, setJobArchived } from "./organization-data";
import { loadJobCounts } from "./jobs-management-data";
import { JobCatalogEditor, type CatalogEditor } from "./JobCatalogEditor";
import { JobAssignmentsDrawer } from "./JobAssignmentsDrawer";
import { CatalogArchiveButton, CatalogRowMenu as RowMenu } from "./CatalogRowMenu";
import { ListAddButton } from "../views/CatalogPageHeader";
import { CatalogSortButton, nextCatalogSort } from "../views/CatalogSortButton";
import { isNoAccess } from "../lib/no-access";
import { NoAccessState } from "../shell/NoAccessState";
import { ListOutline, LoadError, RefreshError } from "../shell/LoadState";
import { noAccessHomePath } from "../auth/resolveLanding";
import { onTabListKeyDown } from "../lib/tab-list-keys";
import "./jobs-settings.css";

// Settings → Jobs & departments in the shared list language (Mert's Jobs V1,
// 2026-10-07, and his ten Jobs decisions of 2026-10-13/14): Jobs, Departments
// and Archived tabs; one table with a sub-heading per department, always open;
// sorting inside each department, A to Z by default. Archiving a department
// takes its active jobs with it, and a restored job comes back under its
// department only while that department is active: both are the database's
// rules (department_archive_takes_its_jobs), so the page writes one row.

type Tab = "jobs" | "departments" | "archived";
type SortKey = "name" | "employees" | "jobs" | "archived";
type Sort = { key: SortKey; descending: boolean } | null;

/** "1 job", "2 jobs". */
const plural = (count: number, one: string) => `${count} ${count === 1 ? one : `${one}s`}`;
const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }) || a.name.localeCompare(b.name);
const archivedOn = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

export default function JobsSettingsPage() {
  const { context } = useAuth();
  const canEdit = context?.permissions.includes("settings.jobs.manage") ?? false;
  const readEmployees = Boolean(context?.permissions.includes("employees.read"));
  const workspaceId = context?.workspace.id ?? "";
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "departments" ? "departments" : params.get("tab") === "archived" ? "archived" : "jobs";
  const search = params.get("q") ?? "";
  const match = useDeferredValue(search.trim().toLowerCase());
  const [sort, setSort] = useState<Sort>(null);
  const [editor, setEditor] = useState<CatalogEditor | null>(null);
  const [transientJob, setTransientJob] = useState<Job | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const queryKey = ["organization-jobs", workspaceId];
  const data = useQuery({ queryKey, enabled: Boolean(workspaceId), queryFn: () => loadDepartmentsAndJobs(workspaceId) });
  const counts = useQuery({
    queryKey: ["organization-job-counts", workspaceId],
    enabled: Boolean(workspaceId && readEmployees),
    queryFn: () => loadJobCounts(workspaceId),
  });
  const departments = data.data?.departments ?? [];
  const jobs = data.data?.jobs ?? [];
  const departmentMap = new Map(departments.map((item) => [item.id, item]));
  const jobCounts = new Map(counts.data?.jobs.map((item) => [item.id, item.employee_count]));
  const departmentCounts = new Map(counts.data?.departments.map((item) => [item.id, item.employee_count]));
  const activeJobs = jobs.filter((job) => !job.archived_at);
  const activeDepartments = departments.filter((dep) => !dep.archived_at).sort(byName);
  // A filter for a department that is gone or archived shows every department.
  const departmentFilter = activeDepartments.some((dep) => dep.id === params.get("department"))
    ? (params.get("department") ?? "")
    : "";
  /** The active jobs a group lists: a department's, or those with no active department. */
  const jobsIn = (dep: Department | undefined) =>
    activeJobs.filter((job) => (dep ? job.department_id === dep.id : !departmentHome(job)));
  /** Where a job is filed or comes back to: its department while that is active. */
  function departmentHome(job: Job): Department | undefined {
    const dep = job.department_id ? departmentMap.get(job.department_id) : undefined;
    return dep && !dep.archived_at ? dep : undefined;
  }
  const selectedJob =
    jobs.find((job) => job.id === params.get("jobId")) ??
    (transientJob?.id === params.get("jobId") ? transientJob : undefined);

  function updateParams(changes: Record<string, string | null>, replace = false) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        Object.entries(changes).forEach(([key, value]) => (value === null ? next.delete(key) : next.set(key, value)));
        return next;
      },
      { replace, preventScrollReset: true },
    );
  }
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: ["organization-job-counts", workspaceId] }),
      queryClient.invalidateQueries({ queryKey: ["employee-reference-data", workspaceId] }),
      queryClient.invalidateQueries({ queryKey: ["schedule-read", workspaceId] }),
    ]);
  };
  const archive = useMutation({
    mutationFn: async (action: { type: "departments" | "jobs"; item: Department | Job }) => {
      if (!canEdit) throw new Error("Jobs edit access required");
      if (action.type === "departments") await setDepartmentArchived(workspaceId, action.item.id, !action.item.archived_at);
      else await setJobArchived(workspaceId, action.item.id, !action.item.archived_at);
    },
    onSuccess: async () => {
      setFormError(null);
      await refresh();
    },
    // BL-1045: an item deleted meanwhile leaves the list; its sentence stays.
    onError: (cause) => {
      setFormError(errorText(cause));
      if (isGoneMeanwhile(cause)) void refresh();
    },
  });

  function changeTab(next: Tab) {
    setSort(null);
    setEditor(null);
    setFormError(null);
    updateParams({ tab: next === "jobs" ? null : next, q: null });
  }
  function openEditor(next: CatalogEditor) {
    setFormError(null);
    setTransientJob(null);
    updateParams({ jobId: null }, true);
    setEditor(next);
  }
  function openJob(job: Job) {
    setEditor(null);
    updateParams({ jobId: job.id });
  }
  function openCreatedJob(job: Job) {
    setTransientJob(job);
    setEditor(null);
    updateParams({ jobId: job.id });
  }
  function countText(value: number | undefined) {
    return !readEmployees || counts.isError ? "—" : counts.isPending ? "…" : (value ?? 0);
  }

  // Sorting stays inside a department group; without a choice, A to Z.
  function sorted<T extends Job | Department>(items: T[]): T[] {
    const base = [...items].sort(byName);
    if (!sort) return base;
    const value = (item: T): string | number => {
      if (sort.key === "employees") return ("department_id" in item ? jobCounts : departmentCounts).get(item.id) ?? 0;
      if (sort.key === "jobs") return activeJobs.filter((job) => job.department_id === item.id).length;
      if (sort.key === "archived") return item.archived_at ?? "";
      return item.name;
    };
    return base.sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      const order =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
      return (sort.descending ? -order : order) || byName(a, b);
    });
  }
  function sortColumn(key: SortKey, label: string, disabled = false) {
    const selected = sort?.key === key;
    return (
      <span role="columnheader" aria-sort={selected ? (sort.descending ? "descending" : "ascending") : "none"}>
        {disabled ? (
          <span className="catalog-sort-label">{label}</span>
        ) : (
          <CatalogSortButton
            active={selected}
            label={label}
            onClick={() => setSort(nextCatalogSort(sort, key))}
          />
        )}
      </span>
    );
  }

  function jobMenu(job: Job) {
    if (!canEdit) return <span />;
    return (
      <RowMenu name={job.name}>
        <button type="button" onClick={() => openJob(job)}>
          Edit job
        </button>
        <CatalogArchiveButton
          archived={Boolean(job.archived_at)}
          name={job.name}
          disabled={archive.isPending}
          onToggle={() => archive.mutate({ type: "jobs", item: job })}
        />
      </RowMenu>
    );
  }
  function departmentMenu(dep: Department) {
    if (!canEdit) return <span />;
    const active = activeJobs.filter((job) => job.department_id === dep.id).length;
    return (
      <RowMenu name={dep.name}>
        <button type="button" onClick={() => openEditor({ type: "departments", item: dep })}>
          Edit department
        </button>
        <button type="button" onClick={() => openEditor({ type: "jobs", departmentId: dep.id })}>
          Add job
        </button>
        <CatalogArchiveButton
          archived={false}
          name={dep.name}
          disabled={archive.isPending}
          title={active > 0 ? `Also archives ${plural(active, "job")}` : undefined}
          onToggle={() => archive.mutate({ type: "departments", item: dep })}
        />
        {active > 0 && <p className="jobs-menu-note">Its {plural(active, "job")} will be archived too.</p>}
      </RowMenu>
    );
  }
  function empty(icon: ReactNode, title: string, text: string) {
    return (
      <div className="catalog-table-empty">
        <span className="catalog-table-empty-icon" aria-hidden>
          {icon}
        </span>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
    );
  }

  function jobsTable() {
    const groups: { dep?: Department; rows: Job[] }[] = activeDepartments
      .filter((dep) => !departmentFilter || dep.id === departmentFilter)
      .map((dep) => {
        const all = jobsIn(dep);
        const rows =
          !match || dep.name.toLowerCase().includes(match) ? all : all.filter((job) => job.name.toLowerCase().includes(match));
        return { dep, rows: sorted(rows) };
      })
      .filter((group) => !match || group.rows.length > 0);
    if (!departmentFilter) {
      const loose = jobsIn(undefined).filter((job) => !match || job.name.toLowerCase().includes(match));
      if (loose.length) groups.push({ rows: sorted(loose) });
    }
    return (
      <div className="job-catalog" aria-label="Jobs">
        <div className="job-column-headings catalog-column-headings jobs-job-row" role="row">
          {sortColumn("name", "Job")}
          {sortColumn("employees", "Employees", !readEmployees || counts.isError)}
          <span />
        </div>
        {groups.length === 0
          ? empty(
              <BriefcaseBusiness size={22} />,
              match ? "No jobs match your search." : "No jobs yet",
              match ? "Try another name or clear your search." : "Add the first job your team works.",
            )
          : groups.map((group) => {
              const dep = group.dep;
              return (
                <div role="rowgroup" key={dep?.id ?? "none"} aria-label={dep?.name ?? "No department"}>
                  <div className="jobs-group-row">
                    <span className="jobs-group-name">
                      <Folder size={15} aria-hidden style={{ color: dep?.color }} />
                      <span className="jobs-group-title">{dep?.name ?? "No department"}</span>
                      <span className="jobs-group-meta">
                        {plural(jobsIn(dep).length, "job")}
                        {dep && readEmployees && counts.isSuccess
                          ? ` · ${plural(departmentCounts.get(dep.id) ?? 0, "employee")}`
                          : ""}
                      </span>
                    </span>
                    {dep && canEdit ? (
                      <button
                        type="button"
                        className="jobs-add-job"
                        aria-label={`Add job to ${dep.name}`}
                        onClick={() => openEditor({ type: "jobs", departmentId: dep.id })}
                      >
                        <Plus size={14} aria-hidden />
                        Add job
                      </button>
                    ) : (
                      <span />
                    )}
                    {dep ? departmentMenu(dep) : <span />}
                  </div>
                  {group.rows.map((job) => (
                    <div className="job-catalog-row jobs-job-row" key={job.id}>
                      <button type="button" className="job-row-identity" onClick={() => openJob(job)}>
                        <span className="job-color-dot" style={{ backgroundColor: job.color }} />
                        <span className="job-name-stack">
                          <span className="job-row-name" title={job.name}>
                            {job.name}
                          </span>
                        </span>
                      </button>
                      <span className="jobs-cell jobs-number">{countText(jobCounts.get(job.id))}</span>
                      {jobMenu(job)}
                    </div>
                  ))}
                  {group.rows.length === 0 && <p className="jobs-group-empty">No jobs in this department yet.</p>}
                </div>
              );
            })}
      </div>
    );
  }

  function departmentsTable() {
    const rows = sorted(
      activeDepartments.filter(
        (dep) =>
          !match || dep.name.toLowerCase().includes(match) || jobsIn(dep).some((job) => job.name.toLowerCase().includes(match)),
      ),
    );
    return (
      <div className="job-catalog" aria-label="Departments">
        <div className="job-column-headings catalog-column-headings jobs-department-row" role="row">
          {sortColumn("name", "Department")}
          {sortColumn("jobs", "Jobs")}
          {sortColumn("employees", "Employees", !readEmployees || counts.isError)}
          <span />
        </div>
        {rows.length === 0
          ? empty(
              <Folder size={22} />,
              match ? "No departments match your search." : "No departments yet",
              match ? "Try another name or clear your search." : "Add a department for the jobs your team works.",
            )
          : rows.map((dep) => {
              const count = jobsIn(dep).length;
              return (
                <div className="job-catalog-row jobs-department-row" key={dep.id}>
                  <button
                    type="button"
                    className="job-row-identity"
                    onClick={() => openEditor({ type: "departments", item: dep })}
                  >
                    <Folder size={15} aria-hidden style={{ color: dep.color, flex: "none" }} />
                    <span className="job-name-stack">
                      <span className="job-row-name" title={dep.name}>
                        {dep.name}
                      </span>
                    </span>
                  </button>
                  <span className="jobs-cell jobs-number">
                    {/* The count opens the Jobs tab filtered to this department (Jobs decision 8). */}
                    <button
                      type="button"
                      className="jobs-count-link"
                      aria-label={`Show the ${plural(count, "job")} in ${dep.name}`}
                      onClick={() => {
                        setSort(null);
                        setEditor(null);
                        setFormError(null);
                        updateParams({ tab: null, q: null, department: dep.id });
                      }}
                    >
                      {count}
                    </button>
                  </span>
                  <span className="jobs-cell jobs-number jobs-people">{countText(departmentCounts.get(dep.id))}</span>
                  {departmentMenu(dep)}
                </div>
              );
            })}
      </div>
    );
  }

  function archivedTable() {
    const hit = (name: string) => !match || name.toLowerCase().includes(match);
    const archivedDepartments = sorted(departments.filter((dep) => dep.archived_at && hit(dep.name)));
    const archivedJobs = sorted(jobs.filter((job) => job.archived_at && hit(job.name)));
    const restore = (name: string, title: string, onClick: () => void) =>
      canEdit ? (
        <button
          type="button"
          className="jobs-restore"
          disabled={archive.isPending}
          title={title}
          aria-label={`Restore ${name}`}
          onClick={onClick}
        >
          Restore
        </button>
      ) : (
        <span />
      );
    const groupHead = (title: string, count: number) => (
      <div className="jobs-group-row jobs-archived-group">
        <span className="jobs-group-name">
          <span className="jobs-group-title">{title}</span>
          <span className="jobs-group-meta">{count}</span>
        </span>
      </div>
    );
    return (
      <div className="job-catalog" aria-label="Archived departments and jobs">
        <div className="job-column-headings catalog-column-headings jobs-archived-row" role="row">
          {/* Departments and jobs share these rows, so the first column has no
              title of its own; each group's heading names it (Mert 2026-10-14). */}
          <span role="columnheader" aria-label="Name" />
          {sortColumn("archived", "Archived")}
          <span />
        </div>
        {archivedDepartments.length + archivedJobs.length === 0 ? (
          empty(
            <Archive size={22} />,
            match ? "Nothing archived matches your search." : "No archived departments or jobs",
            match ? "Try another name or clear your search." : "Departments and jobs you archive will appear here.",
          )
        ) : (
          <>
            {archivedDepartments.length > 0 && (
              <div role="rowgroup" aria-label="Archived departments">
                {groupHead("Departments", archivedDepartments.length)}
                {archivedDepartments.map((dep) => (
                  <div className="job-catalog-row jobs-archived-row" key={dep.id} data-archived="true">
                    <button
                      type="button"
                      className="job-row-identity"
                      onClick={() => openEditor({ type: "departments", item: dep })}
                    >
                      <Folder size={15} aria-hidden style={{ color: dep.color, flex: "none" }} />
                      <span className="job-row-name" title={dep.name}>
                        {dep.name}
                      </span>
                    </button>
                    <span className="jobs-cell jobs-archived-detail">{archivedOn(dep.archived_at)}</span>
                    {restore(dep.name, "Comes back with no jobs", () => archive.mutate({ type: "departments", item: dep }))}
                  </div>
                ))}
              </div>
            )}
            {archivedJobs.length > 0 && (
              <div role="rowgroup" aria-label="Archived jobs">
                {groupHead("Jobs", archivedJobs.length)}
                {archivedJobs.map((job) => {
                  const was = job.department_id ? departmentMap.get(job.department_id) : undefined;
                  const home = departmentHome(job);
                  return (
                    <div className="job-catalog-row jobs-archived-row" key={job.id} data-archived="true">
                      {/* The department sits beside the button, so the button's name stays the job's. */}
                      <span className="jobs-archived-name">
                        <button type="button" className="job-row-identity" onClick={() => openJob(job)}>
                          <span className="job-color-dot" style={{ backgroundColor: job.color }} />
                          <span className="job-row-name" title={job.name}>
                            {job.name}
                          </span>
                        </button>
                        <span className="jobs-faint jobs-archived-home">
                          · {was ? was.name : "No department"}
                          {was?.archived_at ? " · archived" : ""}
                        </span>
                      </span>
                      <span className="jobs-cell jobs-archived-detail">{archivedOn(job.archived_at)}</span>
                      {restore(job.name, home ? `Comes back under ${home.name}` : "Comes back under No department", () =>
                        archive.mutate({ type: "jobs", item: job }),
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // The API's "no" gets the one no-access card, never its raw sentence.
  if (isNoAccess(data.error))
    return <NoAccessState homeHref={noAccessHomePath(context, "/app/settings/jobs")} />;

  const addButton =
    canEdit && tab !== "archived" ? (
      <ListAddButton
        label={tab === "jobs" ? "New job" : "New department"}
        shortLabel="Add"
        disabled={archive.isPending}
        onClick={() => openEditor({ type: tab === "jobs" ? "jobs" : "departments" })}
      />
    ) : null;
  const tabs: [Tab, string][] = [
    ["jobs", "Jobs"],
    ["departments", "Departments"],
    ["archived", "Archived"],
  ];
  return (
    <section className="settings-page jobs-settings-page jobs-catalog-page list-page" aria-labelledby="jobs-settings-title">
      <SettingsListHeader
        icon={<BriefcaseBusiness size={21} aria-hidden />}
        title="Jobs & departments"
        titleId="jobs-settings-title"
        description="Organize your jobs. Connect the right people to each one."
      />
      <div className="job-catalog-toolbar catalog-toolbar">
        <div className="catalog-toolbar-status-row">
          <div className="catalog-status-tabs" ref={tabLineRef} role="tablist" onKeyDown={onTabListKeyDown} aria-label="Jobs and departments">
            {tabs.map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                tabIndex={tab === value ? 0 : -1}
                className={tab === value ? "active" : ""}
                onClick={() => changeTab(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Phone: the add button sits in the tab row, right of Archived (Jobs decision 10). */}
        </div>
        <div className="catalog-toolbar-filter-row">
          {tab === "jobs" && (
            <select
              className="toolbar-filter-select"
              aria-label="Filter by department"
              value={departmentFilter}
              onChange={(event) => updateParams({ department: event.target.value || null })}
            >
              <option value="">All departments</option>
              {activeDepartments.map((dep) => (
                <option key={dep.id} value={dep.id}>
                  {dep.name}
                </option>
              ))}
            </select>
          )}
          <label className="job-search toolbar-search">
            <Search size={16} aria-hidden />
            <input
              aria-label={tab === "departments" ? "Search departments or jobs" : "Search jobs or departments"}
              placeholder={tab === "departments" ? "Search departments or jobs" : "Search jobs or departments"}
              value={search}
              onChange={(event) => updateParams({ q: event.target.value || null }, true)}
            />
            {search && (
              <button type="button" aria-label="Clear search" onClick={() => updateParams({ q: null }, true)}>
                <X size={14} />
              </button>
            )}
          </label>
          {addButton}
        </div>
      </div>
      {editor?.type === "jobs" && !editor.item && !editor.departmentId ? (
        <JobAssignmentsDrawer
          key="new-job"
          workspaceId={workspaceId}
          initialJob={{ name: "", color: "#4478A8", department_id: departmentFilter || null }}
          departments={departments}
          onClose={() => setEditor(null)}
          onCreatedJob={openCreatedJob}
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
          onCreatedJob={openCreatedJob}
        />
      ) : null}
      {formError && (
        <p className="settings-state error" role="alert">
          {formError}
        </p>
      )}
      {/* Employee counts that don't load stay "—" with no message (Mert
          2026-10-14): the list itself is all there. */}
      {data.error && data.data ? (
        <RefreshError
          message="Jobs and departments didn't refresh. This is the last list that loaded."
          retrying={data.isFetching}
          onRetry={() => void data.refetch()}
        />
      ) : null}
      {data.isLoading ? (
        <ListOutline label="Loading jobs and departments" rows={6} columns={3} />
      ) : data.error && !data.data ? (
        <LoadError
          title="We couldn't load jobs and departments"
          detail="Jobs and departments didn't load. Nothing was changed."
          retrying={data.isFetching}
          onRetry={() => void data.refetch()}
        />
      ) : data.data ? (
        tab === "jobs" ? (
          jobsTable()
        ) : tab === "departments" ? (
          departmentsTable()
        ) : (
          archivedTable()
        )
      ) : null}
      {params.get("jobId") && data.isSuccess && !selectedJob && (
        <p className="settings-state error" role="alert">
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
