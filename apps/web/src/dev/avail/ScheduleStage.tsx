// The real Schedule top bar, edit banner and grid on the lab's fake week, in edit mode.
import type { ScheduleReadModel } from "@newfork/shared/schedule";
import { ClipboardPaste, Send, WandSparkles, X } from "lucide-react";
import { useMemo, useState, type ReactNode, type RefObject } from "react";
import { ScheduleGrid } from "../../schedule/components/ScheduleGrid";
import { ScheduleTopBar } from "../../schedule/components/ScheduleTopBar";
import { SCHEDULE_ACTION_BUTTON_CLASS } from "../../schedule/lib/scheduleActionButton";
import { editSession, week } from "./fixtures";

const noop = () => {};

export function ScheduleStage({ model, stageRef, banner, above, hideAvailability = false, onCreate, children }: {
  readonly model: ScheduleReadModel;
  readonly stageRef?: RefObject<HTMLElement | null>;
  readonly banner?: ReactNode;
  readonly above?: ReactNode;
  readonly hideAvailability?: boolean;
  readonly onCreate?: (employeeId: string | null, date: string, point?: { readonly x: number; readonly y: number }) => void;
  readonly children?: ReactNode;
}) {
  const [hideUnscheduled, setHideUnscheduled] = useState(false);
  const session = useMemo(() => editSession(model), [model]);
  const search = useMemo(() => new URLSearchParams(), []);
  return (
    <section
      ref={stageRef}
      className="schedule-page avail-stage"
      aria-labelledby="schedule-title"
      data-avail-hidden={hideAvailability ? "true" : undefined}
    >
      <ScheduleTopBar
        weekLabel="Oct 19 – 25, 2026"
        view="week"
        weekStartDate={week[0]!}
        weekStartDay="monday"
        layout="separate"
        onLayoutChange={noop}
        onPreviousViewPeriod={noop}
        onNextViewPeriod={noop}
        onCurrentViewPeriodClick={noop}
        isCurrentViewPeriod
        onDayPick={noop}
        onWeekJump={noop}
        hideUnscheduled={hideUnscheduled}
        onToggleHideUnscheduled={() => setHideUnscheduled((value) => !value)}
        showShiftType
        onToggleShiftType={noop}
        showShiftLabels
        onToggleShiftLabels={noop}
        showClockTimes={false}
        onToggleClockTimes={noop}
        showTotalHours
        onToggleTotalHours={noop}
        showRoleSeparators={false}
        onToggleRoleSeparators={noop}
        employeeSortMode="alphabetical"
        onEmployeeSortModeChange={noop}
        locations={model.locations}
        selectedLocationIds={[]}
        onLocationFilterChange={noop}
        shiftTypes={model.shift_types}
        selectedShiftTypeIds={[]}
        onShiftTypeFilterChange={noop}
        jobs={model.jobs}
        departments={model.departments}
        selectedJobIds={[]}
        onJobFilterChange={noop}
        employees={model.employees}
        selectedEmployeeIds={[]}
        onEmployeeFilterChange={noop}
        actions={
          <button type="button" className={`schedule-publish-action ${SCHEDULE_ACTION_BUTTON_CLASS}`} data-publication-tone="full">
            <Send size={15} aria-hidden /> Publish
          </button>
        }
      />
      <div className="schedule-edit-banner" role="toolbar">
        <button type="button" aria-pressed={false}>
          <ClipboardPaste size={15} /> Paste mode off
        </button>
        <button type="button">
          <WandSparkles size={15} /> Auto-fill
        </button>
        {banner}
        <button type="button">
          <X size={15} /> Discard
        </button>
      </div>
      {above}
      <ScheduleGrid
        model={model}
        search={search}
        selectedDate={week[0]!}
        view="week"
        layout="separate"
        hideUnscheduled={hideUnscheduled}
        showShiftType
        showShiftLabels
        showClockTimes={false}
        showTotalHours
        showUnassignedShifts={false}
        unassignedFrozen={false}
        showJobColorDot={false}
        showRoleSeparators={false}
        showPresetShiftBadges={false}
        useDefaultTimesForScheduling={false}
        employeeSortMode="alphabetical"
        session={session}
        focusedShiftId={null}
        selectedIds={[]}
        clipboard={null}
        pasteArmed={false}
        organizationName="Meyhouse"
        organizationLogoUrl={null}
        organizationLogoPlacement={null}
        onSelect={noop}
        onFocusShift={noop}
        onEdit={noop}
        onCreate={(_location, employeeId, date, point) => onCreate?.(employeeId, date, point)}
        onPresetCreate={noop}
        onCopy={noop}
        onClearSelection={noop}
        onShiftContextMenu={noop}
        onCellContextMenu={noop}
        onPaste={noop}
        onMove={noop}
        onCopyMove={noop}
        onOpenEmployeeCard={noop}
        onDayHeaderClick={noop}
        onLocationHeaderClick={noop}
      />
      {children}
    </section>
  );
}
