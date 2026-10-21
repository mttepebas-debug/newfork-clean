import type {
  CreateScheduleExportScheduleInput,
  ScheduleExportPreset,
  ScheduleExportSchedule,
} from "@newfork/shared/schedule";
import { CalendarClock, Trash2 } from "lucide-react";
import { useState } from "react";
import { zoneName } from "../../lib/today";

const dayLabels = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const hourOptions = Array.from({ length: 24 }, (_, hour) => hour);

const timezoneOptions = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "UTC",
];

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ScheduleExportSchedules({
  presets,
  schedules,
  selectedLocationIds,
  pending,
  run,
  onCreate,
  onToggle,
  onDelete,
  locationZone,
}: {
  readonly presets: readonly ScheduleExportPreset[];
  readonly schedules: readonly ScheduleExportSchedule[];
  readonly selectedLocationIds: readonly string[];
  readonly pending: boolean;
  readonly run: (action: () => Promise<void>) => void;
  readonly onCreate: (
    input: CreateScheduleExportScheduleInput,
  ) => Promise<unknown>;
  readonly onToggle: (scheduleId: string, enabled: boolean) => Promise<unknown>;
  readonly onDelete: (scheduleId: string) => Promise<unknown>;
  readonly locationZone?: string;
}) {
  const [name, setName] = useState("");
  const [presetId, setPresetId] = useState("");
  const [recipients, setRecipients] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [sendHour, setSendHour] = useState(8);
  // The location's zone first (S-226): the email goes out on the restaurant's clock.
  const [timezone, setTimezone] = useState(locationZone ?? browserTimezone());
  const recipientList = parseRecipients(recipients);
  const recipientError = recipients.trim()
    ? validateRecipients(recipientList)
    : null;
  const canCreate =
    Boolean(name.trim()) &&
    Boolean(presetId) &&
    selectedLocationIds.length > 0 &&
    validateRecipients(recipientList) === null &&
    !pending;

  return (
    <section
      className="schedule-export-schedules"
      data-testid="schedule-export-schedules"
    >
      <div className="schedule-export-section-label">Scheduled emails</div>
      {schedules.length ? (
        <div className="schedule-export-schedule-list">
          {schedules.map((schedule) => (
            <div key={schedule.id} className="schedule-export-schedule-row">
              <label>
                <input
                  type="checkbox"
                  checked={schedule.enabled}
                  disabled={pending}
                  aria-label={`Enable ${schedule.name}`}
                  onChange={(event) =>
                    run(async () => {
                      await onToggle(schedule.id, event.target.checked);
                    })
                  }
                />
                <CalendarClock size={14} />
                <span>
                  <strong>{schedule.name}</strong>
                  <small>
                    {schedule.preset_name ?? "Deleted preset"} -{" "}
                    {dayLabels[schedule.day_of_week]}{" "}
                    {formatScheduleHour(schedule.send_hour)} -{" "}
                    {zoneName(schedule.timezone)}
                  </small>
                  <small>{formatLastSent(schedule.last_sent_at)}</small>
                  {schedule.auto_disabled_at ? (
                    <small className="warning">
                      Auto-disabled
                      {schedule.last_error
                        ? ` - ${truncateScheduleExportError(schedule.last_error)}`
                        : ""}
                    </small>
                  ) : schedule.last_error ? (
                    // KK-166: a partly delivered email keeps the rule on and names who missed it.
                    <small className="warning" title={schedule.last_error}>
                      {truncateScheduleExportError(schedule.last_error)}
                    </small>
                  ) : null}
                </span>
              </label>
              <button
                type="button"
                aria-label={`Delete schedule ${schedule.name}`}
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    await onDelete(schedule.id);
                  })
                }
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="schedule-export-empty">No scheduled emails yet.</p>
      )}
      <div className="schedule-export-schedule-form">
        <input
          id="schedule-export-name"
          aria-label="Schedule name"
          placeholder="Schedule name"
          maxLength={80}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <select
          id="schedule-export-preset"
          aria-label="Scheduled export preset"
          value={presetId}
          onChange={(event) => setPresetId(event.target.value)}
        >
          <option value="">Select a preset...</option>
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
        <input
          id="schedule-export-recipients"
          aria-label="Recipients"
          placeholder="Recipients, comma-separated"
          value={recipients}
          onChange={(event) => setRecipients(event.target.value)}
        />
        {recipientError ? (
          <p className="schedule-export-validation">{recipientError}</p>
        ) : null}
        <div className="schedule-export-schedule-time">
          <select
            id="schedule-export-day"
            aria-label="Day of week"
            value={dayOfWeek}
            onChange={(event) => setDayOfWeek(Number(event.target.value))}
          >
            {dayLabels.map((label, index) => (
              <option key={label} value={index}>
                {label}
              </option>
            ))}
          </select>
          <select
            id="schedule-export-hour"
            aria-label="Send hour"
            value={sendHour}
            onChange={(event) => setSendHour(Number(event.target.value))}
          >
            {hourOptions.map((hour) => (
              <option key={hour} value={hour}>
                {formatScheduleHour(hour)}
              </option>
            ))}
          </select>
          <select
            id="schedule-export-timezone"
            aria-label="Timezone"
            className="schedule-export-timezone-options"
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
          >
            {[...new Set([...(locationZone ? [locationZone] : []), ...timezoneOptions])].map((option) => (
              <option key={option} value={option}>
                {zoneName(option)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          disabled={!canCreate}
          onClick={() =>
            run(async () => {
              await onCreate({
                name: name.trim(),
                preset_id: presetId,
                recipients: recipientList,
                location_ids: [...selectedLocationIds],
                day_of_week: dayOfWeek,
                send_hour: sendHour,
                timezone,
              });
              setName("");
              setRecipients("");
            })
          }
        >
          Add scheduled email
        </button>
      </div>
    </section>
  );
}

export function formatScheduleHour(hour: number): string {
  const suffix = hour < 12 ? "AM" : "PM";
  const display = hour % 12 || 12;
  return `${display}:00 ${suffix}`;
}

export function parseRecipients(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((email) => email.trim())
        .filter(Boolean),
    ),
  );
}

export function validateRecipients(emails: readonly string[]): string | null {
  if (emails.length === 0) return "At least one recipient email is required.";
  if (emails.length > 10) return "At most 10 recipients are allowed.";
  const invalid = emails.find((email) => !emailPattern.test(email));
  return invalid ? `"${invalid}" is not a valid email.` : null;
}

export function truncateScheduleExportError(
  error: string,
  max = 80,
): string {
  return error.length > max ? `${error.slice(0, max - 1)}...` : error;
}

export function formatLastSent(value: string | null): string {
  if (!value) return "Last sent: Never";
  return `Last sent: ${new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}
