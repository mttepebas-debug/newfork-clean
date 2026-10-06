import type { ScheduleEmployee } from "@newfork/shared/schedule";
import { CalendarOff } from "lucide-react";
import type { CSSProperties, RefObject } from "react";
import { devVar } from "../../dev/varEkran12";
import { Tooltip } from "../../shell/Tooltip";
import {
  formatAvailabilityMarkDay,
  formatAvailabilityRange,
  scheduleAvailabilityMarks,
} from "../lib/scheduleAvailabilityMark";
import { weeklyEmployeeSummary } from "../lib/scheduleWeeklyAvailability";

// VAR-EKRAN-12 BL-524: the week's unavailable days, in people's words.
function varUnavailableDays(employee: ScheduleEmployee) {
  return (employee.weekly_availability ?? []).flatMap((projection) =>
    [...scheduleAvailabilityMarks(projection)]
      .filter(([, mark]) => mark.kind === "unavailable")
      .map(([date, mark]) => ({
        date,
        lines: mark.kind === "unavailable"
          ? mark.windows.map((window) => formatAvailabilityRange("unavailable", window, "12h"))
          : [],
      })),
  );
}

function VarAvailabilityDot({ employee }: { readonly employee: ScheduleEmployee }) {
  const days = varUnavailableDays(employee);
  if (!days.length) return null;
  const content = (
    <>
      <span className="schedule-availability-tip-band">
        <span className="schedule-availability-tip-dot" aria-hidden="true">!</span>
        <span className="schedule-availability-tip-who">
          <strong>{employee.display_name}</strong>
          <span>Unavailable this week</span>
        </span>
      </span>
      <span className="schedule-availability-tip-body">
        {days.map((day) => (
          <strong key={day.date}>{`${formatAvailabilityMarkDay(day.date)} · ${day.lines.join(", ")}`}</strong>
        ))}
      </span>
    </>
  );
  return (
    <Tooltip
      rich
      className="var-bl524-dot"
      label={`${employee.display_name} is unavailable on ${days.map((day) => formatAvailabilityMarkDay(day.date)).join(", ")}`}
      content={content}
    >
      !
    </Tooltip>
  );
}

function VarAvailabilityLine({ employee }: { readonly employee: ScheduleEmployee }) {
  const days = varUnavailableDays(employee);
  if (!days.length) return null;
  const names = days.map((day) => new Date(`${day.date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }));
  return <span className="var-bl524-line">{`Unavailable ${names.join(", ")}`}</span>;
}

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
  const availabilitySummary = employee ? weeklyEmployeeSummary(employee) : null;

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
              aria-label="Weekly availability preferences"
              title={availabilitySummary}
            >
              <CalendarOff size={13} aria-hidden />
            </span>
          ) : null}
          {employee && devVar("bl524") === "b" ? <VarAvailabilityDot employee={employee} /> : null}
        </div>
      ) : (
        <strong>Unassigned</strong>
      )}
      {employee && devVar("bl524") === "c" ? <VarAvailabilityLine employee={employee} /> : null}
      {!employee ? (
        <span>{`${openShiftCount} open ${openShiftCount === 1 ? "shift" : "shifts"}`}</span>
      ) : null}
    </div>
  );
}
