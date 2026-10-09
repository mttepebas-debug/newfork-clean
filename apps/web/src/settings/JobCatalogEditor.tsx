import { useAuth } from "../auth/AuthContext";
import { CatalogDrawer } from "./CatalogDrawer";
import { useMutation } from "@tanstack/react-query";
import { Fragment, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import {
  departmentInputSchema,
  departmentValuesSchema,
  jobInputSchema,
  jobValuesSchema,
  type Department,
  type Job,
} from "@newfork/shared";
import { breaksLetterRule, LetterRuleError, letterRuleProps } from "../shell/us-text";
import {
  createDepartmentWithJobs,
  createDepartmentJobs,
  updateDepartmentWithJobs,
} from "./jobs-management-data";
import { saveJob } from "./organization-data";
import { errorText } from "./GeneralSettingsPage";
import { CatalogDeleteAction } from "./CatalogDeleteAction";

export type CatalogEditor = {
  type: "departments" | "jobs";
  item?: Department | Job;
  departmentId?: string;
};
type DraftRow = { key: number; name: string; color: string };

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function JobColorInput({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className="job-color-control"
      title={label}
      style={{ backgroundColor: value }}
    >
      <input
        aria-label={label}
        disabled={disabled}
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
export function JobCatalogEditor({
  editor,
  workspaceId,
  departments,
  jobs,
  onClose,
  onSaved,
  onCreatedJob,
}: {
  editor: CatalogEditor;
  workspaceId: string;
  departments: Department[];
  jobs: Job[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  onCreatedJob?: (job: Job) => void;
}) {
  const canEdit =
    useAuth().context?.permissions.includes("settings.jobs.manage") ?? false;
  const isJob = editor.type === "jobs";
  const existingDepartment =
    isJob && !editor.item && Boolean(editor.departmentId);
  const bundled = !isJob || existingDepartment;
  const [name, setName] = useState(editor.item?.name ?? "");
  const [color, setColor] = useState(
    editor.item?.color ?? (isJob ? "#4478A8" : "#3C7A68"),
  );
  const [departmentId, setDepartmentId] = useState(
    (isJob ? (editor.item as Job | undefined)?.department_id : null) ??
      editor.departmentId ??
      "",
  );
  const [rows, setRows] = useState<DraftRow[]>([
    { key: 0, name: "", color: "#4478A8" },
  ]);
  const nextKey = useRef(1),
    inputs = useRef(new Map<number, HTMLInputElement>());
  const [error, setError] = useState<string | null>(null);
  const [deleteLocked, setDeleteLocked] = useState(false);
  const noun = existingDepartment ? "jobs" : isJob ? "job" : "department";
  const initialEntity =
    editor.item && !existingDepartment
      ? isJob
        ? jobValuesSchema.parse(editor.item)
        : departmentValuesSchema.parse(editor.item)
      : null;
  const rowDrafts = rows
    .filter((row, index) => index < rows.length - 1 || row.name.trim())
    .map(({ name: jobName, color: jobColor }) => ({
      name: jobName,
      color: jobColor,
    }));
  const rowsReady = rowDrafts.every(
    (row) => Boolean(row.name.trim()) && !breaksLetterRule(row.name),
  );
  const entityReady = existingDepartment
    ? true
    : isJob
      ? jobInputSchema.safeParse({
          name,
          color,
          department_id: departmentId || null,
        }).success
      : departmentInputSchema.safeParse({ name, color }).success;
  const entityDirty =
    !initialEntity ||
    !sameJson(
      isJob
        ? {
            name: name.trim(),
            color,
            department_id: departmentId || null,
          }
        : { name: name.trim(), color },
      initialEntity,
    );
  const rowsDirty = rowDrafts.length > 0;
  function validateUnique(
    value: string,
    existing: (Job | Department)[],
    except?: string,
  ) {
    if (
      existing.some(
        (item) =>
          item.id !== except &&
          !item.archived_at &&
          item.name.toLowerCase() === value.trim().toLowerCase(),
      )
    )
      throw new Error(
        `“${value.trim()}” already exists. Choose a unique name.`,
      );
  }
  const save = useMutation({
    mutationFn: async () => {
      setError(null);
      if (!existingDepartment)
        validateUnique(name, isJob ? jobs : departments, editor.item?.id);
      if (isJob && !bundled)
        return saveJob(
          workspaceId,
          jobInputSchema.parse({
            name,
            color,
            department_id: departmentId || null,
          }),
          editor.item?.id,
        );
      const nonempty = rows.filter(
        (row, index) => index < rows.length - 1 || row.name.trim(),
      );
      const seen = new Set<string>();
      for (const row of nonempty) {
        if (!row.name.trim())
          throw new Error("Enter a job name or remove its row.");
        validateUnique(row.name, jobs);
        const normalized = row.name.trim().toLowerCase();
        if (seen.has(normalized))
          throw new Error(`“${row.name.trim()}” appears more than once.`);
        seen.add(normalized);
      }
      const jobInputs = nonempty.map(({ name: jobName, color: jobColor }) => ({
        name: jobName,
        color: jobColor,
      }));
      if (existingDepartment) {
        if (!jobInputs.length) throw new Error("Enter at least one job name.");
        await createDepartmentJobs(
          workspaceId,
          editor.departmentId!,
          jobInputs,
        );
      } else if (editor.item) {
        await updateDepartmentWithJobs(workspaceId, editor.item.id, {
          department: departmentInputSchema.parse({ name, color }),
          jobs: jobInputs,
        });
      } else
        await createDepartmentWithJobs(workspaceId, {
          department: departmentInputSchema.parse({ name, color }),
          jobs: jobInputs,
        });
    },
    onSuccess: async (result) => {
      await onSaved();
      if (isJob && !editor.item && !bundled && result) {
        onCreatedJob?.(result);
        return;
      }
      onClose();
    },
    onError: (cause) => setError(errorText(cause)),
  });
  const canSave =
    canEdit &&
    !save.isPending &&
    !deleteLocked &&
    entityReady &&
    rowsReady &&
    (!existingDepartment || rowDrafts.length > 0) &&
    (!editor.item || entityDirty || rowsDirty);
  function advance(index: number) {
    const row = rows[index];
    if (!row?.name.trim()) return;
    try {
      jobInputSchema.parse({
        name: row.name,
        color: row.color,
        department_id: null,
      });
      validateUnique(row.name, jobs);
      if (
        rows.some(
          (item, i) =>
            i !== index &&
            item.name.trim().toLowerCase() === row.name.trim().toLowerCase(),
        )
      )
        throw new Error("Each job needs a unique name.");
    } catch (cause) {
      setError(errorText(cause));
      return;
    }
    setError(null);
    if (index < rows.length - 1) {
      inputs.current.get(rows[index + 1]!.key)?.focus();
      return;
    }
    const key = nextKey.current++;
    setRows((current) => [...current, { key, name: "", color: "#4478A8" }]);
    requestAnimationFrame(() => inputs.current.get(key)?.focus());
  }
  return (
    <CatalogDrawer
      label={`${editor.item ? "Edit" : "Add"} ${noun}`}
      onClose={onClose}
      busy={save.isPending || deleteLocked}
    >
      <form
        className="job-catalog-editor"
        aria-label={`${editor.item ? "Edit" : "Add"} ${noun}`}
        onSubmit={(event) => {
          event.preventDefault();
          if (canSave) save.mutate();
        }}
      >
        <div className="job-editor-title">
          <div>
            <h2>
              {existingDepartment
                ? `Add jobs to ${departments.find((item) => item.id === editor.departmentId)?.name ?? "department"}`
                : `${editor.item ? "Edit" : "New"} ${noun}`}
            </h2>
            <p>
              {existingDepartment
                ? "Add as many jobs as you need, then save them together."
                : bundled
                  ? editor.item
                    ? "Update this department and add jobs below."
                    : "Create a department and the jobs that belong to it."
                  : "Keep your team structure up to date."}
            </p>
          </div>
          <button
            type="button"
            className="job-icon-button"
            aria-label="Close editor"
            onClick={onClose}
            disabled={save.isPending || deleteLocked}
          >
            <X size={17} />
          </button>
        </div>
        <div className="catalog-drawer-body">
          <fieldset disabled={!canEdit || save.isPending || deleteLocked}>
            {!existingDepartment && (
              <div className="job-field">
                <label htmlFor="catalog-entity-name">
                  {isJob ? "Job name" : "Department name"}
                </label>
                <div className="job-name-color">
                  <input
                    id="catalog-entity-name"
                    required
                    maxLength={100}
                    value={name}
                    placeholder={isJob ? "e.g. Server" : "e.g. Front of house"}
                    onChange={(event) => setName(event.target.value)}
                    {...letterRuleProps(name, "catalog-entity-name-error")}
                    onKeyDown={(event) => {
                      if (
                        bundled &&
                        event.key === "Enter" &&
                        !event.nativeEvent.isComposing
                      ) {
                        event.preventDefault();
                        inputs.current.get(rows[0]!.key)?.focus();
                      }
                    }}
                  />
                  <JobColorInput
                    label={`${isJob ? "Job" : "Department"} color`}
                    value={color}
                    onChange={setColor}
                  />
                </div>
                <LetterRuleError value={name} id="catalog-entity-name-error" />
              </div>
            )}
            {isJob && !existingDepartment && (
              <label className="job-field">
                <span>Department</span>
                <select
                  value={departmentId}
                  onChange={(event) => setDepartmentId(event.target.value)}
                >
                  <option value="">No department</option>
                  {departments
                    .filter(
                      (item) => !item.archived_at || item.id === departmentId,
                    )
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                        {item.archived_at ? " (archived)" : ""}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {bundled && (
              <div className="job-draft-list">
                <div className="job-section-label">
                  <span>Jobs</span>
                  <span>
                    {rows.filter((row) => row.name.trim()).length} added
                  </span>
                </div>
                {rows.map((row, index) => (
                  <Fragment key={row.key}>
                  <div className="job-draft-row">
                    <input
                      ref={(element) => {
                        if (element) inputs.current.set(row.key, element);
                        else inputs.current.delete(row.key);
                      }}
                      aria-label={`Job name ${index + 1}`}
                      {...letterRuleProps(row.name, `job-row-${row.key}-error`)}
                      placeholder="Add a job…"
                      maxLength={100}
                      value={row.name}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((item) =>
                            item.key === row.key
                              ? { ...item, name: event.target.value }
                              : item,
                          ),
                        )
                      }
                      onKeyDown={(event) => {
                        if (
                          event.key === "Enter" &&
                          !event.nativeEvent.isComposing
                        ) {
                          event.preventDefault();
                          advance(index);
                        }
                      }}
                    />
                    <JobColorInput
                      label={`Job color ${index + 1}`}
                      value={row.color}
                      onChange={(value) =>
                        setRows((current) =>
                          current.map((item) =>
                            item.key === row.key
                              ? { ...item, color: value }
                              : item,
                          ),
                        )
                      }
                    />
                    {index === rows.length - 1 ? (
                      <button
                        className="job-small-button"
                        type="button"
                        disabled={!row.name.trim()}
                        onClick={() => advance(index)}
                      >
                        <Plus size={14} />
                        Add
                      </button>
                    ) : (
                      <button
                        className="job-icon-button"
                        type="button"
                        aria-label={`Remove job ${index + 1}`}
                        onClick={() => {
                          const key =
                            rows[index + 1]?.key ?? rows[index - 1]?.key;
                          setRows((current) =>
                            current.filter((item) => item.key !== row.key),
                          );
                          requestAnimationFrame(() => {
                            if (key !== undefined)
                              inputs.current.get(key)?.focus();
                          });
                        }}
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                  <LetterRuleError value={row.name} id={`job-row-${row.key}-error`} />
                  </Fragment>
                ))}
                <p className="job-hint">
                  Press Enter for the next job. Jobs can also be added later.
                </p>
              </div>
            )}
          </fieldset>
          {error && (
            <p className="job-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="job-editor-footer">
          {editor.item && (
            <CatalogDeleteAction
              kind={editor.type}
              id={editor.item.id}
              name={editor.item.name}
              workspaceId={workspaceId}
              disabled={!canEdit || save.isPending}
              onLockChange={setDeleteLocked}
              onDeleted={onClose}
            />
          )}
          <div className="job-editor-actions">
            <button
              className="job-secondary-button"
              type="button"
              onClick={onClose}
              disabled={save.isPending || deleteLocked}
            >
              Cancel
            </button>
            <button
              className="job-primary-button"
              type="submit"
              disabled={!canSave}
            >
              {save.isPending ? "Saving…" : `Save ${noun}`}
            </button>
          </div>
        </div>
      </form>
    </CatalogDrawer>
  );
}
