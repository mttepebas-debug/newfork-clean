import { describe, expect, it } from "vitest";

import {
  NON_EDIT_SHIFT_BADGE_MIN_HEIGHT,
  PREVIEW_SHIFT_BADGE_MIN_HEIGHT,
  measureBadgeIntrinsicHeight,
  readMeasuredHeight,
} from "./useSynchronizedRowBadgeHeight";

describe("useSynchronizedRowBadgeHeight module", () => {
  it("exposes the reference-app badge height helpers from the schedule measurer", () => {
    expect(NON_EDIT_SHIFT_BADGE_MIN_HEIGHT).toBe(36);
    expect(PREVIEW_SHIFT_BADGE_MIN_HEIGHT).toBe(44);
    expect(typeof readMeasuredHeight).toBe("function");
    expect(typeof measureBadgeIntrinsicHeight).toBe("function");
  });
});
