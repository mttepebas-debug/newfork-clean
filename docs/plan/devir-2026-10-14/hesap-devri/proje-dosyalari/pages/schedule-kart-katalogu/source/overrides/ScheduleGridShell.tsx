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
  scheduleGridFitDayWidth,
  scheduleGridFitsVisibleDays,
  scheduleGridHorizontalNavHeight,
  scheduleGridWeeklyLocationWidths,
  scheduleGridTotalRowHeight,
  type ScheduleGridLocationGroup,
  scheduleGridFitMinDayColumnWidth,
  scheduleGridMinEmployeeColumnWidth,
  scheduleGridEmployeeColumnWidth as employeeColumnWidth,
  scheduleGridTotalColumnWidth,
} from "@web/schedule/lib/scheduleGridLayout";
import { usePick } from "../vk/store";
import { TIGHT } from "../vk/side";
import { firstLineInset } from "../vk/line1";

const horizontalNavMinThumbWidthPx = 34;
const horizontalNavFallbackTrackWidthPx = 240;
const dragAutoscrollEdgePx = 56;
const dragAutoscrollMaxStepPx = 24;

let titleCanvas: CanvasRenderingContext2D | null | undefined;
// Word widths by `font|word`; the grid re-measures on every render.
const titleWordWidths = new Map<string, number>();

// Reads each card on the grid: its title's longest word (a line may break
// after a space or a hyphen) and the room its day cell leaves around the
// title. 0 when nothing can be measured (no cards, no canvas in a test DOM).
function measureFitDayWidth(grid: HTMLElement): number {
  if (titleCanvas === undefined) {
    titleCanvas = document.createElement("canvas").getContext("2d");
  }
  const canvas = titleCanvas;
  if (!canvas) return 0;
  const cards: { longestWord: number; chrome: number }[] = [];
  grid
    .querySelectorAll<HTMLElement>(".schedule-shift-badge strong")
    .forEach((title) => {
      let cell: HTMLElement | null = title;
      while (cell && cell.parentElement !== grid) cell = cell.parentElement;
      const text = title.textContent?.trim();
      if (!cell || !text) return;
      const font = getComputedStyle(title).font;
      // No lookbehind: Safari 16.0-16.3 rejects it at parse time.
      const words = text.replace(/-/g, "- ").split(/\s+/).filter(Boolean);
      const longestWord = Math.max(
        ...words.map((word) => {
          const key = `${font}|${word}`;
          let width = titleWordWidths.get(key);
          if (width === undefined) {
            canvas.font = font;
            width = canvas.measureText(word).width;
            titleWordWidths.set(key, width);
          }
          return width;
        }),
      );
      cards.push({
        longestWord,
        chrome:
          cell.getBoundingClientRect().width -
          title.getBoundingClientRect().width,
      });
    });
  return cards.length ? scheduleGridFitDayWidth(cards) : 0;
}

// Card catalog page, "Yeni" look (Mert, 2026-10-12, 16:56 and 17:04): a card's
// line never wraps, and with the left menu open one location's seven days still
// fit. Each card gives its widest line (every line is nowrap, so scrollWidth is
// the whole line) and the cell around its words; the day needs that line plus
// the corner room on both sides ("side"), or, when that is too wide, plus 2px
// with the marks on rows of their own above and below the words ("tight").
// "time" is the day width that still shows every card's hours in full: below
// it the week scrolls rather than cut a time.
// "compact" is "tight" with the name a point smaller (11px, COMPACT_TITLE).
type YeniNeeds = {
  readonly side: number;
  readonly tight: number;
  readonly compact: number;
  readonly time: number;
};
const TITLE_PX = 12;
const COMPACT_TITLE_PX = 11;
// The card's own side padding: 8px, 5px in the compact band (vk.css).
const BADGE_PAD_X = 8;
const COMPACT_PAD_X = 5;
// Half a pixel to spare, kept to a tenth so the numbers settle.
const fit = (width: number) => Math.ceil((width + 0.5) * 10) / 10;
function measureYeniNeeds(grid: HTMLElement): YeniNeeds | null {
  let side = 0;
  let tight = 0;
  let compact = 0;
  let time = 0;
  grid
    .querySelectorAll<HTMLElement>(".schedule-shift-badge .schedule-shift-badge-content")
    .forEach((content) => {
      let cell: HTMLElement | null = content;
      while (cell && cell.parentElement !== grid) cell = cell.parentElement;
      if (!cell) return;
      // Each line's whole text, to the fraction of a pixel (scrollWidth rounds);
      // the name at its full 12px, whatever size it is drawn at now.
      const widths = Array.from(content.children, (child) => {
        const range = document.createRange();
        range.selectNodeContents(child);
        const width = range.getBoundingClientRect().width;
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
      const room = Number.parseFloat(badge?.style.getPropertyValue("--rk-side") ?? "") || 2;
      // The cell less the content box and the card's side padding: the parts
      // the bands change are added back below, so a band never moves its own
      // numbers.
      const badgeStyle = badge ? getComputedStyle(badge) : null;
      const chrome =
        cell.getBoundingClientRect().width -
        content.getBoundingClientRect().width -
        (Number.parseFloat(badgeStyle?.paddingLeft ?? "") || 0) -
        (Number.parseFloat(badgeStyle?.paddingRight ?? "") || 0);
      // Reading, the first line keeps clear of the marks beside it (vk.css,
      // vk/line1.ts): each side's reach less the card's padding and the
      // words' own 2px. While editing, the marks have a row of their own.
      const reading = content.closest(".schedule-cell")?.getAttribute("data-editing") !== "true";
      const reach = (name: string) => Number.parseFloat(badge?.style.getPropertyValue(name) ?? "") || 0;
      const clear = (pad: number) =>
        firstLineInset(reach("--rk-l1-left"), pad) + firstLineInset(reach("--rk-l1-right"), pad);
      const first = reading && content.children[0]?.tagName === "STRONG";
      const tightLine = first ? Math.max(line, widths[0]! + clear(BADGE_PAD_X)) : line;
      const compactFirst = first ? Math.max(compactLine, (widths[0]! * COMPACT_TITLE_PX) / TITLE_PX + clear(COMPACT_PAD_X)) : compactLine;
      side = Math.max(side, fit(line + 2 * (room + BADGE_PAD_X) + chrome));
      tight = Math.max(tight, fit(tightLine + 2 * (TIGHT.side + BADGE_PAD_X) + chrome));
      compact = Math.max(compact, fit(compactFirst + 2 * (TIGHT.side + COMPACT_PAD_X) + chrome));
      const hoursIndex = Array.from(content.children).findIndex((child) =>
        child.classList.contains("schedule-shift-time"),
      );
      const hours = hoursIndex < 0 ? 0 : widths[hoursIndex]!;
      time = Math.max(time, fit(hours + 2 * (TIGHT.side + COMPACT_PAD_X) + chrome));
    });
  return side ? { side, tight, compact, time } : null;
}

type Band = "side" | "tight" | "compact" | "clip";
type YeniFit = {
  readonly band: Band;
  readonly widths: { readonly day: number; readonly employee: number } | null;
  readonly fits: boolean;
};

/** The first band whose day width leaves the employee column at least 144px. */
function fitYeni({
  width,
  columns,
  showTotalHours,
  needs,
}: {
  readonly width: number;
  readonly columns: number;
  readonly showTotalHours: boolean;
  readonly needs: YeniNeeds;
}): YeniFit {
  const room = width - (showTotalHours ? scheduleGridTotalColumnWidth : 0);
  const tries: [Band, number][] = [
    ["side", needs.side],
    ["tight", needs.tight],
    ["compact", needs.compact],
    // Narrower still: seven days stay on screen and a name too long ends in
    // "…"; the hours are never cut, so below their width the week scrolls.
    ["clip", Math.max(scheduleGridFitMinDayColumnWidth, needs.time)],
  ];
  for (const [band, day] of tries) {
    if (band === "clip") {
      const share = (room - scheduleGridMinEmployeeColumnWidth) / columns;
      if (share >= day) {
        return { band, widths: { day: share, employee: scheduleGridMinEmployeeColumnWidth }, fits: true };
      }
      continue;
    }
    const share = (room - employeeColumnWidth) / columns;
    if (share >= day) return { band, widths: { day: share, employee: employeeColumnWidth }, fits: true };
    const employee = room - columns * day;
    if (employee >= scheduleGridMinEmployeeColumnWidth) {
      return { band, widths: { day, employee }, fits: true };
    }
  }
  return { band: "side", widths: null, fits: false };
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
  readonly showTotalHours: boolean;
  readonly view: "day" | "week";
  readonly onClearSelection: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fillerHeightPx, setFillerHeightPx] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [fitDayWidth, setFitDayWidth] = useState(0);
  const yeni = usePick("look") === "yeni";
  const [yeniNeeds, setYeniNeeds] = useState<YeniNeeds | null>(null);
  // Cards do not change size mid-drag; skip re-reading them every frame.
  const dragging = Boolean(dragPointer);
  // Several locations side by side: each location's week fills one screen,
  // its cards wrapping like a fitted week's. Narrower than the cards' longest
  // title word, the days keep the cards' full width and the week scrolls.
  const yeniFit =
    yeni && yeniNeeds && viewportWidth > 0 && (fitWeeklyLocations || fitVisibleColumns)
      ? fitYeni({
          width: viewportWidth,
          columns: fitWeeklyLocations ? 7 : columns,
          showTotalHours,
          needs: yeniNeeds,
        })
      : null;
  const locationWidths = fitWeeklyLocations
    ? yeniFit
      ? yeniFit.widths
      : scheduleGridWeeklyLocationWidths({
          width: viewportWidth,
          showTotalHours,
          dayWidth: fitDayWidth || undefined,
        })
    : null;
  const effectiveDayColumnMinWidth = locationWidths?.day ?? dayColumnMinWidth;
  // A fitted week that would squeeze days below a readable width (a phone, a
  // tablet, a narrow window) scrolls instead (BL-205).
  const fitsColumns =
    fitVisibleColumns &&
    (yeniFit ? yeniFit.fits : scheduleGridFitsVisibleDays({
      width: viewportWidth,
      columns,
      showTotalHours,
      dayWidth: fitDayWidth || undefined,
    }));
  const band: Band = yeniFit?.band ?? "side";
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    if (yeni) grid.dataset.rkBand = band;
    else delete grid.dataset.rkBand;
  });
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
      gridRef.current
    ) {
      const next = measureFitDayWidth(gridRef.current);
      setFitDayWidth((current) => (current === next ? current : next));
      const needs = measureYeniNeeds(gridRef.current);
      setYeniNeeds((current) =>
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
        data-schedule-column-count={columns}
        aria-label={`${view === "day" ? "Daily" : "Weekly"} ${
          editing ? "editable" : "published"
        } schedule`}
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
