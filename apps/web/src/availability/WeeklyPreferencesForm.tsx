import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Copy, RotateCcw, Save, ShieldCheck, Trash2 } from "lucide-react";
import {
  emptyWeeklyPreference,
  preferenceIsEmpty,
  weeklyPreferenceSaveSchema,
  type WeeklyPreferenceRead,
  type WeeklyPreferenceSave,
} from "@newfork/shared";
import { WeeklyUnavailableEditor } from "./WeeklyUnavailableEditor";
import { useAvailabilityNavigationGuard } from "./availability-navigation";
import { isNoAccess } from "../lib/no-access";

type Props = {
  model: WeeklyPreferenceRead;
  audience: "employee" | "manager";
  // M5: a save decides nothing about pending requests; nothing to review first.
  onSave: (command: WeeklyPreferenceSave) => Promise<WeeklyPreferenceRead>;
  /** In onboarding: there are no assigned shifts yet and no time off to request. */
  wizard?: boolean;
  /** A step's way on, shown after Save in the same bar (one sticky bar). */
  extraAction?: ReactNode;
  /** BL-797: fetches the week someone saved first; Reload waits for it. */
  onReload?: () => Promise<WeeklyPreferenceRead | undefined>;
};

// Remount on actor changes; an employee's unsaved rules must never follow a
// drawer selection to the next employee. Live revisions do not reset a draft.
export function WeeklyPreferencesForm(props: Props) {
  return (
    <PreferenceForm
      // Losing the manager record remounts too: a private reminder draft is dropped.
      key={`${props.model.employee_id}:${props.audience}:${props.model.manager != null}`}
      {...props}
    />
  );
}

function PreferenceForm({
  model,
  audience,
  onSave,
  wizard = false,
  extraAction,
  onReload,
}: Props) {
  const manager = audience === "manager";
  // No reminder data (the person is a manager+, or the reader may not see
  // notes): the manager view shows only the employee's week, no reminder tab.
  const reminders = manager && model.manager != null;
  const canEdit = manager
    ? model.can_manage && model.manager != null
    : model.can_edit_employee;
  const [tab, setTab] = useState<"employee" | "manager">("employee");
  const tabId = useId();
  const source = manager ? model.manager : model.employee;
  const [baseline, setBaseline] = useState(model);
  // A mode change converts every saved week (AVAIL-001): a saved week is
  // always in the current mode.
  const [preference, setPreference] = useState(
    () => source?.preference ?? emptyWeeklyPreference(model.settings.input_mode),
  );
  const [enabled, setEnabled] = useState(model.manager?.enabled ?? true);
  const [notes, setNotes] = useState(
    model.manager?.notes ?? Array<string>(7).fill(""),
  );
  const [dirty, setDirty] = useState(false);
  const [copyRevision, setCopyRevision] = useState<number>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  // BL-797: a refused save because someone saved first; Reload takes theirs.
  const [conflict, setConflict] = useState(false);
  const [reloading, setReloading] = useState(false);
  const inFlight = useRef(false);
  const current = manager ? baseline.manager : baseline.employee;
  const hasChanges = dirty || !current?.submitted;
  const latestModel =
    (source?.revision ?? 0) < (current?.revision ?? 0) ||
    model.settings.revision < baseline.settings.revision
      ? baseline
      : model;
  const editing = !manager || tab === "manager";
  const locked = saving || !canEdit || (manager && !enabled);

  function reset(next: WeeklyPreferenceRead) {
    const record = manager ? next.manager : next.employee;
    setBaseline(next);
    setPreference(
      record?.preference ?? emptyWeeklyPreference(next.settings.input_mode),
    );
    setNotes(next.manager?.notes ?? Array<string>(7).fill(""));
    setEnabled(next.manager?.enabled ?? true);
    setDirty(false);
    setCopyRevision(undefined);
    setError("");
    setConflict(false);
  }

  useEffect(() => {
    if (!dirty && !inFlight.current) reset(latestModel);
    // Deliberately keyed on `model` only: the revision captured by the first
    // edit must survive re-renders for optimistic concurrency.
  }, [model]);

  function changed(week = false) {
    setDirty(true);
    if (week) setCopyRevision(undefined);
    setSaved(false);
    setError("");
  }

  async function save() {
    if (inFlight.current || !hasChanges || !canEdit) return;
    const parsed = weeklyPreferenceSaveSchema.safeParse({
      employee_id: model.employee_id,
      source: manager ? "manager" : "employee",
      expected_revision: current?.revision ?? 0,
      settings_revision: baseline.settings.revision,
      preference,
      ...(manager ? { enabled, notes } : {}),
      ...(copyRevision !== undefined
        ? { copy_employee_revision: copyRevision }
        : {}),
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
      const next = await onSave(parsed.data);
      reset(next);
      setSaved(true);
    } catch (cause) {
      setConflict(
        typeof cause === "object" &&
          cause !== null &&
          "status" in cause &&
          Number(cause.status) === 409,
      );
      setError(
        isNoAccess(cause)
          ? "You don't have access to change this availability."
          : cause instanceof Error
            ? cause.message
            : "Changes could not be saved. Your draft is still here.",
      );
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  // Copying is exact: both weeks are always in the current input mode.
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

  // P26, C2.3: the employee's own week (My availability, onboarding) asks
  // before unsaved hours are lost; the Employees drawer never asks (K7).
  const leaveDialog = useAvailabilityNavigationGuard({
    dirty: !manager && dirty,
    busy: !manager && saving,
    onDiscard: () => reset(baseline),
  });

  return (
    <section
      className="weekly-preferences-panel"
      aria-label={
        reminders
          ? "Employee availability and manager reminders"
          : manager
            ? "Employee availability"
            : "Weekly availability"
      }
    >
      {leaveDialog}
      {reminders && (
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
        role={reminders ? "tabpanel" : undefined}
        aria-labelledby={reminders ? `${tabId}-${tab}` : undefined}
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
            {!manager && !wizard && (
              <p className="weekly-preferences-explainer">
                Availability is a preference, not a guarantee: a manager can
                still schedule you when you've marked yourself unavailable.
              </p>
            )}
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
            <WeeklyUnavailableEditor
              value={preference}
              onChange={(next) => {
                setPreference(next);
                changed(true);
              }}
              shiftTypes={model.shift_types}
              disabled={locked}
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
              {conflict && (
                <>
                  {" "}
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={reloading}
                    onClick={async () => {
                      setReloading(true);
                      try {
                        reset((await onReload?.()) ?? model);
                      } finally {
                        setReloading(false);
                      }
                    }}
                  >
                    Reload
                  </button>
                </>
              )}
            </p>
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
            {extraAction}
          </div>
        </footer>
      )}
    </section>
  );
}
