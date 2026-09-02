import {
  schedulingSettingsInputSchema,
  type SchedulingSettingsInput,
} from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Save } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
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
  const queryClient = useQueryClient();
  const workspaceId = context?.workspace.id ?? "";
  const queryKey = ["scheduling-settings", workspaceId];
  const query = useQuery({
    queryKey,
    queryFn: () => loadSchedulingSettings(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const [draft, setDraft] = useState<SchedulingSettingsInput>(defaults);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (query.data) setDraft(schedulingSettingsInputSchema.parse(query.data));
  }, [query.data]);

  const mutation = useMutation({
    mutationFn: (values: SchedulingSettingsInput) =>
      saveSchedulingSettings(workspaceId, values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      setSaved(true);
    },
  });

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setSaved(false);
    mutation.mutate(schedulingSettingsInputSchema.parse(draft));
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
                setDraft((current) => ({
                  ...current,
                  week_start_day: value as "sunday" | "monday",
                }))
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
                setDraft((current) => ({
                  ...current,
                  schedule_deadline_day: event.target
                    .value as SchedulingSettingsInput["schedule_deadline_day"],
                }))
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
                setDraft((current) => ({
                  ...current,
                  time_format: value as SchedulingSettingsInput["time_format"],
                }))
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
                setDraft((current) => ({
                  ...current,
                  conflict_policy: value as "warn" | "block",
                }))
              }
            />
          </SettingsChoiceRow>
          <SettingsChoiceRow
            label="Availability conflicts"
            description="Soft keeps manager discretion; hard prevents unavailable assignments."
          >
            <SegmentedChoice
              name="availability-policy"
              value={draft.availability_enforcement}
              options={[
                ["soft", "Soft"],
                ["hard", "Hard"],
              ]}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  availability_enforcement: value as "soft" | "hard",
                }))
              }
            />
          </SettingsChoiceRow>
          {mutation.error ? (
            <p className="form-error" role="alert">
              {errorText(mutation.error)}
            </p>
          ) : null}
          {saved ? (
            <p className="form-success" role="status">
              Scheduling rules saved.
            </p>
          ) : null}
          <div className="organization-form-actions">
            <Button type="submit" disabled={mutation.isPending}>
              <Save size={16} aria-hidden />
              {mutation.isPending ? "Saving" : "Save rules"}
            </Button>
          </div>
        </form>
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
