import { render, screen } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { useScheduleGridSelectionClear } from "./useScheduleGridSelectionClear";

function Harness({
  enabled,
  onClearSelection,
}: {
  readonly enabled: boolean;
  readonly onClearSelection: () => void;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  useScheduleGridSelectionClear({
    enabled,
    gridRef,
    onClearSelection,
  });

  return (
    <>
      <div ref={gridRef} data-testid="grid">
        <button type="button">Inside grid</button>
      </div>
      <button type="button">Outside grid</button>
      <div role="dialog">
        <button type="button">Dialog button</button>
      </div>
    </>
  );
}

describe("useScheduleGridSelectionClear", () => {
  it("clears selection only for pointer downs outside the grid and schedule surfaces", () => {
    const onClearSelection = vi.fn();
    render(<Harness enabled onClearSelection={onClearSelection} />);

    screen.getByText("Inside grid").dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true }),
    );
    expect(onClearSelection).not.toHaveBeenCalled();

    screen.getByText("Dialog button").dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true }),
    );
    expect(onClearSelection).not.toHaveBeenCalled();

    screen.getByText("Outside grid").dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true }),
    );
    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });

  it("does not install the outside-grid clear behavior when disabled", () => {
    const onClearSelection = vi.fn();
    render(<Harness enabled={false} onClearSelection={onClearSelection} />);

    screen.getByText("Outside grid").dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true }),
    );

    expect(onClearSelection).not.toHaveBeenCalled();
  });
});
