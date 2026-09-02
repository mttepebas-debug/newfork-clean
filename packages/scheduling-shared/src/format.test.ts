import { describe, expect, it } from "vitest";

import { formatWarning } from "./format.js";

describe("formatWarning", () => {
  describe("time_overlap", () => {
    it("compact returns generic label", () => {
      expect(
        formatWarning(
          {
            type: "time_overlap",
            conflicting_shifts: [
              {
                id: "x",
                start_time: "06:00",
                end_time: "10:00",
                shift_type_label: "Morning",
                location_name: "Main",
              },
            ],
          },
          { detail: false },
        ),
      ).toBe("Time overlap");
    });

    it("detail single shift with shift_type_label", () => {
      expect(
        formatWarning(
          {
            type: "time_overlap",
            conflicting_shifts: [
              {
                id: "x",
                start_time: "06:00",
                end_time: "10:00",
                shift_type_label: "Morning",
                location_name: "Main",
              },
            ],
          },
          { detail: true },
        ),
      ).toBe("Already scheduled 06:00–10:00 — Morning, Main");
    });

    it("detail single shift without shift_type_label uses location only", () => {
      expect(
        formatWarning(
          {
            type: "time_overlap",
            conflicting_shifts: [
              {
                id: "x",
                start_time: "11:00",
                end_time: "15:00",
                shift_type_label: null,
                location_name: "Patio",
              },
            ],
          },
          { detail: true },
        ),
      ).toBe("Already scheduled 11:00–15:00 — Patio");
    });

    it("detail multiple shifts joined with semicolons", () => {
      const out = formatWarning(
        {
          type: "time_overlap",
          conflicting_shifts: [
            {
              id: "x",
              start_time: "06:00",
              end_time: "10:00",
              shift_type_label: "Morning",
              location_name: "Main",
            },
            {
              id: "y",
              start_time: "11:00",
              end_time: "15:00",
              shift_type_label: null,
              location_name: "Patio",
            },
          ],
        },
        { detail: true },
      );
      expect(out).toContain("06:00–10:00");
      expect(out).toContain("11:00–15:00");
      expect(out).toContain("; ");
    });
  });

  describe("named_shift_duplicate", () => {
    it("formats duplicate named shift conflicts", () => {
      expect(
        formatWarning(
          {
            type: "named_shift_duplicate",
            conflicting_shifts: [{ id: "s1", shift_type_label: "Lunch", location_name: "Main" }],
          },
          { detail: true },
        ),
      ).toBe("Already assigned to Lunch — Main");
    });
  });

  describe("availability", () => {
    it("compact returns generic label", () => {
      expect(
        formatWarning(
          { type: "availability", rule_kind: "all_day", day_of_week: 1 },
          { detail: false },
        ),
      ).toBe("Unavailable");
    });

    it("detail all_day uses day name", () => {
      expect(
        formatWarning(
          { type: "availability", rule_kind: "all_day", day_of_week: 1 },
          { detail: true },
        ),
      ).toBe("Unavailable Monday all day");
    });

    it("detail bucket uses bucket name plural", () => {
      expect(
        formatWarning(
          {
            type: "availability",
            rule_kind: "bucket",
            day_of_week: 3,
            bucket: "morning",
          },
          { detail: true },
        ),
      ).toBe("Unavailable Wednesday mornings");
    });

    it("detail shift_type uses label", () => {
      expect(
        formatWarning(
          {
            type: "availability",
            rule_kind: "shift_type",
            day_of_week: 5,
            shift_type_label: "Bar",
          },
          { detail: true },
        ),
      ).toBe("Unavailable for Bar on Friday");
    });

    it("detail shift_type without label falls back", () => {
      expect(
        formatWarning(
          { type: "availability", rule_kind: "shift_type", day_of_week: 5 },
          { detail: true },
        ),
      ).toBe("Unavailable for this shift type on Friday");
    });
  });

  describe("closed_day", () => {
    it("compact returns generic label", () => {
      expect(formatWarning({ type: "closed_day", scope: "all_day" }, { detail: false })).toBe(
        "Location closed",
      );
    });

    it("detail all_day without reason", () => {
      expect(formatWarning({ type: "closed_day", scope: "all_day" }, { detail: true })).toBe(
        "Location closed all day",
      );
    });

    it("detail all_day with reason", () => {
      expect(
        formatWarning(
          { type: "closed_day", scope: "all_day", reason: "Holiday" },
          { detail: true },
        ),
      ).toBe("Location closed — Holiday");
    });

    it("detail shift_type with label", () => {
      expect(
        formatWarning(
          { type: "closed_day", scope: "shift_type", shift_type_label: "Brunch" },
          { detail: true },
        ),
      ).toBe("Location closed for Brunch");
    });

    it("detail shift_type without label falls back", () => {
      expect(formatWarning({ type: "closed_day", scope: "shift_type" }, { detail: true })).toBe(
        "Location closed for this shift type",
      );
    });
  });

  describe("availability_limited", () => {
    it("formats availability_limited detail", () => {
      const text = formatWarning(
        {
          type: "availability_limited",
          rule_kind: "all_day",
          day_of_week: 2,
          severity: "soft",
          overrideable: true,
          requires_override_note: true,
          source: "weekly_availability",
        },
        { detail: true },
      );
      expect(text).toBe("Limited availability Tuesday all day");
    });
  });

});
