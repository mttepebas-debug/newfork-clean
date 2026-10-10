import type { ImportantDateClosureShift } from "@newfork/shared";
import { describe, expect, it } from "vitest";

import { RequestError } from "../lib/request-error";
import {
  dayFor,
  drawerErrorText,
  historyHeading,
  historyLines,
  impactLabel,
  impactPhrase,
  locationImpact,
  savedPhrase,
  shortHoursTag,
  tally,
} from "./important-date-drawer-model";

const shift = (patch: Partial<ImportantDateClosureShift>): ImportantDateClosureShift => ({
  id: "72000000-0000-4000-8000-000000000001",
  source_id: "72000000-0000-4000-8000-000000000002",
  employee_id: "73000000-0000-4000-8000-000000000001",
  employee_name: "Ana Diaz",
  location_id: "11000000-0000-4000-8000-000000000001",
  location_name: "Main Dining",
  job_name: "Server",
  scheduled_date: "2026-12-24",
  start_time: "09:00",
  end_time: "17:00",
  starts_at: "2026-12-24T17:00:00Z",
  ends_at: "2026-12-25T01:00:00Z",
  reason: "short_hours",
  opens: "10:00",
  closes: "15:00",
  default_choice: "keep",
  ...patch,
});

describe("important date drawer model", () => {
  it("keeps short hours already typed and gives new ones 10 AM to 3 PM", () => {
    expect(dayFor("open", undefined)).toBeNull();
    expect(dayFor("closed", { status: "short", opens: "08:00", closes: "12:00" })).toEqual({ status: "closed" });
    expect(dayFor("short", undefined)).toEqual({ status: "short", opens: "10:00", closes: "15:00" });
    expect(dayFor("short", { status: "short", opens: "08:00", closes: "12:00" })).toEqual({
      status: "short",
      opens: "08:00",
      closes: "12:00",
    });
  });

  it("counts each listed shift under its choice, the default when none was made (B12)", () => {
    const first = shift({ id: "72000000-0000-4000-8000-000000000011", default_choice: "remove" });
    const second = shift({ id: "72000000-0000-4000-8000-000000000012", default_choice: "keep" });
    const third = shift({ id: "72000000-0000-4000-8000-000000000013", default_choice: "remove" });
    const counts = tally([first, second, third], { [third.id]: "open" });
    expect(counts).toEqual({ remove: 1, open: 1, keep: 1, listed: 3 });
    expect(impactPhrase(counts)).toBe("1 shift will be removed · 1 becomes open · 1 kept");
    expect(impactPhrase({ remove: 0, open: 2, keep: 0, listed: 2 })).toBe("2 shifts will become open shifts");
    expect(locationImpact("closed", { remove: 2, open: 0, keep: 1, listed: 3 })).toEqual({
      text: "2 removed · 1 kept",
      tone: "remove",
    });
    expect(locationImpact("short", { remove: 0, open: 0, keep: 0, listed: 0 }).text).toBe("All fit");
    expect(locationImpact("open", { remove: 0, open: 0, keep: 0, listed: 0 }).text).toBe("Usual hours");
  });

  it("names the list's Impact column from the locations' days", () => {
    const one = "11000000-0000-4000-8000-000000000001";
    const two = "11000000-0000-4000-8000-000000000002";
    expect(impactLabel({ location_days: {}, location_ids: [] }, 2)).toBe("None");
    expect(impactLabel({ location_days: { [one]: { status: "closed" } }, location_ids: [] }, 2)).toBe("1 closed");
    expect(
      impactLabel({ location_days: { [one]: { status: "closed" }, [two]: { status: "closed" } }, location_ids: [] }, 2),
    ).toBe("Closed");
    expect(
      impactLabel({ location_days: { [one]: { status: "short", opens: "10:00", closes: "15:00" } }, location_ids: [one] }, 2),
    ).toBe("Short hours");
    expect(
      impactLabel(
        { location_days: { [one]: { status: "closed" }, [two]: { status: "short", opens: "10:00", closes: "15:00" } }, location_ids: [] },
        2,
      ),
    ).toBe("1 closed · 1 short hours");
  });

  it("says why a shift is on the list with short hours", () => {
    expect(shortHoursTag(shift({ start_time: "06:00", end_time: "09:00" }))).toBe("Before opening");
    expect(shortHoursTag(shift({ start_time: "16:00", end_time: "22:00" }))).toBe("After closing");
    expect(shortHoursTag(shift({ start_time: "09:00", end_time: "17:00" }))).toBe("Outside 10 AM–3 PM");
    expect(shortHoursTag(shift({ start_time: "09:00", end_time: "14:00" }))).toBe("Starts before 10 AM");
    expect(shortHoursTag(shift({ start_time: "12:00", end_time: "01:00" }))).toBe("Ends after 3 PM");
    expect(shortHoursTag(shift({ reason: "closed" }))).toBe("");
  });

  it("turns refusals into plain sentences", () => {
    expect(drawerErrorText(new RequestError("x", "important_date.closure_changed", undefined, 409))).toBe(
      "The shifts on this date changed. Review them on the Shifts tab, then save again.",
    );
    expect(drawerErrorText(new RequestError("x", "authz.out_of_scope", undefined, 403))).toBe(
      "You can't change dates at this location.",
    );
    expect(drawerErrorText(new RequestError("x", undefined, undefined, 409))).toBe(
      "This date changed. Close it and open it again.",
    );
    expect(drawerErrorText(new Error("network"))).toBe("The date could not be saved. Try again.");
  });

  it("says what a save did to the shifts (BL-884)", () => {
    expect(savedPhrase({})).toBe("Saved");
    expect(savedPhrase({ shifts_removed: 2, shifts_opened: 1, shifts_stay_open: 1 })).toBe(
      "Saved · 2 shifts removed · 1 shift opened · 1 shift stays open",
    );
  });

  it("lists what changed, location by location, and masks a hidden change (K6)", () => {
    const one = "11000000-0000-4000-8000-000000000001";
    const name = (id: string) => (id === one ? "Main Dining" : "Another location");
    const base = {
      title: "Christmas Eve",
      type: "holiday",
      starts_on: "2026-12-24",
      ends_on: "2026-12-24",
      all_day: true,
      recurrence: "annual",
      location_ids: [],
      note: "",
    };
    const change = {
      id: "74000000-0000-4000-8000-000000000001",
      action: "updated" as const,
      changed_at: "2026-10-01T17:30:00Z",
      actor_user_id: null,
      actor_name: "Zeynep Aydin",
      before: { ...base, location_days: {} },
      after: { ...base, title: "Christmas Eve hours", location_days: { [one]: { status: "short", opens: "10:00", closes: "15:00" } } },
    };
    expect(historyHeading(change)).toBe("Changed by Zeynep Aydin");
    expect(historyLines(change, name)).toEqual([
      { label: "Title", before: "Christmas Eve", after: "Christmas Eve hours" },
      { label: "Main Dining", before: "Open", after: "Short hours 10 AM–3 PM" },
    ]);
    const hidden = { ...change, changed_at: null, actor_name: null, before: { hidden: true }, after: { hidden: true } };
    expect(historyHeading(hidden)).toBe("Hidden change");
    expect(historyLines(hidden, name)).toEqual([]);
  });
});
