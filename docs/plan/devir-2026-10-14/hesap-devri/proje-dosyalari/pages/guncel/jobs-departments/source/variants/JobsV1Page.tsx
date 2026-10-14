// Settings → Jobs & departments, V1 (Mert 2026-10-07): the shared list
// language. Built only from the app's own parts (data hooks, CatalogPageHeader,
// CatalogSortButton, row menu, JobAssignmentsDrawer, JobCatalogEditor), so the
// drawers and writes are the real ones. Carries Mert's 2026-10-13 picks:
// Departments tab A, groups always open, the archive rule (two groups,
// department archive takes its jobs, restore without the link, delete from
// the archived drawer).
import { useDeferredValue, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, BriefcaseBusiness, Folder, Plus, Search, X } from "lucide-react";
import type { Department, Job } from "@newfork/shared";
import { useAuth } from "../../../src/auth/AuthContext";
import { errorText } from "../../../src/settings/GeneralSettingsPage";
import { loadDepartmentsAndJobs, saveJob, setDepartmentArchived, setJobArchived } from "../../../src/settings/organization-data";
import { loadJobCounts } from "../../../src/settings/jobs-management-data";
import { JobCatalogEditor, type CatalogEditor } from "../../../src/settings/JobCatalogEditor";
import { JobAssignmentsDrawer } from "../../../src/settings/JobAssignmentsDrawer";
import { CatalogArchiveButton, CatalogRowMenu as RowMenu } from "../../../src/settings/CatalogRowMenu";
import { CatalogPageHeader, ListAddButton } from "../../../src/views/CatalogPageHeader";
import { CatalogSortButton } from "../../../src/views/CatalogSortButton";
import "../../../src/settings/jobs-settings.css";
import { Marker } from "./Marker";

type Tab = "jobs" | "departments" | "archived";
type SortKey = "name" | "employees" | "jobs" | "archived";
type Sort = { key: SortKey; descending: boolean } | null;

const plural = (count: number, one: string) => `${count} ${count === 1 ? one : `${one}s`}`;
const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
const archivedOn = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

export function JobsV1Page() {
  const { context } = useAuth();
  const canEdit = context?.permissions.includes("settings.jobs.manage") ?? false;
  const readEmployees = Boolean(context?.permissions.includes("employees.read"));
  const workspaceId = context?.workspace.id ?? "";
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>("jobs");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [search, setSearch] = useState("");
  const match = useDeferredValue(search.trim().toLowerCase());
  const [sort, setSort] = useState<Sort>(null);
  const [editor, setEditor] = useState<CatalogEditor | null>(null);
  const [openJobId, setOpenJobId] = useState<string | null>(null);
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
  const activeDepartments = departments.filter((dep) => !dep.archived_at);
  const jobsIn = (dep: Department | undefined) =>
    activeJobs.filter((job) => (dep ? job.department_id === dep.id : !job.department_id || !departmentMap.has(job.department_id)));
  const departmentHome = (job: Job) => {
    const dep = job.department_id ? departmentMap.get(job.department_id) : undefined;
    return dep && !dep.archived_at ? dep : undefined;
  };
  const selectedJob =
    jobs.find((job) => job.id === openJobId) ?? (transientJob?.id === openJobId ? transientJob : undefined);

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
      if (action.type === "departments") {
        // Archiving a department takes its active jobs with it (Mert, 2026-10-13).
        if (!action.item.archived_at)
          for (const job of activeJobs.filter((item) => item.department_id === action.item.id))
            await setJobArchived(workspaceId, job.id, true);
        await setDepartmentArchived(workspaceId, action.item.id, !action.item.archived_at);
        return;
      }
      const job = action.item as Job;
      await setJobArchived(workspaceId, job.id, !job.archived_at);
      // A restored job goes back to its department only while that department
      // is active; otherwise it comes back under No department.
      if (job.archived_at && job.department_id && !departmentHome(job))
        await saveJob(workspaceId, { name: job.name, color: job.color, department_id: null }, job.id);
    },
    onSuccess: async () => {
      setFormError(null);
      await refresh();
    },
    onError: (cause) => setFormError(errorText(cause)),
  });

  function changeTab(next: Tab) {
    setTab(next);
    setSort(null);
    setSearch("");
    setEditor(null);
    setFormError(null);
  }
  function openEditor(next: CatalogEditor) {
    setFormError(null);
    setOpenJobId(null);
    setTransientJob(null);
    setEditor(next);
  }
  function openJob(job: Job) {
    setEditor(null);
    setOpenJobId(job.id);
  }
  function countText(value: number | undefined) {
    return !readEmployees || counts.isError ? "—" : counts.isPending ? "…" : (value ?? 0);
  }

  // ---------- sorting: inside a department group; default A→Z ----------
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
      const av = value(a), bv = value(b);
      const order = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
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
            onClick={() => setSort({ key, descending: selected ? !sort.descending : false })}
          />
        )}
      </span>
    );
  }
  const clearSort = sort ? (
    <button type="button" className="job-icon-button" aria-label="Clear column sorting" onClick={() => setSort(null)}>
      <X size={14} />
    </button>
  ) : (
    <span />
  );

  // ---------- menus ----------
  function jobMenu(job: Job) {
    return (
      <RowMenu name={job.name}>
        <button type="button" disabled={!canEdit} onClick={() => openJob(job)}>
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
    const active = activeJobs.filter((job) => job.department_id === dep.id).length;
    return (
      <RowMenu name={dep.name}>
        <button type="button" disabled={!canEdit} onClick={() => openEditor({ type: "departments", item: dep })}>
          Edit department
        </button>
        {!dep.archived_at && (
          <button type="button" disabled={!canEdit} onClick={() => openEditor({ type: "jobs", departmentId: dep.id })}>
            Add job
          </button>
        )}
        <CatalogArchiveButton
          archived={Boolean(dep.archived_at)}
          name={dep.name}
          disabled={archive.isPending}
          title={!dep.archived_at && active > 0 ? `Also archives ${plural(active, "job")}` : undefined}
          onToggle={() => archive.mutate({ type: "departments", item: dep })}
        />
        {!dep.archived_at && active > 0 && <p className="v1-menu-note">Its {plural(active, "job")} will be archived too.</p>}
      </RowMenu>
    );
  }

  // ---------- Jobs tab ----------
  function jobRow(job: Job, index = 1) {
    return (
      <div className="job-catalog-row v1-job-row" key={job.id} data-archived={Boolean(job.archived_at)}>
        <button type="button" className="job-row-identity" onClick={() => openJob(job)}>
          <span className="job-color-dot" style={{ backgroundColor: job.color }} />
          <span className="job-name-stack">
            <span className="job-row-name" title={job.name}>{job.name}</span>
          </span>
          {index === 0 && <Marker n={9} inline />}
        </button>
        <span className="v1-cell v1-number">{countText(jobCounts.get(job.id))}</span>
        {jobMenu(job)}
      </div>
    );
  }
  function groupRow(dep: Department | undefined, marker?: ReactNode) {
    const inDep = jobsIn(dep);
    const people = dep ? departmentCounts.get(dep.id) : undefined;
    return (
      <div className="v1-group-row" key={`group-${dep?.id ?? "none"}`}>
        <span className="v1-group-name">
          <Folder size={15} aria-hidden style={{ color: dep?.color }} />
          <span className="v1-group-title">{dep?.name ?? "No department"}</span>
          <span className="v1-group-meta">
            {plural(inDep.length, "job")}
            {dep && readEmployees && !counts.isPending && !counts.isError ? ` · ${plural(people ?? 0, "employee")}` : ""}
          </span>
          {marker}
        </span>
        {dep && canEdit ? (
          <button type="button" className="v1-text-action" onClick={() => openEditor({ type: "jobs", departmentId: dep.id })} aria-label={`Add job to ${dep.name}`}>
            <Plus size={14} aria-hidden />
            Add job
          </button>
        ) : (
          <span />
        )}
        {dep ? departmentMenu(dep) : <span />}
      </div>
    );
  }
  function jobsTable() {
    const shownDepartments = activeDepartments
      .filter((dep) => !departmentFilter || dep.id === departmentFilter)
      .sort(byName);
    const groups: { dep?: Department; rows: Job[] }[] = shownDepartments
      .map((dep) => {
        const all = jobsIn(dep);
        const rows = !match || dep.name.toLowerCase().includes(match) ? all : all.filter((job) => job.name.toLowerCase().includes(match));
        return { dep, rows: sorted(rows) };
      })
      .filter((group) => !match || group.rows.length > 0);
    if (!departmentFilter) {
      const loose = jobsIn(undefined).filter((job) => !match || job.name.toLowerCase().includes(match));
      if (loose.length) groups.push({ rows: sorted(loose) });
    }
    return (
      <div className="job-catalog v1-table" aria-label="Jobs">
        <div className="job-column-headings catalog-column-headings v1-job-row" role="row">
          {sortColumn("name", "Job")}
          {sortColumn("employees", "Employees", !readEmployees)}
          {clearSort}
          <Marker n={3} className="v1-marker-head" />
        </div>
        {groups.length === 0 ? (
          empty(
            <BriefcaseBusiness size={22} />,
            match ? "No jobs match your search." : "No jobs yet",
            match ? "Try another name or clear your search." : "Add the first job your team works.",
          )
        ) : (
          groups.map((group, index) => (
            <div role="rowgroup" key={group.dep?.id ?? "none"}>
              {groupRow(group.dep, index === 0 ? <Marker n={4} /> : undefined)}
              {group.rows.map((job, row) => jobRow(job, index === 0 ? row : 1))}
              {group.rows.length === 0 && <p className="v1-group-empty">No jobs in this department yet.</p>}
            </div>
          ))
        )}
      </div>
    );
  }

  // ---------- Departments tab: A, plain table (Mert, 2026-10-13 "8-a") ----------
  function departmentsTable() {
    const rows = sorted(
      activeDepartments.filter(
        (dep) => !match || dep.name.toLowerCase().includes(match) || jobsIn(dep).some((job) => job.name.toLowerCase().includes(match)),
      ),
    );
    const showJobsOf = (dep: Department) => {
      changeTab("jobs");
      setDepartmentFilter(dep.id);
    };
    return (
      <div className="job-catalog v1-table v1-departments" aria-label="Departments">
        <div className="job-column-headings catalog-column-headings v1-dep-row" role="row">
          {sortColumn("name", "Department")}
          {sortColumn("jobs", "Jobs")}
          {sortColumn("employees", "Employees", !readEmployees)}
          {clearSort}
          <Marker n={8} className="v1-marker-head" />
        </div>
        {rows.length === 0
          ? empty(<Folder size={22} />, match ? "No departments match your search." : "No departments yet", match ? "Try another name or clear your search." : "Add a department for the jobs your team works.")
          : rows.map((dep) => {
              const count = jobsIn(dep).length;
              return (
                <div className="job-catalog-row v1-dep-row" key={dep.id}>
                  <button type="button" className="job-row-identity" onClick={() => openEditor({ type: "departments", item: dep })}>
                    <Folder size={15} aria-hidden style={{ color: dep.color, flex: "none" }} />
                    <span className="job-name-stack">
                      <span className="job-row-name" title={dep.name}>{dep.name}</span>
                    </span>
                  </button>
                  <span className="v1-cell v1-number">
                    <button type="button" className="v1-count-link" onClick={() => showJobsOf(dep)} aria-label={`Show the ${plural(count, "job")} in ${dep.name}`}>
                      {count}
                    </button>
                  </span>
                  <span className="v1-cell v1-number">{countText(departmentCounts.get(dep.id))}</span>
                  {departmentMenu(dep)}
                </div>
              );
            })}
      </div>
    );
  }

  // ---------- Archived tab: departments and jobs in two groups (Mert, 2026-10-13) ----------
  function archivedTable() {
    const hit = (name: string) => !match || name.toLowerCase().includes(match);
    const archivedDepartments = sorted(departments.filter((dep) => dep.archived_at && hit(dep.name)));
    const archivedJobs = sorted(jobs.filter((job) => job.archived_at && hit(job.name)));
    const restore = (label: string, name: string, onClick: () => void, title: string) =>
      canEdit ? (
        <button type="button" className="v1-restore" disabled={archive.isPending} title={title} onClick={onClick} aria-label={`Restore ${name}`}>
          {label}
        </button>
      ) : (
        <span />
      );
    const groupHead = (title: string, count: number) => (
      <div className="v1-group-row v1-archived-group">
        <span className="v1-group-name">
          <span className="v1-group-title">{title}</span>
          <span className="v1-group-meta">{count}</span>
        </span>
      </div>
    );
    return (
      <div className="job-catalog v1-table" aria-label="Archived departments and jobs">
        <div className="job-column-headings catalog-column-headings v1-archived-row" role="row">
          {sortColumn("name", "Name")}
          <span role="columnheader"><span className="catalog-sort-label">Department</span></span>
          {sortColumn("archived", "Archived")}
          {clearSort}
          <Marker n={6} className="v1-marker-head" />
        </div>
        {archivedDepartments.length + archivedJobs.length === 0 ? (
          empty(<Archive size={22} />, match ? "Nothing archived matches your search." : "No archived departments or jobs", match ? "Try another name or clear your search." : "Departments and jobs you archive will appear here.")
        ) : (
          <>
            {archivedDepartments.length > 0 && (
              <div role="rowgroup">
                {groupHead("Departments", archivedDepartments.length)}
                {archivedDepartments.map((dep) => (
                  <div className="job-catalog-row v1-archived-row" key={dep.id} data-archived="true">
                    <button type="button" className="job-row-identity" onClick={() => openEditor({ type: "departments", item: dep })}>
                      <Folder size={15} aria-hidden style={{ color: dep.color, flex: "none" }} />
                      <span className="job-row-name" title={dep.name}>{dep.name}</span>
                    </button>
                    <span className="v1-cell v1-faint v1-no-dep">—</span>
                    <span className="v1-cell v1-archived-date">{archivedOn(dep.archived_at)}</span>
                    {restore("Restore", dep.name, () => archive.mutate({ type: "departments", item: dep }), "Comes back with no jobs")}
                  </div>
                ))}
              </div>
            )}
            {archivedJobs.length > 0 && (
              <div role="rowgroup">
                {groupHead("Jobs", archivedJobs.length)}
                {archivedJobs.map((job) => {
                  const was = job.department_id ? departmentMap.get(job.department_id) : undefined;
                  const home = departmentHome(job);
                  return (
                    <div className="job-catalog-row v1-archived-row" key={job.id} data-archived="true">
                      <button type="button" className="job-row-identity" onClick={() => openJob(job)}>
                        <span className="job-color-dot" style={{ backgroundColor: job.color }} />
                        <span className="job-row-name" title={job.name}>{job.name}</span>
                      </button>
                      <span className="v1-cell">
                        {was ? was.name : <span className="v1-faint">No department</span>}
                        {was?.archived_at && <span className="v1-faint"> · archived</span>}
                      </span>
                      <span className="v1-cell v1-archived-date">{archivedOn(job.archived_at)}</span>
                      {restore("Restore", job.name, () => archive.mutate({ type: "jobs", item: job }), home ? `Comes back under ${home.name}` : "Comes back under No department")}
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

  function empty(icon: ReactNode, title: string, text: string) {
    return (
      <div className="catalog-table-empty">
        <span className="catalog-table-empty-icon" aria-hidden>{icon}</span>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
    );
  }

  const tabs: [Tab, string][] = [
    ["jobs", "Jobs"],
    ["departments", "Departments"],
    ["archived", "Archived"],
  ];
  return (
    <section className="settings-page jobs-settings-page list-page jobs-v1-page" aria-labelledby="jobs-v1-title">
      <CatalogPageHeader
        eyebrow="SETTINGS"
        title="Jobs & departments"
        titleId="jobs-v1-title"
        description="Organize your jobs. Connect the right people to each one."
      />
      <div className="job-catalog-toolbar catalog-toolbar">
        <div className="catalog-toolbar-status-row v1-status-row">
          <div className="catalog-status-tabs" role="tablist" aria-label="Jobs and departments">
            {tabs.map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                className={tab === value ? "active" : ""}
                onClick={() => changeTab(value)}
              >
                {label}
                {value === "archived" && <Marker n={5} inline />}
              </button>
            ))}
          </div>
          {/* Phone: the add button sits in the tab row, right of Archived (Mert, 2026-10-14). */}
          {canEdit && tab !== "archived" && (
            <span className="v1-tab-add">
              <Marker n={10} />
              <ListAddButton
                label={tab === "jobs" ? "New job" : "New department"}
                shortLabel="Add"
                disabled={archive.isPending}
                onClick={() => openEditor({ type: tab === "jobs" ? "jobs" : "departments" })}
              />
            </span>
          )}
          <span className="v1-status-markers">
            <Marker n={1} />
            <Marker n={2} />
          </span>
        </div>
        <div className="catalog-toolbar-filter-row">
          {tab === "jobs" && (
            <select
              className="toolbar-filter-select"
              aria-label="Filter by department"
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value)}
            >
              <option value="">All departments</option>
              {[...activeDepartments].sort(byName).map((dep) => (
                <option key={dep.id} value={dep.id}>{dep.name}</option>
              ))}
            </select>
          )}
          <label className="job-search toolbar-search">
            <Search size={16} aria-hidden />
            <input
              aria-label={tab === "departments" ? "Search departments" : "Search jobs or departments"}
              placeholder={tab === "departments" ? "Search departments or jobs" : "Search jobs or departments"}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search && (
              <button type="button" aria-label="Clear search" onClick={() => setSearch("")}>
                <X size={14} />
              </button>
            )}
          </label>
          {canEdit && tab === "jobs" && (
            <span className="v1-filter-add">
            <ListAddButton label="New job" disabled={archive.isPending} onClick={() => openEditor({ type: "jobs" })} />
            </span>
          )}
          {canEdit && tab === "departments" && (
            <span className="v1-add-wrap v1-filter-add">
              <ListAddButton label="New department" disabled={archive.isPending} onClick={() => openEditor({ type: "departments" })} />
              <Marker n={7} className="v1-marker-add" />
            </span>
          )}
        </div>
      </div>
      {editor?.type === "jobs" && !editor.item && !editor.departmentId ? (
        <JobAssignmentsDrawer
          key="new-job"
          workspaceId={workspaceId}
          initialJob={{ name: "", color: "#4478A8", department_id: departmentFilter || null }}
          departments={departments}
          onClose={() => setEditor(null)}
          onCreatedJob={(job) => {
            setTransientJob(job);
            setEditor(null);
            setOpenJobId(job.id);
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
            setOpenJobId(job.id);
          }}
        />
      ) : null}
      {formError && <p className="settings-state error" role="alert">{formError}</p>}
      {counts.isError && (
        <p className="settings-state error" role="alert">
          Employee counts could not load.{" "}
          <button type="button" onClick={() => void counts.refetch()}>Retry</button>
        </p>
      )}
      {data.isPending ? (
        <p className="settings-state">Loading your team structure…</p>
      ) : data.isError ? (
        <p className="settings-state error" role="alert">{errorText(data.error)}</p>
      ) : tab === "jobs" ? (
        jobsTable()
      ) : tab === "departments" ? (
        departmentsTable()
      ) : (
        archivedTable()
      )}
      {selectedJob && !editor && (
        <JobAssignmentsDrawer
          key={`${workspaceId}:${selectedJob.id}`}
          workspaceId={workspaceId}
          job={selectedJob}
          departments={departments}
          onClose={() => {
            setTransientJob(null);
            setOpenJobId(null);
          }}
        />
      )}
    </section>
  );
}
