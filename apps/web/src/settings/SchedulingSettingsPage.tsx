import {
  schedulingSettingsInputSchema,
  type SchedulingSettingsInput,
} from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Save } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useLocation } from "react-router";
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
import { noAccessHomePath } from "../auth/resolveLanding";
const defaults: SchedulingSettingsInput = {
  week_start_day: "monday",
  schedule_deadline_day: "sunday",
  time_format: "12h",
  time_off_lead_hours: 24,
};

type SchedulingSettingsDraft = Omit<
  SchedulingSettingsInput,
  "week_start_day" | "time_format"
> & {
  week_start_day: SchedulingSettingsInput["week_start_day"] | "";
  time_format: SchedulingSettingsInput["time_format"] | "";
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
  const location = useLocation();
  const queryClient = useQueryClient();
  const workspaceId = context?.workspace.id ?? "";
  const checklistMode =
    new URLSearchParams(location.search).get("checklist") === "setup";
  const queryKey = ["scheduling-settings", workspaceId];
  const query = useQuery({
    queryKey,
    queryFn: () => loadSchedulingSettings(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const [draft, setDraft] = useState<SchedulingSettingsDraft>(
    checklistMode ? checklistDraft(defaults) : defaults,
  );
  const [draftDirty, setDraftDirty] = useState(false);
  // BL-677 (1): once the checklist's two choices are saved, the page shows
  // them like any other saved value instead of blanking them again.
  const [checklistSaved, setChecklistSaved] = useState(false);
  const blankChoices = checklistMode && !checklistSaved;
  const [saved, setSaved] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!query.data || draftDirty) return;
    const parsed = schedulingSettingsInputSchema.parse(query.data);
    setDraft(blankChoices ? checklistDraft(parsed) : parsed);
    setValidationError(null);
  }, [blankChoices, draftDirty, query.data]);

  const mutation = useMutation({
    mutationFn: (values: SchedulingSettingsInput) =>
      saveSchedulingSettings(workspaceId, values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      setChecklistSaved(true);
      setDraftDirty(false);
      setSaved(true);
    },
  });

  const updateDraft = (patch: Partial<SchedulingSettingsDraft>): void => {
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
    if (blankChoices && (!draft.week_start_day || !draft.time_format)) {
      setValidationError("Choose week start and time format before saving.");
      return;
    }
    const hours = draft.time_off_lead_hours;
    if (hours !== undefined && !(Number.isInteger(hours) && hours >= 0 && hours <= 720)) {
      setValidationError("Enter a time off decision window from 0 to 720 hours.");
      return;
    }
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
        subject="scheduling settings"
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
        <p className="settings-state">Loading scheduling rules...</p>
      ) : null}
      {query.error ? (
        <p className="settings-state error" role="alert">
          {errorText(query.error)}
        </p>
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
              <SettingsChoiceRow
                label="Time off decision window"
                description="Managers decide this many hours before time off starts. Undecided requests are declined."
              >
                <input
                  type="number"
                  min={0}
                  max={720}
                  step={1}
                  required
                  aria-label="Time off decision window (hours)"
                  value={Number.isFinite(draft.time_off_lead_hours) ? draft.time_off_lead_hours : ""}
                  onChange={(event) =>
                    updateDraft({
                      time_off_lead_hours: event.target.value === "" ? Number.NaN : Number(event.target.value),
                    })
                  }
                />
                <span className="setting-unit">hours</span>
              </SettingsChoiceRow>
              {mutation.error ? (
                <p className="form-error" role="alert">
                  {errorText(mutation.error)}
                </p>
              ) : null}
              {validationError ? (
                <p className="form-error" role="alert">
                  {validationError}
                </p>
              ) : null}
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
                    !draftDirty ||
                    (blankChoices &&
                      (!draft.week_start_day || !draft.time_format))
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

function checklistDraft(
  values: SchedulingSettingsInput,
): SchedulingSettingsDraft {
  return { ...values, week_start_day: "", time_format: "" };
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
