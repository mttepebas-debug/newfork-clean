import {
  departmentInputSchema,
  jobInputSchema,
  type Department,
  type DepartmentInput,
  type Job,
  type JobInput,
} from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  BriefcaseBusiness,
  Building,
  Pencil,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { errorText, SettingsHeader } from "./GeneralSettingsPage";
import {
  listDepartments,
  listJobs,
  reorderOrganizationEntities,
  saveDepartment,
  saveJob,
  setDepartmentArchived,
  setJobArchived,
} from "./organization-data";

type View = "departments" | "jobs";
type Editor = { type: View; item?: Department | Job };
const defaultDepartment: DepartmentInput = { name: "", color: "#3C7A68" };
const defaultJob: JobInput = {
  name: "",
  color: "#4478A8",
  department_id: null,
};

export default function JobsSettingsPage() {
  const { context } = useAuth();
  const queryClient = useQueryClient();
  const workspaceId = context?.workspace.id ?? "";
  const queryKey = ["organization-jobs", workspaceId];
  const data = useQuery({
    queryKey,
    queryFn: async () => {
      const [departments, jobs] = await Promise.all([
        listDepartments(workspaceId),
        listJobs(workspaceId),
      ]);
      return { departments, jobs };
    },
    enabled: Boolean(workspaceId),
  });
  const [view, setView] = useState<View>("departments");
  const [showArchived, setShowArchived] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [departmentDraft, setDepartmentDraft] =
    useState<DepartmentInput>(defaultDepartment);
  const [jobDraft, setJobDraft] = useState<JobInput>(defaultJob);
  const [formError, setFormError] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!editor) return;
      if (editor.type === "departments") {
        await saveDepartment(
          workspaceId,
          departmentInputSchema.parse(departmentDraft),
          editor.item?.id,
        );
      } else {
        await saveJob(
          workspaceId,
          jobInputSchema.parse(jobDraft),
          editor.item?.id,
        );
      }
    },
    onSuccess: async () => {
      await refresh();
      setEditor(null);
      setFormError(null);
    },
    onError: (error) => setFormError(errorText(error)),
  });
  const archiveMutation = useMutation({
    mutationFn: async ({
      type,
      id,
      archived,
    }: {
      type: View;
      id: string;
      archived: boolean;
    }) => {
      if (type === "departments")
        await setDepartmentArchived(workspaceId, id, archived);
      else await setJobArchived(workspaceId, id, archived);
    },
    onSuccess: refresh,
    onError: (error) => setFormError(errorText(error)),
  });
  const reorderMutation = useMutation({
    mutationFn: ({ type, ids }: { type: View; ids: readonly string[] }) =>
      reorderOrganizationEntities(workspaceId, type, ids),
    onSuccess: refresh,
    onError: (error) => setFormError(errorText(error)),
  });

  const openEditor = (type: View, item?: Department | Job): void => {
    setEditor({ type, ...(item ? { item } : {}) });
    if (type === "departments")
      setDepartmentDraft(
        item ? departmentInputSchema.parse(item) : defaultDepartment,
      );
    else setJobDraft(item ? jobInputSchema.parse(item) : defaultJob);
    setFormError(null);
  };
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setFormError(null);
    saveMutation.mutate();
  };

  const departments = data.data?.departments ?? [];
  const jobs = data.data?.jobs ?? [];
  const rows = (view === "departments" ? departments : jobs).filter(
    (item) => showArchived || !item.archived_at,
  );
  const departmentNames = new Map(
    departments.map((department) => [department.id, department.name]),
  );
  const activeRows = (view === "departments" ? departments : jobs).filter(
    (item) => !item.archived_at,
  );
  const move = (id: string, offset: -1 | 1): void => {
    const currentIndex = activeRows.findIndex((item) => item.id === id);
    const nextIndex = currentIndex + offset;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= activeRows.length)
      return;
    const ids = activeRows.map((item) => item.id);
    [ids[currentIndex], ids[nextIndex]] = [ids[nextIndex]!, ids[currentIndex]!];
    reorderMutation.mutate({ type: view, ids });
  };

  return (
    <section
      className="settings-page"
      aria-labelledby="jobs-&-departments-settings-title"
    >
      <SettingsHeader
        icon={<BriefcaseBusiness size={21} aria-hidden />}
        title="Jobs & departments"
        description="The operating structure used for employee assignments and schedule rows."
        action={
          <Button type="button" onClick={() => openEditor(view)}>
            <Plus size={16} aria-hidden />
            Add {view === "jobs" ? "job" : "department"}
          </Button>
        }
      />
      <div className="settings-toolbar">
        <div
          className="two-tab-control"
          role="tablist"
          aria-label="Jobs settings view"
        >
          <button
            type="button"
            role="tab"
            aria-selected={view === "departments"}
            onClick={() => {
              setView("departments");
              setEditor(null);
            }}
          >
            Departments
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "jobs"}
            onClick={() => {
              setView("jobs");
              setEditor(null);
            }}
          >
            Jobs
          </button>
        </div>
        <label className="archive-filter">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
          />
          Show archived
        </label>
      </div>
      {editor ? (
        <form
          className="entity-editor compact-editor"
          onSubmit={submit}
          aria-label={`${editor.item ? "Edit" : "Add"} ${editor.type === "jobs" ? "job" : "department"}`}
        >
          <div className="entity-editor-heading">
            <div>
              <strong>
                {editor.item ? "Edit" : "New"}{" "}
                {editor.type === "jobs" ? "job" : "department"}
              </strong>
              <span>Names must be unique within this organization.</span>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Close editor"
              title="Close"
              onClick={() => setEditor(null)}
            >
              <X size={17} aria-hidden />
            </button>
          </div>
          <div className="job-fields">
            <label className="form-field">
              <span>Name</span>
              <input
                value={
                  editor.type === "jobs" ? jobDraft.name : departmentDraft.name
                }
                maxLength={100}
                onChange={(event) =>
                  editor.type === "jobs"
                    ? setJobDraft((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    : setDepartmentDraft((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                }
                required
              />
            </label>
            {editor.type === "jobs" ? (
              <label className="form-field">
                <span>Department</span>
                <select
                  value={jobDraft.department_id ?? ""}
                  onChange={(event) =>
                    setJobDraft((current) => ({
                      ...current,
                      department_id: event.target.value || null,
                    }))
                  }
                >
                  <option value="">No department</option>
                  {departments
                    .filter((department) => !department.archived_at)
                    .map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                </select>
              </label>
            ) : null}
            <label className="form-field color-field">
              <span>Color</span>
              <input
                type="color"
                value={
                  editor.type === "jobs"
                    ? jobDraft.color
                    : departmentDraft.color
                }
                onChange={(event) =>
                  editor.type === "jobs"
                    ? setJobDraft((current) => ({
                        ...current,
                        color: event.target.value,
                      }))
                    : setDepartmentDraft((current) => ({
                        ...current,
                        color: event.target.value,
                      }))
                }
              />
            </label>
          </div>
          {formError ? (
            <p className="form-error" role="alert">
              {formError}
            </p>
          ) : null}
          <div className="entity-editor-actions">
            <Button
              className="secondary-button"
              type="button"
              onClick={() => setEditor(null)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending
                ? "Saving"
                : `Save ${editor.type === "jobs" ? "job" : "department"}`}
            </Button>
          </div>
        </form>
      ) : null}
      {!editor && formError ? (
        <p className="settings-state error" role="alert">
          {formError}
        </p>
      ) : null}
      {data.isLoading ? (
        <p className="settings-state">Loading organization structure...</p>
      ) : null}
      {data.error ? (
        <p className="settings-state error" role="alert">
          {errorText(data.error)}
        </p>
      ) : null}
      {!data.isLoading && !data.error && rows.length === 0 ? (
        <div className="settings-empty">
          {view === "jobs" ? (
            <BriefcaseBusiness size={22} aria-hidden />
          ) : (
            <Building size={22} aria-hidden />
          )}
          <strong>
            {showArchived ? `No archived ${view}` : `No ${view} yet`}
          </strong>
          <p>
            {view === "jobs"
              ? "Add jobs employees can be assigned to on the schedule."
              : "Group related jobs into departments."}
          </p>
        </div>
      ) : null}
      {rows.length > 0 ? (
        <div className="entity-list" aria-label={view}>
          {rows.map((item) => {
            const isDepartment = view === "departments";
            const activeJobs = isDepartment
              ? jobs.filter(
                  (job) => job.department_id === item.id && !job.archived_at,
                ).length
              : 0;
            const job = isDepartment ? null : (item as Job);
            const archiveBlocked =
              isDepartment && !item.archived_at && activeJobs > 0;
            return (
              <div
                className="entity-row"
                key={item.id}
                data-archived={Boolean(item.archived_at)}
              >
                <span
                  className="entity-marker"
                  style={{ backgroundColor: item.color }}
                  aria-hidden
                />
                <div className="entity-summary">
                  <strong>{item.name}</strong>
                  <span>
                    {isDepartment
                      ? `${activeJobs} active ${activeJobs === 1 ? "job" : "jobs"}`
                      : job?.department_id
                        ? (departmentNames.get(job.department_id) ??
                          "Unknown department")
                        : "No department"}
                  </span>
                </div>
                {item.archived_at ? (
                  <span className="status-label">Archived</span>
                ) : null}
                <div className="row-actions">
                  {!item.archived_at ? (
                    <>
                      <button
                        type="button"
                        className="icon-button"
                        disabled={
                          activeRows[0]?.id === item.id ||
                          reorderMutation.isPending
                        }
                        aria-label={`Move ${item.name} up`}
                        title="Move up"
                        onClick={() => move(item.id, -1)}
                      >
                        <ArrowUp size={16} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        disabled={
                          activeRows.at(-1)?.id === item.id ||
                          reorderMutation.isPending
                        }
                        aria-label={`Move ${item.name} down`}
                        title="Move down"
                        onClick={() => move(item.id, 1)}
                      >
                        <ArrowDown size={16} aria-hidden />
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Edit ${item.name}`}
                    title="Edit"
                    onClick={() => openEditor(view, item)}
                  >
                    <Pencil size={16} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    disabled={archiveBlocked}
                    aria-label={`${item.archived_at ? "Restore" : "Archive"} ${item.name}`}
                    title={
                      archiveBlocked
                        ? "Archive active jobs first"
                        : item.archived_at
                          ? "Restore"
                          : "Archive"
                    }
                    onClick={() =>
                      archiveMutation.mutate({
                        type: view,
                        id: item.id,
                        archived: !item.archived_at,
                      })
                    }
                  >
                    {item.archived_at ? (
                      <RotateCcw size={16} aria-hidden />
                    ) : (
                      <Archive size={16} aria-hidden />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
