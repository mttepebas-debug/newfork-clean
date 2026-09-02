import { afterEach, describe, expect, it, vi } from "vitest";

import { scrollScheduleEmployeeRowIntoView } from "./employeeDragScroll";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("scrollScheduleEmployeeRowIntoView", () => {
  it("scrolls the matching schedule employee row into view", () => {
    const row = document.createElement("div");
    row.setAttribute("data-schedule-employee-row", "emp-1");
    const scrollIntoViewMock = vi.fn();
    row.scrollIntoView = scrollIntoViewMock;
    document.body.appendChild(row);

    scrollScheduleEmployeeRowIntoView("emp-1");

    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      block: "center",
      inline: "nearest",
      behavior: "smooth",
    });
  });

  it("does nothing when the row is not rendered", () => {
    expect(() => scrollScheduleEmployeeRowIntoView("missing")).not.toThrow();
  });
});
