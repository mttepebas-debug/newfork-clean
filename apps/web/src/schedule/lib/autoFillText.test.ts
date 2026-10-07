import { describe, expect, it } from "vitest";
import { autoFillApplyLabel, autoFillRejectedText } from "./autoFillText";

describe("Auto-fill text (BL-710)", () => {
  it("counts assignments in the singular for one", () => {
    expect(autoFillApplyLabel(1)).toBe("Apply 1 assignment");
    expect(autoFillApplyLabel(3)).toBe("Apply 3 assignments");
    expect(autoFillApplyLabel(0)).toBe("Apply 0 assignments");
  });

  it("says how many assignments the server turned down", () => {
    expect(autoFillRejectedText(1)).toBe("1 auto-fill assignment could not be applied.");
    expect(autoFillRejectedText(3)).toBe("3 auto-fill assignments could not be applied.");
  });
});
