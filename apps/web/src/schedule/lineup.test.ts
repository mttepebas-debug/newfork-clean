import { describe, expect, it } from "vitest";

import {
  canPublish,
  lineupDay,
  lineupNoteCount,
  lineupCardState,
  lineupHoursChange,
  lineupReadLists,
  lineupShiftSpan,
  phoneLineupKey,
  phoneLineupShift,
  phoneShiftTabs,
  unpublishedCount,
} from "./lineup";
import { aisha, chloe, day, dayRead, dinner, downtown, hannah, host, lunch, maria, model, oldJob, server, cook, shift, uptown } from "./lineup.testing";

const view = (m: ReturnType<typeof model>, date: string) => lineupDay(dayRead(m, date), m);

// Lineup, read-only first stage (Mert 2026-10-13): the day's live shifts per
// location and shift type, grouped by department and job.

describe("lineupDay", () => {
  it("puts locations and shift types in their catalog order", () => {
    const result = view(model([]), day);
    expect(result.map((location) => location.name)).toEqual(["Downtown", "Uptown"]);
    expect(result[0]!.shifts.map((s) => [s.name, s.count])).toEqual([["Lunch", 0], ["Dinner", 0]]);
  });

  it("orders shift types by their start time, the same start by name, no shift type last", () => {
    const brunch = "30000000-0000-4000-8000-000000000003";
    const m = model([
      shift({ employee: maria, job: server, type: lunch, start: "11:00", end: "16:00" }),
      shift({ employee: hannah, job: server, type: null, start: "09:00", end: "12:00" }),
    ]);
    // The catalog's own order says Dinner, Lunch, Brunch; the start times say otherwise.
    const catalog = {
      shift_types: [
        { id: dinner, name: "Dinner", color: null, sort_order: 1, default_start_time: "16:00", default_end_time: "22:00" },
        { id: lunch, name: "Lunch", color: null, sort_order: 2, default_start_time: "11:00", default_end_time: "16:00" },
        { id: brunch, name: "Brunch", color: null, sort_order: 3, default_start_time: "11:00", default_end_time: "14:00" },
      ],
    } as unknown as Parameters<typeof lineupDay>[1];
    expect(lineupDay(dayRead(m, day), catalog)[0]!.shifts.map((s) => s.name)).toEqual([
      "Brunch",
      "Lunch",
      "Dinner",
      "No shift type",
    ]);
  });

  it("groups the day's people by department, then job, earliest first", () => {
    const result = view(
      model([
        shift({ employee: hannah, job: server, type: lunch, start: "11:30", end: "16:00", labels: ["Training"] }),
        shift({ employee: maria, job: server, type: lunch, start: "11:00", end: "16:00" }),
        shift({ employee: aisha, job: cook, type: lunch, start: "10:00", end: "16:00" }),
        shift({ employee: chloe, job: host, type: lunch, start: "11:00", end: "16:00" }),
      ]),
      day,
    );
    const lunchShift = result[0]!.shifts[0]!;
    expect(lunchShift.count).toBe(4);
    expect(lunchShift.departments.map((d) => d.name)).toEqual(["Front of House", "Kitchen"]);
    expect(lunchShift.departments[0]!.jobs.map((j) => j.name)).toEqual(["Host", "Server"]);
    expect(lunchShift.departments[0]!.jobs[1]!.rows.map((r) => [r.name, r.startTime, r.labels])).toEqual([
      ["Maria Lopez", "11:00", []],
      ["Hannah Lee", "11:30", ["Training"]],
    ]);
  });

  it("leaves out open shifts, other days and other locations", () => {
    const result = view(
      model([
        shift({ employee: null, job: server, type: lunch, start: "11:00", end: "16:00" }),
        shift({ employee: maria, job: server, type: lunch, start: "11:00", end: "16:00", date: "2026-10-14" }),
        shift({ employee: hannah, job: server, type: lunch, start: "11:00", end: "16:00", location: uptown }),
      ]),
      day,
    );
    expect(result[0]!.shifts[0]!.count).toBe(0);
    expect(result[1]!.shifts[0]!.count).toBe(1);
  });

  it("keeps shifts without a shift type, and archived jobs by name", () => {
    const result = view(
      model([shift({ employee: maria, job: oldJob, type: null, start: "09:00", end: "12:00" })]),
      day,
    );
    const none = result[0]!.shifts.at(-1)!;
    expect(none.name).toBe("No shift type");
    expect(none.departments[0]!.name).toBe("Other");
    expect(none.departments[0]!.jobs[0]!.name).toBe("Barback");
  });

  it("names a published closed day and short hours, not a scheduled one", () => {
    const closure = (kind: "closed" | "short", location: string, status?: "scheduled") => ({
      id: `80000000-0000-4000-8000-00000000000${kind === "closed" ? 1 : 2}`,
      location_id: location,
      closed_date: day,
      title: kind === "closed" ? "Private event" : "Early close",
      is_all_day: kind === "closed",
      kind,
      opens: kind === "short" ? "11:00" : null,
      closes: kind === "short" ? "20:00" : null,
      status,
    });
    const result = view(model([], [closure("closed", downtown), closure("short", uptown, "scheduled")]), day);
    expect(result[0]!.closed?.title).toBe("Private event");
    expect(result[1]!.shortHours).toBeNull();
  });
});

// LINEUP-PUBLISH-WEB: the publish state comes from the day read, per lineup.
describe("publish state", () => {
  const m = model([
    shift({ employee: maria, job: server, type: lunch, start: "11:00", end: "16:00" }),
    shift({ employee: hannah, job: server, type: dinner, start: "16:00", end: "23:00" }),
  ]);

  it("names each lineup for a command and carries who published it and who read it", () => {
    const read = dayRead(m, day, {
      [dinner]: {
        status: "shared", published: true, shared_at: "2026-10-13T21:10:00+00:00", shared_by_name: "Mia Person",
        ask_ack: true, acknowledged: 7, with_app: 11,
      },
    });
    const [lunchShift, dinnerShift] = lineupDay(read, m)[0]!.shifts;
    expect(lunchShift!.publish).toMatchObject({ published: false, status: "draft", acknowledged: 0 });
    expect(dinnerShift!.publish).toMatchObject({
      target: { location_id: downtown, service_date: day, shift_type_id: dinner },
      published: true, sharedByName: "Mia Person", askAck: true, acknowledged: 7, withApp: 11,
    });
  });

  it("counts the lineups waiting to be published: people on them, not published, not past", () => {
    const read = dayRead(m, day, { [dinner]: { status: "shared", published: true } });
    const locations = lineupDay(read, m);
    expect(locations[0]!.shifts.map(canPublish)).toEqual([true, false]);
    // Uptown's empty Lunch and Dinner wait for nobody.
    expect(unpublishedCount(locations)).toBe(1);
    const past = lineupDay(dayRead(m, day, { [lunch]: { status: "past" } }), m);
    expect(unpublishedCount(past)).toBe(1);
  });

  it("an empty shift type of the catalog stays as a card nobody can publish", () => {
    const shifts = lineupDay(dayRead(model([]), day), m)[1]!.shifts;
    expect(shifts.map((s) => [s.name, s.count, canPublish(s)])).toEqual([["Lunch", 0, false], ["Dinner", 0, false]]);
  });
});

// Phone Lineup (Mert 2026-10-14): one shift at a time, under tabs.
describe("phoneLineupShift", () => {
  const shifts = view(
    model([
      shift({ employee: maria, job: server, type: lunch, start: "11:00", end: "16:00" }),
      shift({ employee: hannah, job: server, type: dinner, start: "16:00", end: "23:00" }),
    ]),
    day,
  )[0]!.shifts;

  it("opens on the chosen shift when there is one", () => {
    expect(phoneLineupShift(shifts, dinner, null)?.name).toBe("Dinner");
  });

  it("today, opens on the first shift still on the floor", () => {
    expect(phoneLineupShift(shifts, "", "10:00")?.name).toBe("Lunch");
    expect(phoneLineupShift(shifts, "", "17:30")?.name).toBe("Dinner");
    // After everyone left, the last shift with people.
    expect(phoneLineupShift(shifts, "", "23:30")?.name).toBe("Dinner");
  });

  it("another day, opens on the first shift with people", () => {
    expect(phoneLineupShift(shifts, "", null)?.name).toBe("Lunch");
    const empty = view(model([shift({ employee: hannah, job: server, type: dinner, start: "16:00", end: "23:00" })]), day)[0]!.shifts;
    expect(phoneLineupShift(empty, "", null)?.name).toBe("Dinner");
    expect(phoneLineupShift(view(model([]), day)[0]!.shifts, "", null)?.name).toBe("Lunch");
    expect(phoneLineupShift([], "", null)).toBeNull();
  });

  it("falls back when the chosen shift is not at this location", () => {
    expect(phoneLineupShift(shifts, "nope", null)?.name).toBe("Lunch");
  });
});

// All locations (Mert 2026-10-17 ~9:10 AM): a shift tab stands for that shift at every location shown.
describe("phoneShiftTabs", () => {
  it("lists each shift once over the locations, its count the people at all of them", () => {
    const locations = view(
      model([
        shift({ employee: maria, job: server, type: lunch, start: "11:00", end: "16:00" }),
        shift({ employee: hannah, job: server, type: lunch, start: "11:00", end: "16:00", location: uptown }),
        shift({ employee: chloe, job: server, type: dinner, start: "16:00", end: "22:00", location: uptown }),
      ]),
      day,
    );
    expect(phoneShiftTabs(locations).map((tab) => [tab.key, tab.name, tab.count])).toEqual([
      [lunch, "Lunch", 2],
      [dinner, "Dinner", 1],
    ]);
    expect(phoneShiftTabs(locations.slice(0, 1)).map((tab) => [tab.name, tab.count])).toEqual([["Lunch", 1], ["Dinner", 0]]);
  });

  it("adds a shift only one location has after the others, and skips a closed location", () => {
    const locations = view(
      model([
        shift({ employee: maria, job: server, type: lunch, start: "11:00", end: "16:00" }),
        shift({ employee: hannah, job: server, type: null, start: "18:00", end: "23:00", location: uptown }),
      ]),
      day,
    );
    expect(phoneShiftTabs(locations).map((tab) => [tab.name, tab.count])).toEqual([["Lunch", 1], ["Dinner", 0], ["No shift type", 1]]);
    expect(phoneShiftTabs([{ ...locations[0]!, closed: { title: "Holiday" }, shifts: [] }])).toEqual([]);
  });
});

describe("phoneLineupKey", () => {
  const locations = view(
    model([
      shift({ employee: hannah, job: server, type: dinner, start: "16:00", end: "23:00" }),
      shift({ employee: maria, job: server, type: lunch, start: "11:00", end: "16:00", location: uptown }),
    ]),
    day,
  );
  const never = () => null;

  it("keeps the chosen shift when any location shown has it", () => {
    expect(phoneLineupKey(locations, dinner, never)).toBe(dinner);
  });

  it("otherwise opens where the first location with people would, on its own clock", () => {
    expect(phoneLineupKey(locations, "", never)).toBe(dinner);
    expect(phoneLineupKey(locations.slice(1), "", never)).toBe(lunch);
    // Downtown's clock says 23:30: everyone has left, its last shift with people.
    expect(phoneLineupKey(locations, "nope", (location) => (location.id === downtown ? "23:30" : null))).toBe(dinner);
    expect(phoneLineupKey(view(model([]), day), "", never)).toBe(lunch);
    expect(phoneLineupKey([], "", never)).toBeNull();
  });
});

describe("lineupShiftSpan", () => {
  it("gives the first start and the last end, past midnight too", () => {
    const [lunchShift] = view(
      model([
        shift({ employee: maria, job: server, type: lunch, start: "11:30", end: "16:00" }),
        shift({ employee: hannah, job: server, type: lunch, start: "10:00", end: "15:00" }),
        shift({ employee: chloe, job: host, type: lunch, start: "18:00", end: "01:00", crossesMidnight: true }),
      ]),
      day,
    )[0]!.shifts;
    expect(lineupShiftSpan(lunchShift!)).toEqual({ firstIn: "10:00", lastOut: "01:00" });
  });

  it("is empty for a shift no one works", () => {
    expect(lineupShiftSpan(view(model([]), day)[0]!.shifts[0]!)).toBeNull();
  });
});

// The phone Lineup (E, Mert 2026-10-17): C's rows, the summary's state line, the Notes and Read counts.
describe("the phone's lineup parts", () => {
  const m = model([
    shift({ employee: maria, job: server, type: lunch, start: "11:00", end: "16:00" }),
    shift({ employee: hannah, job: server, type: dinner, start: "16:00", end: "23:00" }),
  ]);

  it("carries each row's section, whether it is on the lineup only, and what the lineup changed", () => {
    const read = dayRead(m, day);
    const row = read.locations[0]!.lineups[0]!.rows[0]!;
    read.locations[0]!.lineups[0]!.rows[0] = { ...row, section_name: "Patio", lineup_only: true, changed: ["start_time"] };
    const first = lineupDay(read, m)[0]!.shifts[0]!.departments[0]!.jobs[0]!.rows[0]!;
    expect(first).toMatchObject({ sectionName: "Patio", lineupOnly: true, changed: ["start_time"] });
    const plain = lineupDay(dayRead(m, day), m)[0]!.shifts[0]!.departments[0]!.jobs[0]!.rows[0]!;
    expect(plain).toMatchObject({ sectionName: null, lineupOnly: false, changed: [] });
  });

  // The started lock reads the location's own clock, not the phone's.
  it("carries each location's time zone", () => {
    const read = dayRead(m, day);
    read.locations[0] = { ...read.locations[0]!, timezone: "America/New_York" };
    expect(lineupDay(read, m).map((location) => location.timezone)).toEqual(["America/New_York", "America/Los_Angeles"]);
  });

  it("carries how many are on a lineup, with or without the app", () => {
    const read = dayRead(m, day, { [dinner]: { people: 12, with_app: 11 } });
    expect(lineupDay(read, m)[0]!.shifts[1]!.publish).toMatchObject({ people: 12, withApp: 11 });
  });

  // Mert 2026-10-17 (E, card 1): the card says Live or Draft, and a started shift locks its Edit either way.
  it("names the card's state: live or draft, and whether the shift has started", () => {
    const shifts = (extra: Parameters<typeof dayRead>[2] = {}) => lineupDay(dayRead(m, day, extra), m)[0]!.shifts;
    const [lunchDraft, dinnerDraft] = shifts();
    expect(lineupCardState(lunchDraft!, null)).toEqual({ live: false, started: false });
    // Today, once its first person is in, a lineup has started.
    expect(lineupCardState(lunchDraft!, "10:59")).toEqual({ live: false, started: false });
    expect(lineupCardState(lunchDraft!, "11:00")).toEqual({ live: false, started: true });
    expect(lineupCardState(dinnerDraft!, "12:00")).toEqual({ live: false, started: false });
    expect(lineupCardState(shifts({ [lunch]: { status: "past" } })[0]!, null)).toEqual({ live: false, started: true });
    expect(lineupCardState(shifts({ [lunch]: { status: "shared", published: true } })[0]!, "10:00")).toEqual({ live: true, started: false });
    // Published and started: still live, its Edit locked.
    expect(lineupCardState(shifts({ [lunch]: { status: "shared", published: true } })[0]!, "12:00")).toEqual({ live: true, started: true });
    expect(lineupCardState(lineupDay(dayRead(model([]), day), m)[0]!.shifts[0]!, "12:00")).toEqual({ live: false, started: false });
  });

  // LINEUP-EDIT L2a: the server locks edits with the same rule (app_private.lineup_started,
  // supabase/tests/lineup_edit.test.sql). Same fixture on both sides: Eli in at 9:00, Ana at 10:00, and an open
  // shift at 8:00 that is nobody's and starts nothing.
  it("starts with its first person in, the rule the server locks edits by", () => {
    const shifts = (extra: Parameters<typeof dayRead>[2] = {}) =>
      lineupDay(dayRead(model([
        shift({ employee: hannah, job: cook, type: lunch, start: "09:00", end: "15:00" }),
        shift({ employee: maria, job: cook, type: lunch, start: "10:00", end: "15:00" }),
        shift({ employee: null, job: cook, type: lunch, start: "08:00", end: "15:00" }),
      ]), day, extra), model([]))[0]!.shifts.find((each) => each.key === lunch)!;
    expect(lineupCardState(shifts(), "08:59").started).toBe(false);
    expect(lineupCardState(shifts(), "09:00").started).toBe(true);
    expect(lineupCardState(shifts(), null).started).toBe(false);
    expect(lineupCardState(shifts({ [lunch]: { status: "past" } }), null).started).toBe(true);
  });

  it("sorts the people on it into not read yet, read (earliest first) and no app, once each", () => {
    const people = model([
      shift({ employee: maria, job: server, type: dinner, start: "16:00", end: "22:00" }),
      shift({ employee: hannah, job: server, type: dinner, start: "16:00", end: "22:00" }),
      shift({ employee: chloe, job: host, type: dinner, start: "17:00", end: "22:00" }),
      shift({ employee: aisha, job: cook, type: dinner, start: "15:00", end: "18:00" }),
      // Aisha works twice: she is one person on the list.
      shift({ employee: aisha, job: cook, type: dinner, start: "19:00", end: "22:00" }),
    ]);
    const read = dayRead(people, day);
    const rows = read.locations[0]!.lineups.find((l) => l.shift_type_id === dinner)!.rows;
    const by = (id: string) => rows.filter((row) => row.employee_id === id);
    for (const row of by(hannah)) Object.assign(row, { acknowledged_at: "2026-10-13T22:05:00Z" });
    for (const row of by(aisha)) Object.assign(row, { acknowledged_at: "2026-10-13T21:40:00Z" });
    for (const row of by(chloe)) Object.assign(row, { has_app: false });
    const dinnerShift = lineupDay(read, people)[0]!.shifts.find((s) => s.key === dinner)!;
    const lists = lineupReadLists(dinnerShift);
    expect(lists.unread.map((p) => [p.name, p.jobName])).toEqual([["Maria Lopez", "Server"]]);
    expect(lists.read.map((p) => [p.name, p.acknowledgedAt])).toEqual([
      ["Aisha Johnson", "2026-10-13T21:40:00Z"],
      ["Hannah Lee", "2026-10-13T22:05:00Z"],
    ]);
    expect(lists.noApp.map((p) => p.name)).toEqual(["Chloe Davis"]);
  });

  it("counts the notes staff will see", () => {
    expect(lineupNoteCount({ specials: "Halibut", n86: "", shift_notes: "  " })).toBe(1);
    expect(lineupNoteCount({ specials: "", n86: "", shift_notes: "" })).toBe(0);
  });
});

// Mert 2026-10-19 ~5:30 AM (S-178 Ek 2): red / green is the TOTAL hours worked against the Schedule.
describe("lineupHoursChange", () => {
  const row = (start: string, end: string, scheduleStart: string | null, scheduleEnd: string | null) =>
    ({ startTime: start, endTime: end, scheduleStartTime: scheduleStart, scheduleEndTime: scheduleEnd }) as Parameters<
      typeof lineupHoursChange
    >[0];
  it("counts the whole shift: earlier in and later out add up", () => {
    expect(lineupHoursChange(row("15:00", "23:00", "16:00", "22:30"))).toBe(90);
  });
  it("is negative when the shift got shorter, zero when the total is the same", () => {
    expect(lineupHoursChange(row("16:00", "21:30", "16:00", "22:30"))).toBe(-60);
    expect(lineupHoursChange(row("15:00", "21:30", "16:00", "22:30"))).toBe(0);
  });
  it("runs past midnight, and says nothing for a row with no Schedule times", () => {
    expect(lineupHoursChange(row("21:00", "01:00", "21:00", "00:30"))).toBe(30);
    expect(lineupHoursChange(row("16:00", "22:00", null, null))).toBe(0);
  });
});
