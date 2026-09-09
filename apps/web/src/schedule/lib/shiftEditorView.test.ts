import { describe, expect, it } from "vitest";

import {
  clampQuickEditorPosition,
  formatUnpaidBreakOption,
  getQuickEditorInitialPosition,
  unpaidBreakMinuteOptions,
} from "./shiftEditorView";

describe("shiftEditorView", () => {
  it("keeps the quick editor inside the viewport", () => {
    expect(
      clampQuickEditorPosition(-20, -10, { width: 1024, height: 768 }),
    ).toEqual({ x: 8, y: 8 });
    expect(
      clampQuickEditorPosition(900, 600, { width: 1024, height: 768 }),
    ).toEqual({ x: 712, y: 240 });
    expect(
      clampQuickEditorPosition(240, 120, { width: 1024, height: 768 }),
    ).toEqual({ x: 240, y: 120 });
  });

  it("opens the quick editor immediately to the right of the pointer", () => {
    expect(
      getQuickEditorInitialPosition(120, 160, { width: 1024, height: 768 }),
    ).toEqual({ x: 130, y: 160 });
  });

  it("formats unpaid break options for the editor select", () => {
    expect(unpaidBreakMinuteOptions).toEqual([0, 15, 30, 45, 60]);
    expect(formatUnpaidBreakOption(0)).toBe("None");
    expect(formatUnpaidBreakOption(30)).toBe("30m");
  });
});
