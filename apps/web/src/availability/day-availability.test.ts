import { describe, expect, it } from "vitest";
import { emptyWeeklyPreference, type PreferenceShiftType } from "@newfork/shared";
import {
  applyDay,
  changedDays,
  dayState,
  dayStatusText,
  dayTone,
  rangeOf,
  rangeText,
  setDayState,
  toggleCopy,
  toggleShiftType,
  withRange,
  noCopies,
} from "./day-availability";

const type = (id: string, name: string, start: string, end: string, selectable = true): PreferenceShiftType => ({
  id: `ad430000-0000-4000-8000-00000000000${id}`,
  name,
  start_time: start,
  end_time: end,
  archived: !selectable,
  selectable,
});
const types = [type("1", "Breakfast", "07:00", "11:00"), type("2", "Lunch", "11:00", "16:00"), type("3", "Dinner", "16:00", "22:00")];

describe("one day of the week", () => {
  it("reads as available, unavailable all day or some hours", () => {
    const week = emptyWeeklyPreference("time_range");
    expect(dayState(week.days[1]!)).toBe("free");
    week.days[1] = { ...week.days[1]!, all_day: true };
    expect(dayState(week.days[1]!)).toBe("off");
    week.days[2] = { ...week.days[2]!, ranges: [{ start: "18:00", end: "24:00" }] };
    expect(dayState(week.days[2]!)).toBe("some");
  });

  it("says the hours the way a person reads them, 12 AM to 12 AM", () => {
    expect(rangeText([0, 1440], "12h")).toBe("All day");
    expect(rangeText([0, 660], "12h")).toBe("Before 11 AM");
    expect(rangeText([1080, 1440], "12h")).toBe("After 6 PM");
    expect(rangeText([540, 1050], "12h")).toBe("9 AM – 5:30 PM");
    expect(rangeText([540, 1050], "24h")).toBe("09:00 – 17:30");
  });

  it("names each day's state for the week list", () => {
    const week = emptyWeeklyPreference("time_range");
    expect(dayStatusText(week.days[0]!, types, "12h")).toBe("Available");
    expect(dayStatusText({ ...week.days[0]!, all_day: true }, types, "12h")).toBe("Unavailable all day");
    expect(dayStatusText({ ...week.days[0]!, ranges: [{ start: "18:00", end: "24:00" }] }, types, "12h")).toBe("After 6 PM");
    const shifts = emptyWeeklyPreference("shift_type");
    expect(
      dayStatusText({ ...shifts.days[0]!, shift_type_ids: [types[2]!.id, types[0]!.id] }, types, "12h"),
    ).toBe("Breakfast, Dinner");
  });

  it("keeps one range a day; the whole day is unavailable all day", () => {
    const day = emptyWeeklyPreference("time_range").days[3]!;
    expect(withRange(day, [1080, 1440])).toEqual({ ...day, all_day: false, ranges: [{ start: "18:00", end: "24:00" }] });
    expect(withRange(day, [0, 1440])).toEqual({ ...day, all_day: true, ranges: [], shift_type_ids: [] });
    expect(rangeOf({ ...day, all_day: true })).toEqual([0, 1440]);
    expect(rangeOf(day)).toBeNull();
    // A saved day with several ranges (a mode change wrote them) is edited as one.
    expect(rangeOf({ ...day, ranges: [{ start: "09:00", end: "12:00" }, { start: "17:00", end: "24:00" }] })).toEqual([540, 1440]);
  });

  it("switches a day between the three cards", () => {
    const day = emptyWeeklyPreference("time_range").days[5]!;
    expect(setDayState(day, "off", "time_range", types).all_day).toBe(true);
    expect(setDayState(day, "some", "time_range", types).ranges).toEqual([{ start: "18:00", end: "24:00" }]);
    const off = setDayState(day, "off", "time_range", types);
    expect(setDayState(off, "some", "time_range", types).ranges).toEqual([{ start: "18:00", end: "24:00" }]);
    expect(setDayState(off, "free", "time_range", types)).toEqual(day);
    // Some hours that are already some hours stay as they are.
    const evening = withRange(day, [1200, 1440]);
    expect(setDayState(evening, "some", "time_range", types)).toBe(evening);
    const shifts = emptyWeeklyPreference("shift_type").days[5]!;
    expect(setDayState(shifts, "some", "shift_type", types).shift_type_ids).toEqual([types[2]!.id]);
  });

  it("marks shift types and turns all day on when every one is marked (M3)", () => {
    const day = emptyWeeklyPreference("shift_type").days[1]!;
    const lunch = toggleShiftType(day, types[1]!.id, types);
    expect(lunch.shift_type_ids).toEqual([types[1]!.id]);
    const two = toggleShiftType(lunch, types[0]!.id, types);
    const all = toggleShiftType(two, types[2]!.id, types);
    expect(all).toEqual({ ...day, all_day: true, shift_type_ids: [] });
    // Unmarking one from all day leaves the other selectable ones marked.
    expect(toggleShiftType(all, types[1]!.id, types).shift_type_ids).toEqual([types[0]!.id, types[2]!.id]);
  });
});

// Mert 2026-10-16: a row says the day plainly and takes its colour from it
// (green available, orange unavailable); the manager's read-only days reuse it.
describe("a day's row: colour and words", () => {
  const day = emptyWeeklyPreference("time_range").days[1]!;
  it.each([
    [day, "free", "Available all day"],
    [{ ...day, all_day: true }, "blocked", "Unavailable all day"],
    [{ ...day, ranges: [{ start: "15:00", end: "22:00" }] }, "blocked", "Unavailable 3:00 PM – 10:00 PM"],
    [{ ...day, ranges: [{ start: "00:00", end: "11:00" }] }, "blocked", "Unavailable before 11:00 AM"],
    [{ ...day, ranges: [{ start: "18:00", end: "24:00" }] }, "blocked", "Unavailable after 6:00 PM"],
  ] as const)("%j", (rule, tone, label) => {
    expect(dayTone(rule, types, "12h")).toEqual({ tone, label, className: `dav-tone is-${tone}` });
  });
  it("names the shift types in the workspace's order", () => {
    const shifts = emptyWeeklyPreference("shift_type").days[5]!;
    expect(dayTone({ ...shifts, shift_type_ids: [types[2]!.id, types[1]!.id] }, types, "12h").label).toBe(
      "Unavailable for Lunch, Dinner",
    );
  });
  it("writes a 24-hour workspace's clock", () => {
    expect(dayTone({ ...day, ranges: [{ start: "18:00", end: "24:00" }] }, types, "24h").label).toBe(
      "Unavailable after 18:00",
    );
  });
});

describe("copying a day to other days", () => {
  it("copies, follows the edited day, and puts a day back when unpressed", () => {
    let week = emptyWeeklyPreference("time_range");
    week = applyDay(week, 5, withRange(week.days[5]!, [1080, 1440]), noCopies);
    week.days[2] = { ...week.days[2]!, all_day: true };
    let copies = noCopies;
    ({ week, copies } = toggleCopy(week, 5, 2, copies));
    expect(week.days[2]).toEqual({ ...week.days[5]!, day: 2 });
    expect(copies.days).toEqual([2]);
    // The edited day changes: Tuesday follows it.
    week = applyDay(week, 5, withRange(week.days[5]!, [1200, 1440]), copies);
    expect(week.days[2]!.ranges).toEqual([{ start: "20:00", end: "24:00" }]);
    // Pressed again: Tuesday is as it was before the copy.
    ({ week, copies } = toggleCopy(week, 5, 2, copies));
    expect(week.days[2]!.all_day).toBe(true);
    expect(copies.days).toEqual([]);
  });

  it("counts the days that differ from the saved week", () => {
    const saved = emptyWeeklyPreference("time_range");
    const draft = structuredClone(saved);
    draft.days[1]!.all_day = true;
    draft.days[3]!.ranges = [{ start: "09:00", end: "12:00" }];
    expect(changedDays(saved, draft)).toEqual([1, 3]);
  });
});
