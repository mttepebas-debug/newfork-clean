import type {
  ScheduleEditableShift,
  ScheduleReadModel,
  ScheduleShift,
} from "@newfork/shared/schedule";
import { AlertTriangle, Check, CloudOff, Edit3 } from "lucide-react";
import type {
  CSSProperties,
  MouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useRef } from "react";

import {
  formatScheduleBadgeAriaLabel,
  formatScheduleShiftWarningAria,
} from "../badgeAccessibility";
import type { TimeFormat } from "../timeInput";
import type { ShiftPublicationState } from "./ScheduleContextMenu";

const warningLabels = {
  availability: "Outside employee availability",
  closed_location: "Location is closed",
  overlap: "Overlapping employee shifts",
} as const;

export function ShiftCard({
  shift,
  job,
  type,
  locationName,
  editing = false,
  showShiftType,
  showShiftLabels,
  showClockTimes,
  timeFormat = "12h",
  showJobColorDot: _showJobColorDot,
  selected = false,
  focused = false,
  rowKey,
  badgeHeight,
  dragging,
  publicationState,
  onSelect,
  onFocus,
  onEdit,
  onCopy,
  onContextMenu,
  onPointerDown,
  onMouseDown,
}: {
  readonly shift: ScheduleShift;
  readonly job: string;
  readonly type: ScheduleReadModel["shift_types"][number] | undefined;
  readonly locationName?: string | null;
  readonly editing?: boolean;
  readonly showShiftType: boolean;
  readonly showShiftLabels: boolean;
  readonly showClockTimes: boolean;
  readonly timeFormat?: TimeFormat;
  readonly showJobColorDot: boolean;
  readonly selected?: boolean;
  readonly focused?: boolean;
  readonly rowKey: string;
  readonly badgeHeight: number;
  readonly dragging?: boolean;
  readonly publicationState: ShiftPublicationState | null;
  readonly onSelect?: (id: string, additive: boolean) => void;
  readonly onFocus?: (shift: ScheduleShift) => void;
  readonly onEdit?: (
    shift: ScheduleEditableShift,
    point?: { readonly x: number; readonly y: number },
  ) => void;
  readonly onCopy?: (shift: ScheduleEditableShift) => void;
  readonly onContextMenu?: (
    shift: ScheduleEditableShift,
    event: MouseEvent<HTMLElement>,
  ) => void;
  readonly onPointerDown?: (
    shiftId: string,
    event: ReactPointerEvent<HTMLElement>,
  ) => void;
  readonly onMouseDown?: (
    shiftId: string,
    event: MouseEvent<HTMLElement>,
  ) => void;
}) {
  const title = formatScheduleShiftBadgeTitle(type, job, showShiftType);
  const showClockRow = showClockTimes && !shift.hide_time_on_badge;
  const timeText = formatScheduleBadgeTimeRange(
    shift.start_time,
    shift.end_time,
    timeFormat,
  );
  const labelText = (shift.label_names ?? []).join(" · ");
  const warningText = formatScheduleShiftWarningAria(shift.warning_codes);
  const modifierSelectionHandledRef = useRef(false);
  const handleModifierSelectionStart = (
    event: ReactPointerEvent<HTMLElement> | MouseEvent<HTMLElement>,
    phase: "pointer" | "mouse",
  ) => {
    if (!editing || !(event.shiftKey || event.ctrlKey || event.metaKey)) {
      return false;
    }
    if (phase === "pointer" || !modifierSelectionHandledRef.current) {
      modifierSelectionHandledRef.current = true;
      onSelect?.(shift.id, true);
    }
    event.preventDefault();
    event.stopPropagation();
    return true;
  };

  return (
    <button
      type="button"
      className="schedule-shift-badge"
      style={
        {
          "--shift-color": type?.color ?? "#54736a",
          "--schedule-row-badge-height": `${badgeHeight}px`,
        } as CSSProperties
      }
      aria-label={formatScheduleBadgeAriaLabel({
        title,
        labelText: showShiftLabels ? labelText : "",
        timeText: showClockRow ? timeText : "",
        locationText: locationName ?? "",
        warningText,
      })}
      data-shift-badge="true"
      data-shift-id={shift.id}
      data-schedule-row-key={rowKey}
      data-selected={selected}
      data-dragging={dragging}
      data-job-color-dot={false}
      data-has-markers={Boolean(
        publicationState || shift.warning_codes.length,
      )}
      data-shift-labels-visible={showShiftLabels}
      data-publication-state={publicationState ?? undefined}
      data-focused={focused}
      aria-pressed={selected}
      draggable={editing}
      onPointerDown={(event) => {
        if (handleModifierSelectionStart(event, "pointer")) return;
        modifierSelectionHandledRef.current = false;
        onPointerDown?.(shift.id, event);
      }}
      onMouseDown={(event) => {
        if (handleModifierSelectionStart(event, "mouse")) return;
        modifierSelectionHandledRef.current = false;
        onMouseDown?.(shift.id, event);
      }}
      onClick={(event) => {
        if (modifierSelectionHandledRef.current) {
          modifierSelectionHandledRef.current = false;
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (editing && event.detail > 1) {
          event.preventDefault();
          event.stopPropagation();
          onEdit?.(shift as ScheduleEditableShift, {
            x: event.clientX,
            y: event.clientY,
          });
          return;
        }
        if (event.shiftKey || event.ctrlKey || event.metaKey) {
          if (!editing) return;
          event.preventDefault();
          event.stopPropagation();
          onSelect?.(shift.id, true);
          return;
        }
        onFocus?.(shift);
      }}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        return (
          editing &&
          onEdit?.(shift as ScheduleEditableShift, {
            x: event.clientX,
            y: event.clientY,
          })
        );
      }}
      onKeyDown={(event) => {
        if (!editing) return;
        if (event.key === "Enter") onEdit?.(shift as ScheduleEditableShift);
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c")
          onCopy?.(shift as ScheduleEditableShift);
      }}
      onContextMenu={(event) => {
        if (!editing) return;
        onContextMenu?.(shift as ScheduleEditableShift, event);
      }}
    >
      {selected || focused ? (
        <span
          className="schedule-shift-selection-ring"
          data-shift-selection-ring="true"
          data-multi-selected={selected}
          aria-hidden="true"
        />
      ) : null}
      {publicationState || shift.warning_codes.length ? (
        <span className="schedule-shift-badge-markers">
          {publicationState === "locked" ? (
            <Check size={12} aria-label="Live - published to employees">
              <title>Live - published to employees</title>
            </Check>
          ) : null}
          {publicationState === "staged-removed" ? (
            <CloudOff size={12} aria-label="Staged for removal">
              <title>Staged for removal</title>
            </CloudOff>
          ) : null}
          {publicationState === "unlocked-modified" ? (
            <Edit3
              size={12}
              aria-label="Edited - updates the live shift on next publish"
            >
              <title>Edited - updates the live shift on next publish</title>
            </Edit3>
          ) : null}
          {shift.warning_codes.length ? (
            <AlertTriangle
              size={13}
              aria-label={shift.warning_codes
                .map((code) => warningLabels[code])
                .join(", ")}
            />
          ) : null}
        </span>
      ) : null}
      <span
        className="schedule-shift-badge-content"
        data-shift-badge-content="true"
      >
        <strong>{title}</strong>
        {locationName ? (
          <span
            className="schedule-shift-location"
            data-shift-badge-location="true"
          >
            {locationName}
          </span>
        ) : null}
        {showShiftLabels && labelText ? (
          <span className="schedule-shift-labels">{labelText}</span>
        ) : null}
        {showClockRow ? (
          <span className="schedule-shift-time">
            {timeText}
            {shift.crosses_midnight ? " +1" : ""}
          </span>
        ) : null}
      </span>
    </button>
  );
}

export function GhostShiftCard({
  shift,
  job,
  type,
  locationName,
  showShiftType,
  showShiftLabels,
  showClockTimes,
  timeFormat = "12h",
  showJobColorDot: _showJobColorDot,
  rowKey,
  badgeHeight,
}: {
  readonly shift: ScheduleShift;
  readonly job: string;
  readonly type: ScheduleReadModel["shift_types"][number] | undefined;
  readonly locationName?: string | null;
  readonly showShiftType: boolean;
  readonly showShiftLabels: boolean;
  readonly showClockTimes: boolean;
  readonly timeFormat?: TimeFormat;
  readonly showJobColorDot: boolean;
  readonly rowKey: string;
  readonly badgeHeight: number;
}) {
  const sourceLocation = ghostShiftLocation(shift);
  const displayedLocation = locationName ?? sourceLocation;
  const title = formatScheduleShiftBadgeTitle(type, job, showShiftType);
  const showClockRow = showClockTimes && !shift.hide_time_on_badge;
  const timeText = formatScheduleBadgeTimeRange(
    shift.start_time,
    shift.end_time,
    timeFormat,
  );
  const labelText = (shift.label_names ?? []).join(" · ");
  const warningText = formatScheduleShiftWarningAria(shift.warning_codes);
  const otherLocationText = sourceLocation
    ? `also scheduled at ${sourceLocation}`
    : displayedLocation
      ? `also scheduled at ${displayedLocation}`
      : "";
  return (
    <article
      className="schedule-shift-badge"
      style={
        {
          "--shift-color": type?.color ?? "#54736a",
          "--schedule-row-badge-height": `${badgeHeight}px`,
        } as CSSProperties
      }
      aria-label={formatScheduleBadgeAriaLabel({
        title,
        labelText: showShiftLabels ? labelText : "",
        timeText: showClockRow ? timeText : "",
        locationText: otherLocationText,
        warningText,
      })}
      data-testid="ghost-shift-badge"
      data-shift-badge="true"
      data-shift-id={shift.id}
      data-schedule-row-key={rowKey}
      data-ghost="true"
      data-job-color-dot={false}
      data-has-markers={Boolean(shift.warning_codes.length)}
      data-shift-labels-visible={showShiftLabels}
      title={
        sourceLocation
          ? `Also scheduled at ${sourceLocation}${
              warningText ? ` and ${warningText}` : ""
            }`
          : warningText || undefined
      }
    >
      {shift.warning_codes.length ? (
        <span className="schedule-shift-badge-markers">
          <AlertTriangle
            size={13}
            aria-label={shift.warning_codes
              .map((code) => warningLabels[code])
              .join(", ")}
          />
        </span>
      ) : null}
      <span
        className="schedule-shift-badge-content"
        data-shift-badge-content="true"
      >
        <strong>{title}</strong>
        {displayedLocation ? (
          <span
            className="schedule-shift-location"
            data-shift-badge-location="true"
          >
            {displayedLocation}
          </span>
        ) : null}
        {showShiftLabels && labelText ? (
          <span className="schedule-shift-labels">{labelText}</span>
        ) : null}
        {showClockRow ? (
          <span className="schedule-shift-time">
            {timeText}
            {shift.crosses_midnight ? " +1" : ""}
          </span>
        ) : null}
      </span>
    </article>
  );
}

export function formatScheduleShiftBadgeTitle(
  type: ScheduleReadModel["shift_types"][number] | undefined,
  job: string,
  showShiftType = true,
): string {
  if (!showShiftType) return job;
  return type ? `${type.name}-${job}` : job;
}

export function formatScheduleBadgeTime(
  value: string,
  timeFormat: TimeFormat = "12h",
): string {
  const [hour, minute] = value.split(":").map(Number);
  const normalizedHour = hour ?? 0;
  const normalizedMinute = minute ?? 0;
  if (timeFormat === "24h") {
    return `${String(normalizedHour).padStart(2, "0")}:${String(normalizedMinute).padStart(2, "0")}`;
  }
  const suffix = normalizedHour >= 12 ? "p" : "a";
  const display = normalizedHour % 12 || 12;
  if (normalizedMinute === 0) return `${display}${suffix}`;
  return `${display}:${String(normalizedMinute).padStart(2, "0")}${suffix}`;
}

export function formatScheduleBadgeTimeRange(
  startTime: string,
  endTime: string,
  timeFormat: TimeFormat = "12h",
): string {
  return `${formatScheduleBadgeTime(startTime, timeFormat)} to ${formatScheduleBadgeTime(endTime, timeFormat)}`;
}

type GhostShiftMetadata = {
  readonly ghost?: boolean;
  readonly is_ghost?: boolean;
  readonly ghost_location_name?: string | null;
  readonly source_location_name?: string | null;
};

function ghostShiftLocation(shift: ScheduleShift): string | null {
  const metadata = shift as ScheduleShift & GhostShiftMetadata;
  return metadata.ghost_location_name ?? metadata.source_location_name ?? null;
}
