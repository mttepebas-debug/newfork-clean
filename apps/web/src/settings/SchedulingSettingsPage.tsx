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
import { WeeklyPreferenceSettingsPanel } from "../availability/WeeklyPreferenceSettings";
import { errorText, SettingsHeader } from "./GeneralSettingsPage";
import {
  loadSchedulingSettings,
  saveSchedulingSettings,
} from "./organization-data";

const defaults: SchedulingSettingsInput = {
  week_start_day: "monday",
  schedule_deadline_day: "sunday",
  conflict_policy: "warn",
  availability_enforcement: "soft",
  time_format: "12h",
  availability_ownership: "hybrid",
  availability_approval: "narrowing",
  availability_initial_review: false,
  availability_notice_days: 0,
  minimum_travel_minutes: 0,
};

type SchedulingSettingsDraft = Omit<
  SchedulingSettingsInput,
  "week_start_day" | "time_format" | "minimum_travel_minutes"
> & {
  week_start_day: SchedulingSettingsInput["week_start_day"] | "";
  time_format: SchedulingSettingsInput["time_format"] | "";
  minimum_travel_minutes?: number | "";
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
  const [saved, setSaved] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!query.data || draftDirty) return;
    const parsed = schedulingSettingsInputSchema.parse(query.data);
    setDraft(checklistMode ? checklistDraft(parsed) : parsed);
    setValidationError(null);
  }, [checklistMode, draftDirty, query.data]);

  const mutation = useMutation({
    mutationFn: (values: SchedulingSettingsInput) =>
      saveSchedulingSettings(workspaceId, values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
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
    setSaved(false);
    setValidationError(null);
    if (checklistMode && (!draft.week_start_day || !draft.time_format)) {
      setValidationError("Choose week start and time format before saving.");
      return;
    }
    const parsed = schedulingSettingsInputSchema.safeParse(draft);
    if (!parsed.success) {
      setValidationError("Enter a whole number from 0 to 240 for minimum travel time.");
      return;
    }
    mutation.mutate(parsed.data);
  };

  return (
    <section
      className="settings-page"
      aria-labelledby="scheduling-settings-title"
    >
      <SettingsHeader
        icon={<CalendarClock size={21} aria-hidden />}
        title="Scheduling"
        description="Week boundaries, publishing expectations, and schedule conflict policy."
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
        <form className="organization-form scheduling-form" onSubmit={submit}>
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
            description="The weekday used as the publication deadline for each schedule week."
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
                  time_format: value as SchedulingSettingsInput["time_format"],
                })
              }
            />
          </SettingsChoiceRow>
          <SettingsChoiceRow
            label="Schedule conflicts"
            description="Choose whether conflicting assignments warn managers or prevent saving."
          >
            <SegmentedChoice
              name="conflict-policy"
              value={draft.conflict_policy}
              options={[
                ["warn", "Warn"],
                ["block", "Block"],
              ]}
              onChange={(value) =>
                updateDraft({
                  conflict_policy: value as "warn" | "block",
                })
              }
            />
          </SettingsChoiceRow>
          <SettingsChoiceRow
            label="Travel between locations"
            description="Minimum time between work at different locations. Applies to Shift Hub cover and swap requests and Line Up staffing decisions."
          >
            <div className="scheduling-travel-control">
              <label htmlFor="minimum-travel">Minimum travel time (minutes)</label>
              <input
                id="minimum-travel"
                type="number"
                min={0}
                max={240}
                step={1}
                required
                aria-describedby="minimum-travel-help"
                value={draft.minimum_travel_minutes ?? 0}
                onChange={(event) => updateDraft({
                  minimum_travel_minutes: event.target.value === "" ? "" : Number(event.target.value),
                })}
              />
              <p id="minimum-travel-help">
                {(draft.minimum_travel_minutes === "" || !Number.isInteger(draft.minimum_travel_minutes ?? 0) || (draft.minimum_travel_minutes ?? 0) < 0 || (draft.minimum_travel_minutes ?? 0) > 240) ? "Enter 0–240 minutes." : (draft.minimum_travel_minutes ?? 0) === 0
                  ? "No minimum configured. Overlapping shifts are still blocked."
                  : `For work ending at 3:00 PM, the next location can start at ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 1, 15, draft.minimum_travel_minutes)))} or later.`}
              </p>
              <p>Pending requests are checked again before approval. Completed changes stay in place.</p>
            </div>
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
                (checklistMode && (!draft.week_start_day || !draft.time_format))
              }
            >
              <Save size={16} aria-hidden />
              {mutation.isPending ? "Saving" : "Save rules"}
            </Button>
          </div>
        </form>
      ) : null}
      {workspaceId ? <WeeklyPreferenceSettingsPanel workspaceId={workspaceId} /> : null}
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
