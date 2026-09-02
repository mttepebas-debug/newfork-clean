import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import type { CSSProperties } from "react";

export interface ScheduleFilterChipView {
  readonly key: string;
  readonly kind: "location" | "shift" | "job" | "employee";
  readonly label: string;
  readonly color?: string | null;
  readonly onRemove: () => void;
}

interface ScheduleFilterCommandStripProps {
  readonly chips: readonly ScheduleFilterChipView[];
  readonly viewModeLabel?: string;
  readonly viewModeTitle?: string;
  readonly returnCue?: boolean;
  readonly showCurrentViewReturnCue?: boolean;
  readonly onToggleViewMode?: () => void;
  readonly onPrevious?: () => void;
  readonly onNext?: () => void;
}

export interface ScheduleViewModeControlsProps {
  readonly viewModeLabel: string;
  readonly viewModeTitle?: string;
  readonly showCurrentViewReturnCue?: boolean;
  readonly onToggleViewMode: () => void;
  readonly onPrevious?: () => void;
  readonly onNext?: () => void;
}

export function ScheduleViewModeControls({
  viewModeLabel,
  viewModeTitle,
  showCurrentViewReturnCue = false,
  onToggleViewMode,
  onPrevious,
  onNext,
}: ScheduleViewModeControlsProps) {
  const isDailyView = viewModeLabel === "Daily view";
  const previousLabel = isDailyView ? "Previous day" : "Previous week";
  const nextLabel = isDailyView ? "Next day" : "Next week";
  const mainButtonTitle =
    viewModeTitle ??
    (isDailyView ? "Switch to weekly view" : "Switch to daily view");

  return (
    <div className="schedule-view-mode-controls">
      {onPrevious ? (
        <button
          type="button"
          className="schedule-view-mode-step"
          aria-label={previousLabel}
          title={previousLabel}
          onClick={(event) => {
            event.stopPropagation();
            onPrevious();
          }}
        >
          <ChevronLeft size={15} aria-hidden />
        </button>
      ) : null}
      <button
        type="button"
        className="schedule-view-mode"
        aria-label={viewModeLabel}
        title={mainButtonTitle}
        data-return-cue={showCurrentViewReturnCue}
        onClick={(event) => {
          event.stopPropagation();
          onToggleViewMode();
        }}
      >
        <CalendarDays size={15} aria-hidden />
        {viewModeLabel}
      </button>
      {onNext ? (
        <button
          type="button"
          className="schedule-view-mode-step"
          aria-label={nextLabel}
          title={nextLabel}
          onClick={(event) => {
            event.stopPropagation();
            onNext();
          }}
        >
          <ChevronRight size={15} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

export function ScheduleFilterCommandStrip({
  chips,
  viewModeLabel,
  viewModeTitle,
  returnCue = false,
  showCurrentViewReturnCue,
  onToggleViewMode,
  onPrevious,
  onNext,
}: ScheduleFilterCommandStripProps) {
  const showViewMode = Boolean(viewModeLabel && onToggleViewMode);
  const hasCommands = chips.length > 0 || showViewMode;
  const shouldShowCurrentViewReturnCue =
    showCurrentViewReturnCue ?? returnCue;

  return (
    <div
      className="schedule-filter-command-strip"
      data-schedule-filter-command-strip
      data-empty={!hasCommands}
      aria-label="Active schedule filters"
      aria-hidden={hasCommands ? undefined : true}
    >
      {showViewMode ? (
        <ScheduleViewModeControls
          viewModeLabel={viewModeLabel!}
          viewModeTitle={viewModeTitle}
          showCurrentViewReturnCue={shouldShowCurrentViewReturnCue}
          onToggleViewMode={onToggleViewMode!}
          onPrevious={onPrevious}
          onNext={onNext}
        />
      ) : null}
      <div className="schedule-filter-command-chips">
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            className="schedule-filter-chip"
            aria-label={`Remove ${chip.kind} filter ${chip.label}`}
            title={`Remove ${chip.label}`}
            onClick={(event) => {
              event.stopPropagation();
              chip.onRemove();
            }}
            style={
              chip.color
                ? ({
                    "--schedule-chip-color": chip.color,
                  } as CSSProperties)
                : undefined
            }
          >
            <span aria-hidden className="schedule-filter-chip-dot" />
            <span>{chip.label}</span>
            <X size={13} aria-hidden />
          </button>
        ))}
      </div>
    </div>
  );
}
