import type {
  ScheduleEditableShift,
  ScheduleReadModel,
  ScheduleShift,
} from "@newfork/shared/schedule";
import { Check, CloudOff, Edit3, MapPin } from "lucide-react";
import type {
  CSSProperties,
  MouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useEffect, useRef } from "react";

import {
  formatScheduleBadgeAriaLabel,
  formatScheduleShiftWarningAria,
} from "../badgeAccessibility";
import type { TimeFormat } from "../timeInput";
import type { ShiftPublicationState } from "./ScheduleContextMenu";
import type { EffectiveScheduleShift } from "../hooks/useEffectiveShifts";
import "./schedule-shift-save.css";

const SINGLE_CLICK_FOCUS_DELAY_MS = 250;

export function formatShiftLabelDisplay(labelNames: readonly string[]): {
  readonly fullText: string;
  readonly displayText: string;
} {
  const labels = labelNames.map((label) => label.trim()).filter(Boolean);
  const fullText = labels.join(" · ");
  return { fullText, displayText: fullText };
}

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
  stackCount = 1,
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
  readonly shift: ScheduleShift & Pick<EffectiveScheduleShift, "optimistic" | "saving_state">;
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
  readonly stackCount?: number;
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
  const labelText = formatShiftLabelDisplay(shift.label_names ?? []);
  const warningText = formatScheduleShiftWarningAria(shift.warning_codes);
  const modifierSelectionHandledRef = useRef(false);
  const pendingSingleClickRef = useRef<number | null>(null);
  const cancelPendingSingleClick = () => {
    if (pendingSingleClickRef.current === null) return;
    window.clearTimeout(pendingSingleClickRef.current);
    pendingSingleClickRef.current = null;
  };
  useEffect(
    () => () => {
      if (pendingSingleClickRef.current !== null) {
        window.clearTimeout(pendingSingleClickRef.current);
      }
    },
    [],
  );
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
        title: stackCount > 1 ? `${title}, ${stackCount} open shifts` : title,
        labelText: showShiftLabels ? labelText.fullText : "",
        timeText: showClockRow ? timeText : "",
        locationText: locationName ?? "",
        warningText,
      })}
      data-shift-badge="true"
      data-shift-id={shift.id}
      disabled={shift.optimistic}
      aria-busy={shift.optimistic || undefined}
      data-save-state={shift.saving_state ?? undefined}
      data-schedule-row-key={rowKey}
      data-selected={selected}
      data-dragging={dragging}
      data-job-color-dot={false}
      data-has-markers={Boolean(publicationState)}
      data-shift-labels-visible={showShiftLabels}
      data-publication-state={publicationState ?? undefined}
      data-focused={focused}
      data-current={focused}
      data-stack-count={stackCount > 1 ? stackCount : undefined}
      aria-pressed={selected}
      onPointerDown={(event) => {
        if (!handleModifierSelectionStart(event, "pointer")) modifierSelectionHandledRef.current = false;
        onPointerDown?.(shift.id, event);
      }}
      onMouseDown={(event) => {
        if (!handleModifierSelectionStart(event, "mouse")) modifierSelectionHandledRef.current = false;
        onMouseDown?.(shift.id, event);
      }}
      onClick={(event) => {
        if (modifierSelectionHandledRef.current) {
          modifierSelectionHandledRef.current = false;
          cancelPendingSingleClick();
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (editing && event.detail > 1) {
          cancelPendingSingleClick();
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (event.shiftKey || event.ctrlKey || event.metaKey) {
          if (!editing) return;
          cancelPendingSingleClick();
          event.preventDefault();
          event.stopPropagation();
          onSelect?.(shift.id, true);
          return;
        }
        if (!editing) {
          onFocus?.(shift);
          return;
        }
        cancelPendingSingleClick();
        pendingSingleClickRef.current = window.setTimeout(() => {
          pendingSingleClickRef.current = null;
          onFocus?.(shift);
        }, SINGLE_CLICK_FOCUS_DELAY_MS);
      }}
      onDoubleClick={(event) => {
        cancelPendingSingleClick();
        event.preventDefault();
        event.stopPropagation();
        if (editing) {
          onEdit?.(shift as ScheduleEditableShift, {
            x: event.clientX,
            y: event.clientY,
          });
        }
      }}
      onKeyDown={(event) => {
        if (!editing) return;
        if (event.key === "Enter") {
          cancelPendingSingleClick();
          onEdit?.(shift as ScheduleEditableShift);
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
          event.preventDefault();
          event.stopPropagation();
          onCopy?.(shift as ScheduleEditableShift);
        }
      }}
      onContextMenu={(event) => {
        if (!editing) return;
        onContextMenu?.(shift as ScheduleEditableShift, event);
      }}
    >
      {shift.saving_state ? (
        <span className="schedule-shift-save-status" role="status"
          title={shift.saving_state === "delayed" ? "Still saving. Wait for the result before trying again." : undefined}>
          {shift.saving_state === "delayed" ? "Still saving — please wait" : "Saving"}
        </span>
      ) : null}
      {selected || focused ? (
        <span
          className="schedule-shift-selection-ring"
          data-shift-selection-ring="true"
          data-multi-selected={selected}
          data-current={focused}
          aria-hidden="true"
        />
      ) : null}
      {publicationState ? (
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
        </span>
      ) : null}
      {stackCount > 1 ? (
        <span className="schedule-shift-stack-count" aria-hidden="true">
          x{stackCount}
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
        {showShiftLabels && labelText.displayText ? (
          <span className="schedule-shift-labels" title={labelText.fullText}>
            {labelText.displayText}
          </span>
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
  // An out-of-scope ghost carries its own job and type names; the lists may not have them.
  const metadata = shift as ScheduleShift & GhostShiftMetadata;
  const carriedTypeName = metadata.ghost_shift_type_name?.trim();
  // DEV-only ghost color mockups (ghost-color); deleted after the pick.
  const devGhost = devGhostVariant();
  const devBefore = devGhost === "before";
  const title = devBefore
    ? formatScheduleShiftBadgeTitle(type, job, showShiftType)
    : formatScheduleShiftBadgeTitle(
        carriedTypeName ? { name: carriedTypeName } : type,
        metadata.ghost_job_name?.trim() || job,
        showShiftType,
      );
  // 6-10: every ghost shares one neutral look, whatever its type, job or location.
  const devNeutral = devGhost !== null && Number(devGhost) >= 6;
  const ghostColor = devNeutral
    ? "#66716c"
    : (type?.color ??
      (devGhost && !devBefore && devGhost !== "now" ? DEV_GHOST_TYPE_COLOR : "#54736a"));
  const devStrip = devGhost === "6" && displayedLocation;
  const showClockRow = showClockTimes && !shift.hide_time_on_badge;
  const timeText = formatScheduleBadgeTimeRange(
    shift.start_time,
    shift.end_time,
    timeFormat,
  );
  const labelText = formatShiftLabelDisplay(
    devBefore ? [] : (shift.label_names ?? []),
  );
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
          "--shift-color": ghostColor,
          "--schedule-row-badge-height": `${badgeHeight}px`,
        } as CSSProperties
      }
      aria-label={formatScheduleBadgeAriaLabel({
        title,
        labelText: showShiftLabels ? labelText.fullText : "",
        timeText: showClockRow ? timeText : "",
        locationText: otherLocationText,
        warningText,
      })}
      data-testid="ghost-shift-badge"
      data-ghost-variant={devGhost ?? undefined}
      data-shift-badge="true"
      data-shift-id={shift.id}
      data-schedule-row-key={rowKey}
      data-ghost="true"
      data-job-color-dot={false}
      data-has-markers={false}
      data-shift-labels-visible={showShiftLabels}
      title={
        sourceLocation
          ? `Also scheduled at ${sourceLocation}${
              warningText ? ` and ${warningText}` : ""
            }`
          : warningText || undefined
      }
    >
      {devGhost === "8" ? (
        <span className="dev-ghost-corner" aria-hidden="true">
          <MapPin size={10} strokeWidth={2.5} />
        </span>
      ) : null}
      <span
        className="schedule-shift-badge-content"
        data-shift-badge-content="true"
      >
        {devStrip ? (
          <span className="dev-ghost-strip">
            <MapPin size={10} strokeWidth={2.5} aria-hidden="true" />
            {displayedLocation}
          </span>
        ) : null}
        <strong>{title}</strong>
        {displayedLocation && !devStrip ? (
          <span
            className="schedule-shift-location"
            data-shift-badge-location="true"
          >
            {devGhost === "10" ? (
              <MapPin size={10} strokeWidth={2.5} aria-hidden="true" />
            ) : null}
            {displayedLocation}
          </span>
        ) : null}
        {showShiftLabels && labelText.displayText ? (
          <span className="schedule-shift-labels" title={labelText.fullText}>
            {labelText.displayText}
          </span>
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
  type: Pick<ScheduleReadModel["shift_types"][number], "name"> | undefined,
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
  const suffix = normalizedHour >= 12 ? "PM" : "AM";
  const display = normalizedHour % 12 || 12;
  return `${display}:${String(normalizedMinute).padStart(2, "0")} ${suffix}`;
}

export function formatScheduleBadgeTimeRange(
  startTime: string,
  endTime: string,
  timeFormat: TimeFormat = "12h",
): string {
  return `${formatScheduleBadgeTime(startTime, timeFormat)} - ${formatScheduleBadgeTime(endTime, timeFormat)}`;
}

type GhostShiftMetadata = {
  readonly ghost?: boolean;
  readonly is_ghost?: boolean;
  readonly ghost_location_name?: string | null;
  readonly source_location_name?: string | null;
  readonly ghost_job_name?: string | null;
  readonly ghost_shift_type_name?: string | null;
};

// DEV-only ghost color mockups (ghost-color): ?devGhost=before|now|2..10.
// The out-of-scope type color is not sent yet, so the mockups paint a purple "Bar" type.
const DEV_GHOST_TYPE_COLOR = "#7B5EA7";
const DEV_GHOST_VARIANTS = new Set(["before", "now", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
if (import.meta.env.DEV) void import("../../dev/ghostColorVariants.css");
function devGhostVariant(): string | null {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("devGhost");
  return value && DEV_GHOST_VARIANTS.has(value) ? value : null;
}

function ghostShiftLocation(shift: ScheduleShift): string | null {
  const metadata = shift as ScheduleShift & GhostShiftMetadata;
  return metadata.ghost_location_name ?? metadata.source_location_name ?? null;
}
