import type {
  ScheduleDraftSummary,
  ScheduleExportPreset,
  ScheduleExportSettings,
  ScheduleLocation,
} from "@newfork/shared/schedule";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ScheduleExportPanel } from "./ScheduleExportPanel";

const frontLocationId = "11111111-1111-4111-8111-111111111111";
const kitchenLocationId = "22222222-2222-4222-8222-222222222222";

const locations: ScheduleLocation[] = [
  {
    id: frontLocationId,
    name: "Front",
    timezone: "America/Los_Angeles",
    sort_order: 0,
    publication_status: "published",
    published_at: "2026-08-17T12:00:00.000Z",
  },
  {
    id: kitchenLocationId,
    name: "Kitchen",
    timezone: "America/Los_Angeles",
    sort_order: 1,
    publication_status: "unpublished",
    published_at: null,
  },
];

const draft: ScheduleDraftSummary = {
  id: "33333333-3333-4333-8333-333333333333",
  workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
  week_start: "2026-08-17",
  name: "Manager edits",
  revision: 2,
  created_by: "88888888-8888-4888-8888-888888888888",
  updated_by: "88888888-8888-4888-8888-888888888888",
  created_at: "2026-08-17T12:00:00.000Z",
  updated_at: "2026-08-17T12:00:00.000Z",
};

const presetSettings: ScheduleExportSettings = {
  format: "xlsx",
  layout: "daily",
  locale: "en",
  time_format: "24h",
  include_unassigned: true,
  include_notes: true,
  include_scheduled_hours: true,
  csv_delimiter: ",",
};

const preset: ScheduleExportPreset = {
  id: "44444444-4444-4444-8444-444444444444",
  workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
  name: "Payroll XLSX",
  settings: presetSettings,
  created_by: "88888888-8888-4888-8888-888888888888",
  updated_at: "2026-08-17T12:00:00.000Z",
};

function renderPanel(overrides: Partial<Parameters<typeof ScheduleExportPanel>[0]> = {}) {
  const props: Parameters<typeof ScheduleExportPanel>[0] = {
    weekStart: "2026-08-17",
    weekLabel: "Aug 17 - Aug 23, 2026",
    locations,
    drafts: [draft],
    presets: [preset],
    scheduledExports: [],
    recentExportEvents: [],
    showShiftType: true,
    showShiftLabels: true,
    showClockTimes: true,
    showRoleSeparators: true,
    showPresetShiftBadges: true,
    onClose: vi.fn(),
    onPreview: vi.fn().mockResolvedValue({
      summary: {
        shift_count: 0,
        employee_count: 0,
        scheduled_minutes: 0,
      },
      locations: [],
      rows: [],
    }),
    onPreviewHtml: vi.fn().mockResolvedValue("<html></html>"),
    onDownload: vi.fn().mockResolvedValue(new Blob(["schedule"])),
    onSavePreset: vi.fn(),
    onDeletePreset: vi.fn(),
    onCreateScheduledExport: vi.fn(),
    onToggleScheduledExport: vi.fn(),
    onDeleteScheduledExport: vi.fn(),
    ...overrides,
  };
  render(<ScheduleExportPanel {...props} />);
  return props;
}

describe("ScheduleExportPanel", () => {
  it("renders the reference-style side panel and downloads the selected request", async () => {
    const createObjectUrl = vi.fn(() => "blob:export");
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl,
    });
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const onDownload = vi.fn().mockResolvedValue(new Blob(["schedule"]));

    renderPanel({ onDownload });

    expect(screen.getByTestId("schedule-export-panel")).toBeTruthy();
    expect(screen.getByText("Export schedule")).toBeTruthy();
    expect(screen.getByText("Aug 17 - Aug 23, 2026")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Preset"), {
      target: { value: preset.id },
    });
    fireEvent.click(screen.getByRole("button", { name: "Export XLSX" }));

    await waitFor(() =>
      expect(onDownload).toHaveBeenCalledWith(
        expect.objectContaining({
          week_start: "2026-08-17",
          source: { type: "published" },
          location_ids: [frontLocationId, kitchenLocationId],
          settings: expect.objectContaining({
            format: "xlsx",
            layout: "daily",
            show_shift_type: true,
            show_preset_shift_badges: true,
          }),
        }),
      ),
    );
    expect(createObjectUrl).toHaveBeenCalled();
    expect(anchorClick).toHaveBeenCalled();
    expect(revokeObjectUrl).not.toHaveBeenCalled();
  });

  it("opens the export workspace from the panel header", () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Open export workspace" }));

    expect(
      screen.getByRole("dialog", { name: "Export workspace" }),
    ).toBeTruthy();
  });

  it("previews printable exports inside the reference-style side panel", async () => {
    const onPreview = vi.fn();
    const onPreviewHtml = vi
      .fn()
      .mockResolvedValue("<html><body><h1>Printable schedule</h1></body></html>");

    renderPanel({ onPreview, onPreviewHtml });

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    await waitFor(() =>
      expect(onPreviewHtml).toHaveBeenCalledWith(
        expect.objectContaining({
          week_start: "2026-08-17",
          source: { type: "published" },
          settings: expect.objectContaining({
            format: "pdf",
            layout: "weekly",
          }),
        }),
      ),
    );
    expect(onPreview).not.toHaveBeenCalled();
    expect(
      screen.getByTitle("Schedule export preview").getAttribute("srcdoc"),
    ).toContain("Printable schedule");
  });

  it("blocks export when all locations are unchecked", () => {
    renderPanel();

    for (const checkbox of screen.getAllByRole("checkbox")) {
      fireEvent.click(checkbox);
    }

    expect(screen.getByText("Select at least one location.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export PDF" })).toHaveProperty(
      "disabled",
      true,
    );
  });
});
