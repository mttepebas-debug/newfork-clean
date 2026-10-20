import type { ExchangeCase, ManagerHome, ManagerHomeLocation } from "@newfork/shared";
import { describe, expect, it } from "vitest";
import {
  groupNeeds,
  homeNeeds,
  homeSubline,
  hourBars,
  hourNow,
  locationBadge,
  managerOnFloor,
  minutesFromToday,
  needsAt,
  onNow,
  openToday,
} from "./manager-home-model";

const K = "20409979-fe36-4ee6-8461-1ba62eb4dbac";
const B = "30409979-fe36-4ee6-8461-1ba62eb4dbac";
const week = (published = true) =>
  Array.from({ length: 7 }, (_, index) => ({ date: `2026-10-${String(20 + index).padStart(2, "0")}`, shifts: 0, open: 0, published }));

// Los Angeles is UTC-7 on Oct 20: 9 AM there is 16:00 UTC.
const downtown: ManagerHomeLocation = {
  id: K,
  name: "Downtown",
  timezone: "America/Los_Angeles",
  today: "2026-10-20",
  today_shifts: [
    { starts_at: "2026-10-20T16:00:00Z", ends_at: "2026-10-21T00:00:00Z", open: false }, // 9 AM – 5 PM
    { starts_at: "2026-10-20T23:00:00Z", ends_at: "2026-10-21T06:00:00Z", open: false }, // 4 PM – 11 PM
    { starts_at: "2026-10-21T00:00:00Z", ends_at: "2026-10-21T06:00:00Z", open: true }, // 5 PM – 11 PM, open
    { starts_at: "2026-10-20T06:00:00Z", ends_at: "2026-10-20T09:00:00Z", open: false }, // last night 11 PM – 2 AM
  ],
  floor_managers: [{ name: "Tom Becker", starts_at: "2026-10-20T16:00:00Z", ends_at: "2026-10-21T00:00:00Z" }],
  week: week(),
  open_shifts: [],
  missing_documents: [
    { employee_id: "a1000000-0000-4000-8000-000000000001", name: "Jordan Lee", document: "Food Handler Card" },
  ],
};
const harbor: ManagerHomeLocation = { ...downtown, id: B, name: "Harbor", today_shifts: [], floor_managers: [], missing_documents: [], week: week(false) };
const home: ManagerHome = {
  workspace_id: "f7f9131e-5ae4-4d2d-9fd0-d4284e5b8eaa",
  now: "2026-10-20T21:20:00Z",
  locations: [downtown, harbor],
  time_off: [
    { id: "7d882f38-2421-4bf0-90b3-fcd0b00913c8", employee_id: "db37ec6e-d3b2-42c4-8045-d8533c17a4d2", employee_name: "Emre Demir",
      first_date: "2026-10-23", last_date: "2026-10-25", location_ids: [K, B] },
    { id: "8d882f38-2421-4bf0-90b3-fcd0b00913c8", employee_id: "eb37ec6e-d3b2-42c4-8045-d8533c17a4d2", employee_name: "Remy Remote",
      first_date: "2026-11-02", last_date: "2026-11-02", location_ids: [] },
  ],
};
const swap = {
  id: "c1000000-0000-4000-8000-000000000001",
  kind: "swap",
  status: "open",
  stage: "ready_for_manager",
  owner_name: "Lina Park",
  shift: { location_id: B, scheduled_date: "2026-10-24", job_name: "Bartender" },
} as unknown as ExchangeCase;
const waiting = { ...swap, id: "c1000000-0000-4000-8000-000000000002", stage: "awaiting_peer" } as ExchangeCase;

describe("the managers' Home model", () => {
  it("reads a moment on the location's own clock, from its own midnight", () => {
    expect(minutesFromToday("2026-10-20T16:00:00Z", "America/Los_Angeles", "2026-10-20")).toBe(9 * 60);
    expect(minutesFromToday("2026-10-21T06:00:00Z", "America/Los_Angeles", "2026-10-20")).toBe(23 * 60);
    expect(minutesFromToday("2026-10-20T06:00:00Z", "America/Los_Angeles", "2026-10-20")).toBe(-60);
  });

  it("counts the shifts running in each hour from 6 AM to midnight and marks the open ones", () => {
    const bars = hourBars(downtown);
    expect(bars).toHaveLength(18);
    expect(bars[0]).toEqual({ count: 0, gap: false }); // 6 AM
    expect(bars[3]).toEqual({ count: 1, gap: false }); // 9 AM
    expect(bars[10]).toEqual({ count: 2, gap: false }); // 4 PM
    expect(bars[11]).toEqual({ count: 2, gap: true }); // 5 PM: the 9–5 is over, the open one starts
    expect(bars[17]).toEqual({ count: 0, gap: false }); // 11 PM
  });

  it("says who is on the floor now: people, not open shifts, and the manager only while on a shift", () => {
    const afternoon = new Date("2026-10-20T23:20:00Z"); // 4:20 PM
    expect(onNow(downtown, afternoon)).toBe(2);
    expect(managerOnFloor(downtown, afternoon)).toBe("Tom Becker");
    const evening = new Date("2026-10-21T01:00:00Z"); // 6 PM
    expect(onNow(downtown, evening)).toBe(1);
    expect(managerOnFloor(downtown, evening)).toBeNull();
    expect(openToday(downtown)).toBe(1);
    expect(hourNow(downtown, afternoon)).toBe(10);
    expect(hourNow(downtown, new Date("2026-10-20T12:00:00Z"))).toBeNull(); // 5 AM
  });

  it("lists what needs the manager: documents first, then requests, then unpublished days", () => {
    const needs = homeNeeds(home, [swap, waiting], false);
    expect(needs.map((need) => need.kind)).toEqual(["docs", "timeoff", "timeoff", "swap", "publish"]);
    expect(needs[0]).toMatchObject({
      urgent: true,
      title: "Jordan Lee is working without a required document",
      detail: "Jordan Lee · Food Handler Card",
      locationIds: [K],
    });
    expect(needs[1]).toMatchObject({ title: "Emre Demir asks for time off", detail: "Fri, Oct 23 – Sun, Oct 25" });
    expect(needs[3]).toMatchObject({ title: "Lina Park wants to swap a shift", locationIds: [B] });
    expect(needs[4]).toMatchObject({ title: "The next 7 days aren’t published", href: "/app/schedule?date=2026-10-20" });
  });

  it("sends nobody to Schedule from a phone", () => {
    const publish = homeNeeds(home, [], true).find((need) => need.kind === "publish");
    expect(publish).toMatchObject({ href: null, cta: "Publish from a computer" });
  });

  it("groups the list by location, each item once, and puts what has no location in view last", () => {
    const needs = homeNeeds(home, [swap], false);
    const groups = groupNeeds(needs, home.locations);
    expect(groups.map((group) => [group.name, group.needs.map((need) => need.kind)])).toEqual([
      ["Downtown", ["docs", "timeoff"]],
      ["Harbor", ["swap", "publish"]],
      ["Other", ["timeoff"]],
    ]);
    // Filtered to Harbor, Emre's request (he works at both) shows there too.
    expect(needsAt(needs, B).map((need) => need.kind)).toEqual(["timeoff", "swap", "publish"]);
  });

  it("badges a location: a missing document first, then how much needs you, else all clear", () => {
    const needs = homeNeeds(home, [swap], false);
    expect(locationBadge(downtown, needs)).toMatchObject({ tone: "danger", text: "1 document" });
    expect(locationBadge(harbor, needs)).toMatchObject({ tone: "warn", text: "3 need you" });
    expect(locationBadge(harbor, [])).toMatchObject({ tone: "ok", text: "All clear" });
  });

  it("says the day in one line", () => {
    expect(homeSubline(16, [{ name: "A" }, { name: "B" }, { name: "C" }], 5)).toBe(
      "16 people on the floor across 3 locations. 5 things need you.",
    );
    expect(homeSubline(1, [{ name: "Downtown" }], 0)).toBe("1 person on the floor at Downtown. Nothing needs you right now.");
  });
});
