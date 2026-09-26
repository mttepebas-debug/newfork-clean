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

  it("says where the person stands for the shift, not that availability changed (BL-186)", () => {
    expect(formatScheduleShiftWarningAria(["availability"], "Ali Kaya")).toBe(
      "Ali Kaya shows as unavailable for this shift",
    );
    expect(formatScheduleShiftWarningAria(["availability", "overlap"])).toBe(
      "shows as unavailable for this shift, conflicts with another shift",
    );
  });

  it("keeps title, labels, time, location, and warning text in badge aria order", () => {
    expect(
      formatScheduleBadgeAriaLabel({
        title: "Lunch-Server",
        labelText: "Trainer",
        timeText: "10:00 AM - 2:00 PM",
        locationText: "also scheduled at Patio",
        warningText: "conflicts with another shift",
      }),
    ).toBe(
      "Lunch-Server, Trainer, 10:00 AM - 2:00 PM, also scheduled at Patio, conflicts with another shift",
    );
  });
});
