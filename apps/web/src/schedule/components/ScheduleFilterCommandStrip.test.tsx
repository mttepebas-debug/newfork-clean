import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ScheduleFilterCommandStrip } from "./ScheduleFilterCommandStrip";

describe("ScheduleFilterCommandStrip", () => {
  it("reserves the command strip row without active chips", () => {
    render(<ScheduleFilterCommandStrip chips={[]} />);

    const strip = document.querySelector("[data-schedule-filter-command-strip]");

    expect(strip).toBeTruthy();
    expect(strip?.getAttribute("data-empty")).toBe("true");
    expect(strip?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
  });

  it("renders the daily or weekly view control when supplied", () => {
    const onToggleViewMode = vi.fn();

    render(
      <ScheduleFilterCommandStrip
        chips={[]}
        viewModeLabel="Daily view"
        viewModeTitle="Switch to weekly view"
        onToggleViewMode={onToggleViewMode}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Daily view" }));

    expect(onToggleViewMode).toHaveBeenCalledTimes(1);
  });

  it("renders view period step controls without bubbling to the page", () => {
    const onPageClick = vi.fn();
    const onPrevious = vi.fn();
    const onNext = vi.fn();

    render(
      <div onClick={onPageClick}>
        <ScheduleFilterCommandStrip
          chips={[]}
          viewModeLabel="Daily view"
          onToggleViewMode={vi.fn()}
          onPrevious={onPrevious}
          onNext={onNext}
        />
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Previous day" }));
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));

    expect(onPrevious).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPageClick).not.toHaveBeenCalled();
  });

  it("labels view period step controls for weekly mode", () => {
    render(
      <ScheduleFilterCommandStrip
        chips={[]}
        viewModeLabel="Weekly view"
        onToggleViewMode={vi.fn()}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Previous week" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next week" })).toBeTruthy();
  });

  it("removes chips without bubbling to the schedule page", () => {
    const onPageClick = vi.fn();
    const onRemove = vi.fn();

    render(
      <div onClick={onPageClick}>
        <ScheduleFilterCommandStrip
          chips={[
            {
              key: "locations:loc-1",
              kind: "location",
              label: "Main Dining",
              color: "#2563eb",
              onRemove,
            },
          ]}
        />
      </div>,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove location filter Main Dining",
      }),
    );
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onPageClick).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
    expect(
      document
        .querySelector("[data-schedule-filter-command-strip]")
        ?.getAttribute("data-empty"),
    ).toBe("false");
  });
});
