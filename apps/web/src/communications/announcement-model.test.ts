import type { AnnouncementDetail, AnnouncementProblem, AnnouncementRecord } from "@newfork/shared";
import { describe, expect, it } from "vitest";
import { record } from "./announcement-fixtures.test-util";
import {
  comingUp,
  dayLine,
  dayText,
  draftFromRecord,
  draftKey,
  draftToSend,
  failureReason,
  fitToHours,
  historyStep,
  hoursText,
  inListTab,
  mainAction,
  momentText,
  newDraft,
  nextSort,
  nextStepAfter,
  nextYearDay,
  publishedOn,
  rangeText,
  repeatOptions,
  shiftReason,
  shiftSummary,
  shownProblems,
  sortRecords,
  stepBefore,
  zonedMoment,
  zonedWall,
} from "./announcement-model";

const downtown = "11000000-0000-4000-8000-000000000001";
const harbor = "11000000-0000-4000-8000-000000000002";

const at = (location_id: string, name: string, day: "open" | "closed" | "short", opens: string | null = null, closes: string | null = null) => ({
  location_id,
  name,
  short_name: name,
  timezone: "America/Los_Angeles",
  archived: false,
  day,
  opens,
  closes,
});

describe("announcement wording", () => {
  it("writes days, ranges and hours the way the prototype does", () => {
    expect(dayText("2026-11-26")).toBe("Thu, Nov 26");
    expect(dayText("2026-11-26", true)).toBe("Thu, Nov 26, 2026");
    expect(rangeText("2026-11-26", "2026-11-26")).toBe("Thu, Nov 26");
    expect(rangeText("2026-11-26", "2026-11-27")).toBe("Thu, Nov 26 – Fri, Nov 27");
    expect(hoursText("15:00", "16:00", "12h")).toBe("3:00–4:00 PM");
    expect(hoursText("10:00", "15:00", "12h")).toBe("10:00 AM–3:00 PM");
    expect(hoursText("10:00", "15:00", "24h")).toBe("10:00–15:00");
  });

  it("reads a post's clock in its own zone, both ways", () => {
    expect(zonedWall("2026-11-01T16:00:00.000Z", "America/Los_Angeles")).toBe("2026-11-01T08:00");
    expect(zonedMoment("2026-11-01T09:00", "America/Los_Angeles")).toBe("2026-11-01T17:00:00.000Z");
    expect(zonedMoment("2026-11-01T", "America/Los_Angeles")).toBeNull();
    expect(momentText("2026-11-01T17:00:00.000Z", "America/Los_Angeles", "12h")).toBe("Sun, Nov 1, 9:00 AM");
  });

  it("offers the nth and the last weekday only when they exist", () => {
    // Thu, Nov 26, 2026: the 4th Thursday and the last one.
    expect(repeatOptions("2026-11-26").map((option) => option.label)).toEqual([
      "Never",
      "Every year on Nov 26",
      "Every year on the 4th Thursday of November",
      "Every year on the last Thursday of November",
    ]);
    // Tue, Dec 29: the 5th Tuesday, so only the last.
    expect(repeatOptions("2026-12-29").map((option) => option.value)).toEqual(["none", "date", "last"]);
    expect(repeatOptions(null).map((option) => option.value)).toEqual(["none"]);
  });

  it("finds next year's day for each repeat", () => {
    expect(nextYearDay("2026-11-26", "nth")).toBe("2027-11-25");
    expect(nextYearDay("2026-11-26", "date")).toBe("2027-11-26");
    expect(nextYearDay("2026-05-25", "last")).toBe("2027-05-31");
    expect(nextYearDay("2028-02-29", "date")).toBe("2029-02-28");
    expect(nextYearDay("2026-11-26", "none")).toBeNull();
  });
});

describe("the list", () => {
  it("keeps Archived out of All and files unpublished and failed posts under Draft and Scheduled", () => {
    const of = (display_status: AnnouncementRecord["display_status"]) => record({ id: display_status, display_status });
    expect(inListTab(of("archived"), "all")).toBe(false);
    expect(inListTab(of("unpublished"), "draft")).toBe(true);
    expect(inListTab(of("publish_failed"), "scheduled")).toBe(true);
    expect(inListTab(of("past"), "published")).toBe(true);
    expect(inListTab(of("past"), "draft")).toBe(false);
  });

  it("shows a scheduled post's planned moment and a draft's dash", () => {
    expect(
      publishedOn(record({ id: "s", display_status: "scheduled", publish_at: "2026-11-01T17:00:00Z" })),
    ).toEqual({ at: "2026-11-01T17:00:00Z", planned: true });
    expect(publishedOn(record({ id: "d" }))).toEqual({ at: null, planned: false });
  });

  it("sorts A to Z first, dates newest first, and keeps empty dates at the bottom both ways", () => {
    const rows = [
      record({ id: "a", title: "beta", display_status: "published", published_at: "2026-10-02T10:00:00Z" }),
      record({ id: "b", title: "Alpha", display_status: "draft" }),
      record({ id: "c", title: "gamma", display_status: "published", published_at: "2026-10-05T10:00:00Z" }),
    ];
    const titles = (key: "title" | "published_on" | "status", direction: 1 | -1) =>
      sortRecords(rows, { key, direction }).map((row) => row.id);
    expect(nextSort({ key: "published_on", direction: -1 }, "title")).toEqual({ key: "title", direction: 1 });
    expect(nextSort({ key: "title", direction: 1 }, "title")).toEqual({ key: "title", direction: -1 });
    expect(titles("title", 1)).toEqual(["b", "a", "c"]);
    expect(titles("title", -1)).toEqual(["c", "a", "b"]);
    expect(titles("published_on", -1)).toEqual(["c", "a", "b"]);
    expect(titles("published_on", 1)).toEqual(["a", "c", "b"]);
    expect(titles("status", 1)).toEqual(["b", "c", "a"]);
  });

  it("says what the day is at each location, and a Home line for the reader's own", () => {
    const thanksgiving = record({
      id: "t",
      title: "Thanksgiving",
      category: "holiday",
      starts_on: "2026-11-26",
      ends_on: "2026-11-26",
      locations: [at(downtown, "Downtown", "closed"), at(harbor, "Harbor", "short", "10:00", "15:00")],
    });
    expect(dayLine(thanksgiving, "12h")).toBe("Downtown closed · Harbor 10:00 AM–3:00 PM");
    expect(comingUp(thanksgiving, [downtown], "12h")).toEqual({
      line: "Downtown closed · Thu, Nov 26",
      sub: "Thanksgiving",
    });
    expect(comingUp(thanksgiving, [harbor], "12h").line).toBe("Harbor open 10:00 AM–3:00 PM · Thu, Nov 26");
    expect(comingUp(thanksgiving, [], "12h")).toEqual({ line: "Thanksgiving · Thu, Nov 26", sub: "Holiday" });
  });
});

describe("the drawer", () => {
  it("starts a post from Important Dates as a holiday on every list, at a lone location", () => {
    const draft = newDraft(
      {
        can_write_dates: true,
        locations: [
          { id: downtown, name: "Downtown", short_name: "Downtown", timezone: "America/Los_Angeles", can_change_hours: true, people_count: 4 },
        ],
      },
      true,
      "America/Los_Angeles",
    );
    expect(draft).toMatchObject({
      category: "holiday",
      on_important_dates: true,
      on_calendar: true,
      on_schedule: true,
      locations: [{ location_id: downtown, day: "open", opens: null, closes: null }],
    });
    expect(newDraft({ can_write_dates: false, locations: [] }, true, "UTC").on_important_dates).toBe(false);
  });

  it("opens a post that couldn't publish without its old moment, and trims what it sends", () => {
    const failed = { ...record({ id: "f", display_status: "publish_failed", publish_at: "2026-10-01T10:00:00Z" }) } as AnnouncementDetail;
    const draft = draftFromRecord(failed);
    expect(draft.publish_at).toBeNull();
    const sent = draftToSend({ ...draft, title: "  Patio  ", category: "general", category_other: "Repair" });
    expect(sent.title).toBe("Patio");
    expect(sent.category_other).toBeNull();
    expect(draftKey({ ...draft, title: "Post " })).toBe(draftKey(draft));
  });

  it("sends only the listed shifts' choices, with the preview's fingerprint", () => {
    const draft = draftFromRecord({ ...record({ id: "x" }) } as AnnouncementDetail);
    const listed = "22000000-0000-4000-8000-000000000001";
    const gone = "22000000-0000-4000-8000-000000000002";
    const choices = { [listed]: { choice: "remove" as const }, [gone]: { choice: "keep" as const } };
    expect(Object.keys(draftToSend({ ...draft, choices }).choices)).toEqual([listed, gone]);
    const preview = {
      problems: [],
      fingerprint: "abc",
      shifts: [{ source_id: listed }],
    } as unknown as Parameters<typeof draftToSend>[1];
    const sent = draftToSend({ ...draft, choices }, preview);
    expect(Object.keys(sent.choices)).toEqual([listed]);
    expect(sent.fingerprint).toBe("abc");
  });

  it("names the green button by status and Schedule for later", () => {
    expect(mainAction(null, false, null).label).toBe("Publish");
    expect(mainAction("draft", true, "2026-11-01T17:00:00Z")).toMatchObject({ intent: "schedule", label: "Schedule" });
    expect(mainAction("scheduled", true, "2026-11-01T17:00:00Z")).toMatchObject({ intent: "schedule", label: "Save changes" });
    expect(mainAction("scheduled", true, null)).toMatchObject({ intent: "draft", label: "Save as draft" });
    expect(mainAction("scheduled", false, null)).toMatchObject({ intent: "publish", label: "Publish" });
    expect(mainAction("publish_failed", false, null).label).toBe("Publish now");
    expect(mainAction("published", false, null)).toMatchObject({ intent: "save", label: "Save changes" });
  });

  it("walks Details, Locations, Audience, and Shifts only when hours change", () => {
    const open = { locations: [{ location_id: downtown, day: "open" as const, opens: null, closes: null }] };
    const closed = { locations: [{ location_id: downtown, day: "closed" as const, opens: null, closes: null }] };
    expect(nextStepAfter(true, open, "where")).toBe("aud");
    expect(nextStepAfter(true, open, "aud")).toBeNull();
    expect(nextStepAfter(true, closed, "aud")).toBe("shifts");
    expect(nextStepAfter(false, open, "details")).toBeNull();
    const titleMissing: AnnouncementProblem = { tab: "details", field: "title", code: "title_required", message: "Add a title.", required: true };
    expect(stepBefore(true, closed, [titleMissing], "shifts")).toBe("details");
    expect(stepBefore(true, closed, [titleMissing], "details")).toBeNull();
    expect(stepBefore(false, closed, [titleMissing], "shifts")).toBeNull();
  });

  it("shows an empty required field only after a try; a wrong value at once", () => {
    const empty: AnnouncementProblem = { tab: "details", field: "title", code: "title_required", message: "Add a title.", required: true };
    const wrong: AnnouncementProblem = { tab: "details", field: "ends_on", code: "ends_before_starts", message: "Ends can't be before Starts.", required: false };
    expect(shownProblems([empty, wrong], false, new Set())).toEqual([wrong]);
    expect(shownProblems([empty, wrong], "draft", new Set())).toEqual([empty, wrong]);
    expect(shownProblems([empty, wrong], false, new Set(["details"]))).toEqual([empty, wrong]);
  });

  it("explains why a shift is listed and fits it into the day's hours", () => {
    const shift = { reason: "over" as const, start_time: "08:00", end_time: "16:30", opens: "10:00", closes: "15:00" };
    expect(shiftReason(shift)).toBe("Starts 2 h before opening, runs 1.5 h past closing");
    expect(fitToHours(shift)).toEqual({ from: "10:00", until: "15:00" });
    expect(shiftReason({ ...shift, reason: "closed" })).toBe("Location closed");
    expect(shiftSummary({ removed: 3, edited: 1, opened: 2, kept: 0 })).toBe("3 shifts removed, 1 shortened, 2 open");
    expect(shiftSummary({ removed: 0, edited: 1, opened: 0, kept: 2 })).toBe("1 shift shortened, 2 kept");
  });

  it("writes History steps, with the failure's reason", () => {
    const entry = (action: NonNullable<AnnouncementDetail["history"]>[number]["action"], detail: Record<string, unknown> = {}) => ({
      id: "33000000-0000-4000-8000-000000000001",
      action,
      detail,
      changed_at: "2026-10-12T12:00:00Z",
      actor_user_id: null,
      actor_name: "Mia Chen",
    });
    expect(historyStep(entry("published", { told: 12, shift_changes: 3 }), "America/Los_Angeles", "12h")).toEqual({
      head: "Published by Mia Chen",
      more: "3 shift changes · 12 people told",
      bad: false,
    });
    expect(historyStep(entry("published", { auto: true, told: 1 }), "UTC", "12h").head).toBe("Published at the scheduled time");
    expect(
      historyStep(entry("scheduled", { publish_at: "2026-11-01T17:00:00Z" }), "America/Los_Angeles", "12h").head,
    ).toBe("Scheduled by Mia Chen for Sun, Nov 1, 9:00 AM");
    expect(historyStep(entry("publish_failed", { code: "too_late" }), "UTC", "12h")).toEqual({
      head: "Couldn't publish",
      more: "It started before it could go out.",
      bad: true,
    });
    expect(failureReason(null)).toBe("Something went wrong when it was due.");
  });
});
