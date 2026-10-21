import { describe, expect, it } from "vitest";

import { viewSwitchDate } from "./scheduleViewSwitch";

// This week is Mon Oct 19 - Sun Oct 25, 2026; today is Tue Oct 20 (S-228 (4)).
const today = "2026-10-20";
const currentWeek = "2026-10-19";

describe("viewSwitchDate", () => {
  it("opens the chosen day when Day is chosen and that day is in the shown week", () => {
    expect(
      viewSwitchDate({ to: "day", selectedDate: "2026-11-05", weekStart: "2026-11-02", currentWeek, today }),
    ).toBe("2026-11-05");
  });

  it("opens today when the chosen day is outside this week", () => {
    expect(
      viewSwitchDate({ to: "day", selectedDate: "2026-10-12", weekStart: currentWeek, currentWeek, today }),
    ).toBe(today);
  });

  it("opens the week's first day when the chosen day is outside another week", () => {
    expect(
      viewSwitchDate({ to: "day", selectedDate: "2026-10-12", weekStart: "2026-11-02", currentWeek, today }),
    ).toBe("2026-11-02");
  });

  it("keeps the open day when Week is chosen, so its week opens", () => {
    expect(
      viewSwitchDate({ to: "week", selectedDate: "2026-11-05", weekStart: "2026-11-05", currentWeek, today }),
    ).toBe("2026-11-05");
  });
});
