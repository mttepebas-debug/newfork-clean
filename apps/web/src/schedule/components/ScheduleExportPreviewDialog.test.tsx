import type { ScheduleExportPreview } from "@newfork/shared/schedule";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  ScheduleExportPreviewDialog,
  formatScheduleExportPreviewTime,
} from "./ScheduleExportPreviewDialog";

function preview(
  overrides: Partial<ScheduleExportPreview> = {},
): ScheduleExportPreview {
  return {
    status: "export_ready",
    workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
    workspace_name: "North Store",
    week_start: "2026-08-17",
    source: { type: "published" },
    source_revision: 3,
    fingerprint:
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    locations: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Front",
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Kitchen",
      },
    ],
    rows: [
      {
        shift_id: "33333333-3333-4333-8333-333333333333",
        scheduled_date: "2026-08-17",
        location_name: "Front",
        employee_name: "Ada Lovelace",
        job_name: "Cashier",
        shift_type_name: null,
        label_names: [],
        start_time: "09:30",
        end_time: "17:00",
        crosses_midnight: false,
        note: "",
        scheduled_minutes: 450,
      },
      {
        shift_id: "44444444-4444-4444-8444-444444444444",
        scheduled_date: "2026-08-18",
        location_name: "Kitchen",
        employee_name: null,
        job_name: "Prep",
        shift_type_name: null,
        label_names: [],
        start_time: "13:00",
        end_time: "18:00",
        crosses_midnight: false,
        note: "",
        scheduled_minutes: 300,
      },
    ],
    summary: {
      shift_count: 2,
      employee_count: 1,
      scheduled_minutes: 750,
    },
    ...overrides,
  };
}

describe("ScheduleExportPreviewDialog", () => {
  it("renders summary, selected locations, and preview rows", () => {
    render(<ScheduleExportPreviewDialog preview={preview()} />);

    expect(screen.getByTestId("schedule-export-preview-summary")).toBeTruthy();
    expect(screen.getByText("2 shifts · 1 employees · 12.50 hours")).toBeTruthy();
    expect(screen.getByText("Front, Kitchen")).toBeTruthy();
    expect(screen.getByText("Ada Lovelace")).toBeTruthy();
    expect(screen.getByText("Open shift")).toBeTruthy();
    expect(screen.getByText("Cashier · 9:30a")).toBeTruthy();
  });

  it("limits visible rows to the first five shifts", () => {
    const baseRow: ScheduleExportPreview["rows"][number] = {
      shift_id: "33333333-3333-4333-8333-333333333333",
      scheduled_date: "2026-08-17",
      location_name: "Front",
      employee_name: "Ada Lovelace",
      job_name: "Cashier",
      shift_type_name: null,
      label_names: [],
      start_time: "09:30",
      end_time: "17:00",
      crosses_midnight: false,
      note: "",
      scheduled_minutes: 450,
    };
    const rows = Array.from({ length: 7 }, (_, index) => ({
      ...baseRow,
      shift_id: `33333333-3333-4333-8333-33333333333${index}`,
      employee_name: `Employee ${index + 1}`,
    }));

    render(<ScheduleExportPreviewDialog preview={preview({ rows })} />);

    expect(screen.getByText("Employee 5")).toBeTruthy();
    expect(screen.queryByText("Employee 6")).toBeNull();
  });

  it("formats midnight, noon, and minute precision for row times", () => {
    expect(formatScheduleExportPreviewTime("00:00")).toBe("12a");
    expect(formatScheduleExportPreviewTime("12:00")).toBe("12p");
    expect(formatScheduleExportPreviewTime("23:45")).toBe("11:45p");
  });
});
