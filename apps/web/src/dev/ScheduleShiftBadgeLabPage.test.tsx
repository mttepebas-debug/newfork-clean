import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ScheduleShiftBadgeLabPage from "./ScheduleShiftBadgeLabPage";

const scheduleMock = vi.hoisted(() => ({
  mode: "preview" as "preview" | "edit",
  badgeClicks: vi.fn(),
  cellPointerDowns: vi.fn(),
}));

vi.mock("../views/SchedulePage", () => ({
  SchedulePage: ({
    scheduleBasePath,
  }: {
    readonly scheduleBasePath?: string;
  }) => (
    <main
      className="schedule-page"
      aria-label="Cloned Schedule Page"
      data-base-path={scheduleBasePath}
    >
      <div className="schedule-grid-scroll" data-testid="schedule-grid-scroll">
        <div className="schedule-grid-exact" data-testid="schedule-grid">
          <div className="schedule-grid-corner schedule-grid-sticky">
            <div className="schedule-grid-logo-frame">
              <span className="schedule-generated-logo">O</span>
            </div>
          </div>
          <div
            id="schedule-loc-patio"
            className="schedule-location-header"
            data-location-boundary="start"
          >
            <span>
              <span
                className="schedule-location-status-dot"
                data-status="published"
              />
              Patio
            </span>
          </div>
          <div
            className="schedule-day-header"
            data-today="true"
            data-testid="schedule-day-header-2026-09-03"
          >
            <span className="schedule-day-header-main">
              <strong>Thu</strong>
            </span>
            <span className="schedule-day-header-date">3</span>
          </div>
          <div
            className="schedule-employee-cell schedule-grid-sticky"
            data-editing={scheduleMock.mode === "edit"}
            data-schedule-employee-row="employee-1"
          >
            <button type="button" className="schedule-employee-name-button">
              <strong>Jordan Lee</strong>
            </button>
          </div>
          <div
            className="schedule-cell"
            data-testid="schedule-cell-body"
            data-editing={scheduleMock.mode === "edit"}
            data-employee-id="employee-1"
            data-location-id="patio"
            data-date="2026-09-03"
            onPointerDown={scheduleMock.cellPointerDowns}
          >
            <button
              type="button"
              className="schedule-shift-badge"
              data-shift-badge="true"
              data-shift-id="shift-1"
              data-selected="false"
              data-focused="false"
              data-dragging="false"
              onClick={scheduleMock.badgeClicks}
            >
              <span className="schedule-shift-stack-count">x3</span>
              <span className="schedule-shift-badge-content">
                <strong>Server</strong>
                <span className="schedule-shift-location">Patio</span>
                <span className="schedule-shift-labels">Training</span>
                <span className="schedule-shift-time">9:00 AM - 5:00 PM</span>
              </span>
            </button>
            {scheduleMock.mode === "edit" ? (
              <button type="button" className="schedule-cell-add-another">
                <span>Add shift</span>
              </button>
            ) : null}
            <i data-custom-grid-part="true">custom</i>
          </div>
          <div
            className="schedule-employee-cell schedule-unassigned-row-cell"
            data-unassigned="true"
            data-editing={scheduleMock.mode === "edit"}
            data-schedule-unassigned-bottom-separator="true"
          >
            <strong>Unassigned</strong>
            <span>3 open shifts</span>
          </div>
          <div className="schedule-total-cell">
            <span className="schedule-total-value">8h</span>
          </div>
        </div>
      </div>
    </main>
  ),
}));

describe("ScheduleShiftBadgeLabPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    scheduleMock.mode = "preview";
    scheduleMock.badgeClicks.mockReset();
    scheduleMock.cellPointerDowns.mockReset();
  });

  it("renders the real SchedulePage clone and the full inspector catalog", async () => {
    render(<ScheduleShiftBadgeLabPage />);

    expect(
      screen
        .getByLabelText("Cloned Schedule Page")
        .getAttribute("data-base-path"),
    ).toBe("/app/schedule-badge-lab");
    expect(screen.getByLabelText("Schedule Grid element")).toBeTruthy();
    expect(screen.getByRole("option", { name: "Shift badge" })).toBeTruthy();
    expect(
      screen.getByRole("option", { name: "Unassigned bottom line" }),
    ).toBeTruthy();
    expect(
      await screen.findByText("Shift badge", {
        selector: ".schedule-badge-lab-breadcrumb strong",
      }),
    ).toBeTruthy();
  });

  it("applies independent X and Y overrides and records the exact change", async () => {
    render(<ScheduleShiftBadgeLabPage />);

    const x = await screen.findByLabelText("X value");
    fireEvent.change(x, { target: { value: "5.2" } });

    const css =
      screen.getByTestId("schedule-lab-override-styles").textContent ?? "";
    expect(css).toContain('.schedule-badge-lab-clone[data-lab-mode="preview"]');
    expect(css).toContain("translate: 5.2px 0px !important");

    fireEvent.click(screen.getByRole("tab", { name: /Changes/ }));
    const change = screen.getByTestId("schedule-lab-change");
    expect(change.textContent).toContain("Shift badge");
    expect(change.textContent).toContain("X: 0px 5.2px");
    expect(change.textContent).toContain("translate / type");
  });

  it("keeps preview and edit override namespaces separate", async () => {
    render(<ScheduleShiftBadgeLabPage />);

    fireEvent.change(await screen.findByLabelText("X value"), {
      target: { value: "4.2" },
    });
    fireEvent.click(screen.getByRole("tab", { name: "Edit Page" }));
    fireEvent.change(await screen.findByLabelText("X value"), {
      target: { value: "-3.6" },
    });

    const css =
      screen.getByTestId("schedule-lab-override-styles").textContent ?? "";
    expect(css).toContain('[data-lab-mode="preview"]');
    expect(css).toContain("translate: 4.2px 0px !important");
    expect(css).toContain('[data-lab-mode="edit"]');
    expect(css).toContain("translate: -3.6px 0px !important");
  });

  it("uses inspect mode to select the nearest target and blocks Schedule actions", async () => {
    render(<ScheduleShiftBadgeLabPage />);
    fireEvent.click(screen.getByLabelText("Inspect grid element"));

    const badgeTitle = screen.getByText("Server");
    fireEvent.pointerMove(badgeTitle);
    expect(
      screen.getByText("Badge title", {
        selector: ".schedule-badge-lab-target-overlay > span",
      }),
    ).toBeTruthy();

    fireEvent.pointerDown(badgeTitle);
    fireEvent.click(badgeTitle);

    expect(scheduleMock.badgeClicks).not.toHaveBeenCalled();
    expect(scheduleMock.cellPointerDowns).not.toHaveBeenCalled();
    expect(
      (screen.getByLabelText("Schedule Grid element") as HTMLSelectElement)
        .value,
    ).toBe("badgeTitle");
    expect(
      screen
        .getByRole("button", { name: "This one" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("allows an uncatalogued grid part to become an editable instance", () => {
    render(<ScheduleShiftBadgeLabPage />);
    fireEvent.click(screen.getByLabelText("Inspect grid element"));

    fireEvent.pointerDown(screen.getByText("custom"));

    expect(
      (screen.getByLabelText("Schedule Grid element") as HTMLSelectElement)
        .value,
    ).toBe("");
    expect(
      screen.getByText("i", {
        selector: ".schedule-badge-lab-breadcrumb strong",
      }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "All matching" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("supports state-specific controls and forces the selected state for preview", async () => {
    render(<ScheduleShiftBadgeLabPage />);
    await screen.findByLabelText("X value");
    fireEvent.change(screen.getByLabelText("Element state"), {
      target: { value: "selected" },
    });
    fireEvent.click(screen.getByRole("tab", { name: "Colors" }));
    fireEvent.change(screen.getByLabelText("Opacity value"), {
      target: { value: "0.64" },
    });

    const badge = screen
      .getByText("Server")
      .closest(".schedule-shift-badge") as HTMLElement;
    expect(badge.dataset.selected).toBe("true");
    expect(badge.dataset.labForceState).toBe("selected");
    const css =
      screen.getByTestId("schedule-lab-override-styles").textContent ?? "";
    expect(css).toContain('[data-selected="true"]');
    expect(css).toContain('[data-lab-force-state="selected"]');
    expect(css).toContain("opacity: 0.64 !important");
  });

  it("moves individual border lines without moving element content", async () => {
    render(<ScheduleShiftBadgeLabPage />);
    await screen.findByLabelText("X value");
    fireEvent.click(screen.getByRole("tab", { name: "Lines" }));
    fireEvent.change(screen.getByLabelText("Top line Y value"), {
      target: { value: "2.4" },
    });

    const css =
      screen.getByTestId("schedule-lab-override-styles").textContent ?? "";
    expect(css).toContain("border-top-width: 0 !important");
    expect(css).toContain("background-image: linear-gradient");
    expect(css).toContain("left 0 top 2.4px");
  });

  it("filters properties, shows changed-only values, and resets one property", async () => {
    render(<ScheduleShiftBadgeLabPage />);
    fireEvent.change(await screen.findByLabelText("X value"), {
      target: { value: "3.2" },
    });
    fireEvent.change(screen.getByLabelText("Filter properties"), {
      target: { value: "moves only" },
    });
    expect(screen.getByLabelText("X value")).toBeTruthy();
    expect(screen.getByLabelText("Y value")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Filter properties"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByText("Changed"));
    expect(screen.getByLabelText("X value")).toBeTruthy();
    expect(screen.queryByLabelText("Y value")).toBeNull();

    fireEvent.click(screen.getByLabelText("Reset X"));
    expect(screen.getByText("No matching properties")).toBeTruthy();
  });

  it("copies an AI-ready change brief with old and new values", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<ScheduleShiftBadgeLabPage />);
    fireEvent.change(await screen.findByLabelText("X value"), {
      target: { value: "7.4" },
    });
    fireEvent.click(screen.getByRole("tab", { name: /Changes/ }));
    fireEvent.click(screen.getByRole("button", { name: /AI brief/ }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const brief = String(writeText.mock.calls[0]?.[0]);
    expect(brief).toContain("Preview / Shift badge / Base / type");
    expect(brief).toContain("X: 0px -> 7.4px (CSS: translate)");
    expect(brief).toContain("Selector:");
  });

  it("persists the current change log locally", async () => {
    const first = render(<ScheduleShiftBadgeLabPage />);
    fireEvent.change(await screen.findByLabelText("X value"), {
      target: { value: "6.8" },
    });
    await waitFor(() => {
      expect(
        window.localStorage.getItem("newfork.schedule-grid-lab.v2"),
      ).toContain("6.8px");
    });
    first.unmount();

    render(<ScheduleShiftBadgeLabPage />);
    fireEvent.click(screen.getByRole("tab", { name: /Changes/ }));
    expect(screen.getByTestId("schedule-lab-change").textContent).toContain(
      "6.8px",
    );
  });

  it("exits inspect mode with Escape", () => {
    render(<ScheduleShiftBadgeLabPage />);
    const inspect = screen.getByLabelText("Inspect grid element");
    fireEvent.click(inspect);
    expect(inspect.getAttribute("aria-pressed")).toBe("true");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(inspect.getAttribute("aria-pressed")).toBe("false");
  });
});
