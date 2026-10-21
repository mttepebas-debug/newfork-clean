import type {
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
import {
  scheduleJobName,
  scheduleShiftTypeOf,
  type ScheduleCatalog,
} from "../lib/scheduleCatalogNames";
import { escapeAttributeValue } from "../lib/scheduleInteractionTargets";
import type { ScheduleGridLocationGroup } from "../lib/scheduleGridLayout";
import {
  isGhostScheduleShift,
  publicationStateForShift,
} from "../lib/scheduleShiftMetadata";
import type { TimeFormat } from "../timeInput";
import { unassignedShiftStackKey } from "../lib/unassignedShiftStack";
import { SHIFT_CARD_MARK, shiftCardSideRoom } from "../lib/shiftCardRoom";

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
      // A card's line never wraps (Mert, 2026-10-12), so a scrolling week
      // takes the widest line in full.
      const nextWidth = Math.ceil(
        badges.reduce(
          (max, badge) =>
            Math.max(max, badge.scrollWidth, badge.getBoundingClientRect().width),
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
    // Only a change of width can change the widest card: rows folding away
    // during a drag change the grid's height alone, and measuring every card
    // then cost a tenth of a second at each drag and drop (atama-surukle B).
    const widths = new WeakMap<Element, number>();
    const observer = new ResizeObserver((entries) => {
      let wider = false;
      for (const entry of entries) {
        const next = entry.contentRect.width;
        if (widths.get(entry.target) !== next) wider = true;
        widths.set(entry.target, next);
      }
      if (wider) measure();
    });
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
  catalog,
  editing,
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
  readonly catalog: ScheduleCatalog;
  readonly editing: boolean;
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
    const key = unassignedShiftStackKey(shift);
    unassignedStackCounts.set(key, (unassignedStackCounts.get(key) ?? 0) + 1);
  }
  const shiftItems = shifts.map((shift) => {
    const job = scheduleJobName(catalog, shift.job_id) ?? "Shift";
    const type = scheduleShiftTypeOf(catalog, shift.shift_type_id);
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
      // A ghost shows its place behind the pin, never as a line.
      location: isGhostScheduleShift(shift) ? "" : (locationName ?? ""),
      meta: showShiftLabels && labelNames.length ? labelNames.join(" ") : "",
      time:
        showClockTimes && !shift.hide_time_on_badge
          ? `${formatScheduleBadgeTimeRange(shift.start_time, shift.end_time, timeFormat)}${shift.crosses_midnight ? " +1" : ""}`
          : "",
      // The same room on both sides the card keeps (ShiftCard --shift-card-side).
      side: measuredSideRoom(shift, {
        editing,
        pin: Boolean(locationName ?? ghostShiftLocation(shift)),
        stack:
          shift.employee_id === null &&
          (unassignedStackCounts.get(unassignedShiftStackKey(shift)) ?? 0) > 1,
      }),
    };
  });
  const presetItems = showShiftTypePresets
    ? catalog.jobs.flatMap((job) =>
        catalog.shift_types.map((shiftType) => ({
          id: `${job.id}-${shiftType.id}`,
          isPreset: true,
          color: shiftType.color,
          label: `${shiftType.name}-${job.name}`,
          location: "",
          meta: "",
          time: "",
          side: shiftCardSideRoom({ top: [] }),
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
          data-measure-label={[item.label, item.location, item.meta, item.time]
            .filter(Boolean)
            .join(" ")}
          style={
            {
              "--shift-color": item.color,
              "--schedule-row-badge-height": "auto",
              "--shift-card-side": `${item.side}px`,
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

// A ghost keeps room for its pin. A real card reading keeps room for its note
// and "x2"; editing, also for LIVE on a live shift, the "!" or the saving
// spinner on the others, and NEW on a shift not live yet.
function measuredSideRoom(
  shift: ScheduleShift,
  { editing, pin, stack }: { readonly editing: boolean; readonly pin: boolean; readonly stack: boolean },
): number {
  if (isGhostScheduleShift(shift)) {
    return shiftCardSideRoom({ top: pin ? [SHIFT_CARD_MARK.pin] : [] });
  }
  const note = shift.note?.trim() ? SHIFT_CARD_MARK.note : 0;
  if (!editing) return shiftCardSideRoom({ top: [], stack, note });
  const state = publicationStateForShift(shift);
  const live = state === "locked";
  return shiftCardSideRoom({
    note,
    stack,
    top: live
      ? [SHIFT_CARD_MARK.live]
      : shift.warning_codes.includes("availability")
        ? [SHIFT_CARD_MARK.availability]
        : [SHIFT_CARD_MARK.spinner],
    bottom: state === null || state === "unlocked-modified" ? SHIFT_CARD_MARK.newLabel : 0,
  });
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

/** Room between a card's top corner mark ("!", LIVE) and NEW below it. */
export const CORNER_MARK_GAP_PX = 6;

// A short card grows until its top corner mark and NEW sit apart (Mert,
// 2026-10-13: the "!" and NEW touched on a short card). With two lines or
// more they sit beside the first and the last line and never meet (Mert,
// 2026-10-21); only a one-line card keeps NEW in its corner. The top marks sit
// centred on the first line (useFirstLineMid), so they end half their height
// below their layout top. Layout heights, so a "!" growing under the mouse
// does not move the row.
function cornerMarksHeight(badge: HTMLElement): number {
  const top = badge.querySelector<HTMLElement>(".schedule-shift-badge-markers");
  const bottom = badge.querySelector<HTMLElement>(".schedule-shift-new-mark");
  if (!top || !bottom || !top.offsetHeight || !bottom.offsetHeight) return 0;
  if ((badge.querySelector("[data-shift-badge-content]")?.childElementCount ?? 0) > 1) return 0;
  const px = (value: string) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const card = getComputedStyle(badge);
  return Math.ceil(
    px(card.borderTopWidth) +
      top.offsetTop +
      top.offsetHeight / 2 +
      CORNER_MARK_GAP_PX +
      bottom.offsetHeight +
      // NEW's middle sits at its "bottom" (translateY(50%)).
      px(getComputedStyle(bottom).bottom) - bottom.offsetHeight / 2 +
      px(card.borderBottomWidth),
  );
}

export function measureBadgeIntrinsicHeight(badge: HTMLElement): number {
  return Math.max(measureBadgeWordsHeight(badge), cornerMarksHeight(badge));
}

function measureBadgeWordsHeight(badge: HTMLElement): number {
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
      // The border box: a card that starts saying NEW while editing grows
      // only its padding (its own row below the words), and the row must
      // grow with it so NEW never sits on the words.
      observer.observe(
        badge.querySelector<HTMLElement>("[data-shift-badge-content]") ?? badge,
        { box: "border-box" },
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
