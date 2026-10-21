import type {
  ScheduleReadModel,
  ScheduleShift,
} from "@newfork/shared/schedule";
import { render, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  CORNER_MARK_GAP_PX,
  measureBadgeIntrinsicHeight,
  measureRowBadgeStackHeight,
  readMeasuredHeight,
  renderScheduleBadgeWidthMeasurer,
  useSynchronizedRowBadgeHeight,
  useUniformScheduleBadgeWidth,
} from "./useScheduleBadgeMeasurements";

const job: ScheduleReadModel["jobs"][number] = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Server",
  color: "#2563eb",
  
  department_id: null,
  system_key: null,
};

const shiftType: ScheduleReadModel["shift_types"][number] = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Dinner",
  color: "#7c3aed",
  sort_order: 0,
  default_start_time: "16:00",
  default_end_time: "22:00",
};

const catalog = {
  jobs: [job],
  shift_types: [shiftType],
  referenced_jobs: [] as ScheduleReadModel["referenced_jobs"],
  referenced_shift_types: [] as ScheduleReadModel["referenced_shift_types"],
};

const shift = {
  id: "shift-1",
  location_id: "loc-1",
  job_id: job.id,
  shift_type_id: shiftType.id,
  start_time: "16:00",
  end_time: "22:00",
  crosses_midnight: false,
  hide_time_on_badge: false,
  label_names: ["Patio"],
  note: "",
  warning_codes: [] as ScheduleShift["warning_codes"],
} as ScheduleShift;

const locationGroups = [
  {
    id: "unified",
    name: "Main Dining + Patio",
    timezone: "",
    sort_order: 0,
    publication_status: "published" as const,
    published_at: null,
    sourceIds: ["loc-1", "loc-2"],
    sourceNames: [
      { id: "loc-1", name: "Main Dining" },
      { id: "loc-2", name: "Patio Bar" },
    ],
  },
];

// A card's line never wraps (Mert, 2026-10-12), so a scrolling week takes the
// widest line in full.
it("takes the widest line in full without reducing an explicit minimum width", () => {
  const container = document.createElement("div");
  const badge = document.createElement("span");
  badge.dataset.scheduleBadgeWidthMeasure = "true";
  Object.defineProperty(badge, "scrollWidth", { value: 1000 });
  container.append(badge);
  const frame = vi
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation((callback) => {
      callback(0);
      return 1;
    });
  try {
    const { result, rerender, unmount } = renderHook(
      ({ minimumWidth }) =>
        useUniformScheduleBadgeWidth({
          containerRef: { current: container },
          minimumWidth,
          version: "long",
        }),
      { initialProps: { minimumWidth: 126 } },
    );
    expect(result.current).toBe(1000);
    rerender({ minimumWidth: 1200 });
    expect(result.current).toBe(1200);
    unmount();
  } finally {
    frame.mockRestore();
  }
});

describe("renderScheduleBadgeWidthMeasurer", () => {
  it("measures an archived job and type by their names, never in the presets (K8)", () => {
    render(
      <>
        {renderScheduleBadgeWidthMeasurer({
          shifts: [shift],
          catalog: {
            jobs: [],
            shift_types: [],
            referenced_jobs: [{ id: job.id, name: "Line Cook" }],
            referenced_shift_types: [{ id: shiftType.id, name: "Brunch" }],
          },
          editing: false,
          locationGroups,
          showShiftType: true,
          showShiftLabels: false,
          showClockTimes: false,
          timeFormat: "12h",
          showJobColorDot: false,
          showLocationInBadge: false,
          showShiftTypePresets: true,
        })}
      </>,
    );
    const labels = Array.from(
      document.querySelectorAll<HTMLElement>(".schedule-badge-width-measure"),
    ).map((item) => item.getAttribute("data-measure-label"));
    expect(labels).toEqual(["Brunch-Line Cook"]);
  });

  it("falls back to Shift only for a job neither list knows", () => {
    render(
      <>
        {renderScheduleBadgeWidthMeasurer({
          shifts: [shift],
          catalog: { ...catalog, jobs: [], shift_types: [] },
          editing: false,
          locationGroups,
          showShiftType: true,
          showShiftLabels: false,
          showClockTimes: false,
          timeFormat: "12h",
          showJobColorDot: false,
          showLocationInBadge: false,
          showShiftTypePresets: false,
        })}
      </>,
    );
    expect(
      document
        .querySelector<HTMLElement>(".schedule-badge-width-measure")
        ?.getAttribute("data-measure-label"),
    ).toBe("Shift");
  });

  it("includes shift and preset labels in the hidden measurement surface", () => {
    render(
      <>
        {renderScheduleBadgeWidthMeasurer({
          shifts: [shift],
          catalog,
          editing: false,
          locationGroups,
          showShiftType: true,
          showShiftLabels: true,
          showClockTimes: true,
          timeFormat: "12h",
          showJobColorDot: true,
          showLocationInBadge: false,
          showShiftTypePresets: true,
        })}
      </>,
    );

    const measurer = document.querySelector<HTMLElement>(
      ".schedule-badge-width-measurer",
    );
    expect(measurer).not.toBeNull();
    expect(measurer!.getAttribute("data-shift-labels-visible")).toBe("true");

    const items = Array.from(
      document.querySelectorAll<HTMLElement>(".schedule-badge-width-measure"),
    );
    expect(items).toHaveLength(2);
    expect(items[0]!.getAttribute("data-measure-label")).toBe(
      "Dinner-Server Patio 4:00 PM - 10:00 PM",
    );
    expect(items[0]!.getAttribute("data-job-color-dot")).toBe("true");
    // Reading, a card with no note and no "x2" keeps 2px a side.
    expect(items[0]!.style.getPropertyValue("--shift-card-side")).toBe("2px");
    expect(items[1]!.getAttribute("data-measure-label")).toBe("Dinner-Server");
    expect(
      Array.from(items[0]!.children).map((line) => line.textContent),
    ).toEqual(["Dinner-Server", "Patio", "4:00 PM - 10:00 PM"]);
  });

  it("includes displayed location names when unified badges show location context", () => {
    render(
      <>
        {renderScheduleBadgeWidthMeasurer({
          shifts: [shift],
          catalog,
          editing: false,
          locationGroups,
          showShiftType: true,
          showShiftLabels: true,
          showClockTimes: true,
          timeFormat: "12h",
          showJobColorDot: true,
          showLocationInBadge: true,
          showShiftTypePresets: false,
        })}
      </>,
    );

    expect(
      document
        .querySelector<HTMLElement>(".schedule-badge-width-measure")
        ?.getAttribute("data-measure-label"),
    ).toBe("Dinner-Server Main Dining Patio 4:00 PM - 10:00 PM");
  });

  // Mert, 2026-10-12: the words keep the room of the widest mark on both
  // sides. The sides in px are the card's (shiftCardRoom.ts).
  it("keeps the same side room the card keeps for its marks, reading and editing", () => {
    const openShift = {
      ...shift,
      id: "open-1",
      employee_id: null,
      scheduled_date: "2026-08-17",
      warning_codes: [],
    } as ScheduleShift;
    const liveShift = {
      ...shift,
      id: "live-1",
      employee_id: "employee-1",
      scheduled_date: "2026-08-17",
      warning_codes: [],
      source_published_shift_id: "published-1",
    } as ScheduleShift;
    const warnedShift = {
      ...shift,
      id: "warned-1",
      employee_id: "employee-1",
      scheduled_date: "2026-08-17",
      warning_codes: ["availability"],
    } as ScheduleShift;
    const notedShift = {
      ...shift,
      id: "noted-1",
      employee_id: "employee-1",
      scheduled_date: "2026-08-17",
      note: "Bring the keys",
    } as ScheduleShift;
    const sides = (editing: boolean) => {
      const { unmount } = render(
        <>
          {renderScheduleBadgeWidthMeasurer({
            shifts: [openShift, { ...openShift, id: "open-2" }, liveShift, warnedShift, notedShift],
            catalog,
            editing,
            locationGroups,
            showShiftType: true,
            showShiftLabels: true,
            showClockTimes: true,
            timeFormat: "12h",
            showJobColorDot: true,
            showLocationInBadge: false,
            showShiftTypePresets: false,
          })}
        </>,
      );
      const values = Array.from(
        document.querySelectorAll<HTMLElement>(".schedule-badge-width-measure"),
      ).map((item) => item.style.getPropertyValue("--shift-card-side"));
      unmount();
      return values;
    };

    // Reading: "x2" (5 + 26 + 4 - 8) and the paperclip (21 + 4 - 8); a live
    // or warned card shows no mark.
    expect(sides(false)).toEqual(["27px", "27px", "2px", "2px", "17px"]);
    // Editing: "x2" still; LIVE (6 + 30 + 4 - 8); the "!" or the spinner
    // with NEW below (4 + 22 + 4 - 8).
    expect(sides(true)).toEqual(["27px", "27px", "32px", "22px", "22px"]);
  });

  it("counts a noted open shift apart from its twin, as the Unassigned row draws them (BL-199)", () => {
    const openShift = {
      ...shift,
      id: "open-1",
      employee_id: null,
      scheduled_date: "2026-08-17",
      warning_codes: [],
      note: "",
    } as ScheduleShift;
    const measure = (shifts: ScheduleShift[]) => {
      const { unmount } = render(
        <>
          {renderScheduleBadgeWidthMeasurer({
            shifts,
            catalog,
            editing: false,
            locationGroups,
            showShiftType: true,
            showShiftLabels: true,
            showClockTimes: true,
            timeFormat: "12h",
            showJobColorDot: true,
            showLocationInBadge: false,
            showShiftTypePresets: false,
          })}
        </>,
      );
      const stacks = Array.from(
        document.querySelectorAll<HTMLElement>(".schedule-badge-width-measure"),
      ).map((item) => item.style.getPropertyValue("--shift-card-side"));
      unmount();
      return stacks;
    };

    // No "x2": the plain card keeps 2px, the noted one its paperclip's room.
    expect(
      measure([openShift, { ...openShift, id: "open-2", note: "The new oven arrives at 10" }]),
    ).toEqual(["2px", "17px"]);
    expect(measure([openShift, { ...openShift, id: "open-2" }])).toEqual(["27px", "27px"]);
  });

  it("keeps room for a ghost shift's location pin", () => {
    const ghostShift = {
      ...shift,
      id: "ghost-1",
      ghost: true,
      ghost_location_name: "Besiktas",
    } as ScheduleShift & {
      readonly ghost: boolean;
      readonly ghost_location_name: string;
    };

    render(
      <>
        {renderScheduleBadgeWidthMeasurer({
          shifts: [ghostShift],
          catalog,
          editing: false,
          locationGroups,
          showShiftType: true,
          showShiftLabels: true,
          showClockTimes: true,
          timeFormat: "12h",
          showJobColorDot: true,
          showLocationInBadge: false,
          showShiftTypePresets: false,
        })}
      </>,
    );

    // The pin (17) keeps 6 + 17 + 4 - 8 a side.
    expect(
      document
        .querySelector<HTMLElement>(".schedule-badge-width-measure")
        ?.style.getPropertyValue("--shift-card-side"),
    ).toBe("19px");
  });

  it("does not render when there is nothing to measure", () => {
    const { container } = render(
      <>
        {renderScheduleBadgeWidthMeasurer({
          shifts: [],
          catalog: { ...catalog, jobs: [], shift_types: [] },
          editing: false,
          locationGroups: [],
          showShiftType: true,
          showShiftLabels: true,
          showClockTimes: true,
          timeFormat: "12h",
          showJobColorDot: true,
          showLocationInBadge: false,
          showShiftTypePresets: true,
        })}
      </>,
    );

    expect(container.firstChild).toBeNull();
  });
});

describe("row badge height measurement", () => {
  it("uses the larger of rendered and scroll height", () => {
    const element = document.createElement("div");
    Object.defineProperty(element, "scrollHeight", {
      configurable: true,
      value: 41,
    });
    element.getBoundingClientRect = () => ({ height: 34 }) as DOMRect;

    expect(readMeasuredHeight(element)).toBe(41);
  });

  it("measures badge content plus vertical chrome before falling back to badge height", () => {
    const badge = document.createElement("button");
    badge.style.padding = "0";
    badge.style.borderWidth = "0";
    const content = document.createElement("span");
    content.dataset.shiftBadgeContent = "true";
    Object.defineProperty(content, "scrollHeight", {
      configurable: true,
      value: 32,
    });
    content.getBoundingClientRect = () => ({ height: 30 }) as DOMRect;
    Object.defineProperty(badge, "scrollHeight", {
      configurable: true,
      value: 37,
    });
    badge.getBoundingClientRect = () => ({ height: 37 }) as DOMRect;
    badge.append(content);

    expect(measureBadgeIntrinsicHeight(badge)).toBe(42);
  });

  it("uses the rendered badge padding and borders as vertical chrome", () => {
    const badge = document.createElement("button");
    badge.style.paddingTop = "7px";
    badge.style.paddingBottom = "6px";
    badge.style.borderTopWidth = "1px";
    badge.style.borderBottomWidth = "1px";
    badge.style.borderStyle = "solid";
    const content = document.createElement("span");
    content.dataset.shiftBadgeContent = "true";
    Object.defineProperty(content, "scrollHeight", {
      configurable: true,
      value: 32,
    });
    content.getBoundingClientRect = () => ({ height: 32 }) as DOMRect;
    badge.append(content);

    expect(measureBadgeIntrinsicHeight(badge)).toBe(47);
  });

  // Mert, 2026-10-13: on a short card the "!" on top and NEW below touched.
  it("keeps room between the top corner mark and NEW on a short card", () => {
    const shortCard = ({ border = 0, withNew = true, lines = 1 } = {}) => {
      const badge = document.createElement("button");
      badge.style.padding = "0";
      badge.style.borderTopWidth = `${border}px`;
      badge.style.borderBottomWidth = `${border}px`;
      badge.style.borderStyle = "solid";
      const content = document.createElement("span");
      content.dataset.shiftBadgeContent = "true";
      Object.defineProperty(content, "scrollHeight", { configurable: true, value: 34 });
      content.getBoundingClientRect = () => ({ height: 34 }) as DOMRect;
      for (let line = 0; line < lines; line += 1) content.append(document.createElement("span"));
      const markers = document.createElement("span");
      markers.className = "schedule-shift-badge-markers";
      // The top marks sit centred on the first line (useFirstLineMid): their
      // layout top is the line's middle, 13.5px down.
      Object.defineProperty(markers, "offsetTop", { configurable: true, value: 13.5 });
      Object.defineProperty(markers, "offsetHeight", { configurable: true, value: 18 });
      // Under the mouse the "!" grows; its scaled size must not move the row.
      markers.getBoundingClientRect = () => ({ height: 22 }) as DOMRect;
      badge.append(content, markers);
      if (withNew) {
        const newMark = document.createElement("span");
        newMark.className = "schedule-shift-new-mark";
        // Its middle 11.5px up: its bottom edge 4px off the corner.
        newMark.style.bottom = "11.5px";
        Object.defineProperty(newMark, "offsetHeight", { configurable: true, value: 15 });
        badge.append(newMark);
      }
      return badge;
    };

    // The "!" ends half its height below the line's middle.
    expect(measureBadgeIntrinsicHeight(shortCard())).toBe(
      Math.ceil(13.5 + 18 / 2 + CORNER_MARK_GAP_PX + 15 + 4),
    );
    // The marks sit inside the card's border, so the border adds to it.
    expect(measureBadgeIntrinsicHeight(shortCard({ border: 1 }))).toBe(
      Math.ceil(1 + 13.5 + 18 / 2 + CORNER_MARK_GAP_PX + 15 + 4 + 1),
    );
    // Without NEW the card is as tall as its words and border.
    expect(measureBadgeIntrinsicHeight(shortCard({ border: 1, withNew: false }))).toBe(36);
    // Two lines: the marks sit beside the first and the last, and the card is
    // as tall as its words (Mert, 2026-10-21).
    expect(measureBadgeIntrinsicHeight(shortCard({ border: 1, lines: 2 }))).toBe(36);
  });

  it("measures the tallest per-cell badge stack for dynamic row height", () => {
    const root = document.createElement("div");
    const firstCell = document.createElement("div");
    const secondCell = document.createElement("div");

    const makeBadge = (height: number) => {
      const badge = document.createElement("button");
      badge.dataset.shiftBadge = "true";
      badge.dataset.scheduleRowKey = "unassigned";
      Object.defineProperty(badge, "scrollHeight", {
        configurable: true,
        value: height,
      });
      badge.getBoundingClientRect = () => ({ height }) as DOMRect;
      badge.style.marginBottom = "5px";
      return badge;
    };

    firstCell.append(makeBadge(42), makeBadge(42));
    secondCell.append(makeBadge(58));
    root.append(firstCell, secondCell);

    expect(measureRowBadgeStackHeight(root, "unassigned", 36)).toBe(126);
  });

  it("counts only the occupied action minimum while allowing its lane to stretch", () => {
    const root = document.createElement("div");
    const cell = document.createElement("div");
    cell.style.paddingTop = "6px";
    cell.style.paddingBottom = "6px";

    const makeBadge = (height: number) => {
      const badge = document.createElement("button");
      badge.dataset.shiftBadge = "true";
      badge.dataset.scheduleRowKey = "unassigned";
      Object.defineProperty(badge, "scrollHeight", {
        configurable: true,
        value: height,
      });
      badge.getBoundingClientRect = () => ({ height }) as DOMRect;
      badge.style.marginBottom = "5px";
      return badge;
    };

    const addShift = document.createElement("button");
    addShift.dataset.scheduleAddShiftControl = "true";
    addShift.dataset.occupied = "true";
    addShift.style.minHeight = "28px";
    Object.defineProperty(addShift, "scrollHeight", {
      configurable: true,
      value: 220,
    });
    addShift.getBoundingClientRect = () => ({ height: 220 }) as DOMRect;

    cell.append(makeBadge(42), makeBadge(58), addShift);
    root.append(cell);

    expect(measureRowBadgeStackHeight(root, "unassigned", 36)).toBe(166);
  });

  it("keeps real and ghost badges in one zero-gap preview stack", () => {
    const root = document.createElement("div");
    const cell = document.createElement("div");

    const makeBadge = (tagName: "button" | "article") => {
      const badge = document.createElement(tagName);
      badge.dataset.shiftBadge = "true";
      badge.dataset.scheduleRowKey = "employee-1";
      badge.style.marginBottom = "0";
      Object.defineProperty(badge, "scrollHeight", {
        configurable: true,
        value: 58,
      });
      badge.getBoundingClientRect = () => ({ height: 58 }) as DOMRect;
      return badge;
    };

    cell.append(makeBadge("button"), makeBadge("article"));
    root.append(cell);

    expect(measureRowBadgeStackHeight(root, "employee-1", 44)).toBe(116);
  });
});

// A live card edited while editing starts saying NEW in a row of its own below
// the words: only its padding grows. The row watches each card's border box,
// so it grows too and NEW never sits on the time (Mert, 2026-10-12).
it("watches each card's border box, so a card's new NEW row grows the row", () => {
  const observed: { target: Element; options?: ResizeObserverOptions }[] = [];
  class FakeResizeObserver {
    observe(target: Element, options?: ResizeObserverOptions) {
      observed.push({ target, options });
    }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  function Row() {
    const { anchorRef } = useSynchronizedRowBadgeHeight({ rowKey: "row-1", version: "1", enabled: true });
    return (
      <div>
        <div ref={anchorRef} />
        <span data-shift-badge="true" data-schedule-row-key="row-1">
          <span data-shift-badge-content="true">Line Cook</span>
        </span>
      </div>
    );
  }
  try {
    const { container } = render(<Row />);
    const content = container.querySelector("[data-shift-badge-content]");
    expect(observed.filter(({ target }) => target === content).map(({ options }) => options?.box))
      .toEqual(["border-box"]);
  } finally {
    vi.unstubAllGlobals();
  }
});
