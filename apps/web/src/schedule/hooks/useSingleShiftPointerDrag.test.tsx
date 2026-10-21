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
  onContextMenu = vi.fn(),
}: {
  readonly onContextMenu?: () => void;
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
        onContextMenu={onContextMenu}
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
      <output data-testid="drag-grab">
        {drag.dragState ? `${drag.dragState.grabX},${drag.dragState.grabY}` : ""}
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
  // Mert, 2026-10-13: the lifted card stays where it was pressed, under the mouse.
  it("remembers where on the card the press landed", async () => {
    render(<Harness />);
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => screen.getByTestId("drop-cell") });
    const card = screen.getByRole("button", { name: "Shift" });
    card.getBoundingClientRect = () => ({ left: 100, top: 200, width: 126, height: 60, right: 226, bottom: 260, x: 100, y: 200, toJSON: () => ({}) });
    fireEvent.mouseDown(card, { button: 0, buttons: 1, clientX: 130, clientY: 215 });
    fireEvent.mouseMove(window, { buttons: 1, clientX: 150, clientY: 235 });
    await waitFor(() => expect(screen.getByTestId("drag-grab").textContent).toBe("30,15"));
    fireEvent.mouseUp(window, { clientX: 150, clientY: 235 });
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

  // Mert, 2026-10-20 (atama-surukle B): on a tablet a finger held on a card
  // lifts it; a quick swipe still scrolls (the test above).
  function touch(target: Element | Window, type: string, x: number, y: number) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
      button: { value: 0 }, buttons: { value: type === "pointerup" ? 0 : 1 },
      clientX: { value: x }, clientY: { value: y }, pointerId: { value: 7 }, pointerType: { value: "touch" },
    });
    fireEvent(target, event);
    return event;
  }
  const hold = () => new Promise((resolve) => setTimeout(resolve, 420));

  it("lifts a card held still on a touch screen, and drops it where the finger lets go", async () => {
    const onDrop = vi.fn();
    render(<Harness onDrop={onDrop} />);
    const shift = screen.getByRole("button", { name: "Shift" });
    const cell = screen.getByTestId("drop-cell");
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: vi.fn(() => cell) });
    touch(shift, "pointerdown", 10, 10);
    expect(screen.getByTestId("drag-state").textContent).toBe("idle");
    await hold();
    await waitFor(() => expect(screen.getByTestId("drag-state").textContent).toContain("Dinner, 4p to 10p"));
    // The page does not scroll under the lifted card.
    const move = new Event("touchmove", { bubbles: true, cancelable: true });
    window.dispatchEvent(move);
    expect(move.defaultPrevented).toBe(true);
    touch(window, "pointermove", 60, 80);
    touch(window, "pointerup", 60, 80);
    expect(onDrop).toHaveBeenCalledWith(expect.objectContaining({ shiftId: "shift-1", employeeId: "emp-1", date: "2026-08-17" }));
    await waitFor(() => expect(screen.getByTestId("drag-state").textContent).toBe("idle"));
  });

  it("opens the card's menu when a held card is let go without moving, and only then", async () => {
    const onDrop = vi.fn();
    const onContextMenu = vi.fn();
    render(<Harness onDrop={onDrop} onContextMenu={onContextMenu} />);
    const shift = screen.getByRole("button", { name: "Shift" });
    touch(shift, "pointerdown", 10, 10);
    await hold();
    // The browser's own long-press menu would land mid-hold: it is not this one.
    const native = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 });
    shift.dispatchEvent(native);
    expect(native.defaultPrevented).toBe(true);
    expect(onContextMenu).not.toHaveBeenCalled();
    touch(window, "pointerup", 11, 11);
    expect(onContextMenu).toHaveBeenCalledOnce();
    expect(onDrop).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId("drag-state").textContent).toBe("idle"));
  });
});
