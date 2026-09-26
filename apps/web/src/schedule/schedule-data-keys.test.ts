import { describe, expect, it } from "vitest";

import type { ScheduleExportRequest } from "@newfork/shared/schedule";

import {
  scheduleEditLockKey,
  scheduleExportPreviewHtmlKey,
  schedulePublicationStatusKey,
  scheduleReferenceKey,
  scheduleShiftsKey,
} from "./schedule-data";

describe("schedule reference query key aliases", () => {
  it("keeps the imported reference schedule cache keys available", () => {
    expect(scheduleReferenceKey("workspace", "2026-08-17")).toEqual([
      "schedule-reference",
      "workspace",
      "2026-08-17",
    ]);
    expect(
      scheduleShiftsKey(
        "workspace",
        "2026-08-17",
        "draft-1",
        ["loc-1", "loc-2"],
        true,
      ),
    ).toEqual([
      "schedule-shifts",
      "workspace",
      "2026-08-17",
      "draft-1",
      "include-live",
      "loc-1",
      "loc-2",
    ]);
    expect(scheduleEditLockKey("workspace", "2026-08-17", "draft-1")).toEqual([
      "schedule-edit-lock",
      "workspace",
      "2026-08-17",
      "draft-1",
    ]);
    expect(schedulePublicationStatusKey("workspace", "2026-08-17")).toEqual([
      "schedule-publication-status",
      "workspace",
      "2026-08-17",
    ]);
  });

  it("keeps the imported export preview HTML cache key available", () => {
    const request: ScheduleExportRequest = {
      week_start: "2026-08-17",
      source: { type: "published" },
      location_ids: ["loc-1"],
      settings: {
        format: "pdf",
        layout: "weekly",
        time_format: "12h",
        include_unassigned: true,
        include_notes: false,
        include_scheduled_hours: true,
        csv_delimiter: ",",
      },
    };

    expect(scheduleExportPreviewHtmlKey("workspace", request)).toEqual([
      "schedule-export-preview-html",
      "workspace",
      request,
    ]);
  });
});
