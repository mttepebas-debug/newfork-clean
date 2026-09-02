import type {
  ScheduleEditableShift,
  ScheduleReadModel,
} from "@newfork/shared/schedule";

import type { PresetDragState } from "./SchedulePresetRows";
import {
  ShiftDragPreview,
  ShiftTypePresetDragPreview,
} from "./ShiftDragPreview";
import type { ShiftDragState } from "../hooks/useSingleShiftPointerDrag";

export function ScheduleGridDragPreviews({
  dragPreviewShift,
  jobs,
  presetDragState,
  shiftDragState,
  shiftTypes,
  showClockTimes,
  timeFormat,
  showJobColorDot,
  showShiftLabels,
  showShiftType,
}: {
  readonly dragPreviewShift: ScheduleEditableShift | undefined;
  readonly jobs: ScheduleReadModel["jobs"];
  readonly presetDragState: PresetDragState | null;
  readonly shiftDragState: ShiftDragState | null;
  readonly shiftTypes: ScheduleReadModel["shift_types"];
  readonly showClockTimes: boolean;
  readonly timeFormat: ScheduleReadModel["settings"]["time_format"];
  readonly showJobColorDot: boolean;
  readonly showShiftLabels: boolean;
  readonly showShiftType: boolean;
}) {
  return (
    <>
      {shiftDragState && dragPreviewShift ? (
        <ShiftDragPreview
          dragState={shiftDragState}
          shift={dragPreviewShift}
          job={
            jobs.find((item) => item.id === dragPreviewShift.job_id)?.name ??
            "Shift"
          }
          type={shiftTypes.find(
            (item) => item.id === dragPreviewShift.shift_type_id,
          )}
          showShiftType={showShiftType}
          showShiftLabels={showShiftLabels}
          showClockTimes={showClockTimes}
          timeFormat={timeFormat}
          showJobColorDot={showJobColorDot}
        />
      ) : null}
      {presetDragState ? (
        <ShiftTypePresetDragPreview dragState={presetDragState} />
      ) : null}
    </>
  );
}
