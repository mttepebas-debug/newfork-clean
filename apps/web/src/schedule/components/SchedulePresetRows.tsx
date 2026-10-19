import type {
  ScheduleLocation,
  ScheduleReadModel,
} from "@newfork/shared/schedule";
import {
  useRef,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { PresetCreateInput } from "../lib/shiftEditorState";
import { resolveScheduleInteractionLocationId } from "../lib/scheduleGridLayout";

export interface PresetCreateTarget {
  readonly locationId: string;
  readonly employeeId: string | null;
  readonly date: string;
  readonly preset: PresetCreateInput;
  readonly point?: { readonly x: number; readonly y: number };
}

export interface PresetDragSource {
  readonly jobId: string;
  readonly shiftTypeId: string;
  readonly label: string;
  readonly color: string;
  readonly startTime: string | null;
  readonly endTime: string | null;
}

export interface PresetDropTarget extends PresetDragSource {
  readonly employeeId: string | null;
  readonly locationId: string;
  readonly date: string;
}

export interface PresetDropEvaluation {
  readonly allowed: boolean;
  readonly reason?: string;
  /** One or two words for the dragged preset; `reason` is the full sentence. */
  readonly shortReason?: string;
  readonly targetStatus?: "allowed" | "warning" | "blocked" | null;
}

export interface PresetDragState extends PresetDragSource {
  readonly pointerX: number;
  readonly pointerY: number;
  readonly previewWidth: number;
  readonly previewHeight: number;
  /** Where on the chip the press landed, from its top-left corner. */
  readonly grabX: number;
  readonly grabY: number;
  readonly targetKey: string | null;
  readonly targetStatus: "allowed" | "warning" | "blocked" | null;
  readonly reason: string | null;
}

type PresetLocation = ScheduleLocation & {
  readonly sourceIds: readonly string[];
  readonly sourceNames?: readonly {
    readonly id: string;
    readonly name: string;
  }[];
};

const structuralSeparatorColor =
  "color-mix(in srgb, hsl(var(--foreground)) 36%, hsl(var(--card)) 64%)";

function RoleEmployeeSeam() {
  return (
    <span
      aria-hidden
      className="schedule-role-employee-seam"
      data-schedule-role-employee-seam="true"
      style={{
        right: "-1px",
        width: "3px",
        backgroundColor: structuralSeparatorColor,
      }}
    />
  );
}

export function SchedulePresetRows({
  job,
  shiftTypes,
  locations,
  activeInteractionShiftLocationId = null,
  days,
  editing,
  showTotalHours,
  onPresetCreate,
  onPresetPointerDown,
  onPresetMouseDown,
}: {
  readonly job: ScheduleReadModel["jobs"][number];
  readonly shiftTypes: ScheduleReadModel["shift_types"];
  readonly locations: readonly PresetLocation[];
  readonly activeInteractionShiftLocationId?: string | null;
  readonly days: readonly string[];
  readonly editing: boolean;
  readonly showTotalHours: boolean;
  readonly onPresetCreate: (target: PresetCreateTarget) => void;
  readonly onPresetPointerDown?: (
    preset: PresetDragSource,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  readonly onPresetMouseDown?: (
    preset: PresetDragSource,
    event: MouseEvent<HTMLButtonElement>,
  ) => void;
}) {
  // Where the last press on a chip began: a press that ends far away was a
  // drag, already dropped on its own day, not a click on the chip (PRESET-SAAT).
  const pressAt = useRef<{ x: number; y: number } | null>(null);
  if (!shiftTypes.length) return null;
  return (
    <>
      <div
        className="schedule-preset-row-label schedule-grid-sticky"
        role="rowheader"
        data-testid={`schedule-employee-group-${job.id}`}
        data-schedule-employee-group={job.id}
        data-schedule-pinned-cell="employee"
        data-schedule-role-separator-line="true"
        style={
          {
            "--preset-job-color": job.color,
          } as CSSProperties
        }
      >
        <span aria-hidden className="schedule-preset-job-dot" />
        <strong>{job.name}</strong>
        <RoleEmployeeSeam />
      </div>
      {locations.flatMap((location, locationIndex) =>
        days.map((day, dayIndex) => {
          const shiftType = shiftTypes[dayIndex];
          const label = shiftType ? `${shiftType.name}-${job.name}` : "";
          const hasDefaultTimes = Boolean(
            shiftType?.default_start_time && shiftType.default_end_time,
          );
          const interactionLocationId = resolveScheduleInteractionLocationId({
            sourceLocationIds: location.sourceIds,
            activeInteractionShiftLocationId,
          });
          return (
            <div
              key={`preset-${job.id}-${location.id}-${day}`}
              className="schedule-preset-cell"
              role="gridcell"
              data-schedule-employee-group-boundary={job.id}
              data-schedule-preset-cell="true"
              data-preset-drop-cell="true"
              data-schedule-preset-location-end={
                dayIndex === days.length - 1 ? "true" : undefined
              }
              data-schedule-role-separator-line="true"
              data-location-boundary={
                locationIndex > 0 && dayIndex === 0 ? "start" : undefined
              }
              data-location-id={interactionLocationId}
              data-display-location-id={location.id}
              data-date={day}
              data-job-id={job.id}
            >
              {shiftType ? (
                <button
                  type="button"
                  className="schedule-preset-chip"
                  data-schedule-preset-chip="true"
                  data-job-id={job.id}
                  data-shift-type-id={shiftType.id}
                  data-default-start-time={shiftType.default_start_time ?? ""}
                  data-default-end-time={shiftType.default_end_time ?? ""}
                  data-preset-has-default-times={hasDefaultTimes}
                  data-preset-clock-off={!hasDefaultTimes}
                  disabled={!editing}
                  aria-label={label}
                  title={label}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (!editing) return;
                    const press = pressAt.current;
                    pressAt.current = null;
                    if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 4) return;
                    onPresetCreate({
                      locationId: interactionLocationId,
                      employeeId: null,
                      date: day,
                      point: { x: event.clientX, y: event.clientY },
                      preset: {
                        jobId: job.id,
                        shiftTypeId: shiftType.id,
                        startTime: shiftType.default_start_time,
                        endTime: shiftType.default_end_time,
                      },
                    });
                  }}
                  onPointerDown={(event) => {
                    pressAt.current = { x: event.clientX, y: event.clientY };
                    onPresetPointerDown?.(
                      {
                        jobId: job.id,
                        shiftTypeId: shiftType.id,
                        label,
                        color: shiftType.color,
                        startTime: shiftType.default_start_time,
                        endTime: shiftType.default_end_time,
                      },
                      event,
                    );
                  }}
                  onMouseDown={(event) =>
                    onPresetMouseDown?.(
                      {
                        jobId: job.id,
                        shiftTypeId: shiftType.id,
                        label,
                        color: shiftType.color,
                        startTime: shiftType.default_start_time,
                        endTime: shiftType.default_end_time,
                      },
                      event,
                    )
                  }
                  style={
                    {
                      "--shift-color": shiftType.color,
                      "--schedule-preset-chip-border": shiftType.color,
                      "--schedule-preset-chip-hover-glow": `color-mix(in srgb, ${shiftType.color} 52%, #000)`,
                      "--schedule-preset-chip-hover-glow-soft": `color-mix(in srgb, ${shiftType.color} 24%, transparent)`,
                      borderColor: `color-mix(in srgb, ${shiftType.color} 64%, #26332e)`,
                      backgroundColor: `color-mix(in srgb, ${shiftType.color} 14%, #fff)`,
                      color: "#000000",
                      height: "calc(100% - 4px)",
                      width: "100%",
                    } as CSSProperties
                  }
                >
                  {label}
                </button>
              ) : null}
            </div>
          );
        }),
      )}
      {showTotalHours ? (
        <div
          className="schedule-preset-total-cell"
          role="gridcell"
          data-schedule-total-column-cell="true"
          aria-hidden="true"
        />
      ) : null}
    </>
  );
}

export function ScheduleGroupLabelRow({
  label,
  groupId,
  color,
  locations,
  days,
  showTotalHours,
}: {
  readonly label: string;
  readonly groupId: string;
  readonly color: string | null;
  readonly locations: readonly PresetLocation[];
  readonly days: readonly string[];
  readonly showTotalHours: boolean;
}) {
  return (
    <>
      <div
        className="schedule-preset-row-label schedule-grid-sticky"
        role="rowheader"
        data-schedule-employee-group={groupId}
        data-schedule-pinned-cell="employee"
        data-schedule-role-separator-line="true"
        style={
          {
            "--preset-job-color": color ?? "#60716a",
          } as CSSProperties
        }
      >
        <span aria-hidden className="schedule-preset-job-dot" />
        <strong>{label}</strong>
        <RoleEmployeeSeam />
      </div>
      {locations.flatMap((_location, locationIndex) =>
        days.map((day, dayIndex) => (
          <div
            key={`group-label-${label}-${locationIndex}-${day}`}
            className="schedule-preset-cell schedule-group-label-cell"
            role="gridcell"
            data-schedule-preset-location-end={
              dayIndex === days.length - 1 ? "true" : undefined
            }
            data-schedule-role-separator-line="true"
            data-location-boundary={
              locationIndex > 0 && dayIndex === 0 ? "start" : undefined
            }
            aria-hidden="true"
          />
        )),
      )}
      {showTotalHours ? (
        <div
          className="schedule-preset-total-cell"
          role="gridcell"
          data-schedule-total-column-cell="true"
          aria-hidden="true"
        />
      ) : null}
    </>
  );
}
