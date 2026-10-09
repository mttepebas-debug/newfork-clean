import type { ScheduleRecentExportEvent } from "@newfork/shared/schedule";
import { History } from "lucide-react";

export function ScheduleExportRecentEvents({
  events,
}: {
  readonly events: readonly ScheduleRecentExportEvent[];
}) {
  return (
    <section
      className="schedule-export-recent-events"
      data-testid="schedule-export-recent-events"
    >
      <div className="schedule-export-section-label">
        <History size={14} />
        Recent exports
      </div>
      {events.length ? (
        <ul>
          {events.slice(0, 10).map((event) => (
            <li key={event.id}>
              <span>
                <strong>{event.surface}</strong>
                <small>
                  {formatExportEventFormat(event.format)} ·{" "}
                  {formatExportEventParams(event)}
                </small>
              </span>
              <time dateTime={event.created_at}>
                {formatRelativeTime(event.created_at)}
              </time>
            </li>
          ))}
        </ul>
      ) : (
        <p className="schedule-export-empty">No exports yet.</p>
      )}
    </section>
  );
}

export function formatExportEventFormat(format: string): string {
  if (format === "csv") return "CSV";
  if (format === "print") return "Print";
  return format.toUpperCase();
}

export function formatExportEventParams(event: ScheduleRecentExportEvent): string {
  const parts: string[] = [];
  if (typeof event.params.week_start === "string") {
    parts.push(event.params.week_start);
  }
  if (typeof event.params.layout === "string") {
    parts.push(event.params.layout);
  }
  const locationIds = event.params.location_ids;
  if (Array.isArray(locationIds) && locationIds.length > 0) {
    parts.push(`${locationIds.length} location(s)`);
  }
  return parts.length ? parts.join(" · ") : "-";
}

export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.round(diffMs / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
