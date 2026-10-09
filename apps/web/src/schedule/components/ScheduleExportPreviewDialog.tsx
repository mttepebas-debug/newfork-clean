import type { ScheduleExportPreview } from "@newfork/shared/schedule";

export function ScheduleExportPreviewDialog({
  preview,
}: {
  readonly preview: ScheduleExportPreview;
}) {
  return (
    <section
      className="schedule-export-preview"
      data-testid="schedule-export-preview-summary"
    >
      <strong>
        {preview.summary.shift_count} shifts ·{" "}
        {preview.summary.employee_count} employees ·{" "}
        {(preview.summary.scheduled_minutes / 60).toFixed(2)} hours
      </strong>
      <span>{preview.locations.map((item) => item.name).join(", ")}</span>
      <div>
        {preview.rows.slice(0, 5).map((row) => (
          <p key={row.shift_id}>
            <span>{row.scheduled_date}</span>
            <strong>{row.employee_name ?? "Open shift"}</strong>
            <span>
              {row.job_name} · {formatTime(row.start_time)}
            </span>
          </p>
        ))}
      </div>
    </section>
  );
}

export function formatScheduleExportPreviewTime(value: string): string {
  const [hour, minute] = value.split(":").map(Number);
  const suffix = (hour ?? 0) >= 12 ? "p" : "a";
  const display = (hour ?? 0) % 12 || 12;
  return minute
    ? `${display}:${String(minute).padStart(2, "0")}${suffix}`
    : `${display}${suffix}`;
}

const formatTime = formatScheduleExportPreviewTime;
