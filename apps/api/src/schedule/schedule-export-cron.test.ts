import { describe, expect, it, vi } from "vitest";
import type {
  ScheduleExportPreview,
  ScheduleExportSettings,
} from "@newfork/shared/schedule";
import {
  isScheduledExportDue,
  runScheduledExportsCron,
  weekStartForTimezone,
} from "./schedule-export-cron";
import type {
  ScheduleReadService,
  ScheduledExportCronCandidate,
} from "./schedule-service";

const settings: ScheduleExportSettings = {
  format: "csv",
  layout: "weekly",
  time_format: "12h",
  include_unassigned: true,
  include_notes: false,
  include_scheduled_hours: true,
  csv_delimiter: ",",
};

describe("scheduled schedule export cron", () => {
  it("matches the scheduled local weekday and hour with a 20 hour send guard", () => {
    const now = new Date("2026-08-17T15:05:00.000Z");
    expect(
      isScheduledExportDue(
        {
          day_of_week: 1,
          send_hour: 8,
          timezone: "America/Los_Angeles",
          last_sent_at: null,
        },
        now,
      ),
    ).toBe(true);
    expect(
      isScheduledExportDue(
        {
          day_of_week: 1,
          send_hour: 8,
          timezone: "America/Los_Angeles",
          last_sent_at: "2026-08-17T02:00:00.000Z",
        },
        now,
      ),
    ).toBe(false);
  });

  it("uses the schedule week start from the row timezone", () => {
    expect(
      weekStartForTimezone(
        new Date("2026-08-20T18:00:00.000Z"),
        "America/Los_Angeles",
      ),
    ).toBe("2026-08-17");
  });

  it("renders the current published schedule and records success when any recipient succeeds", async () => {
    const sent: string[] = [];
    const service = scheduleServiceMock([
      scheduleCandidate({
        recipients: ["one@example.test", "two@example.test"],
      }),
    ]);
    const result = await runScheduledExportsCron({
      service,
      now: new Date("2026-08-17T15:00:00.000Z"),
      delivery: {
        send: vi.fn(async (message) => {
          sent.push(message.to);
          if (message.to === "two@example.test") throw new Error("bounce");
        }),
      },
    });

    expect(result).toEqual({
      checked: 1,
      due: 1,
      sent: 1,
      failed: 0,
      skipped: 0,
    });
    expect(sent).toEqual(["one@example.test", "two@example.test"]);
    expect(service.previewExport).toHaveBeenCalledWith(
      expect.objectContaining({
        weekStart: "2026-08-17",
        sourceType: "published",
        locationIds: ["11000000-0000-4000-8000-000000000001"],
      }),
    );
    expect(service.recordScheduledExportSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleId: "8a000000-0000-4000-8000-000000000001",
        format: "csv",
        params: expect.objectContaining({
          week_start: "2026-08-17",
          delivered: 1,
        }),
      }),
    );
  });

  it("renders PDF and XLSX attachments with their own content types", async () => {
    const attachments: {
      readonly filename: string;
      readonly content: string;
      readonly contentType: string;
    }[] = [];
    const service = scheduleServiceMock([
      scheduleCandidate({
        id: "8a000000-0000-4000-8000-000000000002",
        settings: { ...settings, format: "pdf" },
      }),
      scheduleCandidate({
        id: "8a000000-0000-4000-8000-000000000003",
        settings: { ...settings, format: "xlsx" },
      }),
    ]);

    await runScheduledExportsCron({
      service,
      now: new Date("2026-08-17T15:00:00.000Z"),
      delivery: {
        send: vi.fn(async (message) => {
          attachments.push(message.attachment);
        }),
      },
    });

    expect(attachments.map((attachment) => attachment.filename)).toEqual([
      "schedule-2026-08-17.pdf",
      "schedule-2026-08-17.xlsx",
    ]);
    expect(attachments[0]?.contentType).toBe("application/pdf");
    expect(Buffer.from(attachments[0]!.content, "base64").subarray(0, 8).toString("utf8")).toBe(
      "%PDF-1.4",
    );
    expect(attachments[1]?.contentType).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(Buffer.from(attachments[1]!.content, "base64").subarray(0, 2).toString("utf8")).toBe(
      "PK",
    );
  });

  it("records failure when rendering or delivery fully fails", async () => {
    const service = scheduleServiceMock([scheduleCandidate()]);
    service.previewExport.mockRejectedValueOnce(new Error("render failed"));

    const result = await runScheduledExportsCron({
      service,
      now: new Date("2026-08-17T15:00:00.000Z"),
      delivery: { send: vi.fn() },
    });

    expect(result.failed).toBe(1);
    expect(service.recordScheduledExportFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleId: "8a000000-0000-4000-8000-000000000001",
        error: "render failed",
        autoDisableAfter: 3,
      }),
    );
  });
});

function scheduleServiceMock(candidates: ScheduledExportCronCandidate[]) {
  return {
    listScheduledExportCronCandidates: vi.fn(async () => ({
      schedules: candidates,
    })),
    previewExport: vi.fn(async () => preview),
    recordScheduledExportSuccess: vi.fn(async () => schedule),
    recordScheduledExportFailure: vi.fn(async () => schedule),
  } as unknown as ScheduleReadService & {
    listScheduledExportCronCandidates: ReturnType<typeof vi.fn>;
    previewExport: ReturnType<typeof vi.fn>;
    recordScheduledExportSuccess: ReturnType<typeof vi.fn>;
    recordScheduledExportFailure: ReturnType<typeof vi.fn>;
  };
}

function scheduleCandidate(
  overrides: Partial<ScheduledExportCronCandidate> = {},
): ScheduledExportCronCandidate {
  return {
    id: "8a000000-0000-4000-8000-000000000001",
    workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
    workspace_name: "Meyhouse",
    created_by: "00000000-0000-4000-8000-000000000001",
    preset_id: "89000000-0000-4000-8000-000000000001",
    preset_name: "Payroll export",
    settings,
    name: "Monday managers",
    recipients: ["manager@example.test"],
    location_ids: ["11000000-0000-4000-8000-000000000001"],
    day_of_week: 1,
    send_hour: 8,
    timezone: "America/Los_Angeles",
    last_sent_at: null,
    consecutive_failures: 0,
    ...overrides,
  };
}

const preview: ScheduleExportPreview = {
  status: "export_ready",
  workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
  workspace_name: "Meyhouse",
  week_start: "2026-08-17",
  source: { type: "published" },
  source_revision: 1,
  fingerprint: "a".repeat(64),
  locations: [
    { id: "11000000-0000-4000-8000-000000000001", name: "Main" },
  ],
  rows: [
    {
      shift_id: "82000000-0000-4000-8000-000000000001",
      scheduled_date: "2026-08-17",
      location_name: "Main",
      employee_name: "Avery Stone",
      job_name: "Server",
      shift_type_name: "Dinner",
      label_names: ["Trainer"],
      start_time: "17:00",
      end_time: "21:00",
      crosses_midnight: false,
      scheduled_minutes: 240,
      note: "",
    },
  ],
  summary: {
    shift_count: 1,
    employee_count: 1,
    scheduled_minutes: 240,
  },
};

const schedule = {
  id: "8a000000-0000-4000-8000-000000000001",
  workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
  preset_id: "89000000-0000-4000-8000-000000000001",
  preset_name: "Payroll export",
  name: "Monday managers",
  recipients: ["manager@example.test"],
  location_ids: ["11000000-0000-4000-8000-000000000001"],
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
