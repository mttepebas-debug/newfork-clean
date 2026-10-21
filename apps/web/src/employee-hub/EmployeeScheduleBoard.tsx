import { todayIn } from "../lib/today";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { can } from "../auth/can";
import { useAuth } from "../auth/AuthContext";
import { useScheduleCalendarPosts } from "../schedule/hooks/useScheduleCalendarPosts";
import { RefreshCw, User } from "lucide-react";
import { ScheduleGrid } from "../schedule/components/ScheduleGrid";
import { ScheduleTopBar } from "../schedule/components/ScheduleTopBar";
import { addDays, formatPeriod } from "../schedule/lib/scheduleDateTime";
import {
  dismissNextScheduleSearchLayer,
  newestScheduleFilterKey,
  withScheduleSearchValue,
} from "../schedule/lib/scheduleDismissal";
import {
  isBlankScheduleDismissTarget,
  isMatchingScheduleLocationHeaderTarget,
  isScheduleGridCellActivationTarget,
  isSuppressedScheduleClickTarget,
  isTextEditingTarget,
} from "../schedule/lib/scheduleInteractionTargets";
import {
  createScheduleCalendarMarkers,
  parseIds,
  validIds,
} from "../schedule/lib/scheduleFilterModel";
import { getEmployeeScheduleBoard } from "./employee-hub-data";
import "./employee-schedule-board.css";
import { employeeAnnouncementsPath } from "../shell/view-address";

// The employee board is read-only by construction: no edit session, no drag,
// no mutation handlers. The API returns published rows only.
const noop = () => {};

export function EmployeeScheduleBoard({
  workspaceId,
  employeeId,
  organizationName,
  zone,
}: {
  readonly workspaceId: string;
  readonly employeeId: string | null;
  readonly organizationName: string;
  // The primary location's zone (S-226); each location column marks its own day.
  readonly zone?: string;
}) {
  const [params, setParams] = useSearchParams();
  const { context } = useAuth();
  const go = useNavigate();
  const calendarPosts = useScheduleCalendarPosts(
    workspaceId,
    can(context, "announcement.read"),
  );
  const [layout, setLayout] = useState<"separate" | "unified">("separate");
  const [showShiftType, setShowShiftType] = useState(true);
  const [showShiftLabels, setShowShiftLabels] = useState(true);
  const [showClockTimes, setShowClockTimes] = useState(true);
  const [showTotalHours, setShowTotalHours] = useState(true);
  const [showRoleSeparators, setShowRoleSeparators] = useState(false);
  const [employeeSortMode, setEmployeeSortMode] = useState<
    "alphabetical" | "byJob"
  >("alphabetical");
  const [dropdownDismissSignal, setDropdownDismissSignal] = useState(0);
  const dropdownOpen = useRef(false);
  const suppressedClickTarget = useRef<Element | null>(null);
  const dismissOneLayerRef = useRef<() => boolean>(() => false);
  const pointerDismissRef = useRef<(event: PointerEvent) => void>(noop);
  const clickGuardRef = useRef<(event: MouseEvent) => void>(noop);

  const today = todayIn(zone);
  const selectedDate = isCalendarDay(params.get("date"))
    ? (params.get("date") as string)
    : today;
  const view = params.get("view") === "day" ? "day" : "week";
  const hideUnscheduled = params.get("hideUnscheduled") === "true";
  const query = useQuery({
    queryKey: ["employee-schedule-board", workspaceId, selectedDate],
    queryFn: () => getEmployeeScheduleBoard(workspaceId, selectedDate),
    enabled: Boolean(workspaceId),
    refetchInterval: 60_000,
    // Keep the current board on screen while another day or week loads, so the
    // grid does not flash and blank clicks keep working during navigation.
    placeholderData: (previous) => previous,
  });

  // Escape and blank clicks peel one layer at a time, in the manager grid's
  // order. Blank clicks count anywhere in the page area, not only on the grid.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || isTextEditingTarget(event.target)) return;
      if (!dismissOneLayerRef.current()) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const onPointerDown = (event: PointerEvent) =>
      pointerDismissRef.current(event);
    const onClick = (event: MouseEvent) => clickGuardRef.current(event);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  function navigate(values: Record<string, string | null>) {
    setParams((previous) => {
      // Each changed filter becomes the newest one, the one Esc takes off first.
      return Object.entries(values).reduce(
        (next, [key, value]) => withScheduleSearchValue(next, key, value),
        new URLSearchParams(previous),
      );
    });
  }

  if (query.isLoading)
    return (
      <p className="muted" role="status">
        Loading your schedule…
      </p>
    );
  if (!query.data)
    return (
      <div className="empty-state">
        <h2>Schedule is unavailable</h2>
        <p>
          {query.error instanceof Error ? query.error.message : "Try again."}
        </p>
        <button className="secondary-button" onClick={() => query.refetch()}>
          <RefreshCw size={16} />
          Retry
        </button>
      </div>
    );

  const model = query.data;
  const selectedLocationIds = validIds(
    params.get("locations"),
    model.locations.map((item) => item.id),
  );
  const onlyMine =
    employeeId !== null &&
    parseIds(params.get("employees")).includes(employeeId);
  const step = view === "day" ? 1 : 7;
  const currentWeekStart = weekStartOf(today, model.week_start_day);
  const isCurrentViewPeriod =
    view === "day" ? selectedDate === today : model.week_start === currentWeekStart;

  // Dropdown first, then the filters one at a time, newest first, then day
  // view, then a week other than the current one.
  const dismissOneLayer = (
    preserveMatchingLocationHeader = false,
    preserveSearchFilters = false,
  ): boolean => {
    if (dropdownOpen.current) {
      setDropdownDismissSignal((value) => value + 1);
      return true;
    }
    // Read from the router, not window.location: the ref below is reassigned
    // every render, so these params are always the current ones.
    const liveSearch = new URLSearchParams(params);
    if (
      preserveMatchingLocationHeader &&
      newestScheduleFilterKey(liveSearch) === "locations"
    ) {
      return false;
    }
    if (preserveSearchFilters) return false;
    const dismissal = dismissNextScheduleSearchLayer({
      search: liveSearch,
      modelWeekStart: model.week_start,
      currentWeekStart,
      today,
    });
    if (!dismissal) return false;
    setParams(dismissal.search);
    return true;
  };
  dismissOneLayerRef.current = () => dismissOneLayer();

  pointerDismissRef.current = (event: PointerEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const insideBoard = Boolean(target.closest(".employee-schedule-board"));
    const blank = insideBoard
      ? isBlankScheduleDismissTarget(target)
      : isBlankPageTarget(target);
    if (!blank) return;
    const preserveMatchingLocationHeader =
      insideBoard &&
      isMatchingScheduleLocationHeaderTarget(target, selectedLocationIds);
    const preserveSearchFilters =
      insideBoard && isScheduleGridCellActivationTarget(target);
    if (!dismissOneLayer(preserveMatchingLocationHeader, preserveSearchFilters))
      return;
    suppressedClickTarget.current = target;
    event.preventDefault();
    event.stopPropagation();
  };

  clickGuardRef.current = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!isSuppressedScheduleClickTarget(suppressedClickTarget.current, target))
      return;
    suppressedClickTarget.current = null;
    event.preventDefault();
    event.stopPropagation();
  };

  // Same contract as the manager control, except that a day view always goes
  // back to its own week first.
  const onViewPeriodClick = () => {
    if (view === "day") return navigate({ view: null });
    if (!isCurrentViewPeriod) return navigate({ date: today, view: null });
    navigate({ date: today, view: "day" });
  };

  return (
    <div className="employee-schedule-board">
      <ScheduleTopBar
        weekLabel={formatPeriod(selectedDate, model.week_start, view)}
        view={view}
        weekStartDate={model.week_start}
        selectedDate={selectedDate}
        weekStartDay={model.week_start_day}
        today={today}
        calendarMarkers={createScheduleCalendarMarkers(
          calendarPosts,
          model.locations.map((item) => item.id),
        )}
        layout={layout}
        onLayoutChange={setLayout}
        onPreviousViewPeriod={() =>
          navigate({ date: addDays(selectedDate, -step) })
        }
        onNextViewPeriod={() => navigate({ date: addDays(selectedDate, step) })}
        onCurrentViewPeriodClick={onViewPeriodClick}
        isCurrentViewPeriod={isCurrentViewPeriod}
        onDayPick={(date) => navigate({ date, view: "day" })}
        onWeekJump={(date) => navigate({ date, view: null })}
        calendarDayOpensDay
        dropdownDismissSignal={dropdownDismissSignal}
        onDropdownOpenChange={(open) => {
          dropdownOpen.current = open;
        }}
        hideUnscheduled={hideUnscheduled}
        onToggleHideUnscheduled={() =>
          navigate({ hideUnscheduled: hideUnscheduled ? null : "true" })
        }
        showShiftType={showShiftType}
        onToggleShiftType={() => setShowShiftType((value) => !value)}
        showShiftLabels={showShiftLabels}
        onToggleShiftLabels={() => setShowShiftLabels((value) => !value)}
        showClockTimes={showClockTimes}
        onToggleClockTimes={() => setShowClockTimes((value) => !value)}
        showTotalHours={showTotalHours}
        onToggleTotalHours={() => setShowTotalHours((value) => !value)}
        showRoleSeparators={showRoleSeparators}
        onToggleRoleSeparators={() => setShowRoleSeparators((value) => !value)}
        employeeSortMode={employeeSortMode}
        onEmployeeSortModeChange={setEmployeeSortMode}
        locations={model.locations}
        selectedLocationIds={selectedLocationIds}
        onLocationFilterChange={(ids) =>
          navigate({ locations: ids.join(",") || null })
        }
        shiftTypes={model.shift_types}
        selectedShiftTypeIds={validIds(
          params.get("shiftTypes"),
          model.shift_types.map((item) => item.id),
        )}
        onShiftTypeFilterChange={(ids) =>
          navigate({ shiftTypes: ids.join(",") || null })
        }
        jobs={model.jobs}
        departments={model.departments}
        selectedJobIds={validIds(
          params.get("jobs"),
          model.jobs.map((item) => item.id),
        )}
        onJobFilterChange={(ids) => navigate({ jobs: ids.join(",") || null })}
        employees={model.employees}
        selectedEmployeeIds={validIds(
          params.get("employees"),
          model.employees.map((item) => item.id),
        )}
        onEmployeeFilterChange={(ids) =>
          navigate({ employees: ids.join(",") || null })
        }
        actions={
          employeeId ? (
            <button
              type="button"
              className="secondary-button"
              aria-pressed={onlyMine}
              onClick={() =>
                navigate({ employees: onlyMine ? null : employeeId })
              }
            >
              <User size={16} aria-hidden />
              {onlyMine ? "Showing my shifts" : "My Schedule"}
            </button>
          ) : null
        }
      />
      <ScheduleGrid
        model={model}
        search={params}
        selectedDate={selectedDate}
        view={view}
        layout={layout}
        hideUnscheduled={hideUnscheduled}
        showShiftType={showShiftType}
        showShiftLabels={showShiftLabels}
        showClockTimes={showClockTimes}
        showTotalHours={showTotalHours}
        showUnassignedShifts={false}
        unassignedFrozen={false}
        showJobColorDot
        publishWarnings={false}
        showRoleSeparators={showRoleSeparators}
        showPresetShiftBadges={false}
        employeeSortMode={employeeSortMode}
        session={null}
        onOpenPost={(announcementId) =>
          go(`${employeeAnnouncementsPath}/${announcementId}`)
        }
        dragDisabled
        focusedShiftId={null}
        selectedIds={[]}
        clipboard={null}
        pasteArmed={false}
        onSelect={noop}
        onFocusShift={noop}
        onEdit={noop}
        onCreate={noop}
        onPresetCreate={noop}
        onCopy={noop}
        onClearSelection={noop}
        onShiftContextMenu={noop}
        onCellContextMenu={noop}
        onPaste={noop}
        onMove={noop}
        onCopyMove={noop}
        onDayHeaderClick={(date) => navigate({ date, view: "day" })}
        onLocationHeaderClick={(ids) =>
          navigate({ locations: ids.join(",") || null })
        }
        organizationName={organizationName}
        organizationLogoUrl={null}
        organizationLogoPlacement={null}
      />
    </div>
  );
}

// Blank page area around the board: inside the app's main column, but not on
// anything the employee can interact with.
function isBlankPageTarget(target: Element): boolean {
  if (!target.closest(".app-main")) return false;
  return !target.closest(
    "a, button, input, select, textarea, label, summary, [role='button'], [role='menu'], [role='dialog'], [role='listbox']",
  );
}

function isCalendarDay(value: string | null): boolean {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function weekStartOf(date: string, weekStartDay: "monday" | "sunday"): string {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -(weekStartDay === "sunday" ? day : (day + 6) % 7));
}

export default EmployeeScheduleBoard;
