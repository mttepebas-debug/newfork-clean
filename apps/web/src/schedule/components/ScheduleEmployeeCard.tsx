import type { ScheduleEmployee } from "@newfork/shared/schedule";
import type { CSSProperties, RefObject } from "react";
import { AvailabilityMarkButton } from "./AvailabilityMarkButton";

export function ScheduleEmployeeCard({
  availabilityLines = [],
  editing,
  employee,
  openShiftCount,
  unassignedFrozen,
  unassignedLabelMode,
  rowStyle,
  anchorRef,
  onOpenEmployeeCard,
}: {
  /** The week's unavailable days, when the name's "!" shows (KARARLAR Schedule, 2026-10-06). */
  readonly availabilityLines?: readonly string[];
  readonly editing: boolean;
  readonly employee: ScheduleEmployee | null;
  readonly openShiftCount: number;
  readonly unassignedFrozen: boolean;
  readonly unassignedLabelMode: "header" | "centered";
  readonly rowStyle: CSSProperties;
  readonly anchorRef: RefObject<HTMLDivElement | null>;
  /** Without it there is no card to open, so the name is plain text (QA 59). */
  readonly onOpenEmployeeCard?: (employeeId: string) => void;
}) {
  const isUnassignedRow = !employee;

  return (
    <div
      ref={anchorRef}
      className={`schedule-employee-cell schedule-grid-sticky${
        isUnassignedRow ? " schedule-unassigned-row-cell" : ""
      }`}
      role="rowheader"
      data-schedule-row-owner={employee?.id}
      data-testid={isUnassignedRow ? undefined : "schedule-sticky-employee-seam"}
      data-unassigned={!employee}
      data-editing={editing}
      data-unassigned-frozen={isUnassignedRow && unassignedFrozen}
      data-schedule-employee-row={employee?.id}
      data-schedule-pinned-cell="employee"
      data-schedule-real-row-anchor="true"
      data-schedule-row-top-separator="true"
      data-schedule-unassigned-row={isUnassignedRow ? "true" : undefined}
      data-schedule-unassigned-label-cell={isUnassignedRow ? "true" : undefined}
      data-schedule-unassigned-label-content={
        isUnassignedRow ? "true" : undefined
      }
      data-schedule-unassigned-employee-seam={
        isUnassignedRow ? "true" : undefined
      }
      data-schedule-unassigned-bottom-separator={
        isUnassignedRow ? "true" : undefined
      }
      data-schedule-unassigned-label-mode={
        isUnassignedRow ? unassignedLabelMode : undefined
      }
      style={rowStyle}
    >
      {employee ? (
        <div className="schedule-employee-name-row">
          {onOpenEmployeeCard ? (
            <button
              type="button"
              className="schedule-employee-name-button"
              data-schedule-employee-card-trigger="true"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onOpenEmployeeCard(employee.id);
              }}
            >
              <strong>{employee.display_name}</strong>
            </button>
          ) : (
            <strong className="schedule-employee-name-text">{employee.display_name}</strong>
          )}
          {availabilityLines.length ? (
            <AvailabilityMarkButton
              className="schedule-availability-mark-name"
              label={`${employee.display_name}: unavailable days this week`}
              lines={availabilityLines}
              spotlightEmployeeId={employee.id}
            />
          ) : null}
        </div>
      ) : (
        <strong>Unassigned</strong>
      )}
      {!employee ? (
        <span>{`${openShiftCount} open ${openShiftCount === 1 ? "shift" : "shifts"}`}</span>
      ) : null}
    </div>
  );
}
