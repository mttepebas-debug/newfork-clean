import {
  schedulingSettingsInputSchema,
  type SchedulingSettingsInput,
} from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Save } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { can } from "../auth/can";
import { WeeklyPreferenceSettingsPanel } from "../availability/WeeklyPreferenceSettings";
import { errorText, SettingsHeader } from "./GeneralSettingsPage";
import {
  loadSchedulingSettings,
  saveSchedulingSettings,
} from "./organization-data";
import "./scheduling-settings.css";

import { isNoAccess } from "../lib/no-access";
import { NoAccessState } from "../shell/NoAccessState";
import { LinesOutline, LoadError, RefreshError } from "../shell/LoadState";
import { noAccessHomePath } from "../auth/resolveLanding";
import { FieldNote } from "../shell/FieldNote";
const defaults: SchedulingSettingsInput = {
  week_start_day: "monday",
  schedule_deadline_day: "sunday",
  time_format: "12h",
};

const weekdays = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export default function SchedulingSettingsPage() {
  const { context } = useAuth();
  const canEdit = can(context, "settings.scheduling.write");
  const queryClient = useQueryClient();
  const workspaceId = context?.workspace.id ?? "";
  const queryKey = ["scheduling-settings", workspaceId];
  const query = useQuery({
    queryKey,
    queryFn: () => loadSchedulingSettings(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const [draft, setDraft] = useState<SchedulingSettingsInput>(defaults);
  const [draftDirty, setDraftDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!query.data || draftDirty) return;
    setDraft(schedulingSettingsInputSchema.parse(query.data));
    setValidationError(null);
  }, [draftDirty, query.data]);

  const mutation = useMutation({
    mutationFn: (values: SchedulingSettingsInput) =>
      saveSchedulingSettings(workspaceId, values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      setDraftDirty(false);
      setSaved(true);
    },
  });

  const updateDraft = (patch: Partial<SchedulingSettingsInput>): void => {
    setDraft((current) => ({
      ...current,
      ...patch,
    }));
    setDraftDirty(true);
    setSaved(false);
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (!canEdit) return;
    setSaved(false);
    setValidationError(null);
    const parsed = schedulingSettingsInputSchema.safeParse(draft);
    if (!parsed.success) {
      setValidationError("Choose valid scheduling settings before saving.");
      return;
    }
    const {
      conflict_rules,
      conflict_rules_revision,
      minimum_travel_minutes,
      minimum_rest_minutes,
      ...general
    } = parsed.data;
    mutation.mutate(general);
  };

  // The API's "no" gets the one no-access card, never its raw sentence.
  if (isNoAccess(query.error))
    return (
      <NoAccessState
        homeHref={noAccessHomePath(context, "/app/settings/scheduling")}
      />
    );
  return (
    <section
      className="settings-page"
      aria-labelledby="scheduling-settings-title"
    >
      <SettingsHeader
        icon={<CalendarClock size={21} aria-hidden />}
        title="Schedule rules"
        description="Week boundaries, publishing targets, and availability preferences."
      />
      {query.isLoading ? (
        <LinesOutline label="Loading schedule rules" lines={5} />
      ) : null}
      {query.error && !query.data ? (
        <LoadError
          title="We couldn't load schedule rules"
          detail="Schedule rules didn't load. Nothing was changed."
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {query.error && query.data ? (
        <RefreshError
          message="Schedule rules didn't refresh. These are the last rules that loaded."
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {query.data ? (
        <section
          className="scheduling-settings-section"
          aria-labelledby="schedule-basics-title"
        >
          <h2 className="scheduling-section-title" id="schedule-basics-title">
            Schedule basics
          </h2>
          <form className="organization-form scheduling-form" noValidate onSubmit={submit}>
            <fieldset
              disabled={!canEdit}
              style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
            >
              <SettingsChoiceRow
                label="Week starts on"
                description="Defines the first day in weekly schedules and navigation."
              >
                <SegmentedChoice
                  name="week-start"
                  value={draft.week_start_day}
                  options={[
                    ["sunday", "Sunday"],
                    ["monday", "Monday"],
                  ]}
                  onChange={(value) =>
                    updateDraft({
                      week_start_day: value as "sunday" | "monday",
                    })
                  }
                />
              </SettingsChoiceRow>
              <SettingsChoiceRow
                label="Publish by"
                description="Target weekday for publishing each schedule week. Missing this target does not block publishing."
              >
                <select
                  aria-label="Schedule publish deadline"
                  value={draft.schedule_deadline_day}
                  onChange={(event) =>
                    updateDraft({
                      schedule_deadline_day: event.target
                        .value as SchedulingSettingsInput["schedule_deadline_day"],
                    })
                  }
                >
                  {weekdays.map((day) => (
                    <option key={day} value={day}>
                      {day[0]!.toUpperCase() + day.slice(1)}
                    </option>
                  ))}
                </select>
              </SettingsChoiceRow>
              <SettingsChoiceRow
                label="Time format"
                description="Controls how schedule shift times are displayed while editing."
              >
                <SegmentedChoice
                  name="time-format"
                  value={draft.time_format}
                  options={[
                    ["12h", "12-hour"],
                    ["24h", "24-hour"],
                  ]}
                  onChange={(value) =>
                    updateDraft({
                      time_format:
                        value as SchedulingSettingsInput["time_format"],
                    })
                  }
                />
              </SettingsChoiceRow>
              {/* Both when both hold: the form's own check and the server's (UI-FIELDMSG-2). */}
              <FieldNote id="scheduling-settings-check" error={validationError} />
              <FieldNote id="scheduling-settings" error={mutation.error ? errorText(mutation.error) : null} />
              {saved ? (
                <p className="form-success" role="status">
                  Scheduling rules saved.
                </p>
              ) : null}
              <div className="organization-form-actions">
                <Button
                  type="submit"
                  disabled={
                    mutation.isPending ||
                    // BL-677 (1): nothing changed, nothing to save.
                    !draftDirty
                  }
                >
                  <Save size={16} aria-hidden />
                  {mutation.isPending ? "Saving" : "Save rules"}
                </Button>
              </div>
            </fieldset>
          </form>
        </section>
      ) : null}
      {workspaceId && canEdit ? (
        <section
          className="scheduling-settings-section"
          aria-labelledby="availability-staffing-title"
        >
          <h2
            className="scheduling-section-title"
            id="availability-staffing-title"
          >
            Availability and staffing
          </h2>
          <p className="scheduling-section-description">
            Saved separately from Schedule basics. Conflict rules and travel
            buffers are managed in Conflict handling.
          </p>
          <WeeklyPreferenceSettingsPanel workspaceId={workspaceId} />
        </section>
      ) : null}
    </section>
  );
}

function SettingsChoiceRow({
  label,
  description,
  children,
}: {
  readonly label: string;
  readonly description: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="scheduling-setting-row">
      <div>
        <strong>{label}</strong>
        <p>{description}</p>
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

function SegmentedChoice({
  name,
  value,
  options,
  onChange,
}: {
  readonly name: string;
  readonly value: string;
  readonly options: readonly (readonly [string, string])[];
  readonly onChange: (value: string) => void;
}) {
  return (
    <div className="settings-segmented">
      {options.map(([option, label]) => (
        <label key={option} data-selected={value === option}>
          <input
            type="radio"
            name={name}
            value={option}
            checked={value === option}
            onChange={() => onChange(option)}
          />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
}
