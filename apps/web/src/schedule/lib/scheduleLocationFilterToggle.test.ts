import { describe, expect, it } from "vitest";

import { nextScheduleLocationHeaderFilter } from "./scheduleLocationFilterToggle";

describe("nextScheduleLocationHeaderFilter", () => {
  it("activates a clicked location header from the all-locations state", () => {
    expect(
      nextScheduleLocationHeaderFilter({
        selectedLocationIds: [],
        toggledLocationIds: ["loc-1"],
      }),
    ).toEqual(["loc-1"]);
  });

  it("selects the clicked location group when it is not already the exact filter", () => {
    expect(
      nextScheduleLocationHeaderFilter({
        selectedLocationIds: ["loc-1"],
        toggledLocationIds: ["loc-2", "loc-3"],
      }),
    ).toEqual(["loc-2", "loc-3"]);
  });

  it("keeps the filter idempotent when the clicked header already matches", () => {
    const selectedLocationIds = ["loc-2", "loc-3"];

    expect(
      nextScheduleLocationHeaderFilter({
        selectedLocationIds,
        toggledLocationIds: ["loc-3", "loc-2"],
      }),
    ).toBe(selectedLocationIds);
  });

  it("keeps the current filter when an empty header target is sent", () => {
    expect(
      nextScheduleLocationHeaderFilter({
        selectedLocationIds: ["loc-1"],
        toggledLocationIds: [],
      }),
    ).toEqual(["loc-1"]);
  });
});
