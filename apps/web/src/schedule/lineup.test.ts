import { describe, expect, it } from "vitest";

import {
  canPublish,
  lineupDay,
  lineupNoteCount,
  lineupPhoneState,
  lineupShiftSpan,
  lineupWeek,
  phoneLineupShift,
  unpublishedCount,
  type LineupFilters,
} from "./lineup";
import { aisha, chloe, day, dayRead, dinner, downtown, hannah, host, lunch, maria, model, oldJob, server, cook, shift, uptown } from "./lineup.testing";

const view = (m: ReturnType<typeof model>, date: string, filters?: LineupFilters) => lineupDay(dayRead(m, date), m, filters);

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

  it("filters by location and shift type", () => {
    const result = view(model([]), day, { locationId: uptown, shiftTypeId: dinner });
    expect(result.map((l) => l.name)).toEqual(["Uptown"]);
    expect(result[0]!.shifts.map((s) => s.name)).toEqual(["Dinner"]);
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

describe("lineupWeek", () => {
  it("lists the seven days from the week start", () => {
    expect(lineupWeek("2026-10-12")).toEqual([
      "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18",
    ]);
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

  it("carries how many are on a lineup, with or without the app", () => {
    const read = dayRead(m, day, { [dinner]: { people: 12, with_app: 11 } });
    expect(lineupDay(read, m)[0]!.shifts[1]!.publish).toMatchObject({ people: 12, withApp: 11 });
  });

  it("names the summary's state: draft, published, started or nobody yet", () => {
    const shifts = (extra: Parameters<typeof dayRead>[2] = {}) => lineupDay(dayRead(m, day, extra), m)[0]!.shifts;
    const [lunchDraft, dinnerDraft] = shifts();
    expect(lineupPhoneState(lunchDraft!, null)).toBe("draft");
    // Today, once its first person is in, a lineup has started.
    expect(lineupPhoneState(lunchDraft!, "10:59")).toBe("draft");
    expect(lineupPhoneState(lunchDraft!, "11:00")).toBe("started");
    expect(lineupPhoneState(dinnerDraft!, "12:00")).toBe("draft");
    expect(lineupPhoneState(shifts({ [lunch]: { status: "past" } })[0]!, null)).toBe("started");
    expect(lineupPhoneState(shifts({ [lunch]: { status: "shared", published: true } })[0]!, "12:00")).toBe("published");
    expect(lineupPhoneState(lineupDay(dayRead(model([]), day), m)[0]!.shifts[0]!, null)).toBe("none");
  });

  it("counts the notes staff will see", () => {
    expect(lineupNoteCount({ specials: "Halibut", n86: "", shift_notes: "  " })).toBe(1);
    expect(lineupNoteCount({ specials: "", n86: "", shift_notes: "" })).toBe(0);
  });
});
