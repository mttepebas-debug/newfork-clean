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
import {
  scheduleJobName,
  scheduleShiftTypeOf,
  type ScheduleCatalog,
} from "../lib/scheduleCatalogNames";

export function ScheduleGridDragPreviews({
  dragPreviewShift,
  catalog,
  presetDragState,
  shiftDragState,
  showClockTimes,
  timeFormat,
  showJobColorDot,
  showShiftLabels,
  showShiftType,
}: {
  readonly dragPreviewShift: ScheduleEditableShift | undefined;
  readonly catalog: ScheduleCatalog;
  readonly presetDragState: PresetDragState | null;
  readonly shiftDragState: ShiftDragState | null;
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
          job={scheduleJobName(catalog, dragPreviewShift.job_id) ?? "Shift"}
          type={scheduleShiftTypeOf(catalog, dragPreviewShift.shift_type_id)}
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
