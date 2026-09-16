import { type DocumentTypeInput } from "@newfork/shared";

import { Button } from "@newfork/ui";

import { X } from "lucide-react";

import { useLayoutEffect, useRef, useState, type FormEvent } from "react";

import {
  DocumentLifecycleFields,
  type DocumentEditorSection,
} from "../documents/DocumentLifecycleFields";

import "./document-settings-editor.css";

type ValidationIssue = { path: PropertyKey[]; message: string };

function issueSection(issue: ValidationIssue): DocumentEditorSection {
  if (issue.path.includes("extra_fields")) return "fields";

  if (issue.path.includes("target")) return "details";

  if (
    issue.path.some((key) =>
      [
        "period_days",

        "suspend_on_overdue",

        "expiry_warning_days",

        "expiry_schedule_impact",
      ].includes(String(key)),
    )
  )
    return "details";

  return "details";
}

export function DocumentSettingsEditor({
  value,

  onChange,

  workspaceId,

  documentId,

  busy,

  saving,
  saveDisabled = false,

  dirty,

  issues,

  error,

  onSubmit,

  onClose,
}: {
  value: DocumentTypeInput;

  onChange: (value: DocumentTypeInput) => void;

  workspaceId: string;

  documentId?: string;

  busy: boolean;

  saving: boolean;
  saveDisabled?: boolean;

  dirty: boolean;

  issues: readonly ValidationIssue[];

  error: string | null;

  onSubmit: (event: FormEvent) => void;

  onClose: () => void;

  onBusyChange: (busy: boolean) => void;
}) {
  const [section, setSection] = useState<DocumentEditorSection>("details");

  const [validation, setValidation] = useState<ValidationIssue | null>(null);

  const [attempt, setAttempt] = useState(0);

  const description = useRef<HTMLTextAreaElement>(null);

  const panel = useRef<HTMLDivElement>(null);

  const invalidField = validation?.path.includes("extra_fields")
    ? (validation.path.find((key) => typeof key === "number") as
        number | undefined)
    : undefined;

  const change = (next: DocumentTypeInput) => {
    setValidation(null);

    onChange(next);
  };

  useLayoutEffect(() => {
    const input = description.current;

    if (!input) return;

    const resize = () => {
      input.style.height = "auto";

      const style = window.getComputedStyle(input);

      input.style.height = `${input.scrollHeight + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)}px`;
    };

    resize();

    let width = input.clientWidth;

    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            if (input.clientWidth === width) return;

            width = input.clientWidth;

            resize();
          });

    observer?.observe(input);

    return () => observer?.disconnect();
  }, [value.description, section]);

  useLayoutEffect(() => {
    if (validation && invalidField === undefined) {
      const name = String(validation.path.at(-1));

      const target = panel.current?.querySelector<HTMLElement>(
        `[data-document-field="${name}"]`,
      );

      (target ?? panel.current)?.focus();
    }
  }, [attempt, validation, invalidField]);

  const submit = (event: FormEvent) => {
    event.preventDefault();

    if (busy || saveDisabled) return;

    const issue = issues.find(
      (item) => section === "fields" || issueSection(item) === "details",
    );

    if (issue) {
      setSection(issueSection(issue));

      setValidation(issue);

      setAttempt((current) => current + 1);

      return;
    }

    if (section === "details") {
      setSection("fields");

      setValidation(null);

      return;
    }

    if (!dirty) return;

    onSubmit(event);
  };

  return (
    <form
      className="job-catalog-editor document-side-index-form"

      noValidate

      onSubmit={submit}

      aria-label={documentId ? "Edit document type" : "Add document type"}
    >
      <div className="job-editor-title">
        <div>
          <h2>{documentId ? "Edit document type" : "New document type"}</h2>

          <p>
            {section === "details"
              ? "Step 1 of 2 - Details"
              : "Step 2 of 2 - Fields & review"}
          </p>
        </div>

        <button
          type="button"

          className="job-icon-button"

          title="Close"

          aria-label="Close document editor"

          disabled={busy}

          onClick={onClose}
        >
          <X size={17} />
        </button>
      </div>

      <div className="document-side-index-layout">
        <div
          className="document-side-index-panel"

          id="document-editor-panel"

          ref={panel}

          role="region"

          aria-label={section === "details" ? "Details" : "Fields & review"}

          tabIndex={-1}
        >
          <fieldset className="document-editor-fields" disabled={busy}>
            {section === "details" && (
              <>
                <label className="job-field">
                  <span>Name</span>

                  <input
                    data-document-field="title"

                    aria-invalid={validation?.path[0] === "title" || undefined}

                    value={value.title}

                    maxLength={80}

                    required

                    placeholder="Enter document type name"

                    onChange={(event) =>
                      change({ ...value, title: event.target.value })
                    }
                  />
                </label>

                <label className="job-field">
                  <span>Description</span>

                  <textarea
                    ref={description}

                    data-document-field="description"

                    value={value.description}

                    maxLength={240}

                    rows={2}

                    placeholder="Short instructions for this requirement"

                    onChange={(event) =>
                      change({ ...value, description: event.target.value })
                    }
                  />
                </label>
              </>
            )}

            <DocumentLifecycleFields
              value={value}

              workspaceId={workspaceId}

              onChange={change}

              section={
                section === "details"
                  ? ["details", "rules", "audience"]
                  : section
              }

              fieldErrorIndex={invalidField}

              validationAttempt={attempt}
            />

            {section === "details" && (
              <>
                <label className="document-editor-choice">
                  <input
                    type="checkbox"

                    checked={value.requires_review}

                    onChange={(event) =>
                      change({
                        ...value,

                        requires_review: event.target.checked,
                      })
                    }
                  />

                  <span>Manager review required</span>
                </label>

                <label className="document-editor-choice">
                  <input
                    type="checkbox"

                    checked={value.tracks_expiry}

                    onChange={(event) =>
                      change({
                        ...value,

                        tracks_expiry: event.target.checked,

                        expiry_schedule_impact: event.target.checked
                          ? value.expiry_schedule_impact
                          : "track_only",
                      })
                    }
                  />

                  <span>Track expiration</span>
                </label>

                {value.tracks_expiry && (
                  <label className="job-field">
                    <span>Warn before expiry (days)</span>

                    <input
                      data-document-field="expiry_warning_days"

                      type="number"

                      min={1}

                      max={365}

                      value={value.expiry_warning_days}

                      onChange={(event) =>
                        change({
                          ...value,

                          expiry_warning_days: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                )}
              </>
            )}

            {section === "fields" && (
              <p className="document-editor-hint">
                Accepted uploads:{" "}
                {value.accepted_formats

                  .map((format) => format.toUpperCase())

                  .join(", ")}
              </p>
            )}
          </fieldset>

          <div hidden={section !== "fields"} className="document-editor-review">
            <dl>
              <div>
                <dt>Requirement</dt>

                <dd>
                  {value.lifecycle_settings?.mode ??
                    (value.required_at_onboarding ? "required" : "optional")}
                </dd>
              </div>

              <div>
                <dt>Review</dt>

                <dd>
                  {value.requires_review ? "Manager approval" : "Automatic"}
                </dd>
              </div>

              <div>
                <dt>Expiration</dt>

                <dd>
                  {value.tracks_expiry
                    ? `${value.expiry_warning_days} day warning`
                    : "Not tracked"}
                </dd>
              </div>

              <div>
                <dt>Additional fields</dt>

                <dd>{value.lifecycle_settings?.extra_fields.length ?? 0}</dd>
              </div>
            </dl>

            <p className="document-editor-hint">
              Save creates a draft. Publish from the document menu after
              reviewing its employee impact.
            </p>
          </div>
        </div>
      </div>

      <div className="job-editor-footer">
        <div className="document-editor-error">
          {(validation?.message || error) && (
            <p role="alert">{validation?.message || error}</p>
          )}
        </div>

        <div className="job-editor-actions">
          <Button
            type="button"

            className="job-secondary-button"

            disabled={busy}

            onClick={onClose}
          >
            Cancel
          </Button>

          {section === "fields" && (
            <Button
              type="button"
              className="job-secondary-button"
              disabled={busy}
              onClick={() => setSection("details")}
            >
              Back
            </Button>
          )}

          <Button
            type="submit"

            className="job-primary-button"

            disabled={
              busy ||
              saveDisabled ||
              (section === "fields" && (!dirty || issues.length > 0)) ||
              (section === "details" &&
                issues.some((issue) => issueSection(issue) === "details"))
            }
          >
            {section === "details" ? "Next" : saving ? "Saving" : "Save"}
          </Button>
        </div>
      </div>
    </form>
  );
}
