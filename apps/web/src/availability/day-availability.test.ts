import { describe, expect, it } from "vitest";
import { emptyWeeklyPreference, type WeeklyPreferenceDay } from "@newfork/shared";
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
  withRange,
  noCopies,
  firstName,
  updatedOn,
  weekPhrases,
  weekSentence,
} from "./day-availability";

describe("one day of the week", () => {
  it("reads as available, unavailable all day or some hours", () => {
    const week = emptyWeeklyPreference();
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
    const week = emptyWeeklyPreference();
    expect(dayStatusText(week.days[0]!, "12h")).toBe("Available");
    expect(dayStatusText({ ...week.days[0]!, all_day: true }, "12h")).toBe("Unavailable all day");
    expect(dayStatusText({ ...week.days[0]!, ranges: [{ start: "18:00", end: "24:00" }] }, "12h")).toBe("After 6 PM");
  });

  it("keeps one range a day; the whole day is unavailable all day", () => {
    const day = emptyWeeklyPreference().days[3]!;
    expect(withRange(day, [1080, 1440])).toEqual({ ...day, all_day: false, ranges: [{ start: "18:00", end: "24:00" }] });
    expect(withRange(day, [0, 1440])).toEqual({ ...day, all_day: true, ranges: [] });
    expect(rangeOf({ ...day, all_day: true })).toEqual([0, 1440]);
    expect(rangeOf(day)).toBeNull();
    expect(rangeOf({ ...day, ranges: [{ start: "09:00", end: "12:00" }] })).toEqual([540, 720]);
  });

  it("switches a day between the three cards", () => {
    const day = emptyWeeklyPreference().days[5]!;
    expect(setDayState(day, "off").all_day).toBe(true);
    expect(setDayState(day, "some").ranges).toEqual([{ start: "18:00", end: "24:00" }]);
    const off = setDayState(day, "off");
    expect(setDayState(off, "some").ranges).toEqual([{ start: "18:00", end: "24:00" }]);
    expect(setDayState(off, "free")).toEqual(day);
    // Some hours that are already some hours stay as they are.
    const evening = withRange(day, [1200, 1440]);
    expect(setDayState(evening, "some")).toBe(evening);
  });
});

// Mert 2026-10-16: a row says the day plainly and takes its colour from it
// (green available, orange unavailable); the manager's read-only days reuse it.
describe("a day's row: colour and words", () => {
  const day = emptyWeeklyPreference().days[1]!;
  it.each([
    [day, "free", "Available all day"],
    [{ ...day, all_day: true }, "blocked", "Unavailable all day"],
    [{ ...day, ranges: [{ start: "15:00", end: "22:00" }] }, "blocked", "Unavailable 3:00 PM – 10:00 PM"],
    [{ ...day, ranges: [{ start: "00:00", end: "11:00" }] }, "blocked", "Unavailable before 11:00 AM"],
    [{ ...day, ranges: [{ start: "18:00", end: "24:00" }] }, "blocked", "Unavailable after 6:00 PM"],
  ] satisfies [WeeklyPreferenceDay, string, string][])("%j", (rule, tone, label) => {
    expect(dayTone(rule, "12h")).toEqual({ tone, label, className: `dav-tone is-${tone}` });
  });
  it("writes a 24-hour workspace's clock", () => {
    expect(dayTone({ ...day, ranges: [{ start: "18:00", end: "24:00" }] }, "24h").label).toBe(
      "Unavailable after 18:00",
    );
  });
});

describe("copying a day to other days", () => {
  it("copies, follows the edited day, and puts a day back when unpressed", () => {
    let week = emptyWeeklyPreference();
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
    const saved = emptyWeeklyPreference();
    const draft = structuredClone(saved);
    draft.days[1]!.all_day = true;
    draft.days[3]!.ranges = [{ start: "09:00", end: "12:00" }];
    expect(changedDays(saved, draft)).toEqual([1, 3]);
  });
});

describe("the week in one sentence (a manager reads it)", () => {
  it("says an open week plainly", () => {
    expect(weekSentence(emptyWeeklyPreference(), "Maria", "12h")).toBe(
      "Maria is open to work any time.",
    );
    expect(weekPhrases(emptyWeeklyPreference(), "12h")).toEqual([]);
  });

  it("names each marked day Monday first, in the hours a person reads", () => {
    const week = emptyWeeklyPreference();
    week.days[2]!.all_day = true;
    week.days[5]!.ranges = [{ start: "18:00", end: "24:00" }];
    week.days[0]!.ranges = [{ start: "00:00", end: "11:00" }];
    expect(weekPhrases(week, "12h")).toEqual([
      { days: "Tue", text: "all day" },
      { days: "Fri", text: "after 6 PM" },
      { days: "Sun", text: "before 11 AM" },
    ]);
    expect(weekSentence(week, "Maria", "12h")).toBe(
      "Maria prefers not to work Tue all day, Fri after 6 PM and Sun before 11 AM.",
    );
  });

  it("joins days that read the same: a run, the weekdays, the weekend", () => {
    const week = emptyWeeklyPreference();
    for (const day of [1, 2, 3, 4, 5]) week.days[day]!.ranges = [{ start: "09:00", end: "15:00" }];
    week.days[6]!.all_day = true;
    week.days[0]!.all_day = true;
    expect(weekPhrases(week, "12h")).toEqual([
      { days: "Mon–Fri", text: "9 AM – 3 PM" },
      { days: "Sat, Sun", text: "all day" },
    ]);
    const run = emptyWeeklyPreference();
    for (const day of [1, 2, 3, 5]) run.days[day]!.all_day = true;
    expect(weekPhrases(run, "24h")).toEqual([{ days: "Mon–Wed, Fri", text: "all day" }]);
    const every = emptyWeeklyPreference();
    every.days.forEach((day) => (day.all_day = true));
    expect(weekPhrases(every, "12h")).toEqual([{ days: "Every day", text: "all day" }]);
  });
});

describe("a person's name and save date as the manager reads them", () => {
  it("takes the first name", () => {
    expect(firstName("Maria Lopez")).toBe("Maria");
    expect(firstName("  Cher ")).toBe("Cher");
  });
  it("says the save date as month and day", () => {
    expect(updatedOn("2026-10-09T18:00:00.000Z")).toBe("Oct 9");
    expect(updatedOn(null)).toBe("");
  });
});
