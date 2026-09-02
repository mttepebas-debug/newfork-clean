import type { ScheduleExportRequest } from "@newfork/shared/schedule";
import { describe, expect, it } from "vitest";

import { ScheduleRequestError } from "../schedule-data";
import {
  formatScheduleExportLabel,
  scheduleExportErrorMessage,
  scheduleExportFilenameFallback,
} from "./scheduleExportDownload";

const request: ScheduleExportRequest = {
  week_start: "2026-08-17",
  source: { type: "published" },
  location_ids: ["loc-1"],
  settings: {
    format: "csv",
    layout: "weekly",
    time_format: "12h",
    include_unassigned: true,
    include_notes: false,
    include_scheduled_hours: true,
    csv_delimiter: ",",
  },
};

describe("scheduleExportDownload", () => {
  it("maps pdf_render_unavailable to the reference-style PDF message", () => {
    const error = new ScheduleRequestError(
      "worker down",
      503,
      { code: "pdf_render_unavailable", message: "worker down" },
    );

    expect(scheduleExportErrorMessage(error)).toContain(
      "PDF export is temporarily unavailable",
    );
  });

  it("keeps explicit error messages for other failures", () => {
    expect(scheduleExportErrorMessage(new Error("network failed"))).toBe(
      "network failed",
    );
  });

  it("uses stable fallback filenames and labels", () => {
    expect(scheduleExportFilenameFallback(request)).toBe("schedule-2026-08-17.csv");
    expect(formatScheduleExportLabel("csv")).toBe("CSV");
    expect(formatScheduleExportLabel("print")).toBe("PDF");
    expect(formatScheduleExportLabel("pdf")).toBe("PDF");
    expect(formatScheduleExportLabel("xlsx")).toBe("XLSX");
    expect(
      scheduleExportFilenameFallback({
        ...request,
        settings: { ...request.settings, format: "pdf" },
      }),
    ).toBe("schedule-2026-08-17.pdf");
    expect(
      scheduleExportFilenameFallback({
        ...request,
        settings: { ...request.settings, format: "print" },
      }),
    ).toBe("schedule-2026-08-17.html");
    expect(
      scheduleExportFilenameFallback({
        ...request,
        settings: { ...request.settings, format: "xlsx" },
      }),
    ).toBe("schedule-2026-08-17.xlsx");
  });
});
