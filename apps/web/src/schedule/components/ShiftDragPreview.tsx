import type {
  ScheduleEditableShift,
  ScheduleReadModel,
} from "@newfork/shared/schedule";
import type { CSSProperties } from "react";

import type { PresetDragState } from "./SchedulePresetRows";
import { ShiftCard } from "./ShiftCard";
import type { ScheduleShiftTypeLook } from "../lib/scheduleCatalogNames";

interface ShiftDragPreviewState {
  readonly pointerX: number;
  readonly pointerY: number;
  readonly previewWidth: number;
  readonly previewHeight: number;
  readonly grabX: number;
  readonly grabY: number;
  readonly targetStatus: "allowed" | "warning" | "blocked" | null;
  readonly reason: string | null;
  readonly copy: boolean;
}

export function ShiftDragPreview({
  dragState,
  shift,
  job,
  type,
  showShiftType,
  showShiftLabels,
  showClockTimes,
  timeFormat,
  showJobColorDot,
}: {
  readonly dragState: ShiftDragPreviewState;
  readonly shift: ScheduleEditableShift;
  readonly job: string;
  readonly type: ScheduleShiftTypeLook | undefined;
  readonly showShiftType: boolean;
  readonly showShiftLabels: boolean;
  readonly showClockTimes: boolean;
  readonly timeFormat: ScheduleReadModel["settings"]["time_format"];
  readonly showJobColorDot: boolean;
}) {
  return (
    <div
      className="schedule-shift-drag-preview"
      aria-hidden="true"
      style={{
        left: dragState.pointerX - dragState.grabX,
        top: dragState.pointerY - dragState.grabY,
        width: dragState.previewWidth,
        minHeight: dragState.previewHeight,
      }}
      data-copy={dragState.copy}
      data-status={dragState.targetStatus ?? undefined}
    >
      <ShiftCard
        shift={shift}
        job={job}
        type={type}
        showShiftType={showShiftType}
        showShiftLabels={showShiftLabels}
        showClockTimes={showClockTimes}
        timeFormat={timeFormat}
        showJobColorDot={showJobColorDot}
        selected={false}
        rowKey="drag-preview"
        badgeHeight={dragState.previewHeight}
        publicationState={null}
      />
      {dragState.copy ? (
        <span className="schedule-drag-copy-badge">+ Paste</span>
      ) : null}
      {dragState.reason ? (
        <span className="schedule-drag-blocked-reason">{dragState.reason}</span>
      ) : null}
    </div>
  );
}

export function ShiftTypePresetDragPreview({
  dragState,
}: {
  readonly dragState: PresetDragState;
}) {
  return (
    <div
      className="schedule-shift-type-preset-drag-preview"
      data-shift-type-preset-drag-preview="true"
      aria-hidden="true"
      style={{
        left: dragState.pointerX - dragState.grabX,
        top: dragState.pointerY - dragState.grabY,
        width: dragState.previewWidth,
        minHeight: dragState.previewHeight,
      }}
      data-status={dragState.targetStatus ?? undefined}
    >
      <div
        className="schedule-shift-type-preset-drag-preview-card"
        style={
          {
            "--shift-color": dragState.color,
            "--schedule-preset-chip-border": dragState.color,
            "--schedule-preset-chip-hover-glow": `color-mix(in srgb, ${dragState.color} 52%, #000)`,
            "--schedule-preset-chip-hover-glow-soft": `color-mix(in srgb, ${dragState.color} 24%, transparent)`,
            borderColor: `color-mix(in srgb, ${dragState.color} 64%, #26332e)`,
            backgroundColor: `color-mix(in srgb, ${dragState.color} 14%, #fff)`,
          } as CSSProperties
        }
      >
        {dragState.label}
      </div>
      {dragState.reason ? (
        <span className="schedule-drag-blocked-reason">{dragState.reason}</span>
      ) : null}
    </div>
  );
}
