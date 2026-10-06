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
import { HttpError } from "../http-error";

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
    expect(
      weekStartForTimezone(
        new Date("2026-08-17T06:30:00.000Z"),
        "America/Los_Angeles",
        "sunday",
      ),
    ).toBe("2026-08-16");
    expect(
      weekStartForTimezone(
        new Date("2026-03-08T10:30:00.000Z"),
        "America/Los_Angeles",
        "sunday",
      ),
    ).toBe("2026-03-08");
  });

  it("does not count an email that missed some recipients as sent (D-D4)", async () => {
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
      sent: 0,
      failed: 1,
      skipped: 0,
    });
    expect(sent).toEqual(["one@example.test", "two@example.test"]);
    expect(service.recordScheduledExportSuccess).not.toHaveBeenCalled();
    expect(service.recordScheduledExportFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleId: "8a000000-0000-4000-8000-000000000001",
        error: "Not delivered to 1 of 2 recipients: bounce",
      }),
    );
  });

  it("renders the current published schedule and records success when every recipient gets it", async () => {
    const service = scheduleServiceMock([
      scheduleCandidate({ recipients: ["one@example.test", "two@example.test"] }),
    ]);
    const result = await runScheduledExportsCron({
      service,
      now: new Date("2026-08-17T15:00:00.000Z"),
      delivery: { send: vi.fn(async () => undefined) },
    });

    expect(result).toEqual({ checked: 1, due: 1, sent: 1, failed: 0, skipped: 0 });
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
          delivered: 2,
        }),
      }),
    );
  });

  it("renders PDF and XLSX attachments with their own content types", async () => {
    const attachments: {
      readonly filename: string;
      readonly content: Buffer;
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
    expect(attachments[0]!.content.subarray(0, 8).toString("utf8")).toBe(
      "%PDF-1.4",
    );
    expect(attachments[1]?.contentType).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(attachments[1]!.content.subarray(0, 2).toString("utf8")).toBe(
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

  // BL-356 (2): a cron retried inside the same hour must not mail the same
  // week's schedule to the same person twice; Resend drops a repeated key.
  it("sends each recipient one message per schedule and week", async () => {
    const send = vi.fn(async () => undefined);
    await runScheduledExportsCron({
      service: scheduleServiceMock([scheduleCandidate({ recipients: ["one@example.test", "two@example.test"] })]),
      now: new Date("2026-08-17T15:00:00.000Z"),
      delivery: { send },
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "one@example.test", idempotencyKey: "8a000000-0000-4000-8000-000000000001:2026-08-17:one@example.test" }),
    );
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "two@example.test", idempotencyKey: "8a000000-0000-4000-8000-000000000001:2026-08-17:two@example.test" }),
    );
  });

  // BL-356 (1): one slow send must not hold every other workspace's export
  // back until the cron's time runs out.
  it("works on more than one schedule at a time", async () => {
    let inFlight = 0;
    let most = 0;
    const send = vi.fn(async () => {
      inFlight += 1;
      most = Math.max(most, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 20));
      inFlight -= 1;
    });
    const result = await runScheduledExportsCron({
      service: scheduleServiceMock([
        scheduleCandidate({ id: "8a000000-0000-4000-8000-000000000011" }),
        scheduleCandidate({ id: "8a000000-0000-4000-8000-000000000012" }),
        scheduleCandidate({ id: "8a000000-0000-4000-8000-000000000013" }),
      ]),
      now: new Date("2026-08-17T15:00:00.000Z"),
      delivery: { send },
    });

    expect(result).toMatchObject({ checked: 3, sent: 3, failed: 0 });
    expect(most).toBeGreaterThan(1);
  });

  it("keeps going past an export whose time zone is not a real one (BL-272)", async () => {
    const service = scheduleServiceMock([
      scheduleCandidate({
        id: "8a000000-0000-4000-8000-000000000009",
        timezone: "Mars/Olympus_Mons",
      }),
      scheduleCandidate(),
    ]);
    const delivery = { send: vi.fn(async () => undefined) };

    const result = await runScheduledExportsCron({
      service,
      now: new Date("2026-08-17T15:00:00.000Z"),
      delivery,
    });

    expect(result).toMatchObject({ checked: 2, sent: 1, failed: 1 });
    expect(delivery.send).toHaveBeenCalledTimes(1);
    expect(service.recordScheduledExportFailure).toHaveBeenCalledWith({
      workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
      scheduleId: "8a000000-0000-4000-8000-000000000009",
      error: 'The time zone "Mars/Olympus_Mons" is not a real time zone.',
      autoDisableAfter: 1,
    });
  });

  it("keeps going when recording one export's failure fails too (BL-272)", async () => {
    const service = scheduleServiceMock([
      scheduleCandidate({ id: "8a000000-0000-4000-8000-000000000009" }),
      scheduleCandidate(),
    ]);
    service.previewExport.mockRejectedValueOnce(new Error("render failed"));
    service.recordScheduledExportFailure.mockRejectedValueOnce(
      new Error("database unavailable"),
    );

    const result = await runScheduledExportsCron({
      service,
      now: new Date("2026-08-17T15:00:00.000Z"),
      delivery: { send: vi.fn(async () => undefined) },
    });

    expect(result).toMatchObject({ checked: 2, sent: 1, failed: 1 });
  });

  it("records exports the database handed back in a shape the cron cannot read (BL-272)", async () => {
    const service = scheduleServiceMock([scheduleCandidate()], [
      {
        id: "8a000000-0000-4000-8000-000000000009",
        workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
      },
    ]);

    const result = await runScheduledExportsCron({
      service,
      now: new Date("2026-08-17T15:00:00.000Z"),
      delivery: { send: vi.fn(async () => undefined) },
    });

    expect(result).toMatchObject({ checked: 2, sent: 1, failed: 1 });
    expect(service.recordScheduledExportFailure).toHaveBeenCalledWith({
      workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
      scheduleId: "8a000000-0000-4000-8000-000000000009",
      error: "This scheduled export's saved settings can no longer be read. Edit and save it again.",
      autoDisableAfter: 1,
    });
  });

  it("stops an export whose every location was deleted and says why (BL-225, Q-C)", async () => {
    const service = scheduleServiceMock([scheduleCandidate({ location_ids: [] })]);
    const delivery = { send: vi.fn() };

    const result = await runScheduledExportsCron({
      service,
      now: new Date("2026-08-17T15:00:00.000Z"),
      delivery,
    });

    expect(result).toMatchObject({ due: 1, sent: 0, failed: 1 });
    expect(service.previewExport).not.toHaveBeenCalled();
    expect(delivery.send).not.toHaveBeenCalled();
    expect(service.recordScheduledExportFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Every location in this export was deleted.",
        autoDisableAfter: 1,
      }),
    );
  });

  it("stops an export at once when its creator may no longer export those locations (BL-101)", async () => {
    const service = scheduleServiceMock([scheduleCandidate()]);
    service.previewExport.mockRejectedValueOnce(
      new HttpError("Access denied", 403, {
        pgCode: "42501",
        reason: "authz.out_of_scope",
      }),
    );

    const result = await runScheduledExportsCron({
      service,
      now: new Date("2026-08-17T15:00:00.000Z"),
      delivery: { send: vi.fn() },
    });

    expect(result).toMatchObject({ due: 1, failed: 1 });
    expect(service.recordScheduledExportFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        error:
          "The person who set up this export can no longer export these locations.",
        autoDisableAfter: 1,
      }),
    );
  });

  it("never sends shift notes, even when the preset includes them (BL-330)", async () => {
    const service = scheduleServiceMock([
      scheduleCandidate({ settings: { ...settings, include_notes: true } }),
    ]);
    service.previewExport.mockResolvedValueOnce({
      ...preview,
      rows: [{ ...preview.rows[0]!, note: "Deniz: doctor at 9" }],
    });
    const attachments: Buffer[] = [];

    await runScheduledExportsCron({
      service,
      now: new Date("2026-08-17T15:00:00.000Z"),
      delivery: {
        send: vi.fn(async (message) => {
          attachments.push(message.attachment.content);
        }),
      },
    });

    expect(attachments).toHaveLength(1);
    expect(attachments[0]!.toString("utf8")).toContain("Avery Stone");
    expect(attachments[0]!.toString("utf8")).not.toContain("doctor at 9");
    expect(service.recordScheduledExportSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ include_notes: false }),
      }),
    );
  });
});

function scheduleServiceMock(
  candidates: ScheduledExportCronCandidate[],
  unreadable: { id: string; workspace_id: string }[] = [],
) {
  return {
    listScheduledExportCronCandidates: vi.fn(async () => ({
      schedules: candidates,
      unreadable,
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
    week_start_day: "monday",
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
