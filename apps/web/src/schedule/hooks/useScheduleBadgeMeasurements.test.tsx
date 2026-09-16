import type {
  ScheduleReadModel,
  ScheduleShift,
} from "@newfork/shared/schedule";
import { render, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  measureBadgeIntrinsicHeight,
  measureRowBadgeStackHeight,
  readMeasuredHeight,
  renderScheduleBadgeWidthMeasurer,
  useUniformScheduleBadgeWidth,
} from "./useScheduleBadgeMeasurements";

const job: ScheduleReadModel["jobs"][number] = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Server",
  color: "#2563eb",
  sort_order: 0,
  department_id: null,
};

const shiftType: ScheduleReadModel["shift_types"][number] = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Dinner",
  color: "#7c3aed",
  sort_order: 0,
  default_start_time: "16:00",
  default_end_time: "22:00",
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

it("bounds long badge content without reducing an explicit minimum width", () => {
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
    expect(result.current).toBe(220);
    rerender({ minimumWidth: 240 });
    expect(result.current).toBe(240);
    unmount();
  } finally {
    frame.mockRestore();
  }
});

describe("renderScheduleBadgeWidthMeasurer", () => {
  it("includes shift and preset labels in the hidden measurement surface", () => {
    render(
      <>
        {renderScheduleBadgeWidthMeasurer({
          shifts: [shift],
          jobs: [job],
          shiftTypes: [shiftType],
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
    expect(items[0]!.getAttribute("data-has-markers")).toBe("false");
    expect(items[0]!.getAttribute("data-has-stack")).toBe("false");
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
          jobs: [job],
          shiftTypes: [shiftType],
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

  it("reserves measured width for visible publication markers and unassigned stacks", () => {
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

    render(
      <>
        {renderScheduleBadgeWidthMeasurer({
          shifts: [openShift, { ...openShift, id: "open-2" }, liveShift],
          jobs: [job],
          shiftTypes: [shiftType],
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

    const items = Array.from(
      document.querySelectorAll<HTMLElement>(".schedule-badge-width-measure"),
    );
    expect(items.map((item) => item.dataset.hasStack)).toEqual([
      "true",
      "true",
      "false",
    ]);
    expect(items.map((item) => item.dataset.hasMarkers)).toEqual([
      "false",
      "false",
      "true",
    ]);
  });

  it("does not render when there is nothing to measure", () => {
    const { container } = render(
      <>
        {renderScheduleBadgeWidthMeasurer({
          shifts: [],
          jobs: [],
          shiftTypes: [],
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
