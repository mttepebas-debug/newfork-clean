import { describe, expect, it } from "vitest";
import {
  draftProblems,
  hoursText,
  lengthText,
  placesText,
  quickRange,
  rangeShort,
  rangeText,
  refusalText,
  zoneNow,
  type AskDraft,
} from "./time-off-text";

const now = { date: "2026-10-22", time: "09:30" }; // a Thursday
const draft = (over: Partial<AskDraft>): AskDraft => ({ kind: "vacation", start: "", end: "", allDay: true, from: "09:00", to: "17:00", note: "", ...over });
const days = (start_date: string, end_date: string) => ({ start_date, end_date, all_day: true, start_time: null, end_time: null });
const hours = (start_date: string, start_time: string, end_date: string, end_time: string) =>
  ({ start_date, end_date, all_day: false, start_time, end_time });

describe("the form's own checks", () => {
  it("asks for a type and days", () => {
    expect(draftProblems(draft({ kind: null }), now)).toEqual({ kind: "Choose a type.", dates: "Choose the days you need off." });
  });

  it("says why a range cannot be asked, by field", () => {
    expect(draftProblems(draft({ start: "2026-10-22" }), now)).toEqual({
      dates: "Today has already started. Turn off All day to ask for the rest of today.",
    });
    expect(draftProblems(draft({ start: "2026-10-21" }), now)).toEqual({ dates: "That day has passed." });
    expect(draftProblems(draft({ start: "2026-10-22", allDay: false, from: "09:00", to: "12:00" }), now)).toEqual({ time: "That time has passed." });
    expect(draftProblems(draft({ start: "2026-10-22", allDay: false, from: "10:00", to: "24:00" }), now)).toEqual({});
    expect(draftProblems(draft({ start: "2026-11-01", end: "2026-12-02" }), now)).toEqual({ dates: "Ask for 31 days or fewer at a time." });
    expect(draftProblems(draft({ start: "2026-11-01", allDay: false, from: "15:00", to: "10:00" }), now)).toEqual({
      time: "The end time is before the start time.",
    });
    expect(draftProblems(draft({ start: "2026-11-02", end: "2026-11-01" }), now)).toEqual({ dates: "The last day is before the first day." });
  });
});

describe("quick dates", () => {
  it("picks tomorrow, the coming weekend and next week", () => {
    expect(quickRange("tomorrow", "2026-10-22")).toEqual({ start: "2026-10-23", end: "2026-10-23" });
    expect(quickRange("weekend", "2026-10-22")).toEqual({ start: "2026-10-24", end: "2026-10-25" });
    expect(quickRange("weekend", "2026-10-24")).toEqual({ start: "2026-10-31", end: "2026-11-01" });
    expect(quickRange("nextweek", "2026-10-22")).toEqual({ start: "2026-10-26", end: "2026-11-01" });
    expect(quickRange("nextweek", "2026-10-26")).toEqual({ start: "2026-11-02", end: "2026-11-08" });
  });
});

describe("how a request reads", () => {
  it("writes dates, hours and length the way Karma does", () => {
    expect(rangeShort(days("2026-11-13", "2026-11-16"))).toBe("Nov 13–16");
    expect(rangeShort(days("2026-10-30", "2026-11-01"))).toBe("Oct 30 – Nov 1");
    expect(rangeText(days("2026-11-13", "2026-11-16"))).toBe("Fri, Nov 13 to Mon, Nov 16");
    expect(rangeText(hours("2026-10-27", "13:00", "2026-10-27", "18:00"))).toBe("Tue, Oct 27, 1:00 PM to 6:00 PM");
    expect(rangeText(hours("2026-10-27", "21:00", "2026-10-28", "06:00"))).toBe("Tue, Oct 27 9:00 PM to Wed, Oct 28 6:00 AM");
    expect(hoursText(hours("2026-10-27", "13:00", "2026-10-27", "18:00"), "24h")).toBe("13:00 to 18:00");
    expect(hoursText(days("2026-10-27", "2026-10-27"))).toBe("All day");
    expect(lengthText(days("2026-11-13", "2026-11-16"))).toBe("4 days");
    expect(lengthText(hours("2026-10-27", "13:00", "2026-10-27", "18:30"))).toBe("5.5 hours");
    expect(lengthText(hours("2026-10-27", "21:00", "2026-10-28", "06:00"))).toBe("2 days, part time");
    expect(placesText(["Downtown", "Midtown", "Harbor"])).toBe("Downtown, Midtown or Harbor");
  });

  it("reads now in the location's zone", () => {
    expect(zoneNow("America/Los_Angeles", new Date("2026-10-22T06:30:00Z"))).toEqual({ date: "2026-10-21", time: "23:30" });
  });

  it("puts a database refusal beside its field", () => {
    expect(refusalText("time_off.overlap").field).toBe("dates");
    expect(refusalText("time_off.no_such_time").field).toBe("time");
    expect(refusalText("authz.rank")).toEqual({ field: null, text: "You can't ask for time off in this workspace." });
    expect(refusalText(undefined).text).toBe("Couldn't send your request. Check your connection and try again.");
  });
});
