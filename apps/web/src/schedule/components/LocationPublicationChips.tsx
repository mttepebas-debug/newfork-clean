import { Eye, History, MapPinOff } from "lucide-react";

export interface LocationPublicationChipStatus {
  readonly id: string;
  readonly name: string;
  readonly color?: string | null;
  readonly status: "published" | "unpublished";
  readonly reason?: "worked_shifts_kept" | "not_live" | "live";
  readonly published_shift_count: number;
}

export function LocationPublicationChips({
  statuses,
  selectedLocationIds,
  onLocationClick,
}: {
  readonly statuses: readonly LocationPublicationChipStatus[];
  readonly selectedLocationIds: readonly string[];
  readonly onLocationClick: (locationId: string) => void;
}) {
  if (!statuses.length) return null;
  const selected = new Set(selectedLocationIds);

  return (
    <div className="schedule-location-publication-chips">
      {statuses.map((status) => {
        const active = selected.size === 0 || selected.has(status.id);
        const isLive =
          status.status === "published" && status.reason !== "worked_shifts_kept";
        const isHistorical = status.reason === "worked_shifts_kept";

        return (
          <button
            key={status.id}
            type="button"
            title={chipLabel(status)}
            aria-label={chipLabel(status)}
            data-live={isLive}
            data-historical={isHistorical}
            data-active={active}
            onClick={() => onLocationClick(status.id)}
          >
            <span
              className="schedule-location-publication-dot"
              style={{ backgroundColor: status.color ?? "#64748b" }}
              aria-hidden
            />
            {chipIcon(isLive, isHistorical)}
            <span>{status.name}</span>
            <strong>{isLive ? status.published_shift_count : null}</strong>
          </button>
        );
      })}
    </div>
  );
}

function chipLabel(status: LocationPublicationChipStatus): string {
  if (status.status === "published" && status.reason !== "worked_shifts_kept") {
    return `${status.name} live`;
  }
  if (status.reason === "worked_shifts_kept") {
    return `${status.name} worked kept`;
  }
  return `${status.name} not live`;
}

function chipIcon(isLive: boolean, isHistorical: boolean) {
  if (isLive) return <Eye size={14} aria-hidden />;
  if (isHistorical) return <History size={14} aria-hidden />;
  return <MapPinOff size={14} aria-hidden />;
}
