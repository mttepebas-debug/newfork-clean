import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PresetDropTarget } from "../components/SchedulePresetRows";
import { useShiftTypePresetPointerDrag } from "./useShiftTypePresetPointerDrag";

const preset = {
  jobId: "job-1",
  shiftTypeId: "type-1",
  label: "Dinner-Server",
  color: "#2563eb",
  startTime: "16:00",
  endTime: "22:00",
};

function Harness({
  enabled = true,
  onDragEnd = vi.fn(),
  onDrop = vi.fn(),
}: {
  readonly enabled?: boolean;
  readonly onDragEnd?: () => void;
  readonly onDrop?: (
    target: PresetDropTarget,
    point: { readonly clientX: number; readonly clientY: number },
  ) => void;
}) {
  const drag = useShiftTypePresetPointerDrag({
    enabled,
    evaluateTarget: () => ({ allowed: true, targetStatus: "allowed" }),
    onDropAttempt: vi.fn(),
    onDragEnd,
    onDrop,
  });

  return (
    <div>
      <button
        type="button"
        onPointerDown={(event) => drag.onPresetPointerDown(preset, event)}
        onMouseDown={(event) => drag.onPresetMouseDown(preset, event)}
      >
        Preset
      </button>
      <div
        data-testid="drop-cell"
        data-preset-drop-cell="true"
        data-location-id="loc-1"
        data-employee-id="emp-1"
        data-date="2026-08-17"
      />
      <output data-testid="drag-state">
        {drag.dragState
          ? `${drag.dragState.label}|${drag.dragState.targetKey}|${drag.dragState.targetStatus}`
          : "idle"}
      </output>
    </div>
  );
}

describe("useShiftTypePresetPointerDrag", () => {
  afterEach(() => {
    Reflect.deleteProperty(document, "elementFromPoint");
    vi.restoreAllMocks();
  });

  it("drags preset shift badges to a resolved schedule cell", async () => {
    const onDrop = vi.fn();
    render(<Harness onDrop={onDrop} />);
    const dropCell = screen.getByTestId("drop-cell");
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => dropCell),
    });

    fireEvent.mouseDown(screen.getByRole("button", { name: "Preset" }), {
      button: 0,
      buttons: 1,
      clientX: 0,
      clientY: 0,
    });
    fireEvent.mouseMove(window, {
      buttons: 1,
      clientX: 12,
      clientY: 12,
    });

    await waitFor(() =>
      expect(screen.getByTestId("drag-state").textContent).toBe(
        "Dinner-Server|emp-1|loc-1|2026-08-17|allowed",
      ),
    );

    fireEvent.mouseUp(window, {
      button: 0,
      buttons: 0,
      clientX: 12,
      clientY: 12,
    });

    expect(onDrop).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-1",
        shiftTypeId: "type-1",
        employeeId: "emp-1",
        locationId: "loc-1",
        date: "2026-08-17",
      }),
      { clientX: 12, clientY: 12 },
    );
  });

  it("does not drag preset badges when disabled", () => {
    const onDrop = vi.fn();
    render(<Harness enabled={false} onDrop={onDrop} />);
    const dropCell = screen.getByTestId("drop-cell");
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => dropCell),
    });

    fireEvent.mouseDown(screen.getByRole("button", { name: "Preset" }), {
      button: 0,
      buttons: 1,
      clientX: 0,
      clientY: 0,
    });
    fireEvent.mouseMove(window, {
      buttons: 1,
      clientX: 12,
      clientY: 12,
    });
    fireEvent.mouseUp(window, {
      button: 0,
      buttons: 0,
      clientX: 12,
      clientY: 12,
    });

    expect(screen.getByTestId("drag-state").textContent).toBe("idle");
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("notifies the controller when a preset drag session ends", async () => {
    const onDragEnd = vi.fn();
    render(<Harness onDragEnd={onDragEnd} />);
    const dropCell = screen.getByTestId("drop-cell");
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => dropCell),
    });

    fireEvent.mouseDown(screen.getByRole("button", { name: "Preset" }), {
      button: 0,
      buttons: 1,
      clientX: 0,
      clientY: 0,
    });
    fireEvent.mouseMove(window, {
      buttons: 1,
      clientX: 12,
      clientY: 12,
    });

    await waitFor(() =>
      expect(screen.getByTestId("drag-state").textContent).not.toBe("idle"),
    );

    fireEvent.mouseUp(window, {
      button: 0,
      buttons: 0,
      clientX: 12,
      clientY: 12,
    });

    expect(onDragEnd).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("drag-state").textContent).toBe("idle");
  });
});
