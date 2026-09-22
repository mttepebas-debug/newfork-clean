import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Clock3, RotateCcw, Save } from "lucide-react";
import { Link } from "react-router";
import type {
  WeeklyPreferenceSettingsRead,
  WeeklyPreferenceSettingsSave,
} from "@newfork/shared";
import {
  loadWeeklyPreferenceSettings,
  saveWeeklyPreferenceSettings,
} from "./availability-data";
import "./weekly-preferences.css";

export function WeeklyPreferenceSettingsPanel({
  workspaceId,
}: {
  workspaceId: string;
}) {
  return <ConnectedSettings key={workspaceId} workspaceId={workspaceId} />;
}
function ConnectedSettings({ workspaceId }: { workspaceId: string }) {
  const client = useQueryClient();
  const queryKey = ["weekly-preference-settings", workspaceId];
  const query = useQuery({
    queryKey,
    queryFn: () => loadWeeklyPreferenceSettings(workspaceId),
    enabled: Boolean(workspaceId),
    retry: false,
  });
  const attempt = useRef<{ value: string; key: string } | null>(null);
  async function save(command: WeeklyPreferenceSettingsSave) {
    const value = JSON.stringify(command);
    if (attempt.current?.value !== value)
      attempt.current = { value, key: crypto.randomUUID() };
    try {
      const result = await saveWeeklyPreferenceSettings(
        workspaceId,
        command,
        attempt.current!.key,
      );
      attempt.current = null;
      client.setQueryData(queryKey, result);
      void client.invalidateQueries({
        queryKey: ["weekly-preferences", workspaceId],
      });
      void client.invalidateQueries({ queryKey: ["schedule-reference", workspaceId] });
      void client.invalidateQueries({ queryKey: ["schedule-shifts", workspaceId] });
      return result;
    } catch (error) {
      const status =
        error && typeof error === "object" && "status" in error
          ? Number(error.status)
          : 0;
      if (status >= 400 && status < 500) attempt.current = null;
      throw error;
    }
  }
  const status =
    query.error && typeof query.error === "object" && "status" in query.error
      ? Number(query.error.status)
      : 0;
  const error = query.isError ? (
    <p role="alert">{query.error.message}</p>
  ) : null;
  if (!query.data || [401, 403, 404].includes(status))
    return (
      <section className="weekly-preferences-panel">
        {error ?? <p role="status">Loading availability settings...</p>}
        {error && (
          <button type="button" onClick={() => void query.refetch()}>
            Retry
          </button>
        )}
      </section>
    );
  return (
    <>
      {error}
      <WeeklyPreferenceSettings
        model={query.data}
        onSave={save}
        onReload={async () => {
          const result = await query.refetch();
          if (result.error) throw result.error;
          return result.data!;
        }}
      />
    </>
  );
}

export function WeeklyPreferenceSettings({
  model,
  onSave,
  onReload,
}: {
  model: WeeklyPreferenceSettingsRead;
  onSave: (
    command: WeeklyPreferenceSettingsSave,
  ) => Promise<WeeklyPreferenceSettingsRead>;
  onReload: () => Promise<WeeklyPreferenceSettingsRead>;
}) {
  const [base, setBase] = useState(model.settings);
  const [draft, setDraft] = useState(model.settings);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty =
    draft.input_mode !== base.input_mode ||

    draft.onboarding_required !== base.onboarding_required;
  const stale = model.settings.revision > base.revision;
  const missing =
    draft.input_mode === "shift_type" && model.missing_shift_types.length > 0;
  const disabled = !model.can_edit || busy;
  const inFlight = useRef(false);
  useEffect(() => {
    if (!dirty && model.settings.revision >= base.revision) {
      setBase(model.settings);
      setDraft(model.settings);
    }
  }, [model.settings, dirty, base.revision]);
  function change(patch: Partial<typeof draft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setSaved(false);
  }
  async function save() {
    if (disabled || !dirty || missing || stale || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const result = await onSave({
        input_mode: draft.input_mode,

        onboarding_required: draft.onboarding_required,
        expected_revision: base.revision,
      });
      setBase(result.settings);
      setDraft(result.settings);
      setSaved(true);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Settings could not be saved.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className="weekly-preferences-panel weekly-settings"
      aria-label="Availability settings"
    >
      <header className="weekly-settings-heading">
        <CalendarClock size={18} aria-hidden />
        <h3>Availability</h3>
      </header>
      <div className="weekly-settings-row">
        <strong>Entry mode</strong>
        <fieldset className="weekly-settings-options" disabled={disabled}>
          <legend className="sr-only">Availability entry mode</legend>
          {(
            [
              ["time_range", "Time range", Clock3],
              ["shift_type", "Shift type", CalendarClock],
            ] as const
          ).map(([value, label, Icon]) => (
            <label key={value} data-selected={draft.input_mode === value}>
              <input
                type="radio"
                name="availability-entry-mode"
                checked={draft.input_mode === value}
                onChange={() => change({ input_mode: value })}
              />
              <Icon size={15} aria-hidden />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
      </div>
      {missing && (
        <div className="weekly-settings-missing" role="alert">
          <strong>Default hours needed</strong>
          <ul>
            {model.missing_shift_types.map((type) => (
              <li key={type.id}>
                <Link
                  to={`/app/settings/scheduling/shift-types?edit=${type.id}`}
                >
                  {type.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {draft.input_mode !== base.input_mode && (
        <p className="weekly-settings-notice">
          Saved weeks will be converted to the new entry mode. Employees will be
          notified to check theirs.
        </p>
      )}
      <div className="weekly-settings-row">
        <strong>Required during onboarding</strong>
        <label className="weekly-reminders-switch">
          <input
            type="checkbox"
            role="switch"
            aria-label="Availability required during onboarding"
            checked={draft.onboarding_required}
            disabled={disabled}
            onChange={(event) =>
              change({ onboarding_required: event.target.checked })
            }
          />
        </label>
      </div>
      {model.can_edit && (
        <footer className="weekly-preferences-footer">
          {stale && (
            <p role="alert">
              Settings changed elsewhere. Your draft is preserved.
            </p>
          )}
          {error && (
            <p className="weekly-preferences-error" role="alert">
              {error}
            </p>
          )}
          {(stale || error) && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const latest = await onReload();
                  setBase(latest.settings);
                  setDraft(latest.settings);
                  setError(null);
                  setSaved(false);
                } catch (error) {
                  setError(
                    error instanceof Error
                      ? error.message
                      : "Settings could not be refreshed.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <RotateCcw size={14} aria-hidden />
              Discard and reload
            </button>
          )}
          <div className="weekly-preferences-actions">
            <span role="status">
              {busy
                ? "Saving..."
                : saved
                  ? "Saved"
                  : dirty
                    ? "Unsaved changes"
                    : ""}
            </span>
            <button
              type="button"
              disabled={!dirty || busy}
              onClick={() => {
                setDraft(base);
                setError(null);
                setSaved(false);
              }}
            >
              <RotateCcw size={14} aria-hidden />
              Discard
            </button>
            <button
              type="button"
              className="weekly-primary"
              disabled={disabled || !dirty || missing || stale}
              onClick={() => void save()}
            >
              <Save size={14} aria-hidden />
              Save
            </button>
          </div>
        </footer>
      )}
    </section>
  );
}
