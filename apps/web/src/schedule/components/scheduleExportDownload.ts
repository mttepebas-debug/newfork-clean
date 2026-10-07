import type { ScheduleExportRequest } from "@newfork/shared/schedule";

import { ScheduleRequestError } from "../schedule-data";
import { requestErrorText } from "../../lib/request-error";

export function formatScheduleExportLabel(
  format: ScheduleExportRequest["settings"]["format"],
): string {
  if (format === "csv") return "CSV";
  if (format === "xlsx") return "XLSX";
  return "PDF";
}

export function scheduleExportFilenameFallback(
  request: ScheduleExportRequest,
): string {
  const extension =
    request.settings.format === "csv"
      ? "csv"
      : request.settings.format === "xlsx"
        ? "xlsx"
        : request.settings.format === "print"
          ? "html"
          : "pdf";
  return `schedule-${request.week_start}.${extension}`;
}

export function scheduleExportErrorMessage(error: unknown): string {
  if (
    error instanceof ScheduleRequestError &&
    typeof error.body === "object" &&
    error.body !== null &&
    (error.body as { code?: string }).code === "pdf_render_unavailable"
  ) {
    return "PDF export is temporarily unavailable. Try again in a minute, or export CSV instead.";
  }

  return requestErrorText(error, "Export was not generated. Try again after refreshing the schedule.");
}
