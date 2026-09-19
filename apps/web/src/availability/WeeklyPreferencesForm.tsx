import { useEffect, useId, useRef, useState } from "react";
import { Copy, RotateCcw, Save, ShieldCheck, Trash2 } from "lucide-react";
import {
  emptyWeeklyPreference,
  preferenceIsEmpty,
  weeklyPreferenceSaveSchema,
  type WeeklyPreferenceRead,
  type WeeklyPreferenceSave,
  type WeeklyCommitmentPreview,
} from "@newfork/shared";
import { WeeklyUnavailableEditor } from "./WeeklyUnavailableEditor";
import { WeeklyCommitmentReview } from "./WeeklyCommitmentReview";

type Props = {
  model: WeeklyPreferenceRead;
  audience: "employee" | "manager";
  onSave: (command: WeeklyPreferenceSave) => Promise<WeeklyPreferenceRead>;
  onPreview?: (
    command: WeeklyPreferenceSave,
  ) => Promise<WeeklyCommitmentPreview>;
  /** In onboarding: there are no assigned shifts yet and no time off to request. */
  wizard?: boolean;
};

// Remount on actor changes; an employee's unsaved rules must never follow a
// drawer selection to the next employee. Live revisions do not reset a draft.
export function WeeklyPreferencesForm(props: Props) {
  if (props.audience === "manager" && props.model.manager === null) {
    return (
      <p role="status">Manager reminders are not available for this account.</p>
    );
  }
  return (
    <PreferenceForm
      key={`${props.model.employee_id}:${props.audience}`}
      {...props}
    />
  );
}

function PreferenceForm({
  model,
  audience,
  onSave,
  onPreview,
  wizard = false,
}: Props) {
  const manager = audience === "manager";
  const canEdit = manager
    ? model.can_manage && model.manager !== null
    : model.can_edit_employee;
  const [tab, setTab] = useState<"employee" | "manager">("employee");
  const tabId = useId();
  const source = manager ? model.manager : model.employee;
  const [baseline, setBaseline] = useState(model);
  const initialPreference = () =>
    source?.preference.input_mode === model.settings.input_mode
      ? source.preference
      : emptyWeeklyPreference(model.settings.input_mode);
  const [preference, setPreference] = useState(initialPreference);
  const [enabled, setEnabled] = useState(model.manager?.enabled ?? true);
  const [notes, setNotes] = useState(
    model.manager?.notes ?? Array<string>(7).fill(""),
  );
  const [dirty, setDirty] = useState(false);
  const [weekEdited, setWeekEdited] = useState(false);
  const [copyRevision, setCopyRevision] = useState<number>();
  const [review, setReview] = useState<{
    items: WeeklyCommitmentPreview["items"];
    clearConfirmed: boolean;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const inFlight = useRef(false);
  const current = manager ? baseline.manager : baseline.employee;
  const staleMode = Boolean(
    current?.submitted &&
    current.preference.input_mode !== baseline.settings.input_mode,
  );
  const hasChanges = dirty || !current?.submitted || staleMode;
  const latestModel =
    (source?.revision ?? 0) < (current?.revision ?? 0) ||
    model.settings.revision < baseline.settings.revision
      ? baseline
      : model;
  const editing = !manager || tab === "manager";
  const locked = saving || review !== null || !canEdit || (manager && !enabled);
  const copiedOldMode =
    copyRevision !== undefined &&
    preference.input_mode !== baseline.settings.input_mode;

  function reset(next: WeeklyPreferenceRead) {
    const record = manager ? next.manager : next.employee;
    setBaseline(next);
    setPreference(
      record?.preference.input_mode === next.settings.input_mode
        ? record.preference
        : emptyWeeklyPreference(next.settings.input_mode),
    );
    setNotes(next.manager?.notes ?? Array<string>(7).fill(""));
    setEnabled(next.manager?.enabled ?? true);
    setDirty(false);
    setWeekEdited(false);
    setCopyRevision(undefined);
    setReview(null);
    setConfirmClear(false);
    setError("");
  }

  useEffect(() => {
    if (!dirty && !inFlight.current) reset(latestModel);
    // Deliberately keyed on `model` only: the revision captured by the first
    // edit must survive re-renders for optimistic concurrency.
  }, [model]);

  function changed(week = false) {
    setDirty(true);
    if (week) {
      setWeekEdited(true);
      setCopyRevision(undefined);
    }
    setSaved(false);
    setConfirmClear(false);
    setError("");
  }

  async function save(
    clearConfirmed = false,
    decisions?: WeeklyPreferenceSave["decisions"],
  ) {
    if (inFlight.current || !hasChanges || !canEdit) return;
    const outgoing =
      manager && staleMode && dirty && !weekEdited && current
        ? current.preference
        : preference;
    if (
      staleMode &&
      current &&
      !preferenceIsEmpty(current.preference) &&
      preferenceIsEmpty(outgoing) &&
      copyRevision === undefined &&
      !clearConfirmed
    ) {
      setConfirmClear(true);
      return;
    }
    const parsed = weeklyPreferenceSaveSchema.safeParse({
      employee_id: model.employee_id,
      source: manager ? "manager" : "employee",
      expected_revision: current?.revision ?? 0,
      settings_revision: baseline.settings.revision,
      preference: outgoing,
      ...(manager ? { enabled, notes } : {}),
      ...(clearConfirmed ? { confirm_clear: true } : {}),
      ...(copyRevision !== undefined
        ? { copy_employee_revision: copyRevision }
        : {}),
      ...(decisions ? { decisions } : {}),
    });
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ?? "Check the unavailable hours.",
      );
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setError("");
    try {
      if (onPreview && !decisions) {
        const preview = await onPreview(parsed.data);
        if (preview.items.length) {
          setReview({ items: preview.items, clearConfirmed });
          return;
        }
      }
      setReview(null);
      const next = await onSave(parsed.data);
      reset(next);
      setSaved(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Changes could not be saved. Your draft is still here.",
      );
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  // Copying is exact, never a lossy conversion between input modes. A saved
  // previous-mode week remains visible until the employee renews it.
  const copyAllowed = model.employee.submitted;
  const copyTitle = !model.employee.submitted
    ? "No employee preferences submitted"
    : "Replace selections; keep manager notes";
  const switchTab = (next: "employee" | "manager") => {
    if (saving || tab === next) return;
    reset(latestModel);
    setSaved(false);
    setTab(next);
  };
  const employeeWeek = (
    <WeeklyUnavailableEditor
      value={model.employee.preference}
      shiftTypes={model.shift_types}
      readOnly
      timeFormat={model.time_format}
    />
  );

  return (
    <section
      className="weekly-preferences-panel"
      aria-label={
        manager
          ? "Employee availability and manager reminders"
          : "Weekly availability"
      }
    >
      {manager && (
        <div
          role="tablist"
          aria-label="Availability"
          className="weekly-preferences-tabs"
          onKeyDown={(event) => {
            if (
              ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
            ) {
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? "employee"
                  : event.key === "End"
                    ? "manager"
                    : tab === "employee"
                      ? "manager"
                      : "employee";
              switchTab(next);
              document.getElementById(`${tabId}-${next}`)?.focus();
            }
          }}
        >
          {(["employee", "manager"] as const).map((item) => (
            <button
              type="button"
              role="tab"
              key={item}
              id={`${tabId}-${item}`}
              aria-controls={`${tabId}-panel`}
              aria-selected={tab === item}
              tabIndex={tab === item ? 0 : -1}
              disabled={saving}
              onClick={() => switchTab(item)}
            >
              {item === "employee"
                ? "Employee availability"
                : "Manager reminders"}
            </button>
          ))}
        </div>
      )}
      <div
        id={`${tabId}-panel`}
        role={manager ? "tabpanel" : undefined}
        aria-labelledby={manager ? `${tabId}-${tab}` : undefined}
        className="weekly-preferences-body"
      >
        {manager && tab === "employee" ? (
          <>
            <div className="weekly-preferences-heading">
              <h3>Employee availability</h3>
              <span className="weekly-preferences-status">
                {model.employee.submitted ? "Submitted" : "Not submitted"}
              </span>
            </div>
            {preferenceIsEmpty(model.employee.preference) ? (
              <details className="weekly-available-summary">
                <summary>Available all week</summary>
                {employeeWeek}
              </details>
            ) : employeeWeek}
          </>
        ) : (
          <>
            <div className="weekly-preferences-heading">
              <h3>{manager ? "Manager reminders" : "Weekly availability"}</h3>
              {manager ? (
                <label className="weekly-reminders-switch">
                  <span>{enabled ? "On" : "Off"}</span>
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label="Enable manager reminders"
                    checked={enabled}
                    disabled={saving || !canEdit}
                    onChange={(event) => {
                      setEnabled(event.target.checked);
                      changed();
                    }}
                  />
                </label>
              ) : (
                <span className="weekly-preferences-status">
                  {latestModel.employee.submitted
                    ? "Submitted"
                    : "Not submitted"}
                </span>
              )}
            </div>
            {manager && (
              <div className="weekly-preferences-toolbar">
                <span>
                  <ShieldCheck size={14} />
                  Managers only
                </span>
                <button
                  type="button"
                  disabled={locked || !copyAllowed}
                  title={copyTitle}
                  onClick={() => {
                    setPreference(structuredClone(model.employee.preference));
                    changed(true);
                    setCopyRevision(model.employee.revision);
                  }}
                >
                  <Copy size={14} />
                  Use employee preferences
                </button>
                <button
                  type="button"
                  className="weekly-form-icon"
                  disabled={locked || preferenceIsEmpty(preference)}
                  aria-label="Clear all unavailable selections"
                  title="Clear selections; keep notes"
                  onClick={() => {
                    setPreference(
                      emptyWeeklyPreference(baseline.settings.input_mode),
                    );
                    changed(true);
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            )}
            {manager && !enabled && (
              <p className="weekly-preferences-notice">
                Reminders are off. Saved rules and notes are kept.
              </p>
            )}
            {staleMode && (
              <div className="weekly-previous-preferences">
                <p className="weekly-preferences-notice">
                  Entry mode changed. Previous preferences remain in effect
                  until you save.
                </p>
                <details>
                  <summary>Previous preferences</summary>
                  <WeeklyUnavailableEditor
                    value={current!.preference}
                    shiftTypes={model.shift_types}
                    readOnly
                    timeFormat={model.time_format}
                  />
                </details>
              </div>
            )}
            {copiedOldMode && (
              <div className="weekly-preferences-notice">
                Copied preferences use the previous entry mode.{" "}
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => {
                    setPreference(
                      emptyWeeklyPreference(baseline.settings.input_mode),
                    );
                    changed(true);
                  }}
                >
                  Use current mode
                </button>
              </div>
            )}
            <WeeklyUnavailableEditor
              value={
                manager && !enabled && staleMode && !weekEdited && current
                  ? current.preference
                  : preference
              }
              onChange={(next) => {
                setPreference(next);
                changed(true);
              }}
              shiftTypes={model.shift_types}
              disabled={locked || copiedOldMode}
              timeFormat={model.time_format}
              {...(manager
                ? {
                    notes,
                    onNotesChange: (next: string[]) => {
                      setNotes(next);
                      changed();
                    },
                  }
                : {})}
            />
          </>
        )}
      </div>
      {editing && (
        <footer className="weekly-preferences-footer">
          {!manager && (
            <p>
              {wizard
                ? "You can change this later from your own availability page."
                : "Changes apply immediately and do not change assigned shifts. Your manager may miss the notification; tell them directly too. For temporary changes, request time off."}
            </p>
          )}
          {error && (
            <p className="weekly-preferences-error" role="alert">
              {error}
            </p>
          )}
          {confirmClear && (
            <div className="weekly-clear-confirm" role="alert">
              <p>
                Remove your previous unavailable hours and mark the whole week
                available?
              </p>
              <button type="button" onClick={() => setConfirmClear(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="weekly-primary"
                onClick={() => void save(true)}
              >
                Clear and save
              </button>
            </div>
          )}
          <div className="weekly-preferences-actions">
            <span role="status">
              {saving
                ? "Saving..."
                : saved
                  ? "Saved"
                  : dirty
                    ? "Unsaved changes"
                    : ""}
            </span>
            <button
              type="button"
              disabled={!dirty || saving}
              onClick={() => {
                reset(latestModel);
                setSaved(false);
              }}
            >
              <RotateCcw size={14} />
              Discard
            </button>
            <button
              type="button"
              className="weekly-primary"
              disabled={!hasChanges || saving || !canEdit}
              onClick={() => void save()}
            >
              <Save size={14} />
              Save
            </button>
          </div>
        </footer>
      )}
      {review && (
        <WeeklyCommitmentReview
          items={review.items}
          timeFormat={model.time_format}
          onCancel={() => setReview(null)}
          onContinue={(decisions) =>
            void save(review.clearConfirmed, decisions)
          }
        />
      )}
    </section>
  );
}
