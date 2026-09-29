import type {
  ScheduleDraftSummary,
  ScheduleEditSession,
  ScheduleReadModel,
  ScheduleTemplateSummary,
} from "@newfork/shared/schedule";
import { ConfirmButton } from "@newfork/ui";
import { Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

export const TEMPLATE_NO_DEPARTMENT_KEY = "__no_department__";

export function ScheduleTemplatesDialog({
  templates,
  drafts,
  session,
  departments = [],
  onClose,
  onCreate,
  onRename,
  onDelete,
  onApply,
}: {
  readonly templates: readonly ScheduleTemplateSummary[];
  readonly drafts: readonly ScheduleDraftSummary[];
  readonly session: ScheduleEditSession | null;
  readonly departments?: ScheduleReadModel["departments"];
  readonly onClose: () => void;
  readonly onCreate: (
    draftId: string,
    name: string,
    stripAssignments: boolean,
  ) => Promise<unknown>;
  readonly onRename: (
    template: ScheduleTemplateSummary,
    name: string,
  ) => Promise<unknown>;
  readonly onDelete: (template: ScheduleTemplateSummary) => Promise<unknown>;
  readonly onApply: (
    templateId: string,
    mode: "merge" | "overwrite",
    departmentKeys: readonly string[] | null,
  ) => Promise<unknown>;
}) {
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? "");
  const selected = templates.find((item) => item.id === selectedId) ?? null;
  const [draftId, setDraftId] = useState(drafts[0]?.id ?? "");
  const [name, setName] = useState("");
  const [stripAssignments, setStripAssignments] = useState(true);
  const [rename, setRename] = useState(selected?.name ?? "");
  const departmentOptions = useMemo(
    () => [
      ...departments.map((department) => ({
        key: department.id,
        label: department.name,
      })),
      ...(departments.length
        ? [{ key: TEMPLATE_NO_DEPARTMENT_KEY, label: "No department" }]
        : []),
    ],
    [departments],
  );
  const allDepartmentKeys = useMemo(
    () => departmentOptions.map((department) => department.key),
    [departmentOptions],
  );
  const [selectedDepartmentKeys, setSelectedDepartmentKeys] =
    useState<readonly string[]>(allDepartmentKeys);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (selectedId && templates.some((template) => template.id === selectedId))
      return;
    setSelectedId(templates[0]?.id ?? "");
  }, [selectedId, templates]);
  useEffect(() => {
    setRename(selected?.name ?? "");
  }, [selected?.id, selected?.name]);
  useEffect(() => {
    setSelectedDepartmentKeys((current) => {
      const validSelection = current.filter((key) =>
        allDepartmentKeys.includes(key),
      );
      if (validSelection.length) return validSelection;
      return allDepartmentKeys;
    });
  }, [allDepartmentKeys]);
  const run = async (action: () => Promise<unknown>) => {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setPending(false);
    }
  };
  const choose = (template: ScheduleTemplateSummary) => {
    setSelectedId(template.id);
    setRename(template.name);
    setSelectedDepartmentKeys(allDepartmentKeys);
  };
  const toggleDepartmentKey = (key: string) => {
    setSelectedDepartmentKeys((current) =>
      current.includes(key)
        ? current.filter((selectedKey) => selectedKey !== key)
        : [...current, key],
    );
  };
  const allDepartmentsSelected =
    allDepartmentKeys.length === 0 ||
    allDepartmentKeys.every((key) => selectedDepartmentKeys.includes(key));
  const hasDepartmentSelection =
    allDepartmentKeys.length === 0 || selectedDepartmentKeys.length > 0;
  const departmentKeysForApply = allDepartmentsSelected
    ? null
    : selectedDepartmentKeys;
  const hasExistingShifts = Boolean(session?.shifts.length);
  return (
    <Dialog
      title="Schedule templates"
      description="Save a draft as a reusable week, then apply it to the schedule you are editing."
      onClose={onClose}
    >
      <div className="schedule-tool-dialog schedule-template-dialog">
        <section>
          <h3>Saved templates</h3>
          <div className="schedule-template-list">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                aria-pressed={template.id === selectedId}
                onClick={() => choose(template)}
              >
                <strong>{template.name}</strong>
                <small>
                  {template.shift_count}{" "}
                  {template.shift_count === 1 ? "shift" : "shifts"} ·{" "}
                  {template.open_slot_count} open · Revision {template.revision}
                </small>
              </button>
            ))}
            {!templates.length ? <p>No templates saved yet.</p> : null}
          </div>
          {selected ? (
            <div className="schedule-template-actions">
              <label>
                Template name
                <input
                  value={rename}
                  maxLength={80}
                  onChange={(event) => setRename(event.target.value)}
                />
              </label>
              <div>
                <button
                  type="button"
                  disabled={pending || !rename.trim()}
                  onClick={() =>
                    void run(() => onRename(selected, rename.trim()))
                  }
                >
                  Rename
                </button>
                <ConfirmButton
                  unstyled
                  className="danger-text"
                  disabled={pending}
                  confirmLabel={
                    <>
                      <Trash2 size={14} /> Confirm delete
                    </>
                  }
                  onConfirm={() => void run(() => onDelete(selected))}
                >
                  <Trash2 size={14} /> Delete
                </ConfirmButton>
              </div>
              {session ? (
                <>
                  <p className="schedule-template-apply-summary">
                    Apply "{selected.name}" ({selected.shift_count}{" "}
                    {selected.shift_count === 1 ? "shift" : "shifts"}) to this
                    working copy. Shifts stay in draft until you publish.
                  </p>
                  {departmentOptions.length ? (
                    <div
                      className="schedule-template-departments"
                      data-apply-template-departments
                    >
                      <div>
                        <strong>Departments</strong>
                        <span>Only selected department shifts are applied.</span>
                      </div>
                      <div>
                        {departmentOptions.map((department) => (
                          <label key={department.key}>
                            <input
                              type="checkbox"
                              checked={selectedDepartmentKeys.includes(
                                department.key,
                              )}
                              onChange={() =>
                                toggleDepartmentKey(department.key)
                              }
                            />
                            {department.label}
                          </label>
                        ))}
                      </div>
                      {!hasDepartmentSelection ? (
                        <p>Select at least one department to apply.</p>
                      ) : null}
                    </div>
                  ) : null}
                  {hasExistingShifts ? (
                    <p className="schedule-template-apply-summary">
                      This schedule already has shifts. Merge keeps them and
                      adds the template on top; Overwrite clears them first.
                    </p>
                  ) : null}
                  <div className="schedule-template-apply-actions">
                    {hasExistingShifts ? (
                      <button
                        type="button"
                        className="danger-text"
                        disabled={pending || !hasDepartmentSelection}
                        onClick={() =>
                          void run(() =>
                            onApply(
                              selected.id,
                              "overwrite",
                              departmentKeysForApply,
                            ),
                          )
                        }
                      >
                        Overwrite
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="primary-command"
                      disabled={pending || !hasDepartmentSelection}
                      onClick={() =>
                        void run(() =>
                          onApply(
                            selected.id,
                            "merge",
                            departmentKeysForApply,
                          ),
                        )
                      }
                    >
                      {hasExistingShifts ? "Merge" : "Apply template"}
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </section>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await onCreate(draftId, name.trim(), stripAssignments);
              setName("");
            });
          }}
        >
          <h3>New template from a draft</h3>
          <label>
            Draft
            <select
              value={draftId}
              onChange={(event) => setDraftId(event.target.value)}
            >
              <option value="">Select draft</option>
              {drafts.map((draft) => (
                <option key={draft.id} value={draft.id}>
                  {draft.name} · revision {draft.revision}
                </option>
              ))}
            </select>
          </label>
          <label>
            Template name
            <input
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <label className="schedule-check">
            <input
              type="checkbox"
              checked={stripAssignments}
              onChange={(event) => setStripAssignments(event.target.checked)}
            />{" "}
            Save shifts as open slots
          </label>
          <button
            type="submit"
            className="primary-command"
            disabled={pending || !draftId || !name.trim()}
          >
            Create template
          </button>
        </form>
        {error ? (
          <p className="schedule-overwrite-warning" role="alert">
            {error}
          </p>
        ) : null}
        <div className="schedule-dialog-actions">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function Dialog({
  title,
  description,
  onClose,
  children,
}: {
  readonly title: string;
  readonly description: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  return (
    <div
      className="schedule-dialog-layer"
      role="presentation"
      data-schedule-quiet-dialog
    >
      <button
        type="button"
        className="schedule-dialog-backdrop"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <section
        className="schedule-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-template-dialog-title"
        aria-describedby="schedule-template-dialog-description"
      >
        <header>
          <div className="schedule-quiet-dialog-heading">
            <h2 id="schedule-template-dialog-title">{title}</h2>
            <p id="schedule-template-dialog-description">{description}</p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
