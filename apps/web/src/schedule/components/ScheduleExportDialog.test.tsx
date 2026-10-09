import type {
  ScheduleDraftSummary,
  ScheduleExportPreset,
  ScheduleExportPreview,
  ScheduleExportSchedule,
  ScheduleLocation,
  ScheduleRecentExportEvent,
} from "@newfork/shared/schedule";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ScheduleExportDialog } from "./ScheduleExportDialog";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
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
  workspace_id: workspaceId,
  week_start: "2026-08-17",
  name: "Manager edits",
  revision: 2,
  created_by: "88888888-8888-4888-8888-888888888888",
  updated_by: "88888888-8888-4888-8888-888888888888",
  created_at: "2026-08-17T12:00:00.000Z",
  updated_at: "2026-08-17T12:00:00.000Z",
};

const preset: ScheduleExportPreset = {
  id: "44444444-4444-4444-8444-444444444444",
  workspace_id: workspaceId,
  name: "Print view",
  settings: {
    format: "print",
    layout: "daily",
    time_format: "24h",
    include_unassigned: true,
    include_notes: true,
    include_scheduled_hours: true,
    csv_delimiter: ",",
  },
  created_by: "88888888-8888-4888-8888-888888888888",
  updated_at: "2026-08-17T12:00:00.000Z",
};

const scheduledExport: ScheduleExportSchedule = {
  id: "55555555-5555-4555-8555-555555555555",
  workspace_id: workspaceId,
  preset_id: preset.id,
  preset_name: preset.name,
  name: "Monday managers",
  recipients: ["manager@example.com"],
  location_ids: [frontLocationId],
  day_of_week: 1,
  send_hour: 8,
  timezone: "America/Los_Angeles",
  enabled: true,
  last_sent_at: null,
  consecutive_failures: 0,
  last_error: null,
  auto_disabled_at: null,
  created_at: "2026-08-17T12:00:00.000Z",
  updated_at: "2026-08-17T12:00:00.000Z",
};

const recentEvent: ScheduleRecentExportEvent = {
  id: "event-1",
  workspace_id: workspaceId,
  surface: "schedule",
  format: "print",
  params: {
    week_start: "2026-08-17",
    layout: "weekly",
    location_ids: [frontLocationId],
  },
  actor_user_id: "88888888-8888-4888-8888-888888888888",
  created_at: "2026-08-17T12:00:00.000Z",
};

const preview: ScheduleExportPreview = {
  status: "export_ready",
  workspace_id: workspaceId,
  workspace_name: "North Store",
  week_start: "2026-08-17",
  source: { type: "published" },
  source_revision: 3,
  fingerprint: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  locations: [
    {
      id: frontLocationId,
      name: "Front",
    },
  ],
  rows: [
    {
      shift_id: "66666666-6666-4666-8666-666666666666",
      scheduled_date: "2026-08-17",
      location_name: "Front",
      employee_name: "Ada Lovelace",
      job_name: "Server",
      shift_type_name: "Dinner",
      label_names: ["Trainer"],
      start_time: "17:00",
      end_time: "22:00",
      crosses_midnight: false,
      note: "Patio",
      scheduled_minutes: 300,
    },
  ],
  summary: {
    shift_count: 1,
    employee_count: 1,
    scheduled_minutes: 300,
  },
};

function renderDialog(
  overrides: Partial<Parameters<typeof ScheduleExportDialog>[0]> = {},
) {
  const props: Parameters<typeof ScheduleExportDialog>[0] = {
    weekStart: "2026-08-17",
    locations,
    drafts: [draft],
    presets: [preset],
    scheduledExports: [scheduledExport],
    recentExportEvents: [recentEvent],
    showShiftType: true,
    showShiftLabels: true,
    showClockTimes: true,
    showRoleSeparators: true,
    showPresetShiftBadges: true,
    onClose: vi.fn(),
    onPreview: vi.fn().mockResolvedValue(preview),
    onPreviewHtml: vi.fn().mockResolvedValue("<h1>North Store schedule</h1>"),
    onDownload: vi.fn().mockResolvedValue(new Blob(["ok"], { type: "text/plain" })),
    onSavePreset: vi.fn().mockResolvedValue(undefined),
    onDeletePreset: vi.fn().mockResolvedValue(undefined),
    onCreateScheduledExport: vi.fn().mockResolvedValue(undefined),
    onToggleScheduledExport: vi.fn().mockResolvedValue(undefined),
    onDeleteScheduledExport: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };

  render(<ScheduleExportDialog {...props} />);
  return props;
}

describe("ScheduleExportDialog", () => {
  it("opens the larger export workspace from the schedule export dialog", () => {
    renderDialog();

    fireEvent.click(
      screen.getByRole("button", { name: "Open export workspace" }),
    );
    const workspace = screen.getByRole("dialog", { name: "Export workspace" });
    fireEvent.click(within(workspace).getByRole("button", { name: "CSV" }));

    expect(within(workspace).getByText("Scheduled emails")).toBeTruthy();
    expect(within(workspace).getByText("Recent exports")).toBeTruthy();
    expect(
      within(workspace).getByText("CSV is a data file - no print preview."),
    ).toBeTruthy();
  });

  it("previews printable exports from the workspace using the active settings", async () => {
    const props = renderDialog();

    fireEvent.click(
      screen.getByRole("button", { name: "Open export workspace" }),
    );
    const workspace = screen.getByRole("dialog", { name: "Export workspace" });
    fireEvent.click(
      within(workspace).getByRole("button", { name: "Preview export" }),
    );

    await waitFor(() =>
      expect(props.onPreviewHtml).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({ format: "pdf" }),
        }),
      ),
    );
    expect(
      await within(workspace).findByTitle("Schedule export preview"),
    ).toHaveProperty("srcdoc", "<h1>North Store schedule</h1>");
    expect(
      within(workspace).getByRole("button", { name: "Download PDF" }),
    ).toBeTruthy();
  });

  it("uses the schedule time format as the default export setting", async () => {
    const props = renderDialog({ defaultTimeFormat: "24h" });

    fireEvent.click(
      screen.getByRole("button", { name: "Open export workspace" }),
    );
    const workspace = screen.getByRole("dialog", { name: "Export workspace" });
    fireEvent.click(
      within(workspace).getByRole("button", { name: "Preview export" }),
    );

    await waitFor(() =>
      expect(props.onPreviewHtml).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({ time_format: "24h" }),
        }),
      ),
    );
  });

  it("previews XLSX exports as data files and exposes the XLSX download action", async () => {
    const props = renderDialog();

    fireEvent.click(
      screen.getByRole("button", { name: "Open export workspace" }),
    );
    const workspace = screen.getByRole("dialog", { name: "Export workspace" });
    fireEvent.click(within(workspace).getByRole("button", { name: "XLSX" }));
    fireEvent.click(
      within(workspace).getByRole("button", { name: "Preview export" }),
    );

    await waitFor(() =>
      expect(props.onPreview).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({ format: "xlsx" }),
        }),
      ),
    );
    expect(
      within(workspace).getByText("XLSX is a data file - no print preview."),
    ).toBeTruthy();
    expect(
      within(workspace).getByRole("button", { name: "Download XLSX" }),
    ).toBeTruthy();
  });
});
