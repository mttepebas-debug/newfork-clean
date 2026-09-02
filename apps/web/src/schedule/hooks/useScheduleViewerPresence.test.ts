import { describe, expect, it } from "vitest";
import { normalizeSchedulePresence } from "./useScheduleViewerPresence";

describe("normalizeSchedulePresence", () => {
  it("normalizes valid schedule presence metadata", () => {
    expect(
      normalizeSchedulePresence({
        user_id: "user-1",
        mode: "edit",
        online_at: "2026-05-01T00:00:00Z",
      }),
    ).toEqual({
      userId: "user-1",
      mode: "edit",
      onlineAt: "2026-05-01T00:00:00Z",
    });
  });

  it("drops presence metadata without a user id", () => {
    expect(normalizeSchedulePresence({ mode: "edit" })).toBeNull();
  });

  it("falls back to preview mode and a stable timestamp", () => {
    expect(normalizeSchedulePresence({ user_id: "user-1" })).toEqual({
      userId: "user-1",
      mode: "preview",
      onlineAt: "1970-01-01T00:00:00.000Z",
    });
  });
});
