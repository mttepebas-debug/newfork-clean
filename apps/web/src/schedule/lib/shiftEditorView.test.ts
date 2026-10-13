import { describe, expect, it } from "vitest";

import { formatUnpaidBreakOption, unpaidBreakMinuteOptions } from "./shiftEditorView";

describe("shiftEditorView", () => {
  it("formats unpaid break options for the editor select", () => {
    expect(unpaidBreakMinuteOptions).toEqual([0, 15, 30, 45, 60]);
    expect(formatUnpaidBreakOption(0)).toBe("None");
    expect(formatUnpaidBreakOption(30)).toBe("30m");
  });
});
