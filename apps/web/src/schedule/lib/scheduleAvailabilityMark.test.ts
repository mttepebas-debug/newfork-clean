import { describe, expect, it } from "vitest";
import type { ScheduleEmployee } from "@newfork/shared/schedule";

import {
  formatAvailabilityMarkDay,
  formatAvailabilityRange,
  formatNoteBy,
  formatNoteWhen,
  formatAvailabilityMarkLine,
  mergeAvailabilityMarks,
  nameCellShowsAvailabilityMark,
  scheduleAvailabilityMarks,
  windowsDuringShift,
} from "./scheduleAvailabilityMark";

type Projection = NonNullable<ScheduleEmployee["weekly_availability"]>[number];

// New York in October: UTC-4 the whole week.
const week = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"];
function projection(overrides: Partial<Projection>): Projection {
  return {
    location_id: "loc",
    location_name: "Main Dining",
    timezone: "America/New_York",
    week_start: week[0]!,
    status: "ready",
    unavailable_intervals: [],
    employee_intervals: [],
    leave_intervals: [],
    clock_segments: [{ start_at: "2026-10-19T04:00:00Z", end_at: "2026-10-27T04:00:00Z", offset_seconds: -4 * 3600 }],
    days: week.map((date) => ({ date, has_unavailable: false, all_day: false })),
    ...overrides,
  } as Projection;
}
const marked = (dates: readonly string[], allDay: readonly string[] = []) =>
  week.map((date) => ({ date, has_unavailable: dates.includes(date), all_day: allDay.includes(date) }));

describe("scheduleAvailabilityMarks", () => {
  it("reads the employee's own hours on the local day", () => {
    const after2 = { start_at: "2026-10-20T18:00:00Z", end_at: "2026-10-21T04:00:00Z" };
    const marks = scheduleAvailabilityMarks(projection({
      unavailable_intervals: [after2],
      employee_intervals: [after2],
      days: marked(["2026-10-20"]),
    }));
    expect(marks.get("2026-10-20")).toEqual({ kind: "unavailable", windows: [{ from: 840, to: 1440 }] });
    expect(marks.has("2026-10-21")).toBe(false);
  });

  it("draws only the employee's own hours; a manager's note never reaches the grid (M12)", () => {
    const marks = scheduleAvailabilityMarks(projection({
      unavailable_intervals: [{ start_at: "2026-10-19T20:00:00Z", end_at: "2026-10-19T22:00:00Z" }],
      note_intervals: [{ start_at: "2026-10-19T04:00:00Z", end_at: "2026-10-19T16:00:00Z" }],
      manager_notes: ["", "School mornings", "", "", "", "", ""],
      days: marked(["2026-10-19"]),
    }));
    expect(marks.get("2026-10-19")).toEqual({ kind: "unavailable", windows: [{ from: 960, to: 1080 }] });
  });

  it("marks approved time off red even on a day with no unavailable flag", () => {
    const marks = scheduleAvailabilityMarks(projection({
      leave_intervals: [{ start_at: "2026-10-24T04:00:00Z", end_at: "2026-10-25T04:00:00Z" }],
    }));
    expect(marks.get("2026-10-24")).toEqual({ kind: "time_off", ranges: [{ from: 0, to: 1440 }] });
    expect(marks.size).toBe(1);
  });

  it("lets time off win over the employee's preference on the same day", () => {
    const allDay = { start_at: "2026-10-24T04:00:00Z", end_at: "2026-10-25T04:00:00Z" };
    const marks = scheduleAvailabilityMarks(projection({
      unavailable_intervals: [allDay],
      employee_intervals: [allDay],
      leave_intervals: [{ start_at: "2026-10-24T13:00:00Z", end_at: "2026-10-24T17:00:00Z" }],
      days: marked(["2026-10-24"], ["2026-10-24"]),
    }));
    expect(marks.get("2026-10-24")).toEqual({ kind: "time_off", ranges: [{ from: 540, to: 780 }] });
  });

  // EKRAN-01 #38 (KARARLAR 2026-10-05, BL-579): Ali took a 10:00-14:00 shift on
  // his approved day off with his own consent; the rest of the day is still
  // leave, yet the cell reads as an ordinary shift: no red, no "!".
  it("leaves a day whose leave the employee gave up for a shift unmarked where the shift is", () => {
    const gaveUp = projection({
      unavailable_intervals: [{ start_at: "2026-10-24T13:00:00Z", end_at: "2026-10-24T15:00:00Z" }],
      leave_intervals: [
        { start_at: "2026-10-24T04:00:00Z", end_at: "2026-10-24T14:00:00Z" },
        { start_at: "2026-10-24T18:00:00Z", end_at: "2026-10-25T04:00:00Z" },
      ],
      days: week.map((date) => ({
        date, has_unavailable: date === "2026-10-24", all_day: false,
        leave_given_for_shift: date === "2026-10-24",
      })),
    });
    expect(scheduleAvailabilityMarks(gaveUp, (date) => date === "2026-10-24").has("2026-10-24")).toBe(false);
    // Review #38 O1: the flag is about the day; without his shift in this cell
    // (a closing shift's next morning, another location, a shift given away
    // since) the leave left that day still reads red.
    expect(scheduleAvailabilityMarks(gaveUp).get("2026-10-24")?.kind).toBe("time_off");
    expect(scheduleAvailabilityMarks(gaveUp, () => false).get("2026-10-24")?.kind).toBe("time_off");
  });

  it("reads nothing from a projection that is not ready", () => {
    expect(scheduleAvailabilityMarks(projection({ status: "unknown", days: [] })).size).toBe(0);
  });
});

describe("mergeAvailabilityMarks", () => {
  it("keeps one copy of the same window from two locations in one zone", () => {
    const mark = { kind: "unavailable" as const, windows: [{ from: 840, to: 1440 }] };
    expect(mergeAvailabilityMarks(mark, mark)).toEqual(mark);
  });
  it("lets time off win", () => {
    const off = { kind: "time_off" as const, ranges: [{ from: 0, to: 1440 }] };
    expect(mergeAvailabilityMarks({ kind: "unavailable", windows: [{ from: 0, to: 60 }] }, off)).toEqual(off);
  });
});

describe("formatting", () => {
  it("uses the prototype's wording", () => {
    expect(formatAvailabilityRange("unavailable", { from: 840, to: 1080 }, "12h")).toBe("Unavailable 2:00 PM – 6:00 PM");
    expect(formatAvailabilityRange("unavailable", { from: 840, to: 1440 }, "12h")).toBe("Unavailable after 2:00 PM");
    expect(formatAvailabilityRange("unavailable", { from: 0, to: 960 }, "12h")).toBe("Unavailable until 4:00 PM");
    expect(formatAvailabilityRange("unavailable", { from: 0, to: 1440 }, "12h")).toBe("Unavailable all day");
    expect(formatAvailabilityRange("time_off", { from: 0, to: 1440 }, "12h")).toBe("Approved time off, all day");
    expect(formatAvailabilityRange("time_off", { from: 540, to: 780 }, "12h")).toBe("Approved time off 9:00 AM – 1:00 PM");
    expect(formatAvailabilityRange("unavailable", { from: 840, to: 1080 }, "24h")).toBe("Unavailable 14:00 – 18:00");
    expect(formatAvailabilityMarkDay("2026-10-20")).toBe("Tue, Oct 20");
  });
});

describe("windowsDuringShift", () => {
  const windows = [
    { from: 0, to: 600 },
    { from: 840, to: 1440 },
  ];
  it("keeps the windows the shift touches", () => {
    expect(windowsDuringShift(windows, "16:00:00", "22:00:00")).toEqual([windows[1]]);
  });
  it("runs an overnight shift to the end of its day", () => {
    expect(windowsDuringShift(windows, "23:00", "02:00")).toEqual([windows[1]]);
  });
  it("shows the whole day when the shift touches none", () => {
    expect(windowsDuringShift(windows, "11:00", "13:00")).toEqual(windows);
  });
});

// Mert, 2026-10-04 (S2 B as designed): the note card's head says when the note is about.
describe("formatNoteWhen", () => {
  it("names the note's hours on the shift's day", () => {
    const after6 = { start_at: "2026-10-21T22:00:00Z", end_at: "2026-10-22T04:00:00Z" };
    expect(formatNoteWhen(projection({ note_intervals: [after6] }), "2026-10-21", "12h")).toBe("Wed after 6:00 PM");
    const morning = { start_at: "2026-10-21T13:00:00Z", end_at: "2026-10-21T16:00:00Z" };
    expect(formatNoteWhen(projection({ note_intervals: [morning, after6] }), "2026-10-21", "24h")).toBe("Wed 09:00 – 12:00, after 18:00");
    const allDay = { start_at: "2026-10-21T04:00:00Z", end_at: "2026-10-22T04:00:00Z" };
    expect(formatNoteWhen(projection({ note_intervals: [allDay] }), "2026-10-21", "12h")).toBe("Wed all day");
  });

  it("falls back to the day when the note's hours are not there", () => {
    expect(formatNoteWhen(projection({}), "2026-10-21", "12h")).toBe("Wed, Oct 21");
    expect(formatNoteWhen(undefined, "2026-10-21", "12h")).toBe("Wed, Oct 21");
  });
});

// Mert, 2026-10-04 (S2 B as designed): "KadıköyMüdür1 · Sep 28" under the note's words.
describe("formatNoteBy", () => {
  const withMeta = (note_author: string | null, note_edited_at: string | null) =>
    ({ ...projection({}), note_author, note_edited_at }) as Projection;

  it("names who last wrote the note and the day, on the note's own clock", () => {
    expect(formatNoteBy(withMeta("KadıköyMüdür1", "2026-09-28T15:00:00Z"))).toBe("KadıköyMüdür1 · Sep 28");
    // 10 PM in New York is already the 29th in UTC.
    expect(formatNoteBy(withMeta("KadıköyMüdür1", "2026-09-29T02:00:00Z"))).toBe("KadıköyMüdür1 · Sep 28");
  });

  it("keeps the day alone when the writer has no profile, and says nothing when neither is there", () => {
    expect(formatNoteBy(withMeta(null, "2026-09-28T15:00:00Z"))).toBe("Sep 28");
    expect(formatNoteBy(withMeta(null, null))).toBeNull();
    expect(formatNoteBy(projection({}))).toBeNull();
    expect(formatNoteBy(undefined)).toBeNull();
  });
});

describe("nameCellShowsAvailabilityMark (KARARLAR Schedule, 2026-10-06)", () => {
  const allDay = { kind: "unavailable", windows: [{ from: 0, to: 1440 }] } as const;
  const evening = { kind: "unavailable", windows: [{ from: 18 * 60, to: 1440 }] } as const;
  const timeOff = { kind: "time_off", ranges: [{ from: 0, to: 1440 }] } as const;

  it("stays off for one unavailable day whose corner mark is in sight", () => {
    expect(nameCellShowsAvailabilityMark([{ date: "2026-10-23", mark: allDay, shiftCount: 0, clashes: false }])).toBe(false);
  });
  it("stays off for one day whose clashing card already shows the mark", () => {
    expect(nameCellShowsAvailabilityMark([{ date: "2026-10-23", mark: evening, shiftCount: 1, clashes: true }])).toBe(false);
  });
  it("shows when a shift that does not clash hides the corner mark", () => {
    expect(nameCellShowsAvailabilityMark([{ date: "2026-10-20", mark: evening, shiftCount: 1, clashes: false }])).toBe(true);
  });
  it("shows for two or more unavailable days, wherever their mark sits", () => {
    expect(nameCellShowsAvailabilityMark([
      { date: "2026-10-20", mark: evening, shiftCount: 1, clashes: true },
      { date: "2026-10-23", mark: allDay, shiftCount: 0, clashes: false },
    ])).toBe(true);
  });
  // Two or more shifts in one cell (Mert, 2026-10-06 ~07:25Z).
  it("(a) some shifts clash: the cards say it, the day does not light the name", () => {
    expect(nameCellShowsAvailabilityMark([{ date: "2026-10-20", mark: evening, shiftCount: 2, clashes: true }])).toBe(false);
  });
  it("(b) none of the shifts clash: the corner hides under them, so the name says it", () => {
    expect(nameCellShowsAvailabilityMark([{ date: "2026-10-20", mark: evening, shiftCount: 3, clashes: false }])).toBe(true);
  });
  it("(c) every shift clashes: the cards say it, the name stays off for one day", () => {
    expect(nameCellShowsAvailabilityMark([{ date: "2026-10-20", mark: allDay, shiftCount: 2, clashes: true }])).toBe(false);
  });
  it("counts a day once across two locations, and never counts time off", () => {
    expect(nameCellShowsAvailabilityMark([
      { date: "2026-10-23", mark: allDay, shiftCount: 0, clashes: false },
      { date: "2026-10-23", mark: allDay, shiftCount: 0, clashes: false },
      { date: "2026-10-21", mark: timeOff, shiftCount: 0, clashes: false },
      { date: "2026-10-22", mark: null, shiftCount: 1, clashes: false },
    ])).toBe(false);
  });
});

describe("formatAvailabilityMarkLine", () => {
  it("says the date and the hours, no author", () => {
    expect(formatAvailabilityMarkLine("2026-09-30", { from: 0, to: 1440 }, "12h")).toBe("Marked unavailable Wed, Sep 30 · All day");
    expect(formatAvailabilityMarkLine("2026-10-02", { from: 14 * 60, to: 1440 }, "12h")).toBe("Marked unavailable Fri, Oct 2 · After 2:00 PM");
  });
});
