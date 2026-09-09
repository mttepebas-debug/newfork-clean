import type { ScheduleEmployee } from "@newfork/shared/schedule";
import { CalendarOff } from "lucide-react";
import type { CSSProperties, RefObject } from "react";
import { weeklyEmployeeSummary } from "../lib/scheduleWeeklyAvailability";

import {
  formatEmployeeAvailabilitySummary,
  scheduleEmployeeAvailabilityRules,
} from "../availabilityIndicators";

export function ScheduleEmployeeCard({
  editing,
  employee,
  openShiftCount,
  unassignedFrozen,
  unassignedLabelMode,
  rowStyle,
  anchorRef,
  onOpenEmployeeCard,
}: {
  readonly editing: boolean;
  readonly employee: ScheduleEmployee | null;
  readonly openShiftCount: number;
  readonly unassignedFrozen: boolean;
  readonly unassignedLabelMode: "header" | "centered";
  readonly rowStyle: CSSProperties;
  readonly anchorRef: RefObject<HTMLDivElement | null>;
  readonly onOpenEmployeeCard: (employeeId: string) => void;
}) {
  const isUnassignedRow = !employee;
  const availabilityRules = employee
    ? scheduleEmployeeAvailabilityRules(employee)
    : [];
  const weeklySummary = employee ? weeklyEmployeeSummary(employee) : null;
  const availabilitySummary = weeklySummary ?? formatEmployeeAvailabilitySummary(availabilityRules);

  return (
    <div
      ref={anchorRef}
      className={`schedule-employee-cell schedule-grid-sticky${
        isUnassignedRow ? " schedule-unassigned-row-cell" : ""
      }`}
      role="rowheader"
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
          {availabilitySummary ? (
            <span
              className="schedule-employee-availability"
              aria-label={weeklySummary !== null ? "Weekly availability preferences" : `Has ${availabilityRules.length} availability rule(s)`}
              title={availabilitySummary}
            >
              <CalendarOff size={13} aria-hidden />
            </span>
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
