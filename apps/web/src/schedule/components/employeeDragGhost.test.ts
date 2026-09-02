import type { DragEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import { attachEmployeeDragGhost } from "./employeeDragGhost";

describe("attachEmployeeDragGhost", () => {
  it("attaches the reference employee drag image and cleans it up", () => {
    vi.useFakeTimers();
    const setDragImage = vi.fn();
    const dataTransfer = {
      effectAllowed: "none",
      setDragImage,
    };
    const event = { dataTransfer } as unknown as DragEvent;

    attachEmployeeDragGhost(event, "Alex Rivera", "#22c55e");

    const ghost = document.body.lastElementChild as HTMLElement | null;
    expect(ghost).toBeTruthy();
    expect(ghost?.innerText).toBe("👤 Alex Rivera");
    expect(ghost?.style.position).toBe("fixed");
    expect(ghost?.style.border).toContain("rgb(34, 197, 94)");
    expect(ghost?.style.color).toBe("rgb(34, 197, 94)");
    expect(setDragImage).toHaveBeenCalledWith(ghost, 0, 0);
    expect(dataTransfer.effectAllowed).toBe("copy");

    vi.runOnlyPendingTimers();
    expect(document.body.contains(ghost)).toBe(false);
    vi.useRealTimers();
  });
});
