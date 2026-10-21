import type {
  ScheduleEmployee,
  ScheduleLocation,
  ScheduleReadModel,
} from "@newfork/shared/schedule";
import {
  ArrowDownAZ,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  EyeOff,
  MapPin,
  SlidersHorizontal,
  Snowflake,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { Tooltip } from "../../shell/Tooltip";
import { useCloseOnEscape } from "../lib/useCloseOnEscape";
import { MiniCalendar, type CalendarMarker } from "./MiniCalendar";
import { ScheduleSearchField } from "./ScheduleSearch";
import {
  ScheduleTopBarFilter,
  type ScheduleTopBarFilterGroup,
  type ScheduleTopBarFilterId,
  type ScheduleTopBarFilterItem,
} from "./ScheduleTopBarFilter";

type ScheduleLayoutMode = "separate" | "unified";
type ScheduleEmployeeSortMode = "alphabetical" | "byJob";
type ScheduleTopBarDropdownId =
  "settings" | "calendar" | ScheduleTopBarFilterId;

interface ScheduleTopBarProps {
  readonly weekLabel: string;
  readonly view: "day" | "week";
  readonly weekStartDate: string;
  readonly selectedDate?: string;
  readonly weekStartDay: "monday" | "sunday";
  // The page's today, the location's (S-226), for the calendar.
  readonly today?: string;
  readonly calendarMarkers?: readonly CalendarMarker[];
  readonly layout: ScheduleLayoutMode;
  readonly onLayoutChange: (layout: ScheduleLayoutMode) => void;
  readonly onPreviousViewPeriod: () => void;
  readonly onNextViewPeriod: () => void;
  readonly onCurrentViewPeriodClick: () => void;
  readonly isCurrentViewPeriod: boolean;
  /** Shows the Week | Day switch; the date button then only jumps to today or this week. */
  readonly onViewChange?: (view: "day" | "week") => void;
  readonly onDayPick: (date: string) => void;
  readonly onWeekJump: (date: string) => void;
  /** Day cells in the calendar always open that day, even from week view. */
  readonly calendarDayOpensDay?: boolean;
  readonly hideUnscheduled: boolean;
  readonly onToggleHideUnscheduled: () => void;
  readonly showUnassignedShifts?: boolean;
  readonly onToggleUnassignedShifts?: () => void;
  readonly unassignedFrozen?: boolean;
  readonly onToggleUnassignedFrozen?: () => void;
  /** The Unassigned Shifts Row can only be hidden or frozen while editing. */
  readonly unassignedRowSettingsDisabled?: boolean;
  readonly dropdownDismissSignal?: number;
  readonly onDropdownOpenChange?: (open: boolean) => void;
  readonly showShiftType: boolean;
  readonly onToggleShiftType: () => void;
  readonly showShiftLabels: boolean;
  readonly onToggleShiftLabels: () => void;
  readonly showClockTimes: boolean;
  readonly onToggleClockTimes: () => void;
  readonly showTotalHours: boolean;
  readonly onToggleTotalHours: () => void;
  readonly showRoleSeparators: boolean;
  readonly onToggleRoleSeparators: () => void;
  readonly showPresetShiftBadges?: boolean;
  readonly onTogglePresetShiftBadges?: () => void;
  readonly showAvailability?: boolean;
  readonly onToggleAvailability?: () => void;
  readonly employeeSortMode: ScheduleEmployeeSortMode;
  readonly onEmployeeSortModeChange: (mode: ScheduleEmployeeSortMode) => void;
  readonly locations: readonly ScheduleLocation[];
  readonly selectedLocationIds: readonly string[];
  readonly onLocationFilterChange: (ids: string[]) => void;
  readonly shiftTypes: ScheduleReadModel["shift_types"];
  readonly selectedShiftTypeIds: readonly string[];
  readonly onShiftTypeFilterChange: (ids: string[]) => void;
  readonly jobs: ScheduleReadModel["jobs"];
  readonly departments: ScheduleReadModel["departments"];
  readonly selectedJobIds: readonly string[];
  readonly onJobFilterChange: (ids: string[]) => void;
  readonly employees: readonly ScheduleEmployee[];
  readonly selectedEmployeeIds: readonly string[];
  readonly onEmployeeFilterChange: (ids: string[]) => void;
  readonly actions?: ReactNode;
  /** Edit-return mockup (variant B): sits right after the Week | Day switch. */
  readonly editReturn?: ReactNode;
  /**
   * The manager Schedule's search (S-228): with it the filters, Hide
   * Unscheduled and Settings move to a second row behind a search field.
   */
  readonly search?: {
    readonly value: string;
    readonly onChange: (value: string) => void;
  };
}

export function ScheduleTopBar({
  weekLabel,
  view,
  weekStartDate,
  selectedDate,
  weekStartDay,
  today,
  calendarMarkers,
  onDayPick,
  onWeekJump,
  calendarDayOpensDay = false,
  layout,
  onLayoutChange,
  onPreviousViewPeriod,
  onNextViewPeriod,
  onCurrentViewPeriodClick,
  isCurrentViewPeriod,
  onViewChange,
  hideUnscheduled,
  onToggleHideUnscheduled,
  showUnassignedShifts,
  onToggleUnassignedShifts,
  unassignedFrozen,
  onToggleUnassignedFrozen,
  unassignedRowSettingsDisabled = false,
  dropdownDismissSignal,
  onDropdownOpenChange,
  showShiftType,
  onToggleShiftType,
  showShiftLabels,
  onToggleShiftLabels,
  showClockTimes,
  onToggleClockTimes,
  showTotalHours,
  onToggleTotalHours,
  showRoleSeparators,
  onToggleRoleSeparators,
  showPresetShiftBadges,
  onTogglePresetShiftBadges,
  showAvailability,
  onToggleAvailability,
  employeeSortMode,
  onEmployeeSortModeChange,
  locations,
  selectedLocationIds,
  onLocationFilterChange,
  shiftTypes,
  selectedShiftTypeIds,
  onShiftTypeFilterChange,
  jobs,
  departments,
  selectedJobIds,
  onJobFilterChange,
  employees,
  selectedEmployeeIds,
  onEmployeeFilterChange,
  actions,
  editReturn,
  search,
}: ScheduleTopBarProps) {
  const lastDismissSignalRef = useRef(dropdownDismissSignal);
  const [openDropdownId, setOpenDropdownId] =
    useState<ScheduleTopBarDropdownId | null>(null);
  const viewModeLabel = view === "day" ? "Daily view" : "Weekly view";
  const viewModeTitle = onViewChange
    ? isCurrentViewPeriod
      ? "Open calendar"
      : view === "day"
        ? "Jump to today"
        : "Jump to this week"
    : isCurrentViewPeriod
    ? `Switch to ${view === "day" ? "weekly" : "daily"} view`
    : view === "day"
      ? "Jump to today"
      : "Jump to this week";
  const setDropdownOpen = (id: ScheduleTopBarDropdownId, open: boolean) => {
    const nextOpenDropdownId = open
      ? id
      : openDropdownId === id
        ? null
        : openDropdownId;
    setOpenDropdownId(nextOpenDropdownId);
    onDropdownOpenChange?.(nextOpenDropdownId !== null);
  };
  useEffect(() => {
    onDropdownOpenChange?.(openDropdownId !== null);
  }, [onDropdownOpenChange, openDropdownId]);
  useEffect(() => {
    if (
      dropdownDismissSignal === undefined ||
      lastDismissSignalRef.current === dropdownDismissSignal
    ) {
      return;
    }
    lastDismissSignalRef.current = dropdownDismissSignal;
    setOpenDropdownId(null);
  }, [dropdownDismissSignal]);
  useEffect(() => {
    if (!openDropdownId) return undefined;
    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-schedule-filter-command-strip]")) return;
      const activeSurfaceSelector =
        openDropdownId === "settings"
          ? ".schedule-command-menu"
          : openDropdownId === "calendar"
            ? ".schedule-date-split"
            : `[data-filter-id="${openDropdownId}"]`;
      if (target.closest(activeSurfaceSelector)) return;
      setOpenDropdownId(null);
      if (
        target.closest("[data-schedule-grid-frame], [data-schedule-grid-track]")
      ) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener("pointerdown", closeOnOutsidePointerDown, true);
    return () => {
      window.removeEventListener(
        "pointerdown",
        closeOnOutsidePointerDown,
        true,
      );
    };
  }, [openDropdownId]);
  const closeDropdownOnEscape = useCallback(() => {
    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLElement &&
      activeElement.closest(".schedule-topbar")
    ) {
      activeElement.blur();
    }
    setOpenDropdownId(null);
  }, []);
  useCloseOnEscape(openDropdownId ? closeDropdownOnEscape : null);

  const settingsMenu = (
    <div className="schedule-command-menu">
      <button
        type="button"
        className="schedule-command-menu-trigger"
        aria-expanded={openDropdownId === "settings"}
        title="Settings"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setDropdownOpen("settings", openDropdownId !== "settings");
        }}
      >
        <SlidersHorizontal size={15} aria-hidden /> Settings
      </button>
      {openDropdownId === "settings" ? (
        <SettingsMenuPanel
          employeeSortMode={employeeSortMode}
          showShiftType={showShiftType}
          showShiftLabels={showShiftLabels}
          showClockTimes={showClockTimes}
          showPresetShiftBadges={showPresetShiftBadges}
          showTotalHours={showTotalHours}
          showRoleSeparators={showRoleSeparators}
          showUnassignedShifts={showUnassignedShifts}
          unassignedFrozen={unassignedFrozen}
          onEmployeeSortModeChange={onEmployeeSortModeChange}
          onToggleShiftType={onToggleShiftType}
          onToggleShiftLabels={onToggleShiftLabels}
          onToggleClockTimes={onToggleClockTimes}
          onTogglePresetShiftBadges={onTogglePresetShiftBadges}
          onToggleTotalHours={onToggleTotalHours}
          onToggleRoleSeparators={onToggleRoleSeparators}
          onToggleUnassignedShifts={onToggleUnassignedShifts}
          onToggleUnassignedFrozen={onToggleUnassignedFrozen}
          unassignedRowSettingsDisabled={unassignedRowSettingsDisabled}
          showAvailability={showAvailability}
          onToggleAvailability={onToggleAvailability}
        />
      ) : null}
    </div>
  );
  const hideUnscheduledButton = (
    <button
      type="button"
      className="schedule-hide-unscheduled"
      aria-pressed={hideUnscheduled}
      title={hideUnscheduled ? "Show Unscheduled" : "Hide Unscheduled"}
      onClick={onToggleHideUnscheduled}
    >
      {hideUnscheduled ? (
        <Eye size={15} aria-hidden />
      ) : (
        <EyeOff size={15} aria-hidden />
      )}
      {hideUnscheduled ? "Show Unscheduled" : "Hide Unscheduled"}
    </button>
  );
  const filterMenus = (
    <>
      {locations.length > 0 ? (
        <ScheduleTopBarFilter
          filterId="locations"
          allLabel="All locations"
          singularLabel="location"
          pluralLabel="locations"
          summarySuffix={layout === "unified" ? "Merged" : "Separate"}
          icon={<MapPin size={15} aria-hidden />}
          items={locations.map((location) => ({
            id: location.id,
            label: location.name,
          }))}
          selectedIds={selectedLocationIds}
          onChange={onLocationFilterChange}
          open={openDropdownId === "locations"}
          onOpenChange={(open) => setDropdownOpen("locations", open)}
          topContent={
            <ScheduleGridViewModeToggle
              mode={layout}
              onChange={onLayoutChange}
            />
          }
        />
      ) : null}
      {shiftTypes.length > 0 ? (
        <ScheduleTopBarFilter
          filterId="shiftTypes"
          allLabel="All shifts"
          singularLabel="shift"
          pluralLabel="shifts"
          icon={<Clock3 size={15} aria-hidden />}
          items={shiftTypes.map((shiftType) => ({
            id: shiftType.id,
            label: shiftType.name,
            color: shiftType.color,
          }))}
          selectedIds={selectedShiftTypeIds}
          onChange={onShiftTypeFilterChange}
          open={openDropdownId === "shiftTypes"}
          onOpenChange={(open) => setDropdownOpen("shiftTypes", open)}
        />
      ) : null}
      {jobs.length > 0 ? (
        <ScheduleTopBarFilter
          filterId="jobs"
          allLabel="All jobs"
          singularLabel="job"
          pluralLabel="jobs"
          icon={<BriefcaseBusiness size={15} aria-hidden />}
          items={flattenGroups(createJobGroups(jobs, departments))}
          groups={createJobGroups(jobs, departments)}
          selectedIds={selectedJobIds}
          onChange={onJobFilterChange}
          open={openDropdownId === "jobs"}
          onOpenChange={(open) => setDropdownOpen("jobs", open)}
        />
      ) : null}
      {employees.length > 0 ? (
        <ScheduleTopBarFilter
          filterId="employees"
          allLabel="All employees"
          singularLabel="employee"
          pluralLabel="employees"
          icon={<CalendarDays size={15} aria-hidden />}
          items={employees.map((employee) => ({
            id: employee.id,
            label: employee.display_name,
          }))}
          selectedIds={selectedEmployeeIds}
          onChange={onEmployeeFilterChange}
          open={openDropdownId === "employees"}
          onOpenChange={(open) => setDropdownOpen("employees", open)}
        />
      ) : null}
    </>
  );

  return (
    <header
      className="schedule-topbar"
      data-schedule-top-bar
      data-rows={search ? "2" : undefined}
    >
      <div className="schedule-command-group" data-schedule-top-bar-main-row>
        <ScheduleViewModeControls
          viewModeLabel={viewModeLabel}
          viewModeTitle={viewModeTitle}
          periodLabel={weekLabel}
          calendarOpen={openDropdownId === "calendar"}
          onCalendarToggle={() =>
            setDropdownOpen("calendar", openDropdownId !== "calendar")
          }
          calendar={
            openDropdownId === "calendar" ? (
              <div
                className="schedule-mini-calendar-panel"
                role="dialog"
                aria-label="Schedule calendar"
              >
                <MiniCalendar
                  selectedDate={
                    view === "day" ? (selectedDate ?? weekStartDate) : null
                  }
                  weekStartDate={weekStartDate}
                  weekStartDay={weekStartDay}
                  today={today}
                  markers={calendarMarkers}
                  onDayPick={(date) => {
                    (view === "week" && !calendarDayOpensDay
                      ? onWeekJump
                      : onDayPick)(date);
                    setDropdownOpen("calendar", false);
                  }}
                  onWeekJump={(date) => {
                    onWeekJump(date);
                    setDropdownOpen("calendar", false);
                  }}
                />
              </div>
            ) : null
          }
          returnCue={!isCurrentViewPeriod}
          fixedWidth={Boolean(onViewChange)}
          onToggleViewMode={
            // With the switch, the date never changes the view: this period opens the calendar.
            onViewChange && isCurrentViewPeriod
              ? () => setDropdownOpen("calendar", openDropdownId !== "calendar")
              : onCurrentViewPeriodClick
          }
          onPrevious={onPreviousViewPeriod}
          onNext={onNextViewPeriod}
        />
        {onViewChange ? (
          <ScheduleViewSwitch view={view} onChange={onViewChange} />
        ) : null}
        {editReturn}
        {search ? null : (
          <>
            {settingsMenu}
            {hideUnscheduledButton}
            {filterMenus}
          </>
        )}
      </div>
      {actions ? <div className="schedule-action-group">{actions}</div> : null}
      {search ? (
        // KARARLAR S-228 variant B: row 1 moves through time, row 2 narrows
        // the grid; nothing hides in a menu, and both rows end on one edge.
        <div className="schedule-topbar-filters" data-schedule-top-bar-filter-row>
          <ScheduleSearchField value={search.value} onChange={search.onChange} />
          {filterMenus}
          {hideUnscheduledButton}
          {settingsMenu}
        </div>
      ) : null}
      <h1 id="schedule-title" className="sr-only">
        Schedule
      </h1>
      <span className="sr-only">{weekLabel}</span>
    </header>
  );
}

export function ScheduleViewModeControls({
  viewModeLabel,
  viewModeTitle,
  returnCue = false,
  fixedWidth = false,
  showViewToggle = true,
  onToggleViewMode,
  onPrevious,
  onNext,
  periodLabel,
  calendarOpen,
  onCalendarToggle,
  calendar,
}: {
  readonly periodLabel?: string;
  readonly calendarOpen?: boolean;
  readonly onCalendarToggle?: () => void;
  readonly calendar?: ReactNode;
  readonly viewModeLabel: string;
  readonly viewModeTitle?: string;
  readonly returnCue?: boolean;
  /** Keeps one width, so the Week | Day switch beside it never moves. */
  readonly fixedWidth?: boolean;
  readonly showViewToggle?: boolean;
  readonly onToggleViewMode: () => void;
  readonly onPrevious?: () => void;
  readonly onNext?: () => void;
}) {
  const isDailyView = viewModeLabel === "Daily view";
  const previousLabel = isDailyView ? "Previous day" : "Previous week";
  const nextLabel = isDailyView ? "Next day" : "Next week";

  return (
    <div className="schedule-view-mode-controls">
      {onPrevious ? (
        <button
          type="button"
          className="schedule-view-mode-step"
          aria-label={previousLabel}
          title={previousLabel}
          onClick={(event) => {
            event.stopPropagation();
            onPrevious();
          }}
        >
          <ChevronLeft size={18} aria-hidden />
        </button>
      ) : null}
      {showViewToggle ? (
        <div className={onCalendarToggle ? "schedule-date-split" : undefined}>
          {onCalendarToggle ? (
            <button
              type="button"
              className="schedule-view-mode schedule-date-calendar-trigger"
              aria-label="Open schedule calendar"
              title="Open calendar"
              aria-haspopup="dialog"
              aria-expanded={calendarOpen}
              data-return-cue={returnCue}
              onClick={(event) => {
                event.stopPropagation();
                onCalendarToggle();
              }}
            >
              <CalendarDays size={15} aria-hidden />
            </button>
          ) : null}
          {/* BL-449 (WCAG 2.5.3): named by what it shows, the dates; the title says what it does. */}
          <button
            type="button"
            className="schedule-view-mode"
            title={viewModeTitle}
            data-fixed-width={fixedWidth || undefined}
            data-return-cue={returnCue}
            onClick={(event) => {
              event.stopPropagation();
              onToggleViewMode();
            }}
          >
            {!onCalendarToggle ? <CalendarDays size={15} aria-hidden /> : null}
            {periodLabel ?? viewModeLabel}
          </button>
          {calendar}
        </div>
      ) : null}
      {onNext ? (
        <button
          type="button"
          className="schedule-view-mode-step"
          aria-label={nextLabel}
          title={nextLabel}
          onClick={(event) => {
            event.stopPropagation();
            onNext();
          }}
        >
          <ChevronRight size={18} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

const SCHEDULE_VIEWS = [
  { id: "week", label: "Week" },
  { id: "day", label: "Day" },
] as const;

function ScheduleViewSwitch({
  view,
  onChange,
}: {
  readonly view: "day" | "week";
  readonly onChange: (view: "day" | "week") => void;
}) {
  return (
    <div
      className="schedule-view-switch"
      role="group"
      aria-label="Schedule view"
    >
      {SCHEDULE_VIEWS.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={view === item.id}
          onClick={(event) => {
            event.stopPropagation();
            if (view !== item.id) onChange(item.id);
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function ScheduleGridViewModeToggle({
  mode,
  onChange,
}: {
  readonly mode: ScheduleLayoutMode;
  readonly onChange: (mode: ScheduleLayoutMode) => void;
}) {
  const isUnified = mode === "unified";
  const nextMode = isUnified ? "separate" : "unified";

  return (
    <button
      type="button"
      aria-pressed={isUnified}
      className="schedule-grid-view-mode-toggle"
      onClick={() => onChange(nextMode)}
    >
      <span>Merge locations</span>
      <span className="schedule-filter-layout-switch" aria-hidden="true" />
    </button>
  );
}

function SettingsMenuPanel({
  employeeSortMode,
  showShiftType,
  showShiftLabels,
  showClockTimes,
  showPresetShiftBadges,
  showTotalHours,
  showRoleSeparators,
  showUnassignedShifts,
  unassignedFrozen,
  onEmployeeSortModeChange,
  onToggleShiftType,
  onToggleShiftLabels,
  onToggleClockTimes,
  onTogglePresetShiftBadges,
  onToggleTotalHours,
  onToggleRoleSeparators,
  onToggleUnassignedShifts,
  onToggleUnassignedFrozen,
  unassignedRowSettingsDisabled,
  showAvailability,
  onToggleAvailability,
}: {
  readonly employeeSortMode: ScheduleEmployeeSortMode;
  readonly showShiftType: boolean;
  readonly showShiftLabels: boolean;
  readonly showClockTimes: boolean;
  readonly showPresetShiftBadges?: boolean;
  readonly showTotalHours: boolean;
  readonly showRoleSeparators: boolean;
  readonly showUnassignedShifts?: boolean;
  readonly unassignedFrozen?: boolean;
  readonly onEmployeeSortModeChange: (mode: ScheduleEmployeeSortMode) => void;
  readonly onToggleShiftType: () => void;
  readonly onToggleShiftLabels: () => void;
  readonly onToggleClockTimes: () => void;
  readonly onTogglePresetShiftBadges?: () => void;
  readonly onToggleTotalHours: () => void;
  readonly onToggleRoleSeparators: () => void;
  readonly onToggleUnassignedShifts?: () => void;
  readonly onToggleUnassignedFrozen?: () => void;
  readonly unassignedRowSettingsDisabled: boolean;
  readonly showAvailability?: boolean;
  readonly onToggleAvailability?: () => void;
}) {
  return (
    <div className="schedule-command-menu-panel schedule-settings-menu-panel">
      <strong>Sort Employees by</strong>
      <SettingsRadioRow
        checked={employeeSortMode === "alphabetical"}
        icon={<ArrowDownAZ size={15} aria-hidden />}
        label="A-Z"
        onClick={() => onEmployeeSortModeChange("alphabetical")}
      />
      <SettingsRadioRow
        checked={employeeSortMode === "byJob"}
        icon={<BriefcaseBusiness size={15} aria-hidden />}
        label="Job/Position"
        onClick={() => onEmployeeSortModeChange("byJob")}
      />
      <div className="schedule-menu-separator" />
      <strong>Shift Badge Settings</strong>
      <SettingsToggleRow
        pressed={showShiftType}
        icon={showShiftType ? <Eye size={15} /> : <EyeOff size={15} />}
        label={showHideLabel(showShiftType, "Shift type in badges")}
        onClick={onToggleShiftType}
      />
      <SettingsToggleRow
        pressed={showShiftLabels}
        icon={showShiftLabels ? <Eye size={15} /> : <EyeOff size={15} />}
        label={showHideLabel(showShiftLabels, "Labels in badges")}
        onClick={onToggleShiftLabels}
      />
      <SettingsToggleRow
        pressed={showClockTimes}
        icon={showClockTimes ? <Eye size={15} /> : <EyeOff size={15} />}
        label={showHideLabel(showClockTimes, "Clock in/out in badges")}
        onClick={onToggleClockTimes}
      />
      {onTogglePresetShiftBadges ? (
        <SettingsToggleRow
          pressed={Boolean(showPresetShiftBadges)}
          icon={showPresetShiftBadges ? <Eye size={15} /> : <EyeOff size={15} />}
          label={showHideLabel(Boolean(showPresetShiftBadges), "Preset badges")}
          onClick={onTogglePresetShiftBadges}
          disabledReason={employeeSortMode !== "byJob" ? SORT_BY_JOB_REASON : null}
        />
      ) : null}
      <div className="schedule-menu-separator" />
      <strong>Schedule Grid Settings</strong>
      <SettingsToggleRow
        pressed={showTotalHours}
        icon={showTotalHours ? <Eye size={15} /> : <EyeOff size={15} />}
        label={showHideLabel(showTotalHours, "Total hours")}
        onClick={onToggleTotalHours}
      />
      <SettingsToggleRow
        pressed={showRoleSeparators}
        icon={showRoleSeparators ? <Eye size={15} /> : <EyeOff size={15} />}
        label={showHideLabel(showRoleSeparators, "Role Separators")}
        onClick={onToggleRoleSeparators}
        disabledReason={employeeSortMode !== "byJob" ? SORT_BY_JOB_REASON : null}
      />
      {onToggleUnassignedShifts ? (
        <SettingsToggleRow
          pressed={Boolean(showUnassignedShifts)}
          icon={showUnassignedShifts ? <Eye size={15} /> : <EyeOff size={15} />}
          label={showHideLabel(Boolean(showUnassignedShifts), "Unassigned Shifts Row")}
          onClick={onToggleUnassignedShifts}
          disabledReason={unassignedRowSettingsDisabled ? EDIT_ONLY_REASON : null}
        />
      ) : null}
      {onToggleUnassignedFrozen ? (
        <SettingsToggleRow
          pressed={Boolean(unassignedFrozen)}
          icon={
            <span
              aria-hidden
              className="schedule-unassigned-freeze-icon"
              data-frozen={unassignedFrozen}
            >
              <Snowflake size={15} strokeWidth={unassignedFrozen ? 2.2 : 1.8} />
              {!unassignedFrozen ? <span /> : null}
            </span>
          }
          label={`${unassignedFrozen ? "Unfreeze" : "Freeze"} Unassigned Shifts Row`}
          onClick={onToggleUnassignedFrozen}
          disabledReason={unassignedRowSettingsDisabled ? EDIT_ONLY_REASON : null}
        />
      ) : null}
      {onToggleAvailability ? (
        <>
          <div className="schedule-menu-separator" />
          <strong>Availability</strong>
          <SettingsToggleRow
            pressed={Boolean(showAvailability)}
            icon={showAvailability ? <Eye size={15} /> : <EyeOff size={15} />}
            label={showHideLabel(Boolean(showAvailability), "Availability")}
            onClick={onToggleAvailability}
            // The orange "!" shows only in edit mode, so the switch does too (KARARLAR Schedule, 2026-10-06).
            disabledReason={unassignedRowSettingsDisabled ? EDIT_ONLY_REASON : null}
          />
        </>
      ) : null}
    </div>
  );
}

function SettingsRadioRow({
  checked,
  icon,
  label,
  onClick,
}: {
  readonly checked: boolean;
  readonly icon: ReactNode;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      className="schedule-settings-row"
      data-pressed={checked}
      onClick={onClick}
    >
      {icon}
      <span aria-hidden className="schedule-settings-row-bullet" />
      <span className="schedule-settings-row-label">{label}</span>
      {checked ? <Check size={15} aria-hidden /> : null}
    </button>
  );
}

// A passive row says why it cannot be used, as the passive Publish does (BL-308, QA 47).
const SORT_BY_JOB_REASON = "Sort by Job/Position to use this.";
const EDIT_ONLY_REASON = "Available while editing.";

function SettingsToggleRow({
  pressed,
  icon,
  label,
  onClick,
  disabledReason = null,
}: {
  readonly pressed: boolean;
  readonly icon: ReactNode;
  readonly label: string;
  readonly onClick: () => void;
  readonly disabledReason?: string | null;
}) {
  const content = (
    <>
      {icon}
      <span aria-hidden className="schedule-settings-row-bullet" />
      <span className="schedule-settings-row-label">{label}</span>
    </>
  );
  // The label is the action ("Hide …"/"Show …"), so no aria-pressed: it would
  // read as the opposite of the screen (QA 48). data-pressed keeps the look.
  if (disabledReason) {
    // Still focusable and tappable, so the reason can be read; the press only shows it.
    return (
      <Tooltip
        unstyled
        label={label}
        content={disabledReason}
        className="schedule-settings-row"
        aria-disabled="true"
        data-pressed={String(pressed)}
      >
        {content}
      </Tooltip>
    );
  }
  return (
    <button
      type="button"
      className="schedule-settings-row"
      data-pressed={pressed}
      onClick={onClick}
    >
      {content}
    </button>
  );
}

function showHideLabel(visible: boolean, label: string): string {
  return `${visible ? "Hide" : "Show"} ${label}`;
}

function createJobGroups(
  jobs: ScheduleReadModel["jobs"],
  departments: ScheduleReadModel["departments"],
): ScheduleTopBarFilterGroup[] {
  // Departments come A to Z from the server (BL-475).
  const departmentIds = new Set(departments.map((department) => department.id));
  const jobsByDepartment = new Map<string, ScheduleTopBarFilterItem[]>();
  const ungrouped: ScheduleTopBarFilterItem[] = [];

  for (const job of jobs) {
    const item = { id: job.id, label: job.name, color: job.color };
    if (!job.department_id || !departmentIds.has(job.department_id)) {
      ungrouped.push(item);
      continue;
    }
    const bucket = jobsByDepartment.get(job.department_id);
    if (bucket) bucket.push(item);
    else jobsByDepartment.set(job.department_id, [item]);
  }

  const groups = departments
    .map((department) => ({
      id: department.id,
      label: department.name,
      items: jobsByDepartment.get(department.id) ?? [],
    }))
    .filter((group) => group.items.length > 0);

  if (ungrouped.length) {
    groups.push({
      id: "__no_department__",
      label: "No department",
      items: ungrouped,
    });
  }

  return groups;
}

function flattenGroups(
  groups: readonly ScheduleTopBarFilterGroup[],
): ScheduleTopBarFilterItem[] {
  return groups.flatMap((group) => group.items);
}
