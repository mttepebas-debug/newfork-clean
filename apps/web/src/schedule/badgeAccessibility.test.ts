import { describe, expect, it } from "vitest";

import {
  formatScheduleBadgeAriaLabel,
  formatScheduleShiftWarningAria,
} from "./badgeAccessibility";

describe("schedule badge accessibility", () => {
  it("formats overlap warnings with the reference conflict wording", () => {
    expect(formatScheduleShiftWarningAria(["overlap"])).toBe(
      "conflicts with another shift",
    );
  });

  it("keeps title, labels, time, location, and warning text in badge aria order", () => {
    expect(
      formatScheduleBadgeAriaLabel({
        title: "Lunch-Server",
        labelText: "Trainer",
        timeText: "10a to 2p",
        locationText: "also scheduled at Patio",
        warningText: "conflicts with another shift",
      }),
    ).toBe(
      "Lunch-Server, Trainer, 10a to 2p, also scheduled at Patio, conflicts with another shift",
    );
  });
});
