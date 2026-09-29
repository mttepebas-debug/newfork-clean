import type { ScheduleLocation } from "@newfork/shared/schedule";
import { CalendarDays, CheckCircle2, EyeOff, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import type { LocationPublicationChipStatus } from "../lib/scheduleFilterModel";
import { useCloseOnEscape } from "../lib/useCloseOnEscape";

export function UnpublishScheduleDialog({
  open,
  weekLabel,
  locations,
  statuses = [],
  isUnpublishing = false,
  onOpenChange,
  onConfirm,
}: {
  readonly open: boolean;
  readonly weekLabel: string;
  readonly locations: readonly ScheduleLocation[];
  readonly statuses?: readonly LocationPublicationChipStatus[];
  readonly isUnpublishing?: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: (locationIds: string[]) => Promise<unknown>;
}) {
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const statusByLocation = new Map(statuses.map((status) => [status.id, status]));
  const liveLocations = locations.filter(
    (location) => statusByLocation.get(location.id)?.status === "published",
  );
  const hasLocationPicker = liveLocations.length > 0;
  const busy = pending || isUnpublishing;
  // BL-301: while an unpublish is sending the window stays; every way out
  // (Cancel, X, backdrop, Escape) goes through here.
  const close = () => {
    if (!busy) onOpenChange(false);
  };
  useCloseOnEscape(open ? close : null);

  useEffect(() => {
    if (!open) {
      setSelectedLocationIds([]);
      setError(null);
      return;
    }
    window.setTimeout(() => cancelButtonRef.current?.focus(), 0);
  }, [open]);

  if (!open) return null;

  const toggleLocation = (locationId: string) => {
    setSelectedLocationIds((current) =>
      current.includes(locationId)
        ? current.filter((id) => id !== locationId)
        : [...current, locationId],
    );
  };
  const confirmDisabled =
    busy || (hasLocationPicker && selectedLocationIds.length === 0);
  const confirm = async () => {
    setPending(true);
    setError(null);
    try {
      await onConfirm(selectedLocationIds);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="schedule-unpublish-layer" role="presentation">
      <button
        type="button"
        aria-label="Close unpublish dialog"
        className="schedule-unpublish-backdrop"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={close}
      />
      <section
        className="schedule-unpublish-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-unpublish-title"
      >
        <header>
          <button
            type="button"
            className="icon-button schedule-unpublish-close"
            aria-label="Close"
            onClick={close}
          >
            <X size={16} aria-hidden />
          </button>
          <div className="schedule-unpublish-eyebrow">
            <EyeOff size={14} aria-hidden />
            Live access
          </div>
          <h2 id="schedule-unpublish-title">Unpublish schedule</h2>
          <div className="schedule-unpublish-week-card">
            <span>
              <CalendarDays size={17} aria-hidden />
            </span>
            <div>
              <small>Week</small>
              <strong>{weekLabel}</strong>
              <em>Current live schedule</em>
            </div>
          </div>
        </header>

        <div className="schedule-unpublish-body">
          <div className="schedule-unpublish-locations">
            {liveLocations.map((location) => {
              const status = statusByLocation.get(location.id);
              const selected = selectedLocationIds.includes(location.id);
              const removedCount = status?.published_shift_count;
              const locationColor =
                status?.color ??
                (location as ScheduleLocation & { readonly color?: string | null })
                  .color ??
                "#64748b";
              return (
                <label key={location.id} data-selected={selected}>
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={busy}
                    onChange={() => toggleLocation(location.id)}
                  />
                  <span>
                    <strong>
                      <i
                        className="schedule-unpublish-location-dot"
                        style={{ backgroundColor: locationColor }}
                        aria-hidden
                      />
                      {location.name}
                    </strong>
                    <small>
                      {typeof removedCount === "number"
                        ? `${removedCount} live shifts will be removed`
                        : "Live shifts will be removed"}
                    </small>
                  </span>
                </label>
              );
            })}
          </div>
          <div className="schedule-unpublish-effects">
            <UnpublishEffect
              icon={<EyeOff size={15} aria-hidden />}
              text="Employee visibility for unworked shifts stops immediately."
              destructive
            />
            <UnpublishEffect
              icon={<CheckCircle2 size={15} aria-hidden />}
              text="Active cover and swap requests for removed shifts will be closed."
            />
            <UnpublishEffect
              icon={<CheckCircle2 size={15} aria-hidden />}
              text="No schedule-change notification is sent."
            />
            <UnpublishEffect
              icon={<CheckCircle2 size={15} aria-hidden />}
              text="This cannot be undone. Republish to restore."
            />
          </div>
          {error ? (
            <p className="schedule-unpublish-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <footer>
          <button
            ref={cancelButtonRef}
            type="button"
            disabled={busy}
            onClick={close}
          >
            Cancel
          </button>
          <button
            type="button"
            className="danger"
            disabled={confirmDisabled}
            onClick={() => void confirm()}
          >
            {busy ? <Loader2 size={15} aria-hidden /> : <EyeOff size={15} aria-hidden />}
            {hasLocationPicker
              ? `Unpublish ${selectedLocationIds.length} locations`
              : "Unpublish"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function UnpublishEffect({
  icon,
  text,
  destructive = false,
}: {
  readonly icon: ReactNode;
  readonly text: string;
  readonly destructive?: boolean;
}) {
  return (
    <div data-destructive={destructive}>
      {icon}
      <span>{text}</span>
    </div>
  );
}
