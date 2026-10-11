import type {
  ScheduleDraftSummary,
  ScheduleEditSession,
  ScheduleReadModel,
  ScheduleTemplateSummary,
} from "@newfork/shared/schedule";
import { ConfirmButton, useConfirmClick } from "@newfork/ui";
import { Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useCloseOnEscape } from "../lib/useCloseOnEscape";
import { useDialogFocus } from "../lib/useDialogFocus";
import { requestErrorText } from "../../lib/request-error";

export const TEMPLATE_NO_DEPARTMENT_KEY = "__no_department__";

/**
 * KK-162 (BL-694): Replace asks twice; its first click says what it removes.
 * The database counts it (the template's locations and departments, never a
 * started shift); without the count the warning still names what goes.
 */
function ReplaceShiftsButton({
  countRemoved,
  disabled,
  onConfirm,
}: {
  readonly countRemoved: () => Promise<number>;
  readonly disabled: boolean;
  readonly onConfirm: () => void;
}) {
  const { armed, confirmProps } = useConfirmClick(onConfirm);
  const [removed, setRemoved] = useState<number | "counting" | "unknown">("counting");
  const countRemovedRef = useRef(countRemoved);
  countRemovedRef.current = countRemoved;
  useEffect(() => {
    if (!armed) return undefined;
    let current = true;
    setRemoved("counting");
    countRemovedRef.current().then(
      (count) => {
        if (current) setRemoved(count);
      },
      () => {
        if (current) setRemoved("unknown");
      },
    );
    return () => {
      current = false;
    };
  }, [armed]);
  return (
    <>
      {armed ? (
        <span className="schedule-template-replace-impact" role="status">
          {removed === "counting"
            ? "Counting the shifts it removes…"
            : removed === "unknown"
              ? "Shifts this template covers will be removed. Draft only, not published."
              : `${removed} ${removed === 1 ? "shift" : "shifts"} will be removed. Draft only, not published.`}
        </span>
      ) : null}
      <button
        type="button"
        className={`danger-text${armed ? " is-armed" : ""}`}
        disabled={disabled}
        data-confirming={armed}
        {...confirmProps}
      >
        {armed ? "Confirm replace" : "Replace current shifts"}
      </button>
    </>
  );
}

export function ScheduleTemplatesDialog({
  templates,
  drafts,
  session,
  departments = [],
  initialDraftId = null,
  onClose,
  onCreate,
  onRename,
  onDelete,
  onApply,
  onPreviewReplace,
}: {
  readonly templates: readonly ScheduleTemplateSummary[];
  readonly drafts: readonly ScheduleDraftSummary[];
  readonly session: ScheduleEditSession | null;
  readonly departments?: ScheduleReadModel["departments"];
  /** New Schedule ▾ → Save as template opens the window on the open draft (BL-705). */
  readonly initialDraftId?: string | null;
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
  /** How many shifts Replace would remove, counted by the database. */
  readonly onPreviewReplace: (
    templateId: string,
    departmentKeys: readonly string[] | null,
  ) => Promise<number>;
}) {
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? "");
  const selected = templates.find((item) => item.id === selectedId) ?? null;
  const [draftId, setDraftId] = useState(initialDraftId ?? drafts[0]?.id ?? "");
  const [name, setName] = useState("");
  // BL-038 K3: a template keeps who works each shift unless asked not to.
  const [stripAssignments, setStripAssignments] = useState(false);
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
      setError(requestErrorText(caught));
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
                  {template.open_slot_count} open
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
                      {/* BL-038 K4: every department applies unless narrowed here. */}
                      <details>
                        <summary>Only some departments</summary>
                        <span>Only selected department shifts are applied.</span>
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
                      </details>
                      {!hasDepartmentSelection ? (
                        <p>Select at least one department to apply.</p>
                      ) : null}
                    </div>
                  ) : null}
                  {hasExistingShifts ? (
                    <p className="schedule-template-apply-summary">
                      This schedule already has shifts. Add keeps them; Replace
                      first removes the ones this template covers that
                      haven&apos;t started.
                    </p>
                  ) : null}
                  <div className="schedule-template-apply-actions">
                    {hasExistingShifts ? (
                      <ReplaceShiftsButton
                        countRemoved={() =>
                          onPreviewReplace(selected.id, departmentKeysForApply)
                        }
                        disabled={pending || !hasDepartmentSelection}
                        onConfirm={() =>
                          void run(() =>
                            onApply(
                              selected.id,
                              "overwrite",
                              departmentKeysForApply,
                            ),
                          )
                        }
                      />
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
                      {hasExistingShifts ? "Add to current shifts" : "Apply template"}
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
                  {draft.name}
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
            Remove employee names (save as open shifts)
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
  useCloseOnEscape(onClose);
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(dialogRef);
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
        ref={dialogRef}
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
