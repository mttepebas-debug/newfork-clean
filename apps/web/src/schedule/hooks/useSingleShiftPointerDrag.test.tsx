import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  useSingleShiftPointerDrag,
  type ShiftDropTarget,
} from "./useSingleShiftPointerDrag";

function Harness({
  enabled = true,
  warning = false,
  ownCell = false,
  onDrop = vi.fn(),
}: {
  readonly enabled?: boolean;
  readonly warning?: boolean;
  readonly ownCell?: boolean;
  readonly onDrop?: (target: ShiftDropTarget) => void;
}) {
  const drag = useSingleShiftPointerDrag({
    enabled,
    resolveLabel: () => "Dinner, 4p to 10p",
    evaluateTarget: (target) => ownCell ? { allowed: false, targetStatus: null } : ({
      allowed: true,
      targetStatus: warning ? "warning" : "allowed",
      reason: target.copy ? "Copy" : undefined,
    }),
    onDragStart: vi.fn(),
    onDropAttempt: vi.fn(),
    onDragEnd: vi.fn(),
    onDrop,
  });

  return (
    <div>
      <button
        type="button"
        onPointerDown={(event) => drag.onShiftPointerDown("shift-1", event)}
        onMouseDown={(event) => drag.onShiftMouseDown("shift-1", event)}
      >
        Shift
      </button>
      <div
        data-testid="drop-cell"
        data-drop-cell="true"
        data-location-id="loc-1"
        data-employee-id="emp-1"
        data-date="2026-08-17"
      />
      <output data-testid="drag-state">
        {drag.dragState
          ? `${drag.dragState.label}|${drag.dragState.targetKey}|${drag.dragState.targetStatus}|${drag.dragState.copy}`
          : "idle"}
      </output>
    </div>
  );
}

describe("useSingleShiftPointerDrag", () => {
  // Mert, 2026-10-13: over the shift's own cell the drag shows no colour.
  it("keeps a plain cell plain: no drop there, and no blocked colour", async () => {
    const onDrop = vi.fn();
    render(<Harness ownCell onDrop={onDrop} />);
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => screen.getByTestId("drop-cell") });
    fireEvent.mouseDown(screen.getByRole("button", { name: "Shift" }), { button: 0, buttons: 1, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { buttons: 1, clientX: 20, clientY: 20 });
    await waitFor(() => expect(screen.getByTestId("drag-state").textContent).toBe("Dinner, 4p to 10p|null|null|false"));
    fireEvent.mouseUp(window, { clientX: 20, clientY: 20 });
    expect(onDrop).not.toHaveBeenCalled();
  });
  it.each(["Control", "Shift"])("updates stationary drag on %s down/up and uses release modifiers", async key => {
    const onDrop = vi.fn();
    render(<Harness onDrop={onDrop} />);
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => screen.getByTestId("drop-cell") });
    fireEvent.mouseDown(screen.getByRole("button", { name: "Shift" }), { button: 0, buttons: 1, clientX: 0, clientY: 0, shiftKey: key === "Shift" });
    fireEvent.mouseMove(window, { buttons: 1, clientX: 20, clientY: 20 });
    fireEvent.keyDown(window, { key, ctrlKey: key === "Control", shiftKey: key === "Shift" });
    await waitFor(() => expect(screen.getByTestId("drag-state").textContent).toMatch(/true$/));
    fireEvent.keyUp(window, { key, ctrlKey: false, shiftKey: false });
    await waitFor(() => expect(screen.getByTestId("drag-state").textContent).toMatch(/false$/));
    fireEvent.mouseUp(window, { clientX: 20, clientY: 20, ctrlKey: false, shiftKey: false });
    expect(onDrop).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ shiftId: "shift-1", copy: false }));
  });
  it("does not reuse a copy target after dropping outside the grid", () => {
    const onDrop = vi.fn(); render(<Harness onDrop={onDrop} />);
    const hit = vi.fn((): HTMLElement | null => screen.getByTestId("drop-cell"));
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: hit });
    fireEvent.mouseDown(screen.getByRole("button", { name: "Shift" }), { button: 0, buttons: 1, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 20, clientY: 20, ctrlKey: true });
    hit.mockReturnValue(null);
    fireEvent.mouseUp(window, { clientX: 50, clientY: 50, ctrlKey: false });
    expect(onDrop).not.toHaveBeenCalled();
  });
  afterEach(() => {
    Reflect.deleteProperty(document, "elementFromPoint");
    vi.restoreAllMocks();
  });

  it.each([false, true])("drops on the resolved cell even when warning=%s", async warning => {
    const onDrop = vi.fn();
    render(<Harness onDrop={onDrop} warning={warning} />);
    const dropCell = screen.getByTestId("drop-cell");
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => dropCell),
    });

    fireEvent.mouseDown(screen.getByRole("button", { name: "Shift" }), {
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
        `Dinner, 4p to 10p|emp-1|loc-1|2026-08-17|${warning ? "warning" : "allowed"}|false`,
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
        shiftId: "shift-1",
        employeeId: "emp-1",
        locationId: "loc-1",
        date: "2026-08-17",
        copy: false,
      }),
    );
  });

  it("starts a copy drag when Ctrl is held from pointer down", async () => {
    const onDrop = vi.fn();
    render(<Harness onDrop={onDrop} />);
    const dropCell = screen.getByTestId("drop-cell");
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => dropCell),
    });

    fireEvent.mouseDown(screen.getByRole("button", { name: "Shift" }), {
      button: 0,
      buttons: 1,
      clientX: 0,
      clientY: 0,
      ctrlKey: true,
    });
    fireEvent.mouseMove(window, {
      buttons: 1,
      clientX: 12,
      clientY: 12,
      ctrlKey: true,
    });

    await waitFor(() =>
      expect(screen.getByTestId("drag-state").textContent).toBe(
        "Dinner, 4p to 10p|emp-1|loc-1|2026-08-17|allowed|true",
      ),
    );

    fireEvent.mouseUp(window, {
      button: 0,
      buttons: 0,
      clientX: 12,
      clientY: 12,
      ctrlKey: true,
    });

    expect(onDrop).toHaveBeenCalledWith(
      expect.objectContaining({
        shiftId: "shift-1",
        employeeId: "emp-1",
        locationId: "loc-1",
        date: "2026-08-17",
        copy: true,
      }),
    );
  });

  it("does not start when disabled", () => {
    const onDrop = vi.fn();
    render(<Harness enabled={false} onDrop={onDrop} />);
    const dropCell = screen.getByTestId("drop-cell");
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => dropCell),
    });

    fireEvent.mouseDown(screen.getByRole("button", { name: "Shift" }), {
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

  it("does not convert a touch gesture into badge drag", async () => {
    const onDrop = vi.fn();
    render(<Harness onDrop={onDrop} />);
    const shift = screen.getByRole("button", { name: "Shift" });

    const touchStart = new Event("pointerdown", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperties(touchStart, {
      button: { value: 0 },
      buttons: { value: 1 },
      clientX: { value: 0 },
      clientY: { value: 0 },
      pointerId: { value: 4 },
      pointerType: { value: "touch" },
    });
    fireEvent(shift, touchStart);
    fireEvent.pointerMove(window, {
      buttons: 1,
      clientX: 20,
      clientY: 20,
      pointerId: 4,
      pointerType: "touch",
    });
    fireEvent.mouseDown(shift, {
      button: 0,
      buttons: 1,
      clientX: 0,
      clientY: 0,
    });
    fireEvent.mouseMove(window, {
      buttons: 1,
      clientX: 20,
      clientY: 20,
    });
    await new Promise((resolve) => window.requestAnimationFrame(resolve));

    expect(screen.getByTestId("drag-state").textContent).toBe("idle");
    expect(onDrop).not.toHaveBeenCalled();
  });
});
