import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";

import {
  calculateScheduleGridFillerHeight,
  createScheduleGridTemplateColumns,
  scheduleGridEmployeeColumnWidth,
  scheduleGridFittedColumns,
  scheduleGridHorizontalNavHeight,
  scheduleGridTotalRowHeight,
  type ScheduleCardBand,
  type ScheduleCardNeeds,
  type ScheduleGridLocationGroup,
} from "../lib/scheduleGridLayout";
import {
  SHIFT_CARD_TIGHT_SIDE,
  shiftCardFirstLineInset,
} from "../lib/shiftCardRoom";

const horizontalNavMinThumbWidthPx = 34;
const horizontalNavFallbackTrackWidthPx = 240;
const dragAutoscrollEdgePx = 56;
const dragAutoscrollMaxStepPx = 24;

// Each card gives its widest line (every line is nowrap, so the range is the
// whole line) and the cell around its words (scheduleGridFitCards).
const TITLE_PX = 12;
const COMPACT_TITLE_PX = 11;
// The card's own side padding: 8px, 5px in the compact band (styles.css).
const BADGE_PAD_X = 8;
const COMPACT_PAD_X = 5;
// Half a pixel to spare, kept to a tenth so the numbers settle.
const fit = (width: number) => Math.ceil((width + 0.5) * 10) / 10;

function measureCardNeeds(grid: HTMLElement): ScheduleCardNeeds | null {
  let side = 0;
  let tight = 0;
  let compact = 0;
  let time = 0;
  // One range for every line: each live range is updated by the browser on
  // every DOM change, and thousands of them (one per line) made removing a
  // row take seconds (atama-surukle B, 2026-10-20).
  const range = document.createRange();
  grid
    .querySelectorAll<HTMLElement>(".schedule-shift-badge .schedule-shift-badge-content")
    .forEach((content) => {
      let cell: HTMLElement | null = content;
      while (cell && cell.parentElement !== grid) cell = cell.parentElement;
      if (!cell) return;
      // Each line's whole text, to the fraction of a pixel (scrollWidth
      // rounds); the name at its full 12px, whatever size it is drawn at now.
      const widths = Array.from(content.children, (child) => {
        range.selectNodeContents(child);
        // Without layout (jsdom) a range has no box: nothing is measured.
        const width = typeof range.getBoundingClientRect === "function"
          ? range.getBoundingClientRect().width
          : 0;
        return child.tagName === "STRONG"
          ? (width * TITLE_PX) / (Number.parseFloat(getComputedStyle(child).fontSize) || TITLE_PX)
          : width;
      });
      const line = Math.max(0, ...widths);
      if (!line) return;
      const compactLine = Math.max(
        0,
        ...widths.map((width, index) =>
          content.children[index]!.tagName === "STRONG" ? (width * COMPACT_TITLE_PX) / TITLE_PX : width,
        ),
      );
      const badge = content.closest<HTMLElement>(".schedule-shift-badge");
      const px = (name: string) => Number.parseFloat(badge?.style.getPropertyValue(name) ?? "") || 0;
      const room = px("--shift-card-side") || SHIFT_CARD_TIGHT_SIDE;
      // The cell less the content box and the card's side padding: the parts
      // the bands change are added back below, so a band never moves its own
      // numbers.
      const badgeStyle = badge ? getComputedStyle(badge) : null;
      const chrome =
        cell.getBoundingClientRect().width -
        content.getBoundingClientRect().width -
        (Number.parseFloat(badgeStyle?.paddingLeft ?? "") || 0) -
        (Number.parseFloat(badgeStyle?.paddingRight ?? "") || 0);
      // Reading, the first line keeps clear of the marks beside it: each
      // side's reach less the card's padding and the words' own 2px. While
      // editing, the marks have a row of their own.
      const reading = content.closest(".schedule-cell")?.getAttribute("data-editing") !== "true";
      const clear = (pad: number) =>
        shiftCardFirstLineInset(px("--shift-card-line1-left"), pad) +
        shiftCardFirstLineInset(px("--shift-card-line1-right"), pad);
      const first = reading && content.children[0]?.tagName === "STRONG";
      const tightLine = first ? Math.max(line, widths[0]! + clear(BADGE_PAD_X)) : line;
      const compactFirst = first
        ? Math.max(compactLine, (widths[0]! * COMPACT_TITLE_PX) / TITLE_PX + clear(COMPACT_PAD_X))
        : compactLine;
      side = Math.max(side, fit(line + 2 * (room + BADGE_PAD_X) + chrome));
      tight = Math.max(tight, fit(tightLine + 2 * (SHIFT_CARD_TIGHT_SIDE + BADGE_PAD_X) + chrome));
      compact = Math.max(compact, fit(compactFirst + 2 * (SHIFT_CARD_TIGHT_SIDE + COMPACT_PAD_X) + chrome));
      const hoursIndex = Array.from(content.children).findIndex((child) =>
        child.classList.contains("schedule-shift-time"),
      );
      const hours = hoursIndex < 0 ? 0 : widths[hoursIndex]!;
      time = Math.max(time, fit(hours + 2 * (SHIFT_CARD_TIGHT_SIDE + COMPACT_PAD_X) + chrome));
    });
  return side ? { side, tight, compact, time } : null;
}

export function ScheduleGridShell({
  children,
  columns,
  dayColumnMinWidth,
  dragPointer,
  editing,
  fitVisibleColumns = false,
  fitWeeklyLocations = false,
  gridRef,
  overlays,
  published = false,
  showTotalHours,
  view,
  onClearSelection,
}: {
  readonly children: ReactNode;
  readonly columns: number;
  readonly dayColumnMinWidth: number;
  readonly dragPointer?: { readonly x: number; readonly y: number } | null;
  readonly editing: boolean;
  readonly fitVisibleColumns?: boolean;
  readonly fitWeeklyLocations?: boolean;
  readonly gridRef: RefObject<HTMLDivElement | null>;
  readonly overlays?: ReactNode;
  /** Every location on the grid is live; only then is the grid called published (QA 51). */
  readonly published?: boolean;
  readonly showTotalHours: boolean;
  readonly view: "day" | "week";
  readonly onClearSelection: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fillerHeightPx, setFillerHeightPx] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [cardNeeds, setCardNeeds] = useState<ScheduleCardNeeds | null>(null);
  // Cards do not change size mid-drag; skip re-reading them every frame.
  const dragging = Boolean(dragPointer);
  // A fitted week (one location's, or several side by side, each filling one
  // screen) takes the first band its cards fit in, with that band's widths.
  // A fitted week that would squeeze days below what their cards need (a
  // phone, a tablet, a narrow window) scrolls instead (BL-205).
  const fitted =
    fitWeeklyLocations || fitVisibleColumns
      ? scheduleGridFittedColumns({
          width: viewportWidth,
          columns,
          showTotalHours,
          needs: cardNeeds,
          weeklyLocations: fitWeeklyLocations,
        })
      : null;
  const locationWidths = fitted?.widths ?? null;
  const effectiveDayColumnMinWidth = locationWidths?.day ?? dayColumnMinWidth;
  const fitsColumns = fitVisibleColumns && Boolean(fitted?.fits);
  const cardBand: ScheduleCardBand = fitted?.band ?? "side";
  const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false);
  const totalBottomOffsetPx = hasHorizontalOverflow
    ? scheduleGridHorizontalNavHeight
    : 0;

  const measureGridLayout = useCallback(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    setViewportWidth(scroll.clientWidth);
    if (
      (fitVisibleColumns || fitWeeklyLocations) &&
      !dragging &&
      gridRef.current &&
      // Rows folding or unfolding around a drag change no card: no need to
      // measure every line again (useKeepScrollThroughDrag holds the grid).
      gridRef.current.dataset.scheduleDragHold !== "true"
    ) {
      const needs = measureCardNeeds(gridRef.current);
      setCardNeeds((current) =>
        current?.side === needs?.side &&
        current?.tight === needs?.tight &&
        current?.compact === needs?.compact &&
        current?.time === needs?.time
          ? current
          : needs,
      );
    }

    const filler = scroll.querySelector<HTMLElement>(
      "[data-schedule-filler-height-px='true']",
    );
    if (!filler) {
      setFillerHeightPx((current) => (current === 0 ? current : 0));
      return;
    }

    const scrollBounds = scroll.getBoundingClientRect();
    const fillerBounds = filler.getBoundingClientRect();
    const totalRow = scroll.querySelector<HTMLElement>(
      "[data-schedule-total-hours-row-label='true']",
    );
    const measuredTotalRowHeight = totalRow
      ? Math.round(
          totalRow.getBoundingClientRect().height || totalRow.offsetHeight,
        )
      : 0;
    const totalRowHeight = totalRow
      ? measuredTotalRowHeight || scheduleGridTotalRowHeight
      : 0;
    const fillerStartOffset = Math.max(
      0,
      Math.round(fillerBounds.top - scrollBounds.top + scroll.scrollTop),
    );
    const nextHeight = calculateScheduleGridFillerHeight({
      viewportHeight: scroll.clientHeight,
      fillerStartOffset,
      totalRowHeight,
      horizontalNavHeight: totalBottomOffsetPx,
    });

    setFillerHeightPx((current) =>
      current === nextHeight ? current : nextHeight,
    );
  }, [
    dragging,
    fitVisibleColumns,
    fitWeeklyLocations,
    gridRef,
    totalBottomOffsetPx,
  ]);

  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return undefined;

    let frame: number | null = null;
    const scheduleMeasurement = () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = null;
        measureGridLayout();
      });
    };
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(scheduleMeasurement);

    scheduleMeasurement();
    window.addEventListener("resize", scheduleMeasurement);
    observer?.observe(scroll);
    if (gridRef.current) observer?.observe(gridRef.current);
    scroll
      .querySelectorAll<HTMLElement>(
        "[data-schedule-real-row-anchor='true']",
      )
      .forEach((rowAnchor) => observer?.observe(rowAnchor));

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", scheduleMeasurement);
    };
  }, [
    children,
    columns,
    dayColumnMinWidth,
    gridRef,
    measureGridLayout,
    showTotalHours,
  ]);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll || !dragPointer) return undefined;

    let frame: number | null = null;
    const scrollWhileDragging = () => {
      const bounds = scroll.getBoundingClientRect();
      const horizontalStep = dragAutoscrollStep(
        dragPointer.x,
        bounds.left,
        bounds.right,
      );
      const verticalStep = dragAutoscrollStep(
        dragPointer.y,
        bounds.top,
        bounds.bottom,
      );
      const nextLeft = clampToRange(
        scroll.scrollLeft + horizontalStep,
        0,
        Math.max(0, scroll.scrollWidth - scroll.clientWidth),
      );
      const nextTop = clampToRange(
        scroll.scrollTop + verticalStep,
        0,
        Math.max(0, scroll.scrollHeight - scroll.clientHeight),
      );

      if (nextLeft !== scroll.scrollLeft || nextTop !== scroll.scrollTop) {
        scroll.scrollLeft = nextLeft;
        scroll.scrollTop = nextTop;
        scroll.dispatchEvent(new Event("scroll"));
        frame = window.requestAnimationFrame(scrollWhileDragging);
      }
    };

    scrollWhileDragging();
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [dragPointer]);

  return (
    <div
      ref={scrollRef}
      className="schedule-grid-scroll"
      style={
        {
          "--schedule-filler-height": `${fillerHeightPx}px`,
          "--schedule-total-bottom-offset": `${totalBottomOffsetPx}px`,
        } as CSSProperties
      }
      data-testid="schedule-grid-scroll"
      data-schedule-grid-frame="true"
      data-schedule-grid-shell="true"
      data-schedule-filler-state={fillerHeightPx > 0 ? "active" : "empty"}
      data-schedule-horizontal-scroll-source="true"
    >
      <div
        ref={gridRef}
        className="schedule-grid-exact"
        role="grid"
        data-testid="schedule-grid"
        data-schedule-grid-track="true"
        data-schedule-fit-visible-columns={fitsColumns || undefined}
        data-card-band={cardBand}
        data-schedule-column-count={columns}
        aria-label={`${view === "day" ? "Daily" : "Weekly"} ${
          editing ? "editable " : published ? "published " : ""
        }schedule`}
        style={
          {
            "--schedule-day-column-min": `${effectiveDayColumnMinWidth}px`,
            "--schedule-employee-column-width": `${
              locationWidths?.employee ?? scheduleGridEmployeeColumnWidth
            }px`,
            gridTemplateColumns: createScheduleGridTemplateColumns({
              columns,
              fitVisibleColumns: fitsColumns,
              locationWidths,
              showTotalHours,
            }),
          } as CSSProperties
        }
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) onClearSelection();
        }}
      >
        {children}
      </div>
      <ScheduleHorizontalNavigation
        columns={columns}
        dayColumnMinWidth={effectiveDayColumnMinWidth}
        onOverflowChange={setHasHorizontalOverflow}
        scrollRef={scrollRef}
        showTotalHours={showTotalHours}
      />
      {overlays}
    </div>
  );
}

function dragAutoscrollStep(
  pointer: number,
  start: number,
  end: number,
): number {
  const distanceFromStart = pointer - start;
  if (distanceFromStart < dragAutoscrollEdgePx) {
    return -Math.ceil(
      ((dragAutoscrollEdgePx - distanceFromStart) / dragAutoscrollEdgePx) *
        dragAutoscrollMaxStepPx,
    );
  }
  const distanceFromEnd = end - pointer;
  if (distanceFromEnd < dragAutoscrollEdgePx) {
    return Math.ceil(
      ((dragAutoscrollEdgePx - distanceFromEnd) / dragAutoscrollEdgePx) *
        dragAutoscrollMaxStepPx,
    );
  }
  return 0;
}

function ScheduleHorizontalNavigation({
  columns,
  dayColumnMinWidth,
  onOverflowChange,
  scrollRef,
  showTotalHours,
}: {
  readonly columns: number;
  readonly dayColumnMinWidth: number;
  readonly onOverflowChange: (canScroll: boolean) => void;
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  readonly showTotalHours: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{
    readonly pointerId: number;
    readonly startX: number;
    readonly startScrollLeft: number;
    readonly maxScrollLeft: number;
    readonly scale: number;
    readonly captureTarget: HTMLElement;
  } | null>(null);
  const [canScroll, setCanScroll] = useState(false);
  const [maxScrollLeft, setMaxScrollLeft] = useState(0);
  const [scrollPositionPx, setScrollPositionPx] = useState(0);
  const [trackWidthPx, setTrackWidthPx] = useState(
    horizontalNavFallbackTrackWidthPx,
  );
  const [thumbWidthPx, setThumbWidthPx] = useState(
    horizontalNavMinThumbWidthPx,
  );
  const [thumbLeftPx, setThumbLeftPx] = useState(0);

  const syncFromScroll = useCallback(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;

    const nextScrollWidth = Math.max(0, Math.round(scroll.scrollWidth));
    const nextMaxScrollLeft = Math.max(
      0,
      Math.round(nextScrollWidth - scroll.clientWidth),
    );
    const nextCanScroll = nextMaxScrollLeft > 1;
    setCanScroll(nextCanScroll);
    setMaxScrollLeft(nextMaxScrollLeft);

    if (!nextCanScroll) {
      setTrackWidthPx(horizontalNavFallbackTrackWidthPx);
      setThumbWidthPx(horizontalNavMinThumbWidthPx);
      setThumbLeftPx(0);
      setScrollPositionPx(0);
      return;
    }

    const nextScrollLeft = clampToRange(
      Math.round(scroll.scrollLeft),
      0,
      nextMaxScrollLeft,
    );
    setScrollPositionPx(nextScrollLeft);

    const track = trackRef.current;
    const measuredTrackWidth = Math.max(
      1,
      Math.round(
        track && track.clientWidth > 0
          ? track.clientWidth
          : track?.getBoundingClientRect().width ||
              scroll.clientWidth ||
              horizontalNavFallbackTrackWidthPx,
      ),
    );
    const visibilityRatio = Math.min(
      1,
      scroll.clientWidth / Math.max(1, nextScrollWidth),
    );
    const nextThumbWidth = clampToRange(
      Math.round(measuredTrackWidth * visibilityRatio),
      horizontalNavMinThumbWidthPx,
      Math.max(1, measuredTrackWidth - 12),
    );
    const travelRange = Math.max(1, measuredTrackWidth - nextThumbWidth);

    setTrackWidthPx(measuredTrackWidth);
    setThumbWidthPx(nextThumbWidth);
    setThumbLeftPx(
      Math.round((nextScrollLeft / nextMaxScrollLeft) * travelRange),
    );
  }, [scrollRef]);

  const setScrollLeft = useCallback(
    (nextScrollLeft: number) => {
      const scroll = scrollRef.current;
      if (!scroll) return;
      scroll.scrollLeft = clampToRange(
        Math.round(nextScrollLeft),
        0,
        maxScrollLeft,
      );
      syncFromScroll();
    },
    [maxScrollLeft, scrollRef, syncFromScroll],
  );

  const stopDrag = useCallback(() => {
    const dragState = dragStateRef.current;
    if (dragState?.captureTarget.hasPointerCapture?.(dragState.pointerId)) {
      dragState.captureTarget.releasePointerCapture(dragState.pointerId);
    }
    dragStateRef.current = null;
  }, []);

  const onPointerMoveWindow = useCallback(
    (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      event.preventDefault();
      setScrollLeft(
        dragState.startScrollLeft +
          (event.clientX - dragState.startX) * dragState.scale,
      );
    },
    [setScrollLeft],
  );

  const onPointerUpWindow = useCallback(
    (event: PointerEvent) => {
      if (dragStateRef.current?.pointerId !== event.pointerId) return;
      stopDrag();
    },
    [stopDrag],
  );

  const startDrag = (
    event: ReactPointerEvent<HTMLDivElement>,
    captureTarget: HTMLElement,
  ): void => {
    const scroll = scrollRef.current;
    if (!scroll || maxScrollLeft <= 0) return;
    const effectiveRange = Math.max(1, trackWidthPx - thumbWidthPx);
    captureTarget.setPointerCapture?.(event.pointerId);
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: scroll.scrollLeft,
      maxScrollLeft,
      scale: maxScrollLeft / effectiveRange,
      captureTarget,
    };
  };

  useEffect(() => {
    onOverflowChange(canScroll);
  }, [canScroll, onOverflowChange]);

  useEffect(() => {
    if (!canScroll) return undefined;
    window.addEventListener("pointermove", onPointerMoveWindow, {
      passive: false,
    });
    window.addEventListener("pointerup", onPointerUpWindow);
    window.addEventListener("pointercancel", onPointerUpWindow);
    return () => {
      window.removeEventListener("pointermove", onPointerMoveWindow);
      window.removeEventListener("pointerup", onPointerUpWindow);
      window.removeEventListener("pointercancel", onPointerUpWindow);
      stopDrag();
    };
  }, [canScroll, onPointerMoveWindow, onPointerUpWindow, stopDrag]);

  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return undefined;
    syncFromScroll();
    const onScroll = () => syncFromScroll();
    const onResize = () => syncFromScroll();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(syncFromScroll);

    scroll.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    observer?.observe(scroll);
    if (scroll.firstElementChild instanceof HTMLElement) {
      observer?.observe(scroll.firstElementChild);
    }
    if (trackRef.current) observer?.observe(trackRef.current);
    const frame = window.requestAnimationFrame(syncFromScroll);

    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      scroll.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [columns, dayColumnMinWidth, scrollRef, showTotalHours, syncFromScroll]);

  if (!canScroll) return null;

  return (
    <div
      data-schedule-horizontal-nav
      role="navigation"
      aria-label="Schedule horizontal navigation"
      className="schedule-horizontal-nav"
      data-own-drag=""
    >
      <div
        ref={trackRef}
        data-schedule-horizontal-nav-track
        role="scrollbar"
        tabIndex={0}
        aria-label="Scroll schedule horizontally"
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={maxScrollLeft}
        aria-valuenow={scrollPositionPx}
        className="schedule-horizontal-nav-track"
        onKeyDown={(event) => {
          const scroll = scrollRef.current;
          if (!scroll) return;
          const pageStep = Math.max(80, Math.round(scroll.clientWidth * 0.85));
          const smallStep = 48;
          const nextScrollLeft =
            event.key === "ArrowLeft"
              ? scroll.scrollLeft - smallStep
              : event.key === "ArrowRight"
                ? scroll.scrollLeft + smallStep
                : event.key === "PageUp"
                  ? scroll.scrollLeft - pageStep
                  : event.key === "PageDown"
                    ? scroll.scrollLeft + pageStep
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? maxScrollLeft
                        : null;
          if (nextScrollLeft === null) return;
          event.preventDefault();
          setScrollLeft(nextScrollLeft);
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          const scroll = scrollRef.current;
          const track = trackRef.current;
          if (!scroll || !track) return;
          const clickOffsetPx =
            event.clientX - track.getBoundingClientRect().left;
          const thumbCenterPx = thumbLeftPx + thumbWidthPx / 2;
          const pageStep = Math.max(80, Math.round(scroll.clientWidth * 0.85));
          setScrollLeft(
            clickOffsetPx < thumbCenterPx
              ? scroll.scrollLeft - pageStep
              : scroll.scrollLeft + pageStep,
          );
          startDrag(event, event.currentTarget);
        }}
        onWheel={(event) => {
          const delta =
            Math.abs(event.deltaX) > Math.abs(event.deltaY)
              ? event.deltaX
              : event.deltaY;
          if (delta === 0) return;
          event.preventDefault();
          setScrollLeft(
            (scrollRef.current?.scrollLeft ?? scrollPositionPx) + delta,
          );
        }}
      >
        <div className="schedule-horizontal-nav-rail" aria-hidden="true" />
        <div
          data-schedule-horizontal-nav-thumb
          aria-hidden="true"
          className="schedule-horizontal-nav-thumb"
          style={{
            width: `${thumbWidthPx}px`,
            transform: `translateX(${thumbLeftPx}px)`,
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            startDrag(event, event.currentTarget);
          }}
        />
      </div>
    </div>
  );
}

function clampToRange(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export type ScheduleGridShellColumns = {
  readonly columns: number;
  readonly locationGroups: readonly ScheduleGridLocationGroup[];
};
