import type {
  ScheduleReadModel,
  ScheduleShift,
} from "@newfork/shared/schedule";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";

import {
  formatScheduleBadgeTimeRange,
  formatScheduleShiftBadgeTitle,
  ghostShiftLocation,
} from "../components/ShiftCard";
import { escapeAttributeValue } from "../lib/scheduleInteractionTargets";
import type { ScheduleGridLocationGroup } from "../lib/scheduleGridLayout";
import {
  isGhostScheduleShift,
  publicationStateForShift,
} from "../lib/scheduleShiftMetadata";
import type { TimeFormat } from "../timeInput";

export const NON_EDIT_SHIFT_BADGE_MIN_HEIGHT = 36;
export const PREVIEW_SHIFT_BADGE_MIN_HEIGHT = 44;

const FALLBACK_SHIFT_BADGE_VERTICAL_CHROME_PX = 10;
const HEIGHT_EPSILON_PX = 1;

export function useUniformScheduleBadgeWidth({
  containerRef,
  minimumWidth = 126,
  version,
}: {
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly minimumWidth?: number;
  readonly version: string;
}): number {
  const [width, setWidth] = useState(minimumWidth);
  const frameRef = useRef<number | null>(null);

  const measure = useCallback(() => {
    if (typeof window === "undefined") return;
    if (frameRef.current !== null)
      window.cancelAnimationFrame(frameRef.current);
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const container = containerRef.current;
      if (!container) return;
      const badges = Array.from(
        container.querySelectorAll<HTMLElement>(
          "[data-schedule-badge-width-measure='true']",
        ),
      );
      if (!badges.length) {
        setWidth(minimumWidth);
        return;
      }
      // Long content wraps in the visible badge instead of widening every day.
      const nextWidth = Math.ceil(
        badges.reduce(
          (max, badge) =>
            Math.max(
              max,
              Math.min(
                badge.dataset.measurePreset === "true" ? Infinity : 220,
                Math.max(badge.scrollWidth, badge.getBoundingClientRect().width),
              ),
            ),
          minimumWidth,
        ),
      );
      setWidth((current) => (current === nextWidth ? current : nextWidth));
    });
  }, [containerRef, minimumWidth]);

  useLayoutEffect(() => {
    measure();
    return () => {
      if (frameRef.current !== null)
        window.cancelAnimationFrame(frameRef.current);
    };
  }, [measure, version]);

  useEffect(() => {
    const fonts = (
      document as unknown as { fonts?: { ready?: Promise<unknown> } }
    ).fonts;
    if (!fonts?.ready) return undefined;
    void fonts.ready.then(measure);
    return undefined;
  }, [measure]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => measure());
    observer.observe(container);
    for (const badge of container.querySelectorAll<HTMLElement>(
      "[data-schedule-badge-width-measure='true']",
    )) {
      observer.observe(badge);
    }
    return () => observer.disconnect();
  }, [containerRef, measure, version]);

  return width;
}

export function renderScheduleBadgeWidthMeasurer({
  shifts,
  jobs,
  shiftTypes,
  locationGroups,
  showShiftType,
  showShiftLabels,
  showClockTimes,
  timeFormat,
  showJobColorDot,
  showLocationInBadge,
  showShiftTypePresets,
}: {
  readonly shifts: readonly ScheduleShift[];
  readonly jobs: ScheduleReadModel["jobs"];
  readonly shiftTypes: ScheduleReadModel["shift_types"];
  readonly locationGroups: readonly ScheduleGridLocationGroup[];
  readonly showShiftType: boolean;
  readonly showShiftLabels: boolean;
  readonly showClockTimes: boolean;
  readonly timeFormat: TimeFormat;
  readonly showJobColorDot: boolean;
  readonly showLocationInBadge: boolean;
  readonly showShiftTypePresets: boolean;
}) {
  const unassignedStackCounts = new Map<string, number>();
  for (const shift of shifts) {
    if (shift.employee_id !== null || isGhostScheduleShift(shift)) continue;
    const key = scheduleBadgeMeasurementStackKey(shift);
    unassignedStackCounts.set(key, (unassignedStackCounts.get(key) ?? 0) + 1);
  }
  const shiftItems = shifts.map((shift) => {
    const job = jobs.find((item) => item.id === shift.job_id)?.name ?? "Shift";
    const type = shiftTypes.find((item) => item.id === shift.shift_type_id);
    const labelNames = shift.label_names ?? [];
    const locationName = showLocationInBadge
      ? (locationGroups
          .find((location) => location.sourceIds.includes(shift.location_id))
          ?.sourceNames.find((source) => source.id === shift.location_id)
          ?.name ?? null)
      : null;
    return {
      id: shift.id,
      isPreset: false,
      color: type?.color ?? "#54736a",
      label: formatScheduleShiftBadgeTitle(type, job, showShiftType),
      location: locationName ?? "",
      meta: showShiftLabels && labelNames.length ? labelNames.join(" ") : "",
      time:
        showClockTimes && !shift.hide_time_on_badge
          ? `${formatScheduleBadgeTimeRange(shift.start_time, shift.end_time, timeFormat)}${shift.crosses_midnight ? " +1" : ""}`
          : "",
      // Same corner space the card reserves (ShiftCard data-has-markers): a
      // ghost's location pin, or a real card's publish mark / availability warning.
      hasMarkers: isGhostScheduleShift(shift)
        ? Boolean(locationName ?? ghostShiftLocation(shift))
        : Boolean(publicationStateForShift(shift)) ||
          shift.warning_codes.includes("availability"),
      hasStack:
        shift.employee_id === null &&
        (unassignedStackCounts.get(scheduleBadgeMeasurementStackKey(shift)) ?? 0) >
          1,
    };
  });
  const presetItems = showShiftTypePresets
    ? jobs.flatMap((job) =>
        shiftTypes.map((shiftType) => ({
          id: `${job.id}-${shiftType.id}`,
          isPreset: true,
          color: shiftType.color,
          label: `${shiftType.name}-${job.name}`,
          location: "",
          meta: "",
          time: "",
          hasMarkers: false,
          hasStack: false,
        })),
      )
    : [];
  const items = [...shiftItems, ...presetItems];
  if (!items.length) return null;

  return (
    <div
      className="schedule-badge-width-measurer"
      aria-hidden="true"
      data-schedule-badge-width-measurer="true"
      data-shift-labels-visible={showShiftLabels}
    >
      {items.map((item) => (
        <div
          key={item.id}
          className="schedule-badge-width-measure"
          data-schedule-badge-width-measure="true"
          data-measure-preset={item.isPreset}
          data-job-color-dot={showJobColorDot}
          data-has-markers={item.hasMarkers}
          data-has-stack={item.hasStack}
          data-measure-label={[item.label, item.location, item.meta, item.time]
            .filter(Boolean)
            .join(" ")}
          style={
            {
              "--shift-color": item.color,
              "--schedule-row-badge-height": "auto",
            } as CSSProperties
          }
        >
          {[item.label, item.location, item.meta, item.time]
            .filter(Boolean)
            .map((line, index) => (
              <span key={`${index}-${line}`}>{line}</span>
            ))}
        </div>
      ))}
    </div>
  );
}

function scheduleBadgeMeasurementStackKey(shift: ScheduleShift): string {
  return [
    shift.location_id,
    shift.scheduled_date,
    shift.shift_type_id ?? "",
    shift.start_time,
    shift.end_time,
    shift.hide_time_on_badge ? "clock-hidden" : "clock-visible",
    shift.crosses_midnight ? "overnight" : "same-day",
  ].join("|");
}

export function readMeasuredHeight(
  element: HTMLElement | null | undefined,
): number {
  if (!element) return 0;
  const rectHeight = element.getBoundingClientRect().height;
  const scrollHeight = element.scrollHeight;
  const height = Math.max(rectHeight, scrollHeight);
  return Number.isFinite(height) && height > 0 ? Math.ceil(height) : 0;
}

export function measureBadgeIntrinsicHeight(badge: HTMLElement): number {
  const content = badge.querySelector<HTMLElement>(
    "[data-shift-badge-content]",
  );
  const contentHeight = readMeasuredHeight(content);
  if (contentHeight > 0) {
    const style = getComputedStyle(badge);
    const measuredChrome = [
      style.paddingTop,
      style.paddingBottom,
      style.borderTopWidth,
      style.borderBottomWidth,
    ].reduce((total, value) => {
      const parsed = Number.parseFloat(value);
      return total + (Number.isFinite(parsed) ? parsed : 0);
    }, 0);
    return (
      contentHeight +
      (measuredChrome > 0
        ? Math.ceil(measuredChrome)
        : FALLBACK_SHIFT_BADGE_VERTICAL_CHROME_PX)
    );
  }
  return readMeasuredHeight(badge);
}

function getRowBadges(root: HTMLElement, rowKey: string): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      `[data-shift-badge="true"][data-schedule-row-key="${escapeAttributeValue(
        rowKey,
      )}"]`,
    ),
  );
}

function measureRowBadgeHeight(
  root: HTMLElement,
  rowKey: string,
  minHeight: number,
): number {
  return getRowBadges(root, rowKey).reduce(
    (height, badge) => Math.max(height, measureBadgeIntrinsicHeight(badge)),
    minHeight,
  );
}

function measureOccupiedActionMinimumHeight(cell: HTMLElement): number {
  const action = cell.querySelector<HTMLElement>(
    '[data-schedule-add-shift-control="true"][data-occupied="true"]',
  );
  if (!action) return 0;
  const style = getComputedStyle(action);
  return [style.minHeight, style.marginTop, style.marginBottom].reduce(
    (height, value) => {
      const parsed = Number.parseFloat(value);
      return height + (Number.isFinite(parsed) ? parsed : 0);
    },
    0,
  );
}

export function measureRowBadgeStackHeight(
  root: HTMLElement,
  rowKey: string,
  minHeight: number,
): number {
  const rowBadges = getRowBadges(root, rowKey);
  const synchronizedBadgeHeight = rowBadges.reduce(
    (height, badge) => Math.max(height, measureBadgeIntrinsicHeight(badge)),
    minHeight,
  );
  const badgesByCell = new Map<HTMLElement, HTMLElement[]>();
  for (const badge of rowBadges) {
    const cell = badge.parentElement;
    if (!cell) continue;
    const cellBadges = badgesByCell.get(cell) ?? [];
    cellBadges.push(badge);
    badgesByCell.set(cell, cellBadges);
  }

  let rowHeight = minHeight;
  for (const [cell, badges] of badgesByCell) {
    const stackHeight = badges.reduce((height, badge) => {
      const marginBottom = Number.parseFloat(
        getComputedStyle(badge).marginBottom,
      );
      return (
        height +
        synchronizedBadgeHeight +
        (Number.isFinite(marginBottom) ? marginBottom : 0)
      );
    }, 0);
    const cellStyle = getComputedStyle(cell);
    const paddingTop = Number.parseFloat(cellStyle.paddingTop);
    const paddingBottom = Number.parseFloat(cellStyle.paddingBottom);
    const cellContentHeight =
      stackHeight +
      measureOccupiedActionMinimumHeight(cell) +
      (Number.isFinite(paddingTop) ? paddingTop : 0) +
      (Number.isFinite(paddingBottom) ? paddingBottom : 0);
    rowHeight = Math.max(rowHeight, Math.ceil(cellContentHeight));
  }

  return rowHeight;
}

export function useSynchronizedRowBadgeHeight({
  rowKey,
  version,
  enabled,
  minHeight = NON_EDIT_SHIFT_BADGE_MIN_HEIGHT,
}: {
  readonly rowKey: string;
  readonly version: string;
  readonly enabled: boolean;
  readonly minHeight?: number;
}): {
  readonly anchorRef: RefObject<HTMLDivElement | null>;
  readonly badgeHeight: number;
  readonly rowBadgeStackHeight: number;
} {
  const anchorRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const [badgeHeight, setBadgeHeight] = useState(minHeight);
  const [rowBadgeStackHeight, setRowBadgeStackHeight] = useState(minHeight);

  const cancelScheduledMeasure = useCallback(() => {
    if (frameRef.current === null || typeof window === "undefined") return;
    window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  const measure = useCallback(() => {
    if (!enabled) {
      setBadgeHeight(minHeight);
      setRowBadgeStackHeight(minHeight);
      return;
    }
    if (typeof window === "undefined") return;
    cancelScheduledMeasure();
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const grid = anchorRef.current?.parentElement;
      if (!grid) return;
      const nextHeight = measureRowBadgeHeight(grid, rowKey, minHeight);
      const nextStackHeight = measureRowBadgeStackHeight(
        grid,
        rowKey,
        minHeight,
      );
      setBadgeHeight((current) =>
        Math.abs(current - nextHeight) < HEIGHT_EPSILON_PX
          ? current
          : nextHeight,
      );
      setRowBadgeStackHeight((current) =>
        Math.abs(current - nextStackHeight) < HEIGHT_EPSILON_PX
          ? current
          : nextStackHeight,
      );
    });
  }, [cancelScheduledMeasure, enabled, minHeight, rowKey]);

  useLayoutEffect(() => {
    measure();
    return cancelScheduledMeasure;
  }, [cancelScheduledMeasure, measure, version]);

  useEffect(() => {
    if (!enabled || typeof ResizeObserver === "undefined") return undefined;
    const grid = anchorRef.current?.parentElement;
    if (!grid) return undefined;
    const observer = new ResizeObserver(() => measure());
    for (const badge of getRowBadges(grid, rowKey)) {
      observer.observe(
        badge.querySelector<HTMLElement>("[data-shift-badge-content]") ?? badge,
      );
    }
    return () => observer.disconnect();
  }, [enabled, measure, rowKey, version]);

  useEffect(() => {
    const fonts = (
      document as unknown as { fonts?: { ready?: Promise<unknown> } }
    ).fonts;
    if (!fonts?.ready) return undefined;
    void fonts.ready.then(measure);
    return undefined;
  }, [measure]);

  return { anchorRef, badgeHeight, rowBadgeStackHeight };
}
