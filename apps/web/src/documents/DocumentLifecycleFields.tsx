import {
  defaultDocumentLifecycleSettings,
  type DocumentLifecycleSettings,
  type DocumentTarget,
  type DocumentTypeInput,
} from "@newfork/shared";

import { useQuery } from "@tanstack/react-query";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import {
  ScheduleTopBarFilter,
  type ScheduleTopBarFilterId,
} from "../schedule/components/ScheduleTopBarFilter";

import { getDocumentTargetOptions } from "../settings/documents-data";

import { getPolicyTargetOptions } from "../settings/signature-templates-data";

import { errorText } from "../settings/GeneralSettingsPage";

export type DocumentEditorSection =
  "details" | "audience" | "rules" | "fields" | "review";

export function DocumentLifecycleFields({
  value,

  workspaceId,

  onChange,

  section,

  fieldErrorIndex,

  validationAttempt,
}: {
  value: DocumentTypeInput;

  workspaceId: string;

  onChange: (value: DocumentTypeInput) => void;

  section?: DocumentEditorSection | readonly DocumentEditorSection[];

  fieldErrorIndex?: number;

  validationAttempt?: number;
}) {
  return (
    <LifecycleAssignmentFields
      workspaceId={workspaceId}

      section={section}

      fieldErrorIndex={fieldErrorIndex}

      validationAttempt={validationAttempt}

      settings={value.lifecycle_settings ?? defaultDocumentLifecycleSettings}

      onChange={(settings) =>
        onChange({
          ...value,

          required_at_onboarding: settings.mode === "required",

          lifecycle_settings: { ...settings, assignment_scope: "all_active" },

          expiry_schedule_impact: "track_only",
        })
      }
    />
  );
}

export function LifecycleAssignmentFields({
  settings,

  workspaceId,

  onChange,

  kind = "document",

  section,

  fieldErrorIndex,

  validationAttempt,
}: {
  settings: DocumentLifecycleSettings;

  workspaceId: string;

  onChange: (value: DocumentLifecycleSettings) => void;

  kind?: "document" | "acknowledgement";

  section?: DocumentEditorSection | readonly DocumentEditorSection[];

  fieldErrorIndex?: number;

  validationAttempt?: number;
}) {
  const [fieldPage, setFieldPage] = useState(0);

  const compact = section !== undefined;

  const shows = (value: DocumentEditorSection) =>
    !section ||
    (typeof section === "string" ? section === value : section.includes(value));

  const lastFieldPage = Math.max(
    0,

    Math.ceil(settings.extra_fields.length / 2) - 1,
  );

  const currentFieldPage = Math.min(fieldPage, lastFieldPage);

  const fieldsRef = useRef<HTMLFieldSetElement>(null);

  useEffect(() => {
    if (fieldErrorIndex !== undefined)
      setFieldPage(Math.floor(fieldErrorIndex / 2));
  }, [fieldErrorIndex, validationAttempt]);

  useLayoutEffect(() => {
    if (
      fieldErrorIndex !== undefined &&
      currentFieldPage === Math.floor(fieldErrorIndex / 2)
    )
      fieldsRef.current

        ?.querySelector<HTMLInputElement>(
          `[data-extra-field-index="${fieldErrorIndex}"] input`,
        )

        ?.focus();
  }, [fieldErrorIndex, validationAttempt, currentFieldPage]);

  const options = useQuery({
    queryKey: ["document-target-options", workspaceId, kind],

    queryFn: () =>
      kind === "acknowledgement"
        ? getPolicyTargetOptions(workspaceId)
        : getDocumentTargetOptions(workspaceId),
  });

  const change = (patch: Partial<DocumentLifecycleSettings>) =>
    onChange({ ...settings, ...patch });

  const targetGroup = (
    label: string,

    key: "location_ids" | "department_ids" | "job_ids" | "employee_ids",

    items: { id: string; name: string }[],
  ) => {
    if (compact)
      return (
        <DocumentTargetDropdown
          label={label}
          items={items}
          selected={settings.target[key]}
          onChange={(ids) =>
            change({
              target: {
                ...settings.target,
                operator:
                  kind === "document" ? "and" : settings.target.operator,
                [key]: ids,
              },
            })
          }
        />
      );

    const choices = (
      <>
        <div className="document-options">
          {items.map((item) => (
            <label key={item.id}>
              <input
                type="checkbox"

                checked={settings.target[key].includes(item.id)}

                onChange={(event) =>
                  change({
                    target: {
                      ...settings.target,

                      [key]: event.target.checked
                        ? [...settings.target[key], item.id]
                        : settings.target[key].filter((id) => id !== item.id),
                    },
                  })
                }
              />

              <span>{item.name}</span>
            </label>
          ))}

          {!items.length && (
            <p>
              {compact ? "No matching" : "No available"} {label.toLowerCase()}.
            </p>
          )}
        </div>
      </>
    );

    return (
      <details>
        <summary>
          {label} ·{" "}
          {settings.target[key].length ||
            (key === "employee_ids" ? "None added" : "All")}
        </summary>

        {choices}
      </details>
    );
  };

  const assignmentScope = (
    <label className="job-field">
      <span>Assignment scope</span>

      <select
        value={settings.assignment_scope}

        data-document-field="assignment_scope"

        onChange={(event) =>
          change({
            assignment_scope: event.target
              .value as DocumentLifecycleSettings["assignment_scope"],
          })
        }
      >
        <option value="future_onboarding">Future onboarding</option>

        <option value="all_active">All active employees</option>
      </select>
    </label>
  );

  return (
    <>
      {shows("details") && (
        <label className="job-field">
          <span>Requirement</span>

          <select
            value={settings.mode}

            data-document-field="mode"

            onChange={(event) => {
              const mode = event.target
                .value as DocumentLifecycleSettings["mode"];

              change({
                mode,

                period_days:
                  mode === "conditional"
                    ? (settings.period_days ?? 7)
                    : mode === "optional"
                      ? null
                      : settings.period_days,

                suspend_on_overdue:
                  mode === "optional" ? false : settings.suspend_on_overdue,
              });
            }}
          >
            <option value="optional">Optional</option>

            <option value="required">Required</option>

            {kind === "document" && (
              <option value="conditional">Conditional</option>
            )}
          </select>
        </label>
      )}

      {shows("audience") && (
        <fieldset className="document-options">
          <legend>Who needs it</legend>

          {!compact && (
            <label className="job-field">
              <span>Match groups</span>

              <select
                value={settings.target.operator}

                data-document-field="operator"

                onChange={(event) =>
                  change({
                    target: {
                      ...settings.target,

                      operator: event.target
                        .value as DocumentTarget["operator"],
                    },
                  })
                }
              >
                <option value="and">All conditions (AND)</option>

                <option value="or">Any condition (OR)</option>
              </select>
            </label>
          )}

          {!compact && (
            <p>
              Empty groups are ignored. With no groups selected, everyone
              matches. Named people are added to the matches. Jobs apply at all
              of an employee's assigned locations.
            </p>
          )}

          {compact && (
            <p className="document-editor-hint">
              Employees must match the selected locations, departments and jobs
              together. All includes current and future options. Jobs apply
              across an employee's assigned locations.
            </p>
          )}
          {compact && settings.target.operator === "or" && (
            <p className="document-editor-hint">
              This existing document uses any-group matching. Changing a filter
              switches to matching all three groups together; review the new
              audience before publishing.
            </p>
          )}
          {compact && settings.target.employee_ids.length > 0 && (
            <p className="document-editor-hint">
              This existing document retains{" "}
              {settings.target.employee_ids.length} previously named employee
              targets. Saving does not remove them.
            </p>
          )}

          {options.error && <p role="alert">{errorText(options.error)}</p>}

          {options.isLoading && <p>Loading targeting options…</p>}

          {options.data && (
            <>
              {targetGroup("Locations", "location_ids", options.data.locations)}

              {targetGroup(
                "Departments",

                "department_ids",

                options.data.departments,
              )}

              {targetGroup("Jobs", "job_ids", options.data.jobs)}

              {!compact &&
                targetGroup(
                  "Named people",
                  "employee_ids",
                  options.data.employees,
                )}
            </>
          )}

          {!compact && assignmentScope}

          {!compact && (
            <p>
              Saving changes the definition for future assignments. Existing
              assignments keep their rules until you preview and apply the
              changes.
            </p>
          )}
        </fieldset>
      )}

      {compact && shows("details") && (
        <p className="document-editor-hint">
          After saving and publishing, applies to matching active employees,
          future onboarding and employees restored from archive. Individual
          exemptions remain in effect.
        </p>
      )}

      {shows("rules") && (
        <fieldset className="document-options">
          <legend>Time &amp; review</legend>

          {settings.mode !== "optional" && (
            <label className="job-field">
              <span>
                {settings.mode === "conditional"
                  ? "Grace period (days)"
                  : "Delivery period (days)"}
              </span>

              <input
                type="number"

                data-document-field="period_days"

                min={1}

                max={3650}

                value={settings.period_days ?? ""}

                required={
                  settings.mode === "conditional" || settings.suspend_on_overdue
                }

                onChange={(event) =>
                  change({
                    period_days:
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
                  })
                }
              />
            </label>
          )}

          <label>
            <input
              type="checkbox"

              checked={settings.suspend_on_overdue}

              disabled={settings.mode === "optional"}

              onChange={(event) =>
                change({
                  suspend_on_overdue: event.target.checked,

                  period_days: event.target.checked
                    ? (settings.period_days ?? 7)
                    : settings.period_days,
                })
              }
            />

            <span>Restrict organization access after the delivery period</span>
          </label>

          {!compact &&
            (kind === "document" ? (
              <p>
                Draft uploads do not pause the delivery period. Submitting for
                review pauses it. Conflict severity is configured in Conflict
                handling.
              </p>
            ) : (
              <p>
                Acknowledging the assigned policy completes its requirement.
                Delivery periods for active employees start when assigned.
              </p>
            ))}
        </fieldset>
      )}

      {kind === "document" && shows("fields") && (
        <fieldset className="document-options" ref={fieldsRef}>
          <legend>Additional fields</legend>

          {settings.extra_fields.map((field, index) =>
            !compact || Math.floor(index / 2) === currentFieldPage ? (
              <div
                key={field.key}

                className="document-extra-field"

                data-extra-field-index={index}
              >
                <label className="job-field">
                  <span>Field label</span>

                  <input
                    value={field.label}

                    maxLength={80}

                    onChange={(event) =>
                      change({
                        extra_fields: settings.extra_fields.map((item, i) =>
                          i === index
                            ? { ...item, label: event.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                </label>

                <label className="job-field">
                  <span>Field type</span>

                  <select
                    value={field.kind}

                    onChange={(event) =>
                      change({
                        extra_fields: settings.extra_fields.map((item, i) =>
                          i === index
                            ? {
                                ...item,

                                kind: event.target.value as typeof field.kind,
                              }
                            : item,
                        ),
                      })
                    }
                  >
                    <option value="text">Text</option>

                    <option value="date">Date</option>

                    <option value="number">Number</option>
                  </select>
                </label>

                <label>
                  <input
                    type="checkbox"

                    checked={field.required}

                    onChange={(event) =>
                      change({
                        extra_fields: settings.extra_fields.map((item, i) =>
                          i === index
                            ? { ...item, required: event.target.checked }
                            : item,
                        ),
                      })
                    }
                  />

                  <span>Required field</span>
                </label>

                <button
                  type="button"

                  className={
                    compact ? "job-icon-button" : "job-secondary-button"
                  }

                  title="Remove field"

                  aria-label={`Remove field ${index + 1}`}

                  onClick={() =>
                    change({
                      extra_fields: settings.extra_fields.filter(
                        (_, i) => i !== index,
                      ),
                    })
                  }
                >
                  {compact ? <Trash2 size={15} /> : "Remove field"}
                </button>
              </div>
            ) : null,
          )}

          {/* BL-857: arrows only when the fields run past one page. */}
          {compact && lastFieldPage > 0 && (
            <div className="document-editor-pagination">
              <span>{settings.extra_fields.length} fields</span>

              <button
                type="button"

                className="job-icon-button"

                title="Previous fields"

                aria-label="Previous fields"

                disabled={currentFieldPage === 0}

                onClick={() => setFieldPage(currentFieldPage - 1)}
              >
                <ChevronLeft size={15} />
              </button>

              <span>
                {currentFieldPage + 1} / {lastFieldPage + 1}
              </span>

              <button
                type="button"

                className="job-icon-button"

                title="Next fields"

                aria-label="Next fields"

                disabled={currentFieldPage === lastFieldPage}

                onClick={() => setFieldPage(currentFieldPage + 1)}
              >
                <ChevronRight size={15} />
              </button>
            </div>
          )}

          <button
            type="button"

            className="job-secondary-button"

            disabled={settings.extra_fields.length >= 20}

            onClick={() => {
              if (compact)
                setFieldPage(Math.floor(settings.extra_fields.length / 2));

              change({
                extra_fields: [
                  ...settings.extra_fields,

                  {
                    key: `field_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`,

                    label: "",

                    kind: "text",

                    required: false,
                  },
                ],
              });
            }}
          >
            Add field
          </button>
        </fieldset>
      )}
    </>
  );
}

/** Document-only presentation; selection always uses the full canonical ID set. */

function DocumentTargetDropdown({
  label,
  items,
  selected,
  onChange,
}: {
  label: string;

  items: { id: string; name: string }[];

  selected: readonly string[];

  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  // Keep unavailable legacy IDs visible and selected until explicitly changed.
  const choices = [
    ...items.map((item) => ({ id: item.id, label: item.name })),
    ...selected
      .filter((id) => !items.some((item) => item.id === id))
      .map((id, index) => ({
        id,
        label: `Unavailable ${label.toLowerCase()} selection ${index + 1}`,
      })),
  ];
  return (
    <div
      ref={root}
      className="document-target-dropdown"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          root.current?.querySelector("summary")?.focus();
        }
      }}
    >
      <ScheduleTopBarFilter
        filterId={label.toLowerCase() as ScheduleTopBarFilterId}
        allLabel={`All ${label}`}
        singularLabel={label.toLowerCase().replace(/s$/, "")}
        pluralLabel={label.toLowerCase()}
        icon={null}
        items={choices}
        selectedIds={selected}
        onChange={onChange}
        open={open}
        onOpenChange={setOpen}
        searchable
      />
    </div>
  );
}
