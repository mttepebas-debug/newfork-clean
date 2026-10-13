import { describe, expect, it } from "vitest";

import {
  grabPoint,
  isPrimaryDragActivation,
  shiftDropTargetKey,
} from "./scheduleDragTargets";

describe("scheduleDragTargets", () => {
  it("builds stable drop target keys for assigned and unassigned cells", () => {
    expect(shiftDropTargetKey("emp-1", "loc-1", "2026-08-17")).toBe(
      "emp-1|loc-1|2026-08-17",
    );
    expect(shiftDropTargetKey(null, "loc-1", "2026-08-17")).toBe(
      "unassigned|loc-1|2026-08-17",
    );
  });

  it("accepts only primary pointer activation", () => {
    expect(isPrimaryDragActivation(0, 1)).toBe(true);
    expect(isPrimaryDragActivation(undefined, 1)).toBe(true);
    expect(isPrimaryDragActivation(undefined, undefined)).toBe(true);
    expect(isPrimaryDragActivation(1, 1)).toBe(false);
    expect(isPrimaryDragActivation(2, 2)).toBe(false);
    expect(isPrimaryDragActivation(undefined, 2)).toBe(false);
  });

  it("remembers where on the card the press landed, inside the card", () => {
    const card = { left: 1020, top: 540, width: 126, height: 60 };
    expect(grabPoint(card, 1083, 570)).toEqual({ grabX: 63, grabY: 30 });
    expect(grabPoint(card, 1000, 700)).toEqual({ grabX: 0, grabY: 60 });
  });
});
