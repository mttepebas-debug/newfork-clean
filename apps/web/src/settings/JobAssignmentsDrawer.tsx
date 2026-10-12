import { useDeferredValue, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Search, Users, X } from "lucide-react";
import type {
  Job,
  Department,
  JobInput,
  JobAssignmentEmployee,
  JobAssignmentQuery,
  JobAssignmentTarget,
} from "@newfork/shared";
import { useAuth } from "../auth/AuthContext";
import {
  createJobWithAssignments,
  loadJobEmployees,
  loadNewJobEmployees,
  loadNewJobTargets,
  loadJobTargets,
  saveJobDetails,
} from "./jobs-management-data";
import { errorText } from "./GeneralSettingsPage";
import { CatalogDeleteAction } from "./CatalogDeleteAction";
import { CatalogDrawer } from "./CatalogDrawer";
import { JobColorInput } from "./JobCatalogEditor";
import { jobInputSchema } from "@newfork/shared";
import { LetterRuleError, letterRuleProps } from "../shell/us-text";
import { listJobs } from "./organization-data";
import { isChangedMeanwhile } from "../lib/catalog-refusals";

type Pending = { before: boolean; assigned: boolean; revision: number };
export function JobAssignmentsDrawer({
  workspaceId,
  job,
  initialJob,
  departments,
  onClose,
  onCreatedJob,
}: {
  workspaceId: string;
  job?: Job;
  initialJob?: JobInput;
  departments: Department[];
  onClose: () => void;
  onCreatedJob?: (job: Job) => void;
}) {
  const { context } = useAuth();
  const createMode = !job;
  const canRead = Boolean(context?.permissions.includes("employees.read"));
  const canManageJob = Boolean(
    context?.permissions.includes("settings.jobs.manage"),
  );
  const canEdit = Boolean(
    canRead &&
    !job?.archived_at &&
    context?.permissions.includes("employees.manage"),
  );
  const initial: JobInput = job
    ? jobInputSchema.parse(job)
    : (initialJob ?? {
        name: "",
        color: "#4478A8",
        department_id: null,
      });
  const [baseline, setBaseline] = useState<JobInput>(() => initial);
  const [jobDraft, setJobDraft] = useState<JobInput>(() => initial);
  const detailsDirty =
    jobDraft.name.trim() !== baseline.name ||
    jobDraft.color !== baseline.color ||
    jobDraft.department_id !== baseline.department_id;
  const departmentName =
    departments.find((item) => item.id === jobDraft.department_id)?.name ??
    "No department";
  const client = useQueryClient();
  const dialog = useRef<HTMLDivElement>(null),
    searchInput = useRef<HTMLInputElement>(null);
  const employeeList = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [location, setLocation] = useState("");
  const [filter, setFilter] = useState<JobAssignmentQuery["filter"]>("all");
  const [page, setPage] = useState(0);
  const [pending, setPending] = useState<Map<string, Pending>>(new Map());
  const [discard, setDiscard] = useState(false);
  const [deleteLocked, setDeleteLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // BL-1045: Reload latest only when the refusal says something newer exists.
  const [reloadable, setReloadable] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const query: JobAssignmentQuery = {
    search: deferredSearch,
    filter,
    page,
    ...(location ? { location_id: location } : {}),
  };
  const data = useQuery({
    queryKey: [
      "job-assignments",
      workspaceId,
      createMode ? "new" : job!.id,
      query,
    ],
    queryFn: () =>
      createMode
        ? loadNewJobEmployees(workspaceId, query)
        : loadJobEmployees(workspaceId, job!.id, query),
    enabled: canRead,
  });
  useEffect(() => {
    if (employeeList.current) employeeList.current.scrollTop = 0;
  }, [page, deferredSearch, location, filter]);
  useEffect(() => {
    const total = data.data?.total;
    if (total !== undefined && !data.isFetching)
      setPage((current) =>
        Math.min(current, Math.max(0, Math.ceil(total / 50) - 1)),
      );
  }, [data.data, data.isFetching]);
  useEffect(() => {
    if (discard)
      dialog.current
        ?.querySelector<HTMLButtonElement>("[data-keep-editing]")
        ?.focus();
  }, [discard]);
  useEffect(() => {
    if (!pending.size) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [pending.size]);
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["job-assignments", workspaceId] }),
      client.invalidateQueries({
        queryKey: ["organization-jobs", workspaceId],
      }),
      client.invalidateQueries({
        queryKey: ["organization-job-counts", workspaceId],
      }),
      client.invalidateQueries({ queryKey: ["employees", workspaceId] }),
      client.invalidateQueries({ queryKey: ["employee-detail", workspaceId] }),
      client.invalidateQueries({
        queryKey: ["employee-reference-data", workspaceId],
      }),
      client.invalidateQueries({ queryKey: ["schedule-read", workspaceId] }),
    ]);
  };
  const save = useMutation({
    mutationFn: async () => {
      setError(null);
      setNotice(null);
      const parsed = jobInputSchema.safeParse(jobDraft);
      if (!parsed.success)
        throw new Error(
          parsed.error.issues[0]?.message ?? "Enter valid job details.",
        );
      const changes = [...pending].map(([employee_id, change]) => ({
        employee_id,
        assigned: change.assigned,
        expected_revision: change.revision,
      }));
      return createMode
        ? createJobWithAssignments(workspaceId, {
            job: parsed.data,
            changes,
          })
        : saveJobDetails(workspaceId, job!.id, {
            ...(detailsDirty
              ? { job: parsed.data, expected_job: baseline }
              : {}),
            changes,
          });
    },
    onSuccess: async (result) => {
      setPending(new Map());
      setBaseline(jobInputSchema.parse(result.job));
      setJobDraft(jobInputSchema.parse(result.job));
      setNotice(
        result.changed_count
          ? `Job saved · ${result.changed_count} employee assignments updated.`
          : "Job saved.",
      );
      await refresh();
      if (createMode) onCreatedJob?.(result.job);
    },
    onError: (cause) => {
      setError(errorText(cause));
      setReloadable(isChangedMeanwhile(cause));
    },
  });
  const busy = save.isPending || bulkBusy || deleteLocked;
  const rows = data.data?.employees ?? [];
  const additions = [...pending.values()].filter((row) => row.assigned).length;
  const removals = pending.size - additions;
  function stage(targets: JobAssignmentTarget[], assigned: boolean) {
    setNotice(null);
    setPending((current) => {
      const next = new Map(current);
      for (const target of targets) {
        const before =
          current.get(target.employee_id)?.before ?? target.assigned;
        if (before === assigned) next.delete(target.employee_id);
        else
          next.set(target.employee_id, {
            before,
            assigned,
            revision:
              current.get(target.employee_id)?.revision ?? target.revision,
          });
      }
      return next;
    });
  }
  async function reloadConflicts() {
    setBulkBusy(true);
    try {
      const [latestJobs, targets] = await Promise.all([
        createMode ? Promise.resolve([] as Job[]) : listJobs(workspaceId),
        canRead && pending.size
          ? createMode
            ? loadNewJobTargets(workspaceId, {
                search: "",
                filter: "all",
                page: 0,
              })
            : loadJobTargets(workspaceId, job!.id, {
                search: "",
                filter: "all",
                page: 0,
              })
          : Promise.resolve([] as JobAssignmentTarget[]),
      ]);
      const latestJob = job
        ? latestJobs.find((item) => item.id === job.id)
        : null;
      if (!latestJob)
        if (!createMode)
          throw new Error(
            "This job is no longer available. Your draft has been kept.",
          );
      if (latestJob) {
        const latest = jobInputSchema.parse(latestJob);
        setJobDraft((current) => ({
          name:
            current.name.trim() !== baseline.name ? current.name : latest.name,
          color:
            current.color !== baseline.color ? current.color : latest.color,
          department_id:
            current.department_id !== baseline.department_id
              ? current.department_id
              : latest.department_id,
        }));
        setBaseline(latest);
      }
      const byId = new Map(targets.map((row) => [row.employee_id, row]));
      setPending((current) => {
        const next = new Map<string, Pending>();
        for (const [id, change] of current) {
          const target = byId.get(id);
          if (!target) next.set(id, change);
          else if (target.assigned !== change.assigned)
            next.set(id, {
              before: target.assigned,
              assigned: change.assigned,
              revision: target.revision,
            });
        }
        return next;
      });
      await refresh();
      setError(null);
      setNotice(
        "Latest data loaded. Your edits are kept; review them before saving.",
      );
    } catch (cause) {
      setError(errorText(cause));
      setReloadable(false);
    } finally {
      setBulkBusy(false);
    }
  }
  function requestClose() {
    if (busy) return;
    if (pending.size) setDiscard(true);
    else onClose();
  }
  function employeeRow(row: JobAssignmentEmployee) {
    const change = pending.get(row.employee_id);
    const assigned = change?.assigned ?? row.assigned;
    const disabled = !canEdit || !row.can_manage || busy;
    return (
      <label
        className="job-employee-row"
        data-pending={Boolean(change)}
        data-disabled={!canEdit || !row.can_manage}
        key={row.employee_id}
        title={row.disabled_reason ?? undefined}
      >
        <input
          type="checkbox"
          checked={assigned}
          disabled={disabled}
          aria-label={`Assign ${row.display_name}`}
          onChange={(event) => stage([row], event.target.checked)}
        />
        <span className="job-employee-avatar" aria-hidden>
          {row.display_name.slice(0, 1).toUpperCase()}
        </span>
        <span className="job-employee-identity">
          <strong title={row.display_name}>{row.display_name}</strong>
          <span>
            {row.employee_code} · {row.location_name ?? "No location"}
          </span>
          {row.disabled_reason && <small>{row.disabled_reason}</small>}
        </span>
        <span className="job-employee-meta">
          {row.is_primary && assigned && (
            <span className="job-primary-tag">Primary</span>
          )}
        </span>
      </label>
    );
  }
  return (
    <CatalogDrawer
      label={createMode ? "Add job" : `Edit job: ${baseline.name}`}
      className="job-assignment-drawer"
      onClose={requestClose}
      busy={busy}
      onEscape={() => {
        if (discard) {
          setDiscard(false);
          searchInput.current?.focus();
        } else requestClose();
      }}
    >
      <form
        className="job-catalog-editor"
        onSubmit={(event) => {
          event.preventDefault();
          if (
            !busy &&
            (detailsDirty || pending.size) &&
            (!detailsDirty || canManageJob) &&
            (!pending.size || canEdit)
          )
            save.mutate();
        }}
      >
        <header className="job-drawer-header">
          <div className="job-drawer-heading">
            <span
              className="job-drawer-job-icon"
              style={{ backgroundColor: jobDraft.color }}
            >
              <Users size={22} aria-hidden />
            </span>
            <div>
              <p className="job-drawer-department">{departmentName}</p>
              <h2 id="job-assignment-title" title={baseline.name}>
                {createMode ? "New job" : baseline.name}
              </h2>
              {canRead && (
                <span>
                  {data.data
                    ? `${data.data.assigned_count} ${data.data.assigned_count === 1 ? "employee" : "employees"} assigned`
                    : "… employees assigned"}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            className="job-icon-button"
            aria-label="Close job editor"
            onClick={requestClose}
            disabled={busy}
          >
            <X size={20} />
          </button>
        </header>
        <div className="catalog-drawer-body">
          <fieldset
            className="job-details-fields"
            disabled={busy || !canManageJob}
          >
            <legend className="job-details-legend">Details</legend>
            <div className="job-field">
              <label htmlFor="edit-job-name">Job name</label>
              <div className="job-name-color">
                <input
                  id="edit-job-name"
                  required
                  maxLength={100}
                  value={jobDraft.name}
                  onChange={(event) => {
                    setNotice(null);
                    setJobDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }));
                  }}
                  {...letterRuleProps(jobDraft.name, "edit-job-name-error")}
                />
                <JobColorInput
                  label="Job color"
                  value={jobDraft.color}
                  onChange={(color) => {
                    setNotice(null);
                    setJobDraft((current) => ({ ...current, color }));
                  }}
                />
              </div>
              <LetterRuleError value={jobDraft.name} id="edit-job-name-error" />
            </div>
            <label className="job-field">
              <span>Department</span>
              <select
                value={jobDraft.department_id ?? ""}
                onChange={(event) => {
                  setNotice(null);
                  setJobDraft((current) => ({
                    ...current,
                    department_id: event.target.value || null,
                  }));
                }}
              >
                <option value="">No department</option>
                {departments
                  .filter(
                    (item) =>
                      !item.archived_at || item.id === jobDraft.department_id,
                  )
                  .map((item) => (
                    <option
                      key={item.id}
                      value={item.id}
                      disabled={Boolean(item.archived_at)}
                    >
                      {item.name}
                      {item.archived_at ? " (archived)" : ""}
                    </option>
                  ))}
              </select>
            </label>
          </fieldset>
          {(error || notice) && (
            <div
              className={error ? "job-error" : "job-save-notice"}
              role={error ? "alert" : "status"}
            >
              {error ?? notice}
              {error && reloadable && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void reloadConflicts()}
                >
                  Reload latest
                </button>
              )}
            </div>
          )}
          {canRead && (
            <section className="job-drawer-employees" aria-label="Employees">
              <div className="job-drawer-controls">
                <div className="job-drawer-intro">
                  <h3>Employees</h3>
                </div>
                {job?.archived_at && (
                  <p className="job-hint">
                    This job is archived. Restore it to change assignments.
                  </p>
                )}
                <div className="job-drawer-search-row">
                  <label className="job-search">
                    <Search size={16} />
                    <input
                      ref={searchInput}
                      aria-label="Search employees"
                      placeholder="Search name or employee code"
                      value={search}
                      disabled={busy}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.preventDefault();
                      }}
                      onChange={(event) => {
                        setSearch(event.target.value);
                        setPage(0);
                      }}
                    />
                  </label>
                  <select
                    aria-label="Filter employees by location"
                    value={location}
                    disabled={busy}
                    onChange={(event) => {
                      setLocation(event.target.value);
                      setPage(0);
                    }}
                  >
                    <option value="">All locations</option>
                    {data.data?.locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="job-drawer-filter-row">
                  <div
                    className="job-view-control"
                    aria-label="Assignment filter"
                  >
                    {(["all", "assigned", "unassigned"] as const).map(
                      (value) => (
                        <button
                          type="button"
                          key={value}
                          aria-pressed={filter === value}
                          disabled={busy}
                          onClick={() => {
                            setFilter(value);
                            setPage(0);
                          }}
                        >
                          {value === "all"
                            ? "All"
                            : value === "assigned"
                              ? "Assigned"
                              : "Not assigned"}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              </div>
              <div
                ref={employeeList}
                className="job-employee-list"
                role="region"
                aria-label="Employee list"
                tabIndex={0}
                aria-busy={data.isFetching || busy}
              >
                {data.isPending ? (
                  <div className="job-empty-state" role="status">
                    Loading employees…
                  </div>
                ) : data.isError ? (
                  <div className="job-error" role="alert">
                    {errorText(data.error)}{" "}
                    <button type="button" onClick={() => void data.refetch()}>
                      Retry
                    </button>
                  </div>
                ) : rows.length ? (
                  rows.map(employeeRow)
                ) : (
                  <div className="job-empty-state">
                    <Users size={24} />
                    <h3>No employees found</h3>
                    <p>Try another search or assignment filter.</p>
                  </div>
                )}
              </div>
              <div className="job-drawer-pagination">
                <span>
                  {data.data?.total
                    ? `${page * 50 + 1}–${Math.min((page + 1) * 50, data.data.total)} of ${data.data.total}`
                    : "0 employees"}
                </span>
                <div>
                  <button
                    className="job-icon-button"
                    type="button"
                    aria-label="Previous employee page"
                    disabled={page === 0 || busy || data.isFetching}
                    onClick={() => setPage((current) => current - 1)}
                  >
                    <ChevronLeft size={17} />
                  </button>
                  <button
                    className="job-icon-button"
                    type="button"
                    aria-label="Next employee page"
                    disabled={
                      (page + 1) * 50 >= (data.data?.total ?? 0) ||
                      busy ||
                      data.isFetching
                    }
                    onClick={() => setPage((current) => current + 1)}
                  >
                    <ChevronRight size={17} />
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>
        <p className="job-change-summary" aria-live="polite">
          {[
            detailsDirty ? "Job details changed" : "",
            pending.size
              ? `${additions} to assign · ${removals} to remove`
              : "",
          ]
            .filter(Boolean)
            .join(" · ") || "No pending changes"}
        </p>
        <footer className="job-editor-footer">
          {context?.permissions.includes("settings.jobs.manage") &&
            !createMode &&
            context?.permissions.includes("employees.manage") && (
              <CatalogDeleteAction
                kind="jobs"
                id={job!.id}
                name={baseline.name}
                workspaceId={workspaceId}
                disabled={save.isPending || bulkBusy}
                onLockChange={setDeleteLocked}
                onDeleted={onClose}
                note={
                  pending.size || detailsDirty
                    ? "Pending job and assignment changes will be discarded."
                    : undefined
                }
              />
            )}
          <div className="job-editor-actions">
            <button
              type="button"
              className="job-secondary-button"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="job-primary-button"
              type="submit"
              disabled={
                busy ||
                (!createMode && !detailsDirty && !pending.size) ||
                !jobInputSchema.safeParse(jobDraft).success ||
                ((createMode || detailsDirty) && !canManageJob) ||
                (pending.size > 0 && !canEdit)
              }
            >
              {save.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </footer>
      </form>
      <div ref={dialog}>
        {discard && (
          <div className="job-discard-backdrop">
            <div
              className="job-discard-dialog"
              data-discard
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="job-discard-title"
            >
              <h3 id="job-discard-title">Discard changes?</h3>
              <p>
                Your job and employee assignment changes have not been saved.
              </p>

              <div>
                <button
                  data-keep-editing
                  type="button"
                  className="job-secondary-button"
                  disabled={busy}
                  onClick={() => {
                    setDiscard(false);
                    searchInput.current?.focus();
                  }}
                >
                  Keep editing
                </button>
                <button
                  type="button"
                  className="job-danger-button"
                  disabled={busy}
                  onClick={onClose}
                >
                  Discard changes
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </CatalogDrawer>
  );
}
