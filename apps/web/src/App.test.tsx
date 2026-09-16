import {
  act,
  configure,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ScheduleReadModel } from "@newfork/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, appQueryClient } from "./App";
import { renderExportFiles, downloadExportFile } from "./schedule/export-v2/files";
import {
  acquireScheduleEditSession,
  authorizeScheduleExportV2,
  applyScheduleAutoFill,
  createScheduleExportSchedule,
  createScheduleShift,
  deleteScheduleExportSchedule,
  deleteScheduleShift,
  discardScheduleEditSession,
  fetchPendingOps,
  fetchScheduleDraftShifts,
  fetchSchedulePublicationStatus,
  getScheduleReadModel,
  updateScheduleShift,
  listScheduleDrafts,
  listScheduleExportPresets,
  listScheduleExportSchedules,
  listScheduleRecentExports,
  listScheduleTemplates,
  previewScheduleAutoFill,
  previewScheduleExport,
  previewScheduleExportHtml,
  previewSchedulePublication,
  previewScheduleUnpublish,
  publishScheduleDraft,
  restoreScheduleShift,
  ScheduleRequestError,
  saveScheduleDraft,
  takeoverScheduleEditSession,
  updateScheduleExportSchedule,
  unpublishSchedule,
} from "./schedule/schedule-data";

vi.mock("./schedule/export-v2/files", async importOriginal => ({
  ...await importOriginal<typeof import("./schedule/export-v2/files")>(),
  renderExportFiles: vi.fn(), downloadExportFile: vi.fn(),
}));
configure({ asyncUtilTimeout: 5000 });

const exportSaveIdleHarness = vi.hoisted(() => ({ expire: undefined as (() => void) | undefined }));
vi.mock("./schedule/hooks/useEditIdleTimer", async importOriginal => {
  const original = await importOriginal<typeof import("./schedule/hooks/useEditIdleTimer")>();
  return { ...original, useEditIdleTimer: (args: import("./schedule/hooks/useEditIdleTimer").UseEditIdleTimerArgs) => {
    if (args.enabled) exportSaveIdleHarness.expire = args.onTimeout;
    return original.useEditIdleTimer(args);
  } };
});

const scheduleFixture = vi.hoisted(() => ({
  workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
  week_start: "2026-08-17",
  week_start_day: "monday",
  settings: {
    time_format: "12h",
  },
  locations: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Main Dining",
      short_name: "MAIN",
      timezone: "America/Los_Angeles",
      sort_order: 0,
      publication_status: "published",
      published_at: "2026-08-17T12:00:00Z",
    },
  ],
  departments: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Front of house",
      color: "#2563EB",
      sort_order: 0,
    },
  ],
  jobs: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      department_id: "22222222-2222-4222-8222-222222222222",
      name: "Server",
      color: "#2563EB",
      sort_order: 0,
    },
  ],
  shift_types: [
    {
      id: "44444444-4444-4444-8444-444444444444",
      name: "Dinner",
      color: "#7C3AED",
      sort_order: 0,
      default_start_time: "16:00",
      default_end_time: "22:00",
    },
  ],
  shift_labels: [],
  employees: [
    {
      id: "55555555-5555-4555-8555-555555555555",
      employee_code: "NF-001",
      display_name: "Alex Rivera",
      location_ids: ["11111111-1111-4111-8111-111111111111"],
      job_ids: ["33333333-3333-4333-8333-333333333333"],
      primary_job_id: "33333333-3333-4333-8333-333333333333",
      availability: null,
    },
  ],
  shifts: [
    {
      id: "66666666-6666-4666-8666-666666666666",
      location_id: "11111111-1111-4111-8111-111111111111",
      employee_id: "55555555-5555-4555-8555-555555555555",
      job_id: "33333333-3333-4333-8333-333333333333",
      shift_type_id: "44444444-4444-4444-8444-444444444444",
      scheduled_date: "2026-08-17",
      start_time: "16:00",
      end_time: "22:30",
      crosses_midnight: false,
      unpaid_break_minutes: 0,
      hide_time_on_badge: false,
      label_ids: [],
      label_names: [],
      note: "",
      warning_codes: [],
    },
  ],
  closures: [],
  important_dates: [],
})) as ScheduleReadModel;

beforeEach(() => {
  // jsdom does not implement the native dialog top-layer methods.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-08-17T12:00:00Z"));
  appQueryClient.clear();
  window.history.pushState({}, "", "/");
  window.localStorage.clear();
  resetScheduleApiMocks();
  vi.mocked(authorizeScheduleExportV2).mockReset().mockResolvedValue(undefined);
  vi.mocked(renderExportFiles).mockReset().mockResolvedValue([{ name: "schedule.pdf", blob: new Blob(["pdf"]) }]);
  vi.mocked(downloadExportFile).mockReset();
  exportSaveIdleHarness.expire = undefined;
  URL.createObjectURL = vi.fn(() => "blob:test-export");
  URL.revokeObjectURL = vi.fn();
});

afterEach(async () => {
  cleanup();
  await appQueryClient.cancelQueries();
  appQueryClient.clear();
  vi.useRealTimers();
});

function scheduleFixtureForWeek(weekStart: string): ScheduleReadModel {
  return {
    ...scheduleFixture,
    week_start: weekStart,
    shifts: scheduleFixture.shifts.map((shift) => ({
      ...shift,
      scheduled_date: weekStart,
    })),
  };
}

async function openPublishedScheduleEditor(
  app: Pick<typeof screen, "findByRole" | "getByRole"> = screen,
) {
  const draftSelectorButton = await app.findByRole(
    "button",
    { name: "Draft selector: New Schedule" },
    { timeout: 5000 },
  );
  await act(async () => {
    fireEvent.click(draftSelectorButton);
    await Promise.resolve();
  });
  const editLiveButton = await app.findByRole(
    "button",
    { name: "Edit live schedule" },
    { timeout: 5000 },
  );
  await act(async () => {
    fireEvent.click(editLiveButton);
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

async function clickReadyButton(
  app: Pick<typeof screen, "findByRole">,
  name: string | RegExp,
) {
  const button = await app.findByRole("button", { name }, { timeout: 5000 });
  await waitFor(() => expect(button).toHaveProperty("disabled", false));
  fireEvent.click(button);
  return button;
}

function makeDefaultEditAcquireResult() {
  return {
    status: "acquired" as const,
    session: {
      id: "77777777-7777-4777-8777-777777777777",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      source_kind: "published" as const,
      source_draft_id: null,
      source_revision: 1,
      holder_user_id: "88888888-8888-4888-8888-888888888888",
      holder_name: "Development Owner",
      revision: 1,
      dirty: false,
      last_heartbeat: "2026-08-17T12:00:00Z",
      expires_at: "2026-08-17T12:04:00Z",
      shifts: scheduleFixture.shifts.map((shift) => ({
        ...shift,
        unpaid_break_minutes: 30 as const,
        revision: 1,
      })),
    },
  };
}

function resetScheduleApiMocks() {
  vi.mocked(getScheduleReadModel).mockReset();
  vi.mocked(getScheduleReadModel).mockResolvedValue(scheduleFixture);
  vi.mocked(listScheduleDrafts).mockReset();
  vi.mocked(listScheduleDrafts).mockResolvedValue({ drafts: [] });
  vi.mocked(fetchScheduleDraftShifts).mockReset();
  vi.mocked(fetchScheduleDraftShifts).mockResolvedValue({
    shifts: scheduleFixture.shifts.map((shift) => ({
      ...shift,
      revision: 1,
    })),
  });
  vi.mocked(fetchPendingOps).mockReset();
  vi.mocked(fetchPendingOps).mockResolvedValue({ pending_ops: [] });
  vi.mocked(fetchSchedulePublicationStatus).mockReset();
  vi.mocked(fetchSchedulePublicationStatus).mockResolvedValue({
    week_start: scheduleFixture.week_start,
    week_end: "2026-08-23",
    week_start_day: "monday",
    schedule_deadline_day: "sunday",
    is_anchor_only: false,
    locations: [
      {
        id: scheduleFixture.locations[0]!.id,
        name: scheduleFixture.locations[0]!.name,
        color: "#2563EB",
        timezone: "America/Los_Angeles",
        status: "published",
        reason: "active_publication_and_shifts",
        publication_includes_location: true,
        published_shift_count: 1,
        worked_shift_count: 0,
        draft_shift_count: 0,
        published_at: "2026-08-17T12:00:00Z",
        published_by_name: "Development Owner",
      },
    ],
  });
  vi.mocked(acquireScheduleEditSession).mockReset();
  vi.mocked(acquireScheduleEditSession).mockResolvedValue(
    makeDefaultEditAcquireResult(),
  );
  vi.mocked(takeoverScheduleEditSession).mockReset();
  vi.mocked(takeoverScheduleEditSession).mockResolvedValue(
    makeDefaultEditAcquireResult(),
  );
  vi.mocked(createScheduleShift).mockReset();
  vi.mocked(updateScheduleShift).mockReset();
  vi.mocked(deleteScheduleShift).mockReset();
  vi.mocked(restoreScheduleShift).mockReset();
  vi.mocked(saveScheduleDraft).mockReset();
  vi.mocked(previewSchedulePublication).mockReset();
  vi.mocked(publishScheduleDraft).mockReset();
  vi.mocked(listScheduleTemplates).mockReset();
  vi.mocked(listScheduleTemplates).mockResolvedValue({ templates: [] });
  vi.mocked(previewScheduleAutoFill).mockReset();
  vi.mocked(applyScheduleAutoFill).mockReset();
  vi.mocked(previewScheduleExport).mockReset();
  vi.mocked(previewScheduleExportHtml).mockReset();
  vi.mocked(listScheduleExportPresets).mockReset();
  vi.mocked(listScheduleExportPresets).mockResolvedValue({
    presets: [
      {
        id: "99999999-9999-4999-8999-999999999999",
        workspace_id: scheduleFixture.workspace_id,
        name: "Manager CSV",
        settings: {
          format: "csv",
          layout: "weekly",
          time_format: "12h",
          include_unassigned: true,
          include_notes: false,
          include_scheduled_hours: true,
          csv_delimiter: ",",
        },
        created_by: "88888888-8888-4888-8888-888888888888",
        updated_at: "2026-08-17T12:00:00Z",
      },
    ],
  });
  vi.mocked(listScheduleExportSchedules).mockReset();
  vi.mocked(listScheduleExportSchedules).mockResolvedValue({
    schedules: [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        workspace_id: scheduleFixture.workspace_id,
        preset_id: "99999999-9999-4999-8999-999999999999",
        preset_name: "Manager CSV",
        name: "Monday managers",
        recipients: ["manager@example.test"],
        location_ids: [scheduleFixture.locations[0]!.id],
        day_of_week: 1,
        send_hour: 8,
        timezone: "America/Los_Angeles",
        enabled: true,
        last_sent_at: null,
        consecutive_failures: 0,
        last_error: null,
        auto_disabled_at: null,
        created_at: "2026-08-17T12:00:00Z",
        updated_at: "2026-08-17T12:00:00Z",
      },
    ],
  });
  vi.mocked(listScheduleRecentExports).mockReset();
  vi.mocked(listScheduleRecentExports).mockResolvedValue({
    events: [
      {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        workspace_id: scheduleFixture.workspace_id,
        surface: "schedule",
        format: "csv",
        params: {
          week_start: "2026-09-21",
          layout: "weekly",
          location_ids: [scheduleFixture.locations[0]!.id],
        },
        actor_user_id: "88888888-8888-4888-8888-888888888888",
        created_at: "2026-08-17T12:00:00Z",
      },
    ],
  });
  vi.mocked(createScheduleExportSchedule).mockReset();
  vi.mocked(createScheduleExportSchedule).mockImplementation(
    (_workspaceId, input) =>
      Promise.resolve({
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        workspace_id: scheduleFixture.workspace_id,
        preset_name: "Manager CSV",
        enabled: true,
        last_sent_at: null,
        consecutive_failures: 0,
        last_error: null,
        auto_disabled_at: null,
        created_at: "2026-08-17T12:00:00Z",
        updated_at: "2026-08-17T12:00:00Z",
        ...input,
      }),
  );
  vi.mocked(updateScheduleExportSchedule).mockReset();
  vi.mocked(updateScheduleExportSchedule).mockImplementation(
    (_workspaceId, scheduleId, input) =>
      Promise.resolve({
        id: scheduleId,
        workspace_id: scheduleFixture.workspace_id,
        preset_id: "99999999-9999-4999-8999-999999999999",
        preset_name: "Manager CSV",
        name: "Monday managers",
        recipients: ["manager@example.test"],
        location_ids: [scheduleFixture.locations[0]!.id],
        day_of_week: 1,
        send_hour: 8,
        timezone: "America/Los_Angeles",
        enabled: input.enabled ?? true,
        last_sent_at: null,
        consecutive_failures: 0,
        last_error: null,
        auto_disabled_at: null,
        created_at: "2026-08-17T12:00:00Z",
        updated_at: "2026-08-17T12:00:00Z",
      }),
  );
  vi.mocked(deleteScheduleExportSchedule).mockReset();
  vi.mocked(deleteScheduleExportSchedule).mockResolvedValue(undefined);
}

vi.mock("./schedule/schedule-data", () => ({
  ScheduleRequestError: class ScheduleRequestError extends Error {
    readonly status: number;
    readonly body: unknown;

    constructor(message: string, status: number, body: unknown) {
      super(message);
      this.name = "ScheduleRequestError";
      this.status = status;
      this.body = body;
    }
  },
  getScheduleReadModel: vi.fn().mockResolvedValue(scheduleFixture),
  authorizeScheduleExportV2: vi.fn().mockResolvedValue(undefined),
  listScheduleDrafts: vi.fn().mockResolvedValue({ drafts: [] }),
  fetchScheduleDraftShifts: vi.fn().mockResolvedValue({
    shifts: scheduleFixture.shifts.map((shift) => ({
      ...shift,
      revision: 1,
    })),
  }),
  fetchPendingOps: vi.fn().mockResolvedValue({ pending_ops: [] }),
  draftsKey: (workspaceId: string | null, weekStart: string) =>
    ["schedule-drafts", workspaceId, weekStart] as const,
  scheduleReadKey: (workspaceId: string | null, date: string, view: string) =>
    ["schedule-read", workspaceId, date, view] as const,
  pendingOpsKey: (
    workspaceId: string | null,
    weekStart: string,
    locationId: string | null = null,
    draftId: string | null = null,
  ) =>
    [
      "schedule-pending-ops",
      workspaceId,
      weekStart,
      locationId,
      draftId,
    ] as const,
  fetchSchedulePublicationStatus: vi.fn().mockResolvedValue({
    week_start: scheduleFixture.week_start,
    locations: [
      {
        location_id: scheduleFixture.locations[0]!.id,
        status: "published",
        draft_id: null,
        published_at: "2026-08-17T12:00:00Z",
        unpublished_at: null,
        revision: 1,
        has_pending_ops: false,
      },
    ],
  }),
  acquireScheduleEditSession: vi.fn().mockImplementation(() =>
    Promise.resolve({
      status: "acquired",
      session: {
        id: "77777777-7777-4777-8777-777777777777",
        workspace_id: scheduleFixture.workspace_id,
        week_start: scheduleFixture.week_start,
        source_kind: "published",
        source_draft_id: null,
        source_revision: 1,
        holder_user_id: "88888888-8888-4888-8888-888888888888",
        holder_name: "Development Owner",
        revision: 1,
        dirty: false,
        last_heartbeat: "2026-08-17T12:00:00Z",
        expires_at: "2026-08-17T12:04:00Z",
        shifts: scheduleFixture.shifts.map((shift) => ({
          ...shift,
          unpaid_break_minutes: 30,
          revision: 1,
        })),
      },
    }),
  ),
  heartbeatScheduleEditSession: vi.fn(),
  takeoverScheduleEditSession: vi.fn().mockImplementation(() =>
    Promise.resolve({
      status: "acquired",
      session: {
        id: "77777777-7777-4777-8777-777777777777",
        workspace_id: scheduleFixture.workspace_id,
        week_start: scheduleFixture.week_start,
        source_kind: "published",
        source_draft_id: null,
        source_revision: 1,
        holder_user_id: "88888888-8888-4888-8888-888888888888",
        holder_name: "Development Owner",
        revision: 1,
        dirty: false,
        last_heartbeat: "2026-08-17T12:00:00Z",
        expires_at: "2026-08-17T12:04:00Z",
        shifts: scheduleFixture.shifts.map((shift) => ({
          ...shift,
          unpaid_break_minutes: 30,
          revision: 1,
        })),
      },
    }),
  ),
  createScheduleShift: vi.fn(),
  updateScheduleShift: vi.fn(),
  deleteScheduleShift: vi.fn(),
  restoreScheduleShift: vi.fn(),
  saveScheduleDraft: vi.fn(),
  discardScheduleEditSession: vi.fn().mockResolvedValue(undefined),
  previewSchedulePublication: vi.fn(),
  publishScheduleDraft: vi.fn(),
  previewScheduleUnpublish: vi.fn(),
  unpublishSchedule: vi.fn(),
  listScheduleTemplates: vi.fn().mockResolvedValue({ templates: [] }),
  createScheduleTemplate: vi.fn(),
  renameScheduleTemplate: vi.fn(),
  deleteScheduleTemplate: vi.fn(),
  applyScheduleTemplate: vi.fn(),
  previewScheduleAutoFill: vi.fn(),
  applyScheduleAutoFill: vi.fn(),
  previewScheduleExport: vi.fn(),
  previewScheduleExportHtml: vi.fn(),
  downloadScheduleExport: vi.fn(),
  listScheduleExportPresets: vi.fn().mockResolvedValue({
    presets: [
      {
        id: "99999999-9999-4999-8999-999999999999",
        workspace_id: scheduleFixture.workspace_id,
        name: "Manager CSV",
        settings: {
          format: "csv",
          layout: "weekly",
          time_format: "12h",
          include_unassigned: true,
          include_notes: false,
          include_scheduled_hours: true,
          csv_delimiter: ",",
        },
        created_by: "88888888-8888-4888-8888-888888888888",
        updated_at: "2026-08-17T12:00:00Z",
      },
    ],
  }),
  listScheduleExportSchedules: vi.fn().mockResolvedValue({
    schedules: [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        workspace_id: scheduleFixture.workspace_id,
        preset_id: "99999999-9999-4999-8999-999999999999",
        preset_name: "Manager CSV",
        name: "Monday managers",
        recipients: ["manager@example.test"],
        day_of_week: 1,
        send_hour: 8,
        timezone: "America/Los_Angeles",
        enabled: true,
        last_sent_at: null,
        consecutive_failures: 0,
        last_error: null,
        auto_disabled_at: null,
        created_at: "2026-08-17T12:00:00Z",
        updated_at: "2026-08-17T12:00:00Z",
      },
    ],
  }),
  listScheduleRecentExports: vi.fn().mockResolvedValue({
    events: [
      {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        workspace_id: scheduleFixture.workspace_id,
        surface: "schedule",
        format: "csv",
        params: {
          week_start: "2026-09-21",
          layout: "weekly",
          location_ids: [scheduleFixture.locations[0]!.id],
        },
        actor_user_id: "88888888-8888-4888-8888-888888888888",
        created_at: "2026-08-17T12:00:00Z",
      },
    ],
  }),
  createScheduleExportPreset: vi.fn(),
  createScheduleExportSchedule: vi
    .fn()
    .mockImplementation((_workspaceId, input) =>
      Promise.resolve({
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        workspace_id: scheduleFixture.workspace_id,
        preset_name: "Manager CSV",
        enabled: true,
        last_sent_at: null,
        consecutive_failures: 0,
        last_error: null,
        auto_disabled_at: null,
        created_at: "2026-08-17T12:00:00Z",
        updated_at: "2026-08-17T12:00:00Z",
        ...input,
      }),
    ),
  updateScheduleExportSchedule: vi
    .fn()
    .mockImplementation((_workspaceId, scheduleId, input) =>
      Promise.resolve({
        id: scheduleId,
        workspace_id: scheduleFixture.workspace_id,
        preset_id: "99999999-9999-4999-8999-999999999999",
        preset_name: "Manager CSV",
        name: "Monday managers",
        recipients: ["manager@example.test"],
        day_of_week: 1,
        send_hour: 8,
        timezone: "America/Los_Angeles",
        enabled: input.enabled ?? true,
        last_sent_at: null,
        consecutive_failures: 0,
        last_error: null,
        auto_disabled_at: null,
        created_at: "2026-08-17T12:00:00Z",
        updated_at: "2026-08-17T12:00:00Z",
      }),
    ),
  deleteScheduleExportSchedule: vi.fn().mockResolvedValue(undefined),
  deleteScheduleExportPreset: vi.fn(),
}));

vi.mock("./schedule/hooks/useScheduleViewerPresence", () => ({
  useScheduleViewerPresence: () => [],
}));

vi.mock("./communications/communications-data", () => ({
  notificationChangeEventName: "newfork:notifications-changed",
  notificationChangeStorageKey: "newfork.notifications.changed",
  getNotifications: vi.fn().mockResolvedValue({
    workspace_id: scheduleFixture.workspace_id,
    unread_count: 0,
    next_cursor: null,
    notifications: [],
  }),
  getWorkspaceDashboard: vi.fn().mockResolvedValue({
    workspace_id: scheduleFixture.workspace_id,
    display_name: "Development user",
    metrics: {
      today_shift_count: 1,
      today_open_shift_count: 0,
      pending_time_off_count: 0,
      pending_shift_change_count: 0,
      unread_notification_count: 0,
    },
    announcements: [],
    notifications: [],
    todos: [],
    layout: {
      widget_order: [
        "operations",
        "pending_requests",
        "open_shifts",
        "announcements",
        "todos",
        "notifications",
        "quick_actions",
      ],
      hidden_widget_ids: [],
    },
  }),
  saveWorkspaceLayout: vi.fn().mockResolvedValue({ status: "saved" }),
  createWorkspaceTodo: vi.fn(),
  resolveWorkspaceTodo: vi.fn(),
  getAnnouncements: vi.fn(),
  saveAnnouncement: vi.fn(),
  transitionAnnouncement: vi.fn(),
  actOnNotification: vi.fn(),
}));

describe("App", () => {
  it("protects workspace routes and opens the authenticated shell", async () => {
    window.history.pushState({}, "", "/app/schedule?date=2026-08-24");
    const { container } = render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Sign in to your workspace" }),
    ).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Workspace role" }), {
      target: { value: "owner" },
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Use development identity" }),
      );
    });

    expect(
      await screen.findByRole(
        "heading",
        { name: "Schedule" },
        { timeout: 25000 },
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Draft selector: New Schedule" }),
    ).toBeTruthy();
    const weeklyViewButton = screen.getByRole("button", {
      name: "Weekly view",
    });
    expect(weeklyViewButton).toHaveProperty(
      "textContent",
      "Aug 17 – Aug 23, 2026",
    );
    expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Hide Unscheduled" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export" }).className).toContain(
      "schedule-action-button",
    );
    expect(
      screen.getByRole("button", { name: "Draft selector: New Schedule" })
        .className,
    ).toContain("schedule-action-button");
    expect(
      screen.getByRole("columnheader", {
        name: "Published - Live Main Dining",
      }),
    ).toBeTruthy();
    const locationFilter = container.querySelector(
      '.schedule-topbar-filter[data-filter-id="locations"]',
    );
    const shiftTypeFilter = container.querySelector(
      '.schedule-topbar-filter[data-filter-id="shiftTypes"]',
    );
    expect(locationFilter).toBeTruthy();
    expect(shiftTypeFilter).toBeTruthy();
    fireEvent.click(locationFilter!.querySelector("summary")!);
    expect(locationFilter?.hasAttribute("open")).toBe(true);
    fireEvent.click(shiftTypeFilter!.querySelector("summary")!);
    expect(locationFilter?.hasAttribute("open")).toBe(false);
    expect(shiftTypeFilter?.hasAttribute("open")).toBe(true);
    fireEvent.pointerDown(document.body);
    expect(shiftTypeFilter?.hasAttribute("open")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /Settings/ }));
    fireEvent.click(screen.getByRole("button", { name: "Show Total hours" }));
    expect(
      screen.getByRole("columnheader", { name: "Total hours" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("grid", { name: "Weekly published schedule" })
        .getAttribute("style"),
    ).toContain(
      "grid-template-columns: minmax(144px, 200px) repeat(7, minmax(0, 1fr)) minmax(72px, 120px)",
    );
    expect(
      screen.getByRole("gridcell", { name: "Alex Rivera total hours 6h 30m" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("gridcell", { name: "Week total hours 6h 30m" }),
    ).toBeTruthy();
    expect(screen.getAllByText("Alex Rivera")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: /Dinner-Server, 4:00 PM - 10:30 PM/ }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Hide Labels in badges" }),
    );
    expect(
      screen.getByRole("button", { name: /Dinner-Server, 4:00 PM - 10:30 PM/ }),
    ).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Employees" })).toBeTruthy();
    const footerLinks = Array.from(
      container.querySelectorAll(".sidebar-footer .nav-item"),
    ).map((item) => item.textContent);
    expect(footerLinks).toEqual(["Settings", "Account", "Sign out"]);
    fireEvent.click(screen.getByRole("link", { name: "Employees" }));
    expect(
      await screen.findByRole("heading", { name: "Employees" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "Settings" }));
    expect(
      await screen.findByRole("heading", { name: "General" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("navigation", { name: "Organization settings" }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Schedule rules" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Shift types" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Roles & permissions" }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Documents" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Acknowledgements" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Support" })).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "Acknowledgements" }));
    expect(
      await screen.findByRole("heading", { name: "Acknowledgements" }),
    ).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Templates" })).toBeTruthy();
    expect(
      screen.getByRole("tab", { name: "Retention policies" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "Roles & permissions" }));
    expect(
      await screen.findByRole("heading", { name: "Roles & permissions" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "Account" }));
    expect(
      await screen.findByRole("heading", { name: "Profile" }),
    ).toBeTruthy();
  }, 40000);

  it("shows reference-style visible and total hour comparison when filters hide assigned shifts", async () => {
    const prepType = {
      ...scheduleFixture.shift_types[0]!,
      id: "44444444-4444-4444-8444-444444444446",
      name: "Prep",
      color: "#0F766E",
      sort_order: 1,
    };
    vi.mocked(getScheduleReadModel).mockResolvedValueOnce({
      ...scheduleFixture,
      shift_types: [...scheduleFixture.shift_types, prepType],
      shifts: [
        ...scheduleFixture.shifts,
        {
          ...scheduleFixture.shifts[0]!,
          id: "77777777-7777-4777-8777-777777777783",
          shift_type_id: prepType.id,
          scheduled_date: "2026-08-18",
          start_time: "10:00",
          end_time: "14:00",
        },
        {
          ...scheduleFixture.shifts[0]!,
          id: "77777777-7777-4777-8777-777777777784",
          employee_id: null,
          shift_type_id: prepType.id,
          scheduled_date: "2026-08-19",
          start_time: "10:00",
          end_time: "18:00",
        },
      ],
    });
    window.history.pushState(
      {},
      "",
      `/app/schedule?date=2026-09-02&shiftTypes=${scheduleFixture.shift_types[0]!.id}`,
    );
    window.localStorage.setItem("newfork.development.workspaceRole", "owner");
    render(<App />);
    await screen.findByRole("heading", { name: "Schedule" });
    fireEvent.click(await screen.findByRole("button", { name: /Settings/ }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Show Total hours" }),
    );

    expect(
      await screen.findByRole("gridcell", {
        name: "Alex Rivera total hours 6h 30m / 10h 30m",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("gridcell", {
        name: "Week total hours 6h 30m / 10h 30m",
      }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("gridcell", { name: /Unassigned total hours/ }),
    ).toBeNull();
  });

  it("keeps an unpublished past schedule week read-only", async () => {
    const pastWeekStart = "2020-01-06";
    const pastFixture = scheduleFixtureForWeek(pastWeekStart);
    vi.mocked(getScheduleReadModel).mockResolvedValue({
      ...pastFixture,
      locations: pastFixture.locations.map((location) => ({
        ...location,
        publication_status: "unpublished" as const,
        published_at: null,
      })),
      shifts: [],
    });
    vi.mocked(listScheduleDrafts).mockResolvedValue({ drafts: [] });
    vi.mocked(fetchSchedulePublicationStatus).mockResolvedValue({
      week_start: pastWeekStart,
      week_end: "2020-01-12",
      week_start_day: "monday",
      schedule_deadline_day: "sunday",
      is_anchor_only: false,
      locations: pastFixture.locations.map((location) => ({
        id: location.id,
        name: location.name,
        color: "#2563EB",
        timezone: location.timezone,
        status: "unpublished" as const,
        reason: "missing_publication" as const,
        publication_includes_location: false,
        published_shift_count: 0,
        worked_shift_count: 0,
        draft_shift_count: 0,
        published_at: null,
        published_by_name: null,
      })),
    });

    window.history.pushState({}, "", `/app/schedule?date=${pastWeekStart}`);
    window.localStorage.setItem("newfork.development.workspaceRole", "owner");
    render(<App />);

    const draftSelector = await screen.findByRole(
      "button",
      { name: "Draft selector: New Schedule" },
      { timeout: 5000 },
    );
    await waitFor(() => expect(draftSelector).toHaveProperty("disabled", true));
    expect(
      screen.queryByRole("button", { name: "New Schedule (blank)" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Edit live schedule" }),
    ).toBeNull();
    expect(acquireScheduleEditSession).not.toHaveBeenCalled();
  });

  it("disables publish from a blank preview when the week has no published schedule", async () => {
    const weekStart = "2026-10-26";
    const unpublishedFixture = scheduleFixtureForWeek(weekStart);
    vi.mocked(getScheduleReadModel).mockResolvedValue({
      ...unpublishedFixture,
      locations: unpublishedFixture.locations.map((location) => ({
        ...location,
        publication_status: "unpublished" as const,
        published_at: null,
      })),
      shifts: [],
    });
    vi.mocked(listScheduleDrafts).mockResolvedValue({ drafts: [] });
    vi.mocked(fetchSchedulePublicationStatus).mockResolvedValue({
      week_start: weekStart,
      week_end: "2026-11-01",
      week_start_day: "monday",
      schedule_deadline_day: "sunday",
      is_anchor_only: false,
      locations: unpublishedFixture.locations.map((location) => ({
        id: location.id,
        name: location.name,
        color: "#2563EB",
        timezone: location.timezone,
        status: "unpublished" as const,
        reason: "missing_publication" as const,
        publication_includes_location: false,
        published_shift_count: 0,
        worked_shift_count: 0,
        draft_shift_count: 0,
        published_at: null,
        published_by_name: null,
      })),
    });

    window.history.pushState({}, "", `/app/schedule?date=${weekStart}`);
    render(<App />);
    fireEvent.change(
      await screen.findByRole("combobox", { name: "Workspace role" }),
      { target: { value: "owner" } },
    );
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Use development identity" }),
      );
    });

    await screen.findByRole("button", {
      name: "Draft selector: New Schedule",
    });
    const draftLookupCount = vi.mocked(listScheduleDrafts).mock.calls.length;
    const publishButton = await screen.findByRole("button", {
      name: "Publish",
    });
    await waitFor(() =>
      expect(publishButton).toHaveProperty("disabled", true),
    );

    fireEvent.click(publishButton);

    expect(vi.mocked(listScheduleDrafts).mock.calls.length).toBe(
      draftLookupCount,
    );
    expect(
      screen.queryByText("Save a named draft before publishing this week."),
    ).toBeNull();
  });

  it("honors per-shift hidden clock time badges from the reference model", async () => {
    vi.mocked(getScheduleReadModel).mockResolvedValueOnce({
      ...scheduleFixture,
      shifts: [
        {
          ...scheduleFixture.shifts[0]!,
          hide_time_on_badge: true,
        },
      ],
    });
    window.history.pushState({}, "", "/app/schedule?date=2026-09-03");
    render(<App />);
    fireEvent.change(
      await screen.findByRole("combobox", { name: "Workspace role" }),
      { target: { value: "owner" } },
    );
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Use development identity" }),
      );
    });

    expect(
      await screen.findByRole("button", { name: "Dinner-Server" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", {
        name: /Dinner-Server, 4:00 PM - 10:30 PM/,
      }),
    ).toBeNull();
  });

  it("shows shift label names in badges only while label badges are enabled", async () => {
    vi.mocked(getScheduleReadModel).mockResolvedValueOnce({
      ...scheduleFixture,
      shifts: [
        {
          ...scheduleFixture.shifts[0]!,
          label_names: ["Trainer", "Close"],
        },
      ],
    });
    window.history.pushState({}, "", "/app/schedule?date=2026-09-11");
    render(<App />);
    fireEvent.change(
      await screen.findByRole("combobox", { name: "Workspace role" }),
      { target: { value: "owner" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Use development identity" }),
    );

    expect(
      await screen.findByRole("button", {
        name: /Dinner-Server, Trainer · Close, 4:00 PM - 10:30 PM/,
      }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Settings/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Hide Labels in badges" }),
    );

    expect(
      screen.queryByRole("button", { name: /Trainer · Close/ }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: /Dinner-Server, 4:00 PM - 10:30 PM/ }),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Hide Shift type in badges" }),
    );

    expect(
      JSON.parse(window.localStorage.getItem("organizer-schedule-ui")!).state
        .showShiftType,
    ).toBe(false);
    expect(screen.queryByRole("button", { name: /Dinner-Server/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: /Server, 4:00 PM - 10:30 PM/ }),
    ).toBeTruthy();
  });

  it("saves the selected reference-style shift label from the quick editor", async () => {
    const label = {
      id: "99999999-9999-4999-8999-999999999991",
      name: "Trainer",
      color: "#0F766E",
      sort_order: 0,
    };
    const labeledFixture = {
      ...scheduleFixtureForWeek("2026-09-07"),
      shift_labels: [label],
    };
    vi.mocked(getScheduleReadModel).mockResolvedValueOnce(labeledFixture);
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({
      status: "acquired",
      session: {
        id: "77777777-7777-4777-8777-777777777777",
        workspace_id: labeledFixture.workspace_id,
        week_start: labeledFixture.week_start,
        source_kind: "published",
        source_draft_id: null,
        source_revision: 1,
        holder_user_id: "88888888-8888-4888-8888-888888888888",
        holder_name: "Development Owner",
        revision: 1,
        dirty: false,
        last_heartbeat: "2026-08-17T12:00:00Z",
        expires_at: "2026-08-17T12:04:00Z",
        shifts: labeledFixture.shifts.map((shift) => ({
          ...shift,
          revision: 1,
        })),
      },
    });
    const updateMock = vi.mocked(updateScheduleShift);
    updateMock.mockClear();
    updateMock.mockResolvedValueOnce({
      id: "77777777-7777-4777-8777-777777777777",
      workspace_id: labeledFixture.workspace_id,
      week_start: labeledFixture.week_start,
      source_kind: "published",
      source_draft_id: null,
      source_revision: 1,
      holder_user_id: "88888888-8888-4888-8888-888888888888",
      holder_name: "Development Owner",
      revision: 2,
      dirty: true,
      last_heartbeat: "2026-08-17T12:00:00Z",
      expires_at: "2026-08-17T12:04:00Z",
      shifts: labeledFixture.shifts.map((shift) => ({
        ...shift,
        label_ids: [label.id],
        label_names: [label.name],
        revision: 2,
      })),
    });
    window.history.pushState({}, "", "/app/schedule?date=2026-09-12");
    const { container } = render(<App />);
    fireEvent.change(
      await screen.findByRole("combobox", { name: "Workspace role" }),
      { target: { value: "owner" } },
    );
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Use development identity" }),
      );
    });
    await openPublishedScheduleEditor();
    const shiftBadge = await waitFor(() => {
      const badge = container.querySelector<HTMLElement>(
        ".schedule-shift-badge",
      );
      expect(badge).toBeTruthy();
      return badge;
    });
    fireEvent.doubleClick(shiftBadge!);
    const dialog = await screen.findByRole("dialog", { name: "Edit shift" });

    fireEvent.click(within(dialog).getByRole("combobox", { name: "Labels" }));
    fireEvent.click(within(dialog).getByRole("option", { name: label.name }));
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Update shift" }),
    );

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    expect(updateMock.mock.calls[0]?.[4]).toEqual(
      expect.objectContaining({
        label_ids: [label.id],
        label_names: [label.name],
      }),
    );
  });

  it("opens Export v2 nonmodally in the application sidebar and keeps grid Settings interactive", async () => {
    window.history.pushState({}, "", "/app/schedule/export?date=2026-08-17");
    render(<App />);
    fireEvent.change(await screen.findByRole("combobox", { name: "Workspace role" }), { target: { value: "owner" } });
    fireEvent.click(screen.getByRole("button", { name: "Use development identity" }));
    const panel = await screen.findByRole("region", { name: "Export settings" });
    expect(panel.closest("aside")?.getAttribute("aria-label")).toBe("Application sidebar");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Scheduled emails")).toBeNull();
    expect(listScheduleExportPresets).not.toHaveBeenCalled();
    expect(listScheduleExportSchedules).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Settings/ }));
    fireEvent.click(screen.getByRole("button", { name: "Hide Clock in/out in badges" }));
    expect(screen.getByRole("region", { name: "Export settings" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show Clock in/out in badges" })).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "Close export" }));
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeTruthy();
  });

  it("opens the standalone schedule templates page from the reference templates route", async () => {
    const draftCallCount = vi.mocked(listScheduleDrafts).mock.calls.length;
    window.history.pushState({}, "", "/app/schedule/templates?date=2026-08-24");
    window.localStorage.setItem("newfork.development.workspaceRole", "owner");
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Schedule templates" }),
    ).toBeTruthy();
    expect(await screen.findByText("No templates yet")).toBeTruthy();
    expect(listScheduleTemplates).toHaveBeenCalledWith(
      scheduleFixture.workspace_id,
    );
    expect(vi.mocked(listScheduleDrafts).mock.calls.length).toBe(
      draftCallCount,
    );
  });

  it("opens Schedule editing from an explicit working-copy source", async () => {
    const workingFixture = scheduleFixtureForWeek("2026-09-07");
    vi.mocked(getScheduleReadModel).mockResolvedValueOnce(workingFixture);
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({
      ...makeDefaultEditAcquireResult(),
      session: {
        ...makeDefaultEditAcquireResult().session,
        week_start: workingFixture.week_start,
        shifts: workingFixture.shifts.map((shift) => ({
          ...shift,
          unpaid_break_minutes: 30,
          revision: 1,
        })),
      },
    });
    window.history.pushState({}, "", "/app/schedule?date=2026-09-07");
    window.localStorage.setItem("newfork.development.workspaceRole", "owner");
    render(<App />);
    await openPublishedScheduleEditor();
    expect(await screen.findByRole("button", { name: "Discard" })).toBeTruthy();
    expect(new URLSearchParams(window.location.search).get("mode")).toBe(
      "edit",
    );
    await waitFor(() =>
      expect(fetchPendingOps).toHaveBeenCalledWith(
        workingFixture.workspace_id,
        {
          location_id: workingFixture.locations[0]!.id,
          week_start: workingFixture.week_start,
          draft_id: null,
        },
      ),
    );
    expect(screen.getByRole("button", { name: "Export" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Publish" })).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Add shift for Alex Rivera at Main Dining on 2026-09-07",
      }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Add shift" }),
    ).toBeTruthy();
  });

  it("clears active preview filters when entering schedule edit mode", async () => {
    const workingFixture = scheduleFixtureForWeek("2026-09-07");
    vi.mocked(getScheduleReadModel).mockResolvedValueOnce(workingFixture);
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({
      ...makeDefaultEditAcquireResult(),
      session: {
        ...makeDefaultEditAcquireResult().session,
        week_start: workingFixture.week_start,
        shifts: workingFixture.shifts.map((shift) => ({
          ...shift,
          unpaid_break_minutes: 30,
          revision: 1,
        })),
      },
    });
    window.history.pushState(
      {},
      "",
      `/app/schedule?date=2026-09-07&locations=${workingFixture.locations[0]!.id}&shiftTypes=${workingFixture.shift_types[0]!.id}&jobs=${workingFixture.jobs[0]!.id}&employees=${workingFixture.employees[0]!.id}&hideUnscheduled=true&layout=unified`,
    );
    window.localStorage.setItem("newfork.development.workspaceRole", "owner");
    render(<App />);

    await openPublishedScheduleEditor();

    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("mode")).toBe(
        "edit",
      ),
    );
    const params = new URLSearchParams(window.location.search);
    expect(params.get("locations")).toBeNull();
    expect(params.get("shiftTypes")).toBeNull();
    expect(params.get("jobs")).toBeNull();
    expect(params.get("employees")).toBeNull();
    expect(params.get("hideUnscheduled")).toBeNull();
    expect(params.get("layout")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Hide Unscheduled" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  }, 20000);

  it("locks grid editing when an active edit session navigates back to a past week", async () => {
    const workingFixture = scheduleFixtureForWeek("2026-09-07");
    vi.mocked(getScheduleReadModel)
      .mockResolvedValueOnce(workingFixture)
      .mockResolvedValue(scheduleFixture);
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({
      ...makeDefaultEditAcquireResult(),
      session: {
        ...makeDefaultEditAcquireResult().session,
        week_start: workingFixture.week_start,
        shifts: workingFixture.shifts.map((shift) => ({
          ...shift,
          unpaid_break_minutes: 30,
          revision: 1,
        })),
      },
    });
    window.history.pushState({}, "", "/app/schedule?date=2026-09-07");
    window.localStorage.setItem("newfork.development.workspaceRole", "owner");
    const { container } = render(<App />);

    await openPublishedScheduleEditor();
    expect(await screen.findByRole("button", { name: "Discard" })).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Add shift for Alex Rivera at Main Dining on 2026-09-07",
      }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));

    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("date")).toBe(
        "2026-08-31",
      ),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Hide Unscheduled" }),
    );
    expect(
      new URLSearchParams(window.location.search).get("hideUnscheduled"),
    ).toBe("true");

    expect(
      screen.queryByRole("button", {
        name: "Add shift for Alex Rivera at Main Dining on 2026-08-17",
      }),
    ).toBeNull();
    const shiftBadge = await waitFor(() => {
      const badge = container.querySelector<HTMLElement>(
        ".schedule-shift-badge",
      );
      expect(badge).toBeTruthy();
      expect(badge?.getAttribute("draggable")).toBeNull();
      return badge;
    });
    fireEvent.doubleClick(shiftBadge!);
    expect(screen.queryByRole("dialog", { name: "Edit shift" })).toBeNull();

    const pastCell = container.querySelector<HTMLElement>(
      '[data-testid="schedule-cell-body"][data-date="2026-08-17"]',
    );
    expect(pastCell).toBeTruthy();
    fireEvent.doubleClick(pastCell!);
    expect(screen.queryByRole("dialog", { name: "Add shift" })).toBeNull();
  }, 20000);

  it("keeps active edit filters while navigating schedule weeks", async () => {
    const workingFixture = scheduleFixtureForWeek("2026-09-07");
    vi.mocked(getScheduleReadModel)
      .mockResolvedValueOnce(workingFixture)
      .mockResolvedValue(scheduleFixture);
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({
      ...makeDefaultEditAcquireResult(),
      session: {
        ...makeDefaultEditAcquireResult().session,
        week_start: workingFixture.week_start,
        shifts: workingFixture.shifts.map((shift) => ({
          ...shift,
          unpaid_break_minutes: 30,
          revision: 1,
        })),
      },
    });
    window.history.pushState({}, "", "/app/schedule?date=2026-09-07");
    window.localStorage.setItem("newfork.development.workspaceRole", "owner");
    render(<App />);

    await openPublishedScheduleEditor();
    expect(await screen.findByRole("button", { name: "Discard" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Hide Unscheduled" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));

    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("date")).toBe(
        "2026-08-31",
      ),
    );
    expect(
      new URLSearchParams(window.location.search).get("hideUnscheduled"),
    ).toBe("true");

    fireEvent.click(await screen.findByRole("button", { name: "Next week" }));

    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("date")).toBe(
        "2026-09-07",
      ),
    );
    expect(
      new URLSearchParams(window.location.search).get("hideUnscheduled"),
    ).toBe("true");
  }, 20000);

  it("keeps active edit filters while navigating schedule days", async () => {
    const workingFixture = scheduleFixtureForWeek("2026-09-07");
    vi.mocked(getScheduleReadModel)
      .mockResolvedValueOnce(workingFixture)
      .mockResolvedValue(workingFixture);
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({
      ...makeDefaultEditAcquireResult(),
      session: {
        ...makeDefaultEditAcquireResult().session,
        week_start: workingFixture.week_start,
        shifts: workingFixture.shifts.map((shift) => ({
          ...shift,
          unpaid_break_minutes: 30,
          revision: 1,
        })),
      },
    });
    window.history.pushState({}, "", "/app/schedule?date=2026-09-07&view=day");
    window.localStorage.setItem("newfork.development.workspaceRole", "owner");
    render(<App />);

    await openPublishedScheduleEditor();
    expect(await screen.findByRole("button", { name: "Discard" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Hide Unscheduled" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous day" }));

    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("date")).toBe(
        "2026-09-06",
      ),
    );
    expect(
      new URLSearchParams(window.location.search).get("hideUnscheduled"),
    ).toBe("true");

    fireEvent.click(await screen.findByRole("button", { name: "Next day" }));

    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("date")).toBe(
        "2026-09-07",
      ),
    );
    expect(
      new URLSearchParams(window.location.search).get("hideUnscheduled"),
    ).toBe("true");
  }, 20000);

  it("clears stale draft preview params on past weeks instead of showing draft not found", async () => {
    const missingDraftId = "99999999-9999-4999-8999-999999999997";
    vi.mocked(fetchScheduleDraftShifts).mockRejectedValueOnce(
      new ScheduleRequestError("draft not found", 404, {
        error: "draft not found",
      }),
    );
    window.history.pushState(
      {},
      "",
      `/app/schedule?date=2026-08-17&draft=${missingDraftId}`,
    );
    window.localStorage.setItem("newfork.development.workspaceRole", "owner");
    render(<App />);

    expect(
      await screen.findByRole("button", {
        name: "Draft selector: New Schedule",
      }),
    ).toBeTruthy();
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("draft")).toBe(
        null,
      ),
    );
    expect(screen.queryByText(/draft not found/i)).toBeNull();
    expect(fetchScheduleDraftShifts).not.toHaveBeenCalled();
  });

  it("uses an app-native confirmation before discarding schedule edits", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const discardMock = vi.mocked(discardScheduleEditSession);
    discardMock.mockClear();
    vi.mocked(getScheduleReadModel).mockResolvedValueOnce(
      scheduleFixtureForWeek("2026-09-07"),
    );
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({
      ...makeDefaultEditAcquireResult(),
      session: {
        ...makeDefaultEditAcquireResult().session,
        week_start: "2026-09-07",
        dirty: true,
      },
    });
    window.history.pushState({}, "", "/app/schedule?date=2026-09-07");
    render(<App />);

    fireEvent.change(
      await screen.findByRole("combobox", { name: "Workspace role" }),
      { target: { value: "owner" } },
    );
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Use development identity" }),
      );
    });
    await openPublishedScheduleEditor();
    expect(await screen.findByRole("button", { name: "Discard" })).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: "Discard" }).at(-1)!);
    const confirmDialog = await screen.findByRole("alertdialog", {
      name: "Discard unsaved changes?",
    });
    expect(confirmSpy).not.toHaveBeenCalled();
    fireEvent.click(
      within(confirmDialog).getByRole("button", { name: "Keep editing" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("alertdialog", {
          name: "Discard unsaved changes?",
        }),
      ).toBeNull(),
    );
    expect(discardMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole("button", { name: "Discard" }).at(-1)!);
    const secondConfirmDialog = await screen.findByRole("alertdialog", {
      name: "Discard unsaved changes?",
    });
    fireEvent.click(
      within(secondConfirmDialog).getByRole("button", { name: "Discard" }),
    );
    await waitFor(() =>
      expect(discardMock).toHaveBeenCalledWith(
        scheduleFixture.workspace_id,
        "77777777-7777-4777-8777-777777777777",
      ),
    );
    await waitFor(() => expect(screen.queryByText("Editing draft")).toBeNull());
    confirmSpy.mockRestore();
  }, 20000);

  it("confirms retroactive draft saves before acknowledging past edits", async () => {
    const savedDraft = {
      id: "99999999-9999-4999-8999-999999999999",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      name: "Schedule vrs.0.1",
      revision: 1,
      created_by: "88888888-8888-4888-8888-888888888888",
      updated_by: "88888888-8888-4888-8888-888888888888",
      created_at: "2026-08-17T12:00:00Z",
      updated_at: "2026-08-17T12:00:00Z",
    };
    const saveMock = vi.mocked(saveScheduleDraft);
    saveMock.mockClear();
    saveMock.mockRejectedValueOnce(
      new ScheduleRequestError("Past edit requires acknowledgement", 409, {
        status: "past_shift_edit_requires_ack",
        past_edits: [
          {
            op_type: "update",
            shift_id: scheduleFixture.shifts[0]!.id,
            scheduled_date: "2026-08-17",
            location_name: "Main Dining",
            employee_name: "Alex Rivera",
            reason: "shift_started",
            severity: "warning",
          },
        ],
        past_edit_messages: [
          "Alex Rivera already worked Main Dining on 2026-08-17.",
        ],
      }),
    );
    saveMock.mockResolvedValueOnce(savedDraft);

    window.history.pushState({}, "", "/app/schedule?date=2026-08-26");
    render(<App />);
    fireEvent.change(
      await screen.findByRole("combobox", { name: "Workspace role" }),
      {
        target: { value: "owner" },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Use development identity" }),
    );
    await openPublishedScheduleEditor();
    fireEvent.click(
      await screen.findByRole("button", { name: /^(?:Save draft|Publish)$/ }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Save As" }));

    expect(
      await screen.findByRole("dialog", {
        name: "This changes shifts that already ran",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText("Alex Rivera already worked Main Dining on 2026-08-17."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save anyway" }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
    expect(saveMock.mock.calls[0]?.[4]).toBe(false);
    expect(saveMock.mock.calls[1]?.[4]).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Editing draft")).toBeNull();
  });

  it("retries a failed save-and-publish as save-and-publish", async () => {
    const savedDraft = {
      id: "99999999-9999-4999-8999-999999999998",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      name: "Schedule vrs.0.1",
      revision: 1,
      created_by: "88888888-8888-4888-8888-888888888888",
      updated_by: "88888888-8888-4888-8888-888888888888",
      created_at: "2026-08-17T12:00:00Z",
      updated_at: "2026-08-17T12:00:00Z",
    };
    const saveMock = vi.mocked(saveScheduleDraft);
    saveMock.mockRejectedValueOnce(new Error("Network dropped"));
    saveMock.mockResolvedValueOnce(savedDraft);
    vi.mocked(previewSchedulePublication).mockResolvedValueOnce({
      status: "publish_ready",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      draft_id: savedDraft.id,
      draft_revision: savedDraft.revision,
      fingerprint: "b".repeat(64),
      locations: [
        {
          location_id: scheduleFixture.locations[0]!.id,
          location_name: scheduleFixture.locations[0]!.name,
          active_publication_id: null,
          active_version: null,
          current_shift_count: 0,
          next_shift_count: 1,
          added: 1,
          updated: 0,
          removed: 0,
          unchanged: 0,
          affected_employee_ids: [scheduleFixture.employees[0]!.id],
        },
      ],
      findings: [],
    });

    window.history.pushState({}, "", "/app/schedule?date=2026-08-26");
    render(<App />);
    fireEvent.change(
      await screen.findByRole("combobox", { name: "Workspace role" }),
      { target: { value: "owner" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Use development identity" }),
    );
    await openPublishedScheduleEditor();
    fireEvent.click(
      await screen.findByRole("button", { name: /^(?:Save draft|Publish)$/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save and publish" }));

    expect(
      await screen.findByRole("dialog", { name: "Schedule save failed" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry save" }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByRole("dialog", {
        name: "Select locations to publish",
      }),
    ).toBeTruthy();
    await clickReadyButton(screen, "Next");
    await waitFor(() =>
      expect(previewSchedulePublication).toHaveBeenCalledWith(
        scheduleFixture.workspace_id,
        savedDraft.id,
        [scheduleFixture.locations[0]!.id],
        {},
      ),
    );
  }, 15_000);

  it("keeps the working copy usable after dismissing save failure recovery", async () => {
    const savedDraft = {
      id: "99999999-9999-4999-8999-999999999995",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      name: "Recovered after keep editing",
      revision: 1,
      created_by: "88888888-8888-4888-8888-888888888888",
      updated_by: "88888888-8888-4888-8888-888888888888",
      created_at: "2026-08-17T12:00:00Z",
      updated_at: "2026-08-17T12:05:00Z",
    };
    const saveMock = vi.mocked(saveScheduleDraft);
    saveMock.mockRejectedValueOnce(new Error("Network dropped"));
    saveMock.mockResolvedValueOnce(savedDraft);

    window.history.pushState({}, "", "/app/schedule?date=2026-08-26");
    render(<App />);
    fireEvent.change(
      await screen.findByRole("combobox", { name: "Workspace role" }),
      { target: { value: "owner" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Use development identity" }),
    );
    await openPublishedScheduleEditor();
    fireEvent.click(
      await screen.findByRole("button", { name: /^(?:Save draft|Publish)$/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save and publish" }));

    expect(
      await screen.findByRole("dialog", { name: "Schedule save failed" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));

    expect(
      screen.queryByRole("dialog", { name: "Schedule save failed" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Discard" })).toBeTruthy();
    // Save failures dismiss the save menu before opening native recovery.
    // Keep editing returns to the working copy; its Save menu remains usable.
    fireEvent.click(screen.getByRole("button", { name: /^(?:Save draft|Publish)$/ }));
    expect(screen.getByRole("dialog", { name: "Save draft" })).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Draft name"), {
      target: { value: savedDraft.name },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save As" }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
    expect(
      screen.queryByRole("dialog", { name: "Schedule save failed" }),
    ).toBeNull();
    expect(screen.queryByText("Editing draft")).toBeNull();
  });

  it("confirms backend draft name conflicts before overwriting the owned draft", async () => {
    const conflictingDraft = {
      id: "99999999-9999-4999-8999-999999999997",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      name: "Older shared copy",
      revision: 7,
      created_by: "77777777-7777-4777-8777-777777777777",
      updated_by: "77777777-7777-4777-8777-777777777777",
      created_at: "2026-08-17T12:00:00Z",
      updated_at: "2026-08-17T12:00:00Z",
    };
    const savedDraft = {
      ...conflictingDraft,
      name: "Shared schedule",
      revision: 8,
      updated_by: "88888888-8888-4888-8888-888888888888",
      updated_at: "2026-08-17T12:05:00Z",
    };
    vi.mocked(listScheduleDrafts).mockResolvedValue({
      drafts: [conflictingDraft],
    });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const saveMock = vi.mocked(saveScheduleDraft);
    saveMock.mockRejectedValueOnce(
      new ScheduleRequestError("Name owned by another manager", 409, {
        status: "name_owned_by_other",
        draft_id: conflictingDraft.id,
        owner_name: "Sam Manager",
      }),
    );
    saveMock.mockResolvedValueOnce(savedDraft);

    window.history.pushState({}, "", "/app/schedule?date=2026-08-26");
    render(<App />);
    fireEvent.change(
      await screen.findByRole("combobox", { name: "Workspace role" }),
      { target: { value: "owner" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Use development identity" }),
    );
    await openPublishedScheduleEditor();
    fireEvent.click(
      await screen.findByRole("button", { name: /^(?:Save draft|Publish)$/ }),
    );
    fireEvent.change(screen.getByLabelText("Draft name"), {
      target: { value: "Shared schedule" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save As" }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
    expect(confirmSpy).toHaveBeenCalledWith(
      '"Shared schedule" is owned by Sam Manager. Overwrite it?',
    );
    expect(saveMock.mock.calls[1]?.[3]).toEqual(conflictingDraft);
    expect(
      screen.queryByRole("dialog", { name: "Schedule save failed" }),
    ).toBeNull();
    expect(screen.queryByText("Editing draft")).toBeNull();
    confirmSpy.mockRestore();
  });

  it("keeps editing and retries when a draft save returns stale baseline", async () => {
    const savedDraft = {
      id: "99999999-9999-4999-8999-999999999996",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      name: "Schedule vrs.0.1",
      revision: 2,
      created_by: "88888888-8888-4888-8888-888888888888",
      updated_by: "88888888-8888-4888-8888-888888888888",
      created_at: "2026-08-17T12:00:00Z",
      updated_at: "2026-08-17T12:05:00Z",
    };
    const saveMock = vi.mocked(saveScheduleDraft);
    saveMock.mockRejectedValueOnce(
      new ScheduleRequestError("stale_baseline", 409, {
        status: "stale_baseline",
      }),
    );
    saveMock.mockResolvedValueOnce(savedDraft);

    window.history.pushState({}, "", "/app/schedule?date=2026-08-26");
    render(<App />);
    fireEvent.change(
      await screen.findByRole("combobox", { name: "Workspace role" }),
      { target: { value: "owner" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Use development identity" }),
    );
    await openPublishedScheduleEditor();
    fireEvent.click(
      await screen.findByRole("button", { name: /^(?:Save draft|Publish)$/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save As" }));

    expect(
      await screen.findByRole("dialog", { name: "Schedule save failed" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "The schedule changed while this draft was being saved. Keep editing, review the latest changes, then retry.",
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Retry save" }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
    expect(
      screen.queryByRole("dialog", { name: "Schedule save failed" }),
    ).toBeNull();
    expect(screen.queryByText("Editing draft")).toBeNull();
  });

  it("sorts schedule employees alphabetically and by job from Settings", async () => {
    const hostJob = {
      ...scheduleFixture.jobs[0]!,
      id: "33333333-3333-4333-8333-333333333334",
      name: "Host",
      sort_order: 0,
    };
    const serverJob = {
      ...scheduleFixture.jobs[0]!,
      name: "Server",
      sort_order: 1,
    };
    const invalidShiftType = {
      ...scheduleFixture.shift_types[0]!,
      id: "44444444-4444-4444-8444-444444444445",
      name: "Invalid",
      sort_order: 1,
      default_start_time: "09:00",
      default_end_time: "09:00",
    };
    const clockOffShiftType = {
      ...scheduleFixture.shift_types[0]!,
      id: "44444444-4444-4444-8444-444444444447",
      name: "Clock off",
      color: "#0F766E",
      sort_order: 2,
      default_start_time: null,
      default_end_time: null,
    };
    const sortedFixture = {
      ...scheduleFixture,
      jobs: [hostJob, serverJob],
      shift_types: [
        ...scheduleFixture.shift_types,
        invalidShiftType,
        clockOffShiftType,
      ],
      employees: [
        {
          ...scheduleFixture.employees[0]!,
          id: "55555555-5555-4555-8555-555555555557",
          employee_code: "NF-009",
          display_name: "Aaron Primary Server",
          job_ids: [hostJob.id, serverJob.id],
          primary_job_id: serverJob.id,
        },
        {
          ...scheduleFixture.employees[0]!,
          id: "55555555-5555-4555-8555-555555555558",
          employee_code: "NF-010",
          display_name: "Alice Server",
          job_ids: [serverJob.id],
          primary_job_id: serverJob.id,
        },
        {
          ...scheduleFixture.employees[0]!,
          id: "55555555-5555-4555-8555-555555555559",
          employee_code: "NF-011",
          display_name: "Zoe Host",
          job_ids: [hostJob.id],
          primary_job_id: hostJob.id,
        },
        {
          ...scheduleFixture.employees[0]!,
          id: "55555555-5555-4555-8555-555555555560",
          employee_code: "NF-012",
          display_name: "Morgan No Primary",
          job_ids: [hostJob.id],
          primary_job_id: null,
        },
      ],
      shifts: [],
    } satisfies ScheduleReadModel;
    vi.mocked(getScheduleReadModel).mockImplementation(
      async (_workspaceId, date) =>
        date === "2026-09-04" ? sortedFixture : scheduleFixture,
    );
    window.localStorage.setItem("newfork.development.workspaceRole", "owner");
    window.localStorage.setItem(
      "organizer-schedule-ui",
      JSON.stringify({
        state: {
          showPresetShiftBadges: false,
          showRoleSeparators: false,
        },
      }),
    );
    window.history.pushState({}, "", "/app/schedule?date=2026-09-04");
    const { container } = render(<App />);
    const app = within(container);
    fireEvent.change(
      await app.findByRole("combobox", { name: "Workspace role" }),
      {
        target: { value: "owner" },
      },
    );
    await act(async () => {
      fireEvent.click(
        app.getByRole("button", { name: "Use development identity" }),
      );
    });
    await app.findByRole("heading", { name: "Schedule" }, { timeout: 5000 });

    const employeeOrder = () =>
      Array.from(
        container.querySelectorAll<HTMLElement>(
          ".schedule-employee-cell strong",
        ),
      ).map((item) => item.textContent);
    const employeeFilterOrder = () =>
      Array.from(
        container.querySelectorAll<HTMLElement>(
          '[data-topbar-filter-content="employees"] .schedule-topbar-filter-label',
        ),
      )
        .map((item) => item.textContent)
        .filter((label) => label !== "All employees");
    const openEmployeeFilter = () => {
      const trigger = container.querySelector<HTMLElement>(
        '[data-filter-id="employees"] summary',
      );
      expect(trigger).toBeTruthy();
      fireEvent.click(trigger!);
    };

    expect(employeeOrder()).toEqual([
      "Aaron Primary Server",
      "Alice Server",
      "Morgan No Primary",
      "Zoe Host",
    ]);
    expect(app.queryByRole("button", { name: "Dinner-Host" })).toBeNull();

    fireEvent.click(app.getByRole("button", { name: /Settings/ }));
    expect(
      app.getByRole("button", { name: "Show Preset badges" }),
    ).toHaveProperty("disabled", true);
    expect(
      app.getByRole("button", { name: "Show Role Seperators" }),
    ).toHaveProperty("disabled", true);
    fireEvent.click(app.getByRole("menuitemradio", { name: "Job/Position" }));
    expect(
      app.getByRole("button", { name: "Hide Preset badges" }),
    ).toHaveProperty("disabled", false);
    expect(
      app.getByRole("button", { name: "Hide Role Seperators" }),
    ).toHaveProperty("disabled", false);

    expect(employeeOrder()).toEqual([
      "Morgan No Primary",
      "Zoe Host",
      "Aaron Primary Server",
      "Alice Server",
    ]);
    expect(
      Array.from(
        container.querySelectorAll<HTMLElement>(
          ".schedule-preset-row-label strong, .schedule-employee-cell strong",
        ),
      ).map((item) => item.textContent),
    ).toEqual([
      "Host",
      "Morgan No Primary",
      "Zoe Host",
      "Server",
      "Aaron Primary Server",
      "Alice Server",
    ]);
    openEmployeeFilter();
    expect(employeeFilterOrder()).toEqual([
      "Morgan No Primary",
      "Zoe Host",
      "Aaron Primary Server",
      "Alice Server",
    ]);
    expect(
      JSON.parse(window.localStorage.getItem("organizer-schedule-ui")!).state
        .employeeSortMode,
    ).toBe("byJob");
    fireEvent.click(app.getByRole("button", { name: /Settings/ }));
    fireEvent.click(app.getByRole("button", { name: "Hide Role Seperators" }));
    expect(
      JSON.parse(window.localStorage.getItem("organizer-schedule-ui")!).state
        .showRoleSeparators,
    ).toBe(false);
    expect(
      Array.from(
        container.querySelectorAll<HTMLElement>(
          ".schedule-preset-row-label strong, .schedule-employee-cell strong",
        ),
      ).map((item) => item.textContent),
    ).toEqual([
      "Morgan No Primary",
      "Zoe Host",
      "Aaron Primary Server",
      "Alice Server",
    ]);
    fireEvent.click(app.getByRole("button", { name: "Show Role Seperators" }));
    expect(
      JSON.parse(window.localStorage.getItem("organizer-schedule-ui")!).state
        .showRoleSeparators,
    ).toBe(true);
    fireEvent.click(
      app.getByRole("button", { name: "Use default times for scheduling" }),
    );
    expect(
      JSON.parse(window.localStorage.getItem("organizer-schedule-ui")!).state
        .useDefaultTimesForScheduling,
    ).toBe(true);
    fireEvent.click(
      app.getByRole("button", { name: "Use default times for scheduling" }),
    );
    expect(
      JSON.parse(window.localStorage.getItem("organizer-schedule-ui")!).state
        .useDefaultTimesForScheduling,
    ).toBe(false);
    fireEvent.click(app.getByRole("menuitemradio", { name: "A-Z" }));
    expect(employeeOrder()).toEqual([
      "Aaron Primary Server",
      "Alice Server",
      "Morgan No Primary",
      "Zoe Host",
    ]);
    openEmployeeFilter();
    expect(employeeFilterOrder()).toEqual([
      "Aaron Primary Server",
      "Alice Server",
      "Morgan No Primary",
      "Zoe Host",
    ]);
    fireEvent.click(app.getByRole("button", { name: /Settings/ }));
    fireEvent.click(app.getByRole("menuitemradio", { name: "Job/Position" }));
    expect(app.queryByRole("button", { name: "Dinner-Host" })).toBeNull();
    await openPublishedScheduleEditor(app);
    expect(await app.findByRole("button", { name: "Discard" })).toBeTruthy();
    expect(app.getAllByRole("button", { name: "Dinner-Host" })).toHaveLength(1);
    const hostPreset = app.getByRole("button", { name: "Dinner-Host" });
    expect(hostPreset.getAttribute("data-schedule-preset-chip")).toBe("true");
    expect(hostPreset.getAttribute("data-job-id")).toBe(hostJob.id);
    expect(hostPreset.getAttribute("data-shift-type-id")).toBe(
      scheduleFixture.shift_types[0]!.id,
    );
    expect(
      hostPreset.style.getPropertyValue("--schedule-preset-chip-border"),
    ).toBe(scheduleFixture.shift_types[0]!.color);
    expect(hostPreset.getAttribute("data-preset-has-default-times")).toBe(
      "true",
    );
    expect(hostPreset.getAttribute("data-preset-clock-off")).toBe("false");
    expect(hostPreset.getAttribute("style")).toContain(
      "background-color: color-mix",
    );
    expect(
      hostPreset
        .closest<HTMLElement>("[data-schedule-preset-cell='true']")
        ?.getAttribute("data-schedule-employee-group-boundary"),
    ).toBe(hostJob.id);
    expect(
      hostPreset
        .closest<HTMLElement>("[data-schedule-preset-cell='true']")
        ?.getAttribute("data-location-boundary"),
    ).toBeNull();
    const invalidPreset = app.getByRole("button", { name: "Invalid-Host" });
    expect(invalidPreset.getAttribute("data-preset-has-default-times")).toBe(
      "true",
    );
    expect(invalidPreset.getAttribute("data-preset-clock-off")).toBe("false");
    const clockOffPreset = app.getByRole("button", { name: "Clock off-Host" });
    expect(clockOffPreset.getAttribute("data-preset-has-default-times")).toBe(
      "false",
    );
    expect(clockOffPreset.getAttribute("data-preset-clock-off")).toBe("true");
    const presetDropTarget = container.querySelector<HTMLElement>(
      `[data-drop-cell='true'][data-employee-id='55555555-5555-4555-8555-555555555559'][data-date='2026-08-18']`,
    );
    expect(presetDropTarget).toBeTruthy();
    const originalElementFromPoint = document.elementFromPoint;
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => presetDropTarget,
    });
    fireEvent.mouseDown(hostPreset, {
      button: 0,
      buttons: 1,
      clientX: 20,
      clientY: 20,
    });
    fireEvent.mouseMove(window, {
      buttons: 1,
      clientX: 96,
      clientY: 96,
    });
    await waitFor(() => {
      expect(
        container.querySelector("[data-shift-type-preset-drag-preview='true']"),
      ).toBeTruthy();
      expect(presetDropTarget?.getAttribute("data-drop-status")).toBe(
        "allowed",
      );
    });
    fireEvent.pointerCancel(window);
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: originalElementFromPoint,
    });
    await waitFor(() => {
      expect(
        container.querySelector("[data-shift-type-preset-drag-preview='true']"),
      ).toBeNull();
    });
    const createMock = vi.mocked(createScheduleShift);
    createMock.mockClear();
    createMock.mockResolvedValueOnce({
      id: "77777777-7777-4777-8777-777777777777",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      source_kind: "published",
      source_draft_id: null,
      source_revision: 1,
      holder_user_id: "88888888-8888-4888-8888-888888888888",
      holder_name: "Development Owner",
      revision: 2,
      dirty: true,
      last_heartbeat: "2026-08-17T12:00:00Z",
      expires_at: "2026-08-17T12:04:00Z",
      shifts: [],
    });
    const clickableHostPreset = app.getByRole("button", {
      name: "Dinner-Host",
    });
    fireEvent.pointerDown(clickableHostPreset);
    await waitFor(() => {
      expect(
        container.querySelector(".schedule-topbar-dismiss-layer"),
      ).toBeNull();
    });
    fireEvent.click(app.getByRole("button", { name: "Dinner-Host" }));
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock.mock.calls[0]?.[2]).toEqual(
      expect.objectContaining({
        employee_id: null,
        job_id: hostJob.id,
        shift_type_id: scheduleFixture.shift_types[0]!.id,
        scheduled_date: "2026-08-17",
        start_time: "16:00",
        end_time: "22:00",
        unpaid_break_minutes: 30,
        hide_time_on_badge: true,
      }),
    );
    expect(app.queryByRole("dialog", { name: "Add shift" })).toBeNull();

    createMock.mockClear();
    fireEvent.click(app.getByRole("button", { name: "Clock off-Host" }));
    expect(createMock).not.toHaveBeenCalled();
    const clockOffDialog = await app.findByRole("dialog", {
      name: "Add shift",
    });
    expect(clockOffDialog).toBeTruthy();
    expect(
      within(clockOffDialog)
        .getByRole("button", { name: "Clock off" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(
      within(clockOffDialog).getByRole("button", { name: "Cancel" }),
    );

    fireEvent.click(app.getAllByRole("button", { name: "Invalid-Host" })[0]!);
    expect(await app.findByText("Preset shift is unavailable")).toBeTruthy();
    expect(
      app.getByText(/Default start and end time cannot be the same\./),
    ).toBeTruthy();
    expect(
      app.getByText(/Invalid-Host \/ Open shift \/ Main Dining \/ 2026-08-18/),
    ).toBeTruthy();
    expect(app.queryByRole("dialog", { name: "Add shift" })).toBeNull();
    const gridLabels = Array.from(
      container.querySelectorAll<HTMLElement>(
        ".schedule-preset-row-label strong, .schedule-employee-cell strong",
      ),
    ).map((item) => item.textContent);
    expect(gridLabels).toEqual([
      "Unassigned",
      "Host",
      "Morgan No Primary",
      "Zoe Host",
      "Server",
      "Aaron Primary Server",
      "Alice Server",
    ]);
  }, 30000);

  it("hides excluded schedule employees unless they have a shift in the visible week", async () => {
    const coveredExcludedEmployee = {
      ...scheduleFixture.employees[0]!,
      id: "55555555-5555-4555-8555-555555555561",
      employee_code: "NF-013",
      display_name: "Covered Excluded",
      is_excluded_from_schedule: true,
    };
    const emptyExcludedEmployee = {
      ...scheduleFixture.employees[0]!,
      id: "55555555-5555-4555-8555-555555555562",
      employee_code: "NF-014",
      display_name: "Empty Excluded",
      is_excluded_from_schedule: true,
    };
    const excludedFixture = {
      ...scheduleFixture,
      employees: [
        ...scheduleFixture.employees,
        coveredExcludedEmployee,
        emptyExcludedEmployee,
      ],
      shifts: [
        ...scheduleFixture.shifts,
        {
          ...scheduleFixture.shifts[0]!,
          id: "66666666-6666-4666-8666-666666666667",
          employee_id: coveredExcludedEmployee.id,
          scheduled_date: "2026-08-19",
        },
      ],
    } satisfies ScheduleReadModel;
    vi.mocked(getScheduleReadModel).mockImplementation(
      async (_workspaceId, date) =>
        date === "2026-09-05" ? excludedFixture : scheduleFixture,
    );

    window.history.pushState({}, "", "/app/schedule?date=2026-09-05");
    const { container } = render(<App />);
    const app = within(container);
    fireEvent.change(
      await app.findByRole("combobox", { name: "Workspace role" }),
      {
        target: { value: "owner" },
      },
    );
    await act(async () => {
      fireEvent.click(
        app.getByRole("button", { name: "Use development identity" }),
      );
    });
    await app.findByRole("heading", { name: "Schedule" }, { timeout: 5000 });

    const employeeOrder = () =>
      Array.from(
        container.querySelectorAll<HTMLElement>(
          ".schedule-employee-cell strong",
        ),
      ).map((item) => item.textContent);

    expect(employeeOrder()).toContain("Alex Rivera");
    expect(employeeOrder()).toContain("Covered Excluded");
    expect(employeeOrder()).not.toContain("Empty Excluded");
    vi.mocked(getScheduleReadModel).mockResolvedValue(scheduleFixture);
  });

  it("sizes schedule day columns from intrinsic shift and preset badge width", async () => {
    const scrollWidthDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollWidth",
    );
    Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
      configurable: true,
      get() {
        return this instanceof HTMLElement &&
          this.getAttribute("data-schedule-badge-width-measure") === "true"
          ? 190
          : 0;
      },
    });
    try {
      window.history.pushState({}, "", "/app/schedule?date=2026-08-24");
      render(<App />);
      fireEvent.change(
        await screen.findByRole("combobox", { name: "Workspace role" }),
        {
          target: { value: "owner" },
        },
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Use development identity" }),
      );

      const grid = await screen.findByRole("grid", {
        name: "Weekly published schedule",
      });
      await waitFor(() =>
        expect(grid.style.getPropertyValue("--schedule-day-column-min")).toBe(
          "193px",
        ),
      );
    } finally {
      if (scrollWidthDescriptor) {
        Object.defineProperty(
          HTMLElement.prototype,
          "scrollWidth",
          scrollWidthDescriptor,
        );
      } else {
        delete (HTMLElement.prototype as { scrollWidth?: number }).scrollWidth;
      }
    }
  });

  it("blocks preset shift badges when a partial closure covers that shift type", async () => {
    const partialClosedFixture = {
      ...scheduleFixture,
      week_start: "2026-08-17",
      shifts: [],
      closures: [
        {
          id: "aaaaaaaa-0000-4000-8000-000000000001",
          location_id: scheduleFixture.locations[0]!.id,
          closed_date: "2026-08-17",
          end_date: null,
          title: "No dinner service",
          is_all_day: false,
          shift_type_ids: [scheduleFixture.shift_types[0]!.id],
        },
      ],
    } satisfies ScheduleReadModel;
    vi.mocked(getScheduleReadModel).mockResolvedValue(partialClosedFixture);
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({
      ...makeDefaultEditAcquireResult(),
      session: {
        ...makeDefaultEditAcquireResult().session,
        shifts: [],
      },
    });
    vi.mocked(createScheduleShift).mockClear();
    window.history.pushState({}, "", "/app/schedule?date=2026-08-17");
    window.localStorage.setItem("newfork.development.workspaceRole", "owner");
    const { container } = render(<App />);
    const app = within(container);
    await app.findByRole("heading", { name: "Schedule" }, { timeout: 5000 });
    fireEvent.click(app.getByRole("button", { name: /Settings/ }));
    fireEvent.click(app.getByRole("menuitemradio", { name: "Job/Position" }));
    fireEvent.pointerDown(document.body);
    await openPublishedScheduleEditor(app);

    const blockedPreset = await app.findByRole("button", {
      name: "Dinner-Server",
    });
    fireEvent.pointerDown(blockedPreset, { clientX: 18, clientY: 18 });
    fireEvent.pointerUp(blockedPreset, { clientX: 18, clientY: 18 });
    fireEvent.click(blockedPreset, { clientX: 18, clientY: 18 });

    expect(await app.findByText("Preset shift is unavailable")).toBeTruthy();
    expect(
      app.getByText(/Location is closed for this shift type\./),
    ).toBeTruthy();
    expect(createScheduleShift).not.toHaveBeenCalled();
    expect(app.queryByRole("dialog", { name: "Add shift" })).toBeNull();
  });

  it("shows location context inside shift badges in unified schedule layout", async () => {
    window.history.pushState(
      {},
      "",
      "/app/schedule?date=2026-08-24&layout=unified",
    );
    const { container } = render(<App />);
    fireEvent.change(
      await screen.findByRole("combobox", { name: "Workspace role" }),
      {
        target: { value: "owner" },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Use development identity" }),
    );

    expect(
      await screen.findByRole("grid", { name: "Weekly published schedule" }),
    ).toBeTruthy();
    const badge = container.querySelector<HTMLElement>(".schedule-shift-badge");
    expect(badge).toBeTruthy();
    expect(
      badge?.querySelector("[data-shift-badge-content='true']"),
    ).toBeTruthy();
    expect(
      badge?.querySelector("[data-shift-badge-location='true']")?.textContent,
    ).toBe("Main Dining");
  });

  it("uses reference-style day header clicks to step into daily location filters", async () => {
    const patioLocation = {
      ...scheduleFixture.locations[0]!,
      id: "77777777-7777-4777-8777-777777777777",
      name: "Patio",
      publication_status: "unpublished" as const,
      published_at: null,
      sort_order: 1,
    };
    vi.mocked(getScheduleReadModel).mockResolvedValue({
      ...scheduleFixture,
      locations: [...scheduleFixture.locations, patioLocation],
      employees: scheduleFixture.employees.map((employee) => ({
        ...employee,
        location_ids: [...employee.location_ids, patioLocation.id],
      })),
    });
    window.history.pushState({}, "", "/app/schedule?date=2026-08-17");
    const { container } = render(<App />);
    const app = within(container);
    fireEvent.change(
      await app.findByRole("combobox", { name: "Workspace role" }),
      {
        target: { value: "owner" },
      },
    );
    fireEvent.click(
      app.getByRole("button", { name: "Use development identity" }),
    );
    await app.findByRole("heading", { name: "Schedule" }, { timeout: 5000 });

    fireEvent.click(
      await app.findByRole("columnheader", {
        name: "View Tue Aug 18, Patio",
      }),
    );
    await waitFor(() => {
      expect(window.location.search).toContain("view=day");
      expect(window.location.search).toContain("date=2026-08-18");
      expect(window.location.search).toContain(`locations=${patioLocation.id}`);
    });
  });

  it("shows the reference-style edit lock dialog on schedule lock conflicts", async () => {
    const acquireMock = vi.mocked(acquireScheduleEditSession);
    const takeoverMock = vi.mocked(takeoverScheduleEditSession);
    takeoverMock.mockClear();
    acquireMock.mockResolvedValueOnce({
      status: "conflict",
      session_id: "77777777-7777-4777-8777-777777777777",
      holder_name: "Morgan Lee",
      last_heartbeat: new Date().toISOString(),
      expires_at: "2026-08-17T12:04:00Z",
    });
    window.history.pushState({}, "", "/app/schedule");
    render(<App />);
    fireEvent.change(
      await screen.findByRole("combobox", { name: "Workspace role" }),
      {
        target: { value: "owner" },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Use development identity" }),
    );
    await openPublishedScheduleEditor();

    await waitFor(() => expect(acquireMock).toHaveBeenCalled());
    expect(
      await screen.findByRole("dialog", { name: "Schedule is being edited" }),
    ).toBeTruthy();
    expect(
      screen.getByText(/Morgan Lee is editing the published schedule/),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "View schedule" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Take over" })).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    acquireMock.mockResolvedValueOnce(makeDefaultEditAcquireResult());
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(acquireMock).toHaveBeenCalledTimes(2));
    expect(takeoverMock).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Schedule is being edited" }),
      ).toBeNull(),
    );
  });

  it("opens reference-style schedule context menus while editing", async () => {
    const deleteMock = vi.mocked(deleteScheduleShift);
    const createMock = vi.mocked(createScheduleShift);
    createMock.mockClear();
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({
      status: "acquired",
      session: {
        id: "77777777-7777-4777-8777-777777777777",
        workspace_id: scheduleFixture.workspace_id,
        week_start: scheduleFixture.week_start,
        source_kind: "published",
        source_draft_id: null,
        source_revision: 1,
        holder_user_id: "88888888-8888-4888-8888-888888888888",
        holder_name: "Development Owner",
        revision: 1,
        dirty: false,
        last_heartbeat: "2026-08-17T12:00:00Z",
        expires_at: "2026-08-17T12:04:00Z",
        shifts: scheduleFixture.shifts.map((shift) => ({
          ...shift,
          unpaid_break_minutes: 30,
          revision: 1,
        })),
      },
    });
    deleteMock.mockClear();
    deleteMock.mockResolvedValueOnce({
      id: "77777777-7777-4777-8777-777777777777",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      source_kind: "published",
      source_draft_id: null,
      source_revision: 1,
      holder_user_id: "88888888-8888-4888-8888-888888888888",
      holder_name: "Development Owner",
      revision: 2,
      dirty: true,
      last_heartbeat: "2026-08-17T12:00:00Z",
      expires_at: "2026-08-17T12:04:00Z",
      shifts: [],
    });
    window.history.pushState({}, "", "/app/schedule?date=2026-09-07");
    const { container } = render(<App />);
    fireEvent.change(
      await screen.findByRole("combobox", { name: "Workspace role" }),
      {
        target: { value: "owner" },
      },
    );
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Use development identity" }),
      );
    });
    await openPublishedScheduleEditor();
    expect(await screen.findByRole("button", { name: "Discard" })).toBeTruthy();

    const shiftBadge = await waitFor(() => {
      const badge = container.querySelector<HTMLElement>(
        ".schedule-shift-badge",
      );
      expect(badge?.getAttribute("draggable")).toBeNull();
      return badge;
    });
    expect(shiftBadge).toBeTruthy();
    const closeShiftDrawer = async (
      name: "Add shift" | "Edit shift" | "Paste shift",
    ) => {
      fireEvent.click(screen.getByRole("button", { name: "Close editor" }));
      const discardConfirm = screen.queryByRole("alertdialog", {
        name: "Discard unsaved shift changes?",
      });
      if (discardConfirm) {
        fireEvent.click(
          within(discardConfirm).getByRole("button", { name: "Discard" }),
        );
      }
      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name })).toBeNull(),
      );
    };
    fireEvent.doubleClick(shiftBadge!);
    expect(
      await screen.findByRole("dialog", { name: "Edit shift" }),
    ).toBeTruthy();
    const startTimeInput = screen.getByRole("textbox", { name: "Start time" });
    fireEvent.change(startTimeInput, { target: { value: "630p" } });
    fireEvent.blur(startTimeInput);
    expect(startTimeInput).toHaveProperty("value", "06:30 PM");
    fireEvent.keyDown(startTimeInput, { key: "a" });
    expect(startTimeInput).toHaveProperty("value", "06:30 AM");
    fireEvent.keyDown(startTimeInput, { key: "p" });
    expect(startTimeInput).toHaveProperty("value", "06:30 PM");
    const endTimeInput = screen.getByRole("textbox", { name: "End time" });
    fireEvent.change(endTimeInput, { target: { value: "630p" } });
    fireEvent.blur(endTimeInput);
    expect(
      await screen.findByText("Start and end times cannot be the same."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Update shift" })).toHaveProperty(
      "disabled",
      true,
    );
    fireEvent.change(endTimeInput, { target: { value: "730p" } });
    fireEvent.blur(endTimeInput);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Update shift" }),
      ).toHaveProperty("disabled", false),
    );
    expect(screen.getByRole("group", { name: "Unpaid break" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "30m" }).getAttribute("aria-pressed"),
    ).toBe("true");
    const actionButtons = within(
      screen.getByRole("dialog", { name: "Edit shift" }),
    )
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label") ?? button.textContent);
    expect(actionButtons).toEqual([
      "Close editor",
      "Dinner",
      "None",
      "15m",
      "30m",
      "45m",
      "60m",
      "Delete shift",
      "Cancel",
      "Update shift",
    ]);
    await closeShiftDrawer("Edit shift");

    fireEvent.contextMenu(shiftBadge!, {
      clientX: 36,
      clientY: 48,
    });
    expect(screen.getByRole("menu", { name: "Shift actions" })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy shift" }));
    expect(await screen.findByText("Shift copied")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Paste mode on" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByRole("status", { name: "Paste status" })).toHaveProperty(
      "textContent",
      "Paste mode on",
    );

    const pasteCell = container.querySelector<HTMLElement>(
      `[data-drop-cell="true"][data-employee-id="${scheduleFixture.employees[0]!.id}"][data-location-id="${scheduleFixture.locations[0]!.id}"][data-date="${scheduleFixture.week_start}"]`,
    );
    expect(pasteCell).toBeTruthy();
    fireEvent.click(pasteCell!, { clientX: 58, clientY: 76 });
    expect(
      await screen.findByRole("dialog", { name: "Shift conflict" }),
    ).toBeTruthy();
    expect(screen.getAllByText(/Employee already has Dinner/)).toHaveLength(2);
    expect(
      screen.getAllByText(
        "This paste was not applied. Review the reason before scheduling the shift.",
      ).length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("status", { name: "Paste status" })).toHaveProperty(
      "textContent",
      "Employee already has Dinner. Requested: Dinner / Server at Main Dining.",
    );
    expect(screen.queryByRole("dialog", { name: "Paste shift" })).toBeNull();
    expect(createMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ scheduled_date: "2026-08-17" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    const unassignedPasteCell = container.querySelector<HTMLElement>(
      `[data-unassigned-cell="true"][data-location-id="${scheduleFixture.locations[0]!.id}"][data-date="${scheduleFixture.week_start}"]`,
    );
    expect(unassignedPasteCell).toBeTruthy();
    fireEvent.click(unassignedPasteCell!, { clientX: 88, clientY: 96 });
    expect(
      await screen.findByRole("dialog", { name: "Shift conflict" }),
    ).toBeTruthy();
    expect(
      screen.getAllByText("Employee could not be found.").length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText(
        "This paste was not applied. Review the reason before scheduling the shift.",
      ).length,
    ).toBeGreaterThanOrEqual(1);
    expect(createMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    fireEvent.pointerDown(document.body);
    expect(
      screen
        .getByRole("button", { name: "Paste mode off" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    fireEvent.contextMenu(pasteCell!, { clientX: 64, clientY: 82 });
    const pasteOnlyCellMenu = screen.getByRole("menu", {
      name: "Cell actions",
    });
    expect(pasteOnlyCellMenu).toBeTruthy();
    expect(
      within(pasteOnlyCellMenu).queryByRole("menuitem", { name: "Add shift" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Paste shift" }));
    expect(
      await screen.findByRole("dialog", { name: "Shift conflict" }),
    ).toBeTruthy();
    expect(container.querySelector(".schedule-quick-editor")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: /Settings/ }));
    fireEvent.click(
      screen.getByRole("menuitemradio", { name: "Job/Position" }),
    );
    fireEvent.pointerDown(document.body);
    const employeePresetCell = container.querySelector<HTMLElement>(
      `.schedule-cell[data-employee-id="${scheduleFixture.employees[0]!.id}"][data-date="2026-08-18"]`,
    );
    expect(employeePresetCell).toBeTruthy();
    fireEvent.contextMenu(employeePresetCell!, { clientX: 72, clientY: 96 });
    const presetCellMenu = screen.getByRole("menu", { name: "Cell actions" });
    expect(presetCellMenu).toBeTruthy();
    expect(
      within(presetCellMenu).queryByRole("menuitem", { name: "Add shift" }),
    ).toBeNull();
    expect(
      within(presetCellMenu).getByRole("menuitem", { name: "Dinner-Server" }),
    ).toBeTruthy();
    fireEvent.pointerDown(document.body);
    fireEvent.click(screen.getByRole("button", { name: /Settings/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Hide Preset badges" }),
    );
    fireEvent.pointerDown(document.body);
    fireEvent.contextMenu(employeePresetCell!, { clientX: 72, clientY: 96 });
    const presetToggleOffCellMenu = screen.getByRole("menu", {
      name: "Cell actions",
    });
    expect(
      within(presetToggleOffCellMenu).queryByRole("menuitem", {
        name: "Dinner-Server",
      }),
    ).toBeNull();
    fireEvent.pointerDown(document.body);
    fireEvent.click(screen.getByRole("button", { name: /Settings/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Show Preset badges" }),
    );
    fireEvent.pointerDown(document.body);
    fireEvent.contextMenu(employeePresetCell!, { clientX: 72, clientY: 96 });
    createMock.mockResolvedValueOnce({
      id: "77777777-7777-4777-8777-777777777777",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      source_kind: "published",
      source_draft_id: null,
      source_revision: 1,
      holder_user_id: "88888888-8888-4888-8888-888888888888",
      holder_name: "Development Owner",
      revision: 2,
      dirty: true,
      last_heartbeat: "2026-08-17T12:00:00Z",
      expires_at: "2026-08-17T12:04:00Z",
      shifts: scheduleFixture.shifts.map((shift) => ({
        ...shift,
        unpaid_break_minutes: 30,
        revision: 1,
      })),
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "Dinner-Server" }));
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock.mock.calls[0]?.[2]).toEqual(
      expect.objectContaining({
        employee_id: scheduleFixture.employees[0]!.id,
        job_id: scheduleFixture.jobs[0]!.id,
        shift_type_id: scheduleFixture.shift_types[0]!.id,
        scheduled_date: "2026-08-18",
        start_time: "16:00",
        end_time: "22:00",
        unpaid_break_minutes: 30,
      }),
    );
    expect(screen.queryByRole("dialog", { name: "Add shift" })).toBeNull();

    const refreshedShiftBadge = await waitFor(() => {
      const badge = container.querySelector<HTMLElement>(
        ".schedule-shift-badge",
      );
      if (!badge) throw new Error("Expected schedule shift badge");
      return badge;
    });
    fireEvent.doubleClick(refreshedShiftBadge);
    expect(
      await screen.findByRole("dialog", { name: "Edit shift" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete shift" }));
    await waitFor(() => expect(deleteMock).toHaveBeenCalled());
    expect(deleteMock.mock.calls.at(-1)?.[2]).toBe(
      scheduleFixture.shifts[0]!.id,
    );
    expect(screen.queryByRole("dialog", { name: "Edit shift" })).toBeNull();
  }, 20000);

  it("dismisses dirty Add shift on sidebar navigation without blocking the link", async () => {
    window.history.pushState({}, "", "/app/schedule?date=2026-08-29");
    const { container } = render(<App />);
    const app = within(container);
    fireEvent.change(
      await app.findByRole("combobox", { name: "Workspace role" }),
      {
        target: { value: "owner" },
      },
    );
    fireEvent.click(
      app.getByRole("button", { name: "Use development identity" }),
    );
    await openPublishedScheduleEditor(app);
    fireEvent.click(
      app.getByRole("button", {
        name: "Add shift for unassigned at Main Dining on 2026-08-17",
      }),
    );
    const dialog = await app.findByRole("dialog", { name: "Add shift" });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Increase count" }),
    );

    const employeesLink = app.getByRole("link", { name: "Employees" });
    fireEvent.pointerDown(employeesLink);
    fireEvent.click(employeesLink);

    expect(
      app.queryByRole("alertdialog", {
        name: "Discard unsaved shift changes?",
      }),
    ).toBeNull();
    expect(app.queryByRole("dialog", { name: "Add shift" })).toBeNull();
    expect(await app.findByRole("heading", { name: "Employees" })).toBeTruthy();
  }, 20000);

  it("dismisses dirty Add shift on schedule clicks without activating the target", async () => {
    window.history.pushState({}, "", "/app/schedule?date=2026-08-29");
    const { container } = render(<App />);
    const app = within(container);
    fireEvent.change(
      await app.findByRole("combobox", { name: "Workspace role" }),
      {
        target: { value: "owner" },
      },
    );
    fireEvent.click(
      app.getByRole("button", { name: "Use development identity" }),
    );
    await openPublishedScheduleEditor(app);
    const scheduleAddButton = app.getByRole("button", {
      name: "Add shift for unassigned at Main Dining on 2026-08-17",
    });
    fireEvent.click(scheduleAddButton);
    const dialog = await app.findByRole("dialog", { name: "Add shift" });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Increase count" }),
    );

    fireEvent.pointerDown(scheduleAddButton);
    fireEvent.click(scheduleAddButton);

    expect(
      app.queryByRole("alertdialog", {
        name: "Discard unsaved shift changes?",
      }),
    ).toBeNull();
    expect(app.queryByRole("dialog", { name: "Add shift" })).toBeNull();
  }, 20000);

  it("passes 24h schedule time format into the shift quick editor", async () => {
    vi.mocked(getScheduleReadModel).mockResolvedValueOnce({
      ...scheduleFixture,
      settings: {
        time_format: "24h",
      },
    });
    window.history.pushState({}, "", "/app/schedule?date=2026-08-17");
    const { container } = render(<App />);
    fireEvent.change(
      await screen.findByRole("combobox", { name: "Workspace role" }),
      {
        target: { value: "owner" },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Use development identity" }),
    );
    await openPublishedScheduleEditor();

    const shiftBadge = await waitFor(() => {
      const badge = container.querySelector<HTMLElement>(
        ".schedule-shift-badge",
      );
      if (!badge) throw new Error("Expected schedule shift badge");
      return badge;
    });
    fireEvent.doubleClick(shiftBadge);

    const dialog = await screen.findByRole("dialog", { name: "Edit shift" });
    const startTimeInput = within(dialog).getByRole("textbox", {
      name: "Start time",
    }) as HTMLInputElement;
    expect(startTimeInput.value).toBe("16:00");
    expect(
      startTimeInput.parentElement?.querySelector(
        '[data-time-segment="period"]',
      ),
    ).toBeNull();

    fireEvent.change(startTimeInput, { target: { value: "0715" } });
    fireEvent.blur(startTimeInput);
    expect(startTimeInput.value).toBe("07:15");
  });

  it("updates quick editor clock fields from selected shift type defaults", async () => {
    const brunchType = {
      ...scheduleFixture.shift_types[0]!,
      id: "44444444-4444-4444-8444-444444444447",
      name: "Brunch",
      color: "#0F766E",
      sort_order: 1,
      default_start_time: "10:00",
      default_end_time: "14:00",
    };
    const standbyType = {
      ...scheduleFixture.shift_types[0]!,
      id: "44444444-4444-4444-8444-444444444448",
      name: "Standby",
      color: "#B45309",
      sort_order: 2,
      default_start_time: null,
      default_end_time: null,
    };
    const editorFixture = {
      ...scheduleFixture,
      shift_types: [...scheduleFixture.shift_types, brunchType, standbyType],
    } satisfies ScheduleReadModel;
    const readModelMock = vi.mocked(getScheduleReadModel);
    const acquireMock = vi.mocked(acquireScheduleEditSession);
    readModelMock.mockResolvedValue(editorFixture);
    acquireMock.mockResolvedValueOnce({
      ...makeDefaultEditAcquireResult(),
      session: {
        ...makeDefaultEditAcquireResult().session,
        shifts: editorFixture.shifts.map((shift) => ({
          ...shift,
          unpaid_break_minutes: 30,
          revision: 1,
        })),
      },
    });
    try {
      window.history.pushState({}, "", "/app/schedule?date=2026-08-17");
      window.localStorage.setItem("newfork.development.workspaceRole", "owner");
      render(<App />);
      await openPublishedScheduleEditor();
      fireEvent.click(screen.getByRole("button", { name: /Settings/ }));
      fireEvent.click(screen.getByRole("menuitemradio", { name: "A-Z" }));
      fireEvent.pointerDown(document.body);
      const addShiftButton = await waitFor(() => {
        const button = document.querySelector<HTMLElement>(
          'button[aria-label="Add shift for Alex Rivera at Main Dining on 2026-08-18"]',
        );
        expect(button).toBeTruthy();
        return button!;
      });
      fireEvent.click(addShiftButton);
      const dialog = await screen.findByRole("dialog", { name: "Add shift" });
      const startTimeInput = within(dialog).getByRole("textbox", {
        name: "Start time",
      }) as HTMLInputElement;
      const endTimeInput = within(dialog).getByRole("textbox", {
        name: "End time",
      }) as HTMLInputElement;
      const clockBadgeToggle = within(dialog).getByRole("checkbox", {
        name: "Use these times for scheduling",
      }) as HTMLInputElement;

      fireEvent.click(within(dialog).getByRole("button", { name: "Brunch" }));

      await waitFor(() => expect(startTimeInput.value).toBe("10:00 AM"));
      expect(endTimeInput.value).toBe("02:00 PM");
      expect(clockBadgeToggle.checked).toBe(true);

      fireEvent.click(within(dialog).getByRole("button", { name: "Standby" }));

      expect(clockBadgeToggle.checked).toBe(false);
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

      vi.mocked(createScheduleShift).mockClear();
      fireEvent.click(screen.getByRole("button", { name: /Settings/ }));
      fireEvent.click(
        screen.getByRole("menuitemradio", { name: "Job/Position" }),
      );
      fireEvent.pointerDown(document.body);
      fireEvent.click(
        await screen.findByRole("button", { name: "Standby-Server" }),
      );
      const presetDialog = await screen.findByRole("dialog", {
        name: "Add shift",
      });
      expect(
        (
          within(presetDialog).getByRole("checkbox", {
            name: "Use these times for scheduling",
          }) as HTMLInputElement
        ).checked,
      ).toBe(false);
      expect(createScheduleShift).not.toHaveBeenCalled();
      fireEvent.click(
        within(presetDialog).getByRole("button", { name: "Add shift" }),
      );
      await waitFor(() => expect(createScheduleShift).toHaveBeenCalledTimes(1));
      expect(vi.mocked(createScheduleShift).mock.calls[0]?.[2]).toEqual(
        expect.objectContaining({
          shift_type_id: standbyType.id,
          start_time: "00:00",
          end_time: "00:01",
          hide_time_on_badge: true,
        }),
      );
    } finally {
      readModelMock.mockResolvedValue(scheduleFixture);
    }
  });

  it("saves edited clock-off named shift types with reference fallback times", async () => {
    const standbyType = {
      ...scheduleFixture.shift_types[0]!,
      id: "44444444-4444-4444-8444-444444444449",
      name: "Standby",
      color: "#B45309",
      sort_order: 1,
      default_start_time: null,
      default_end_time: null,
    };
    const editorFixture = {
      ...scheduleFixtureForWeek("2026-09-18"),
      shift_types: [...scheduleFixture.shift_types, standbyType],
    } satisfies ScheduleReadModel;
    const readModelMock = vi.mocked(getScheduleReadModel);
    const acquireMock = vi.mocked(acquireScheduleEditSession);
    const updateMock = vi.mocked(updateScheduleShift);
    readModelMock.mockImplementation(async (_workspaceId, date) =>
      date === "2026-09-18" ? editorFixture : scheduleFixture,
    );
    acquireMock.mockResolvedValueOnce({
      status: "acquired",
      session: {
        id: "77777777-7777-4777-8777-777777777777",
        workspace_id: scheduleFixture.workspace_id,
        week_start: "2026-09-18",
        source_kind: "published",
        source_draft_id: null,
        source_revision: 1,
        holder_user_id: "88888888-8888-4888-8888-888888888888",
        holder_name: "Development Owner",
        revision: 1,
        dirty: false,
        last_heartbeat: "2026-08-17T12:00:00Z",
        expires_at: "2026-08-17T12:04:00Z",
        shifts: editorFixture.shifts.map((shift) => ({
          ...shift,
          unpaid_break_minutes: 30,
          revision: 1,
        })),
      },
    });
    updateMock.mockClear();
    updateMock.mockResolvedValueOnce({
      id: "77777777-7777-4777-8777-777777777777",
      workspace_id: scheduleFixture.workspace_id,
      week_start: "2026-09-18",
      source_kind: "published",
      source_draft_id: null,
      source_revision: 1,
      holder_user_id: "88888888-8888-4888-8888-888888888888",
      holder_name: "Development Owner",
      revision: 2,
      dirty: true,
      last_heartbeat: "2026-08-17T12:00:00Z",
      expires_at: "2026-08-17T12:04:00Z",
      shifts: [
        {
          ...scheduleFixture.shifts[0]!,
          scheduled_date: "2026-09-18",
          shift_type_id: standbyType.id,
          start_time: "00:00",
          end_time: "00:01",
          hide_time_on_badge: true,
          revision: 2,
        },
      ],
    });
    try {
      window.history.pushState({}, "", "/app/schedule?date=2026-09-18");
      const { container } = render(<App />);
      fireEvent.change(
        await screen.findByRole("combobox", { name: "Workspace role" }),
        { target: { value: "owner" } },
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Use development identity" }),
      );
      await openPublishedScheduleEditor();
      const shiftBadge = await waitFor(() => {
        const badge = container.querySelector<HTMLElement>(
          ".schedule-shift-badge",
        );
        expect(badge).toBeTruthy();
        return badge;
      });
      fireEvent.doubleClick(shiftBadge!);
      const dialog = await screen.findByRole("dialog", { name: "Edit shift" });

      fireEvent.click(within(dialog).getByRole("button", { name: "Standby" }));
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Update shift" }),
      );

      await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
      expect(updateMock.mock.calls[0]?.[4]).toEqual(
        expect.objectContaining({
          shift_type_id: standbyType.id,
          start_time: "00:00",
          end_time: "00:01",
          hide_time_on_badge: true,
        }),
      );
    } finally {
      readModelMock.mockResolvedValue(scheduleFixture);
    }
  });

  it("uses reference-style live shift unpublish and restore menu actions", async () => {
    const liveWeekStart = "2026-09-14";
    const liveShift = {
      ...scheduleFixture.shifts[0]!,
      scheduled_date: liveWeekStart,
      revision: 1,
      source_published_shift_id: scheduleFixture.shifts[0]!.id,
      pending_op_type: null,
      locked: true,
    };
    const stagedRemovedShift = {
      ...liveShift,
      revision: 2,
      pending_op_type: "delete" as const,
      locked: true,
    };
    const deleteMock = vi.mocked(deleteScheduleShift);
    const restoreMock = vi.mocked(restoreScheduleShift);
    deleteMock.mockClear();
    restoreMock.mockClear();
    vi.mocked(getScheduleReadModel).mockResolvedValueOnce({
      ...scheduleFixture,
      week_start: liveWeekStart,
      shifts: [liveShift],
    });
    deleteMock.mockResolvedValueOnce({
      id: "77777777-7777-4777-8777-777777777781",
      workspace_id: scheduleFixture.workspace_id,
      week_start: liveWeekStart,
      source_kind: "published",
      source_draft_id: null,
      source_revision: 1,
      holder_user_id: "88888888-8888-4888-8888-888888888888",
      holder_name: "Development Owner",
      revision: 2,
      dirty: true,
      last_heartbeat: "2026-08-17T12:00:00Z",
      expires_at: "2026-08-17T12:04:00Z",
      shifts: [stagedRemovedShift],
    });
    restoreMock.mockResolvedValueOnce({
      id: "77777777-7777-4777-8777-777777777781",
      workspace_id: scheduleFixture.workspace_id,
      week_start: liveWeekStart,
      source_kind: "published",
      source_draft_id: null,
      source_revision: 1,
      holder_user_id: "88888888-8888-4888-8888-888888888888",
      holder_name: "Development Owner",
      revision: 3,
      dirty: true,
      last_heartbeat: "2026-08-17T12:00:00Z",
      expires_at: "2026-08-17T12:04:00Z",
      shifts: [{ ...liveShift, revision: 3 }],
    });
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({
      status: "acquired",
      session: {
        id: "77777777-7777-4777-8777-777777777781",
        workspace_id: scheduleFixture.workspace_id,
        week_start: liveWeekStart,
        source_kind: "published",
        source_draft_id: null,
        source_revision: 1,
        holder_user_id: "88888888-8888-4888-8888-888888888888",
        holder_name: "Development Owner",
        revision: 1,
        dirty: false,
        last_heartbeat: "2026-08-17T12:00:00Z",
        expires_at: "2026-08-17T12:04:00Z",
        shifts: [liveShift],
      },
    });

    window.history.pushState({}, "", `/app/schedule?date=${liveWeekStart}`);
    window.localStorage.setItem("newfork.development.workspaceRole", "owner");
    const { container } = render(<App />);
    await openPublishedScheduleEditor();
    expect(await screen.findByRole("button", { name: "Discard" })).toBeTruthy();

    const liveBadge = await waitFor(() => {
      const badge = container.querySelector<HTMLElement>(
        ".schedule-shift-badge",
      );
      if (!badge) throw new Error("Expected live shift badge");
      expect(badge.getAttribute("data-publication-state")).toBe("locked");
      return badge;
    });
    expect(
      within(liveBadge).getByLabelText("Live - published to employees"),
    ).toBeTruthy();
    fireEvent.contextMenu(liveBadge, { clientX: 44, clientY: 48 });
    expect(screen.queryByRole("menuitem", { name: "Delete shift" })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Unpublish shift" }));
    await waitFor(() => expect(deleteMock).toHaveBeenCalledTimes(1));

    const stagedBadge = await waitFor(() => {
      const badge = container.querySelector<HTMLElement>(
        ".schedule-shift-badge",
      );
      if (!badge) throw new Error("Expected staged removed shift badge");
      expect(badge.getAttribute("data-publication-state")).toBe(
        "staged-removed",
      );
      return badge;
    });
    expect(
      within(stagedBadge).getByLabelText("Staged for removal"),
    ).toBeTruthy();
    fireEvent.contextMenu(stagedBadge, { clientX: 54, clientY: 58 });
    expect(screen.queryByRole("menuitem", { name: "Edit shift" })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Restore shift" }));
    await waitFor(() => expect(restoreMock).toHaveBeenCalledTimes(1));

    await waitFor(() =>
      expect(
        container
          .querySelector<HTMLElement>(".schedule-shift-badge")
          ?.getAttribute("data-publication-state"),
      ).toBe("locked"),
    );
    expect(await screen.findByText("Shift restored")).toBeTruthy();
  });

  it("keeps the shift quick editor open while scrolling its long form", async () => {
    window.history.pushState({}, "", "/app/schedule?date=2026-08-31");
    const { container } = render(<App />);
    const app = within(container);
    fireEvent.change(
      await app.findByRole("combobox", { name: "Workspace role" }),
      {
        target: { value: "owner" },
      },
    );
    fireEvent.click(
      app.getByRole("button", { name: "Use development identity" }),
    );
    await openPublishedScheduleEditor(app);
    expect(await app.findByRole("button", { name: "Discard" })).toBeTruthy();

    const shiftBadge = container.querySelector(".schedule-shift-badge");
    expect(shiftBadge).toBeTruthy();
    fireEvent.doubleClick(shiftBadge!);
    const dialog = await app.findByRole("dialog", { name: "Edit shift" });

    fireEvent.scroll(dialog);

    expect(app.getByRole("dialog", { name: "Edit shift" })).toBeTruthy();
  });

  it("dismisses schedule topbar menus and active filters one blank click at a time", async () => {
    window.history.pushState(
      {},
      "",
      `/app/schedule?date=2026-08-17&view=day&hideUnscheduled=true&locations=${scheduleFixture.locations[0]!.id}&shiftTypes=${scheduleFixture.shift_types[0]!.id}&jobs=${scheduleFixture.jobs[0]!.id}&employees=${scheduleFixture.employees[0]!.id}`,
    );
    window.localStorage.setItem("newfork.development.workspaceRole", "owner");
    const { container } = render(<App />);
    const app = within(container);
    await app.findByRole(
      "grid",
      { name: "Daily published schedule" },
      { timeout: 5000 },
    );
    const page = container.querySelector(".schedule-page");
    expect(page).toBeTruthy();

    fireEvent.click(app.getByRole("button", { name: /Settings/ }));
    expect(await app.findByText("Shift Badge Settings")).toBeTruthy();
    fireEvent.pointerDown(page!);
    await waitFor(() =>
      expect(app.queryByText("Shift Badge Settings")).toBeNull(),
    );
    expect(window.location.search).toContain("hideUnscheduled=true");

    fireEvent.pointerDown(page!);
    await waitFor(() =>
      expect(window.location.search).not.toContain("hideUnscheduled=true"),
    );
    expect(window.location.search).toContain("shiftTypes=");

    fireEvent.pointerDown(page!);
    await waitFor(() =>
      expect(window.location.search).not.toContain("shiftTypes="),
    );
    expect(window.location.search).not.toContain("jobs=");
    expect(window.location.search).not.toContain("employees=");
    expect(window.location.search).toContain("locations=");

    fireEvent.pointerDown(page!);
    await waitFor(() =>
      expect(window.location.search).not.toContain("locations="),
    );
    expect(window.location.search).toContain("view=day");

    fireEvent.pointerDown(page!);
    await waitFor(() => expect(window.location.search).toContain("view=week"));
  });

  it("uses the schedule edit banner blank area to dismiss active layers in order", async () => {
    const workingFixture = scheduleFixtureForWeek("2026-09-07");
    vi.mocked(getScheduleReadModel)
      .mockResolvedValueOnce(workingFixture)
      .mockResolvedValue(workingFixture);
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({
      ...makeDefaultEditAcquireResult(),
      session: {
        ...makeDefaultEditAcquireResult().session,
        week_start: workingFixture.week_start,
        shifts: workingFixture.shifts.map((shift) => ({
          ...shift,
          unpaid_break_minutes: 30,
          revision: 1,
        })),
      },
    });
    window.history.pushState({}, "", "/app/schedule?date=2026-09-07&view=day");
    window.localStorage.setItem("newfork.development.workspaceRole", "owner");
    const { container } = render(<App />);
    const app = within(container);

    await openPublishedScheduleEditor(app);
    expect(await app.findByRole("button", { name: "Discard" })).toBeTruthy();
    const editBanner = container.querySelector<HTMLElement>(
      ".schedule-edit-banner",
    );
    expect(editBanner).toBeTruthy();

    fireEvent.click(app.getByRole("button", { name: /Settings/ }));
    expect(await app.findByText("Shift Badge Settings")).toBeTruthy();
    fireEvent.pointerDown(editBanner!);
    await waitFor(() =>
      expect(app.queryByText("Shift Badge Settings")).toBeNull(),
    );
    expect(window.location.search).toContain("view=day");

    fireEvent.click(app.getByRole("button", { name: "Hide Unscheduled" }));
    expect(
      new URLSearchParams(window.location.search).get("hideUnscheduled"),
    ).toBe("true");
    fireEvent.pointerDown(editBanner!);
    expect(window.location.search).not.toContain("hideUnscheduled=true");
    expect(window.location.search).toContain("view=day");

    fireEvent.pointerDown(editBanner!);
    expect(window.location.search).toContain("view=week");
  }, 20000);

  it("blocks paste before opening the drawer when the target employee is unavailable", async () => {
    const unavailableFixture = {
      ...scheduleFixture,
      employees: [
        {
          ...scheduleFixture.employees[0]!,
          availability: [
            { day: 0, mode: "unrestricted" as const, windows: [] },
            { day: 1, mode: "unrestricted" as const, windows: [] },
            { day: 2, mode: "unavailable" as const, windows: [] },
            { day: 3, mode: "unrestricted" as const, windows: [] },
            { day: 4, mode: "unrestricted" as const, windows: [] },
            { day: 5, mode: "unrestricted" as const, windows: [] },
            { day: 6, mode: "unrestricted" as const, windows: [] },
          ],
        },
      ],
    } satisfies ScheduleReadModel;
    vi.mocked(getScheduleReadModel).mockResolvedValueOnce(unavailableFixture);
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({
      status: "acquired",
      session: {
        id: "77777777-7777-4777-8777-777777777785",
        workspace_id: scheduleFixture.workspace_id,
        week_start: scheduleFixture.week_start,
        source_kind: "published",
        source_draft_id: null,
        source_revision: 1,
        holder_user_id: "88888888-8888-4888-8888-888888888888",
        holder_name: "Development Owner",
        revision: 1,
        dirty: false,
        last_heartbeat: "2026-08-17T12:00:00Z",
        expires_at: "2026-08-17T12:04:00Z",
        shifts: unavailableFixture.shifts.map((shift) => ({
          ...shift,
          revision: 1,
        })),
      },
    });

    window.history.pushState({}, "", "/app/schedule?date=2026-08-25");
    const { container } = render(<App />);
    fireEvent.change(
      await screen.findByRole("combobox", { name: "Workspace role" }),
      {
        target: { value: "owner" },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Use development identity" }),
    );
    await openPublishedScheduleEditor();

    const shiftBadge = await waitFor(() => {
      const badge = container.querySelector<HTMLElement>(
        ".schedule-shift-badge",
      );
      expect(badge).toBeTruthy();
      return badge;
    });
    fireEvent.contextMenu(shiftBadge!, { clientX: 36, clientY: 48 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy shift" }));
    expect(await screen.findByText("Shift copied")).toBeTruthy();

    const unavailableCell = container.querySelector<HTMLElement>(
      `[data-drop-cell="true"][data-employee-id="${scheduleFixture.employees[0]!.id}"][data-location-id="${scheduleFixture.locations[0]!.id}"][data-date="2026-08-18"]`,
    );
    expect(unavailableCell).toBeTruthy();
    fireEvent.click(unavailableCell!, { clientX: 80, clientY: 96 });

    expect(
      await screen.findByRole("dialog", { name: "Shift conflict" }),
    ).toBeTruthy();
    expect(
      screen.getAllByText(/Alex Rivera is unavailable all day on 2026-08-18/),
    ).toHaveLength(2);
    expect(screen.queryByRole("dialog", { name: "Paste shift" })).toBeNull();
    expect(screen.getByRole("status", { name: "Paste status" })).toHaveProperty(
      "textContent",
      "Alex Rivera is unavailable all day on 2026-08-18. Requested: Dinner / Server at Main Dining.",
    );
  });

  it("shows the reference-style stale quick editor state after edit conflicts", async () => {
    const updateMock = vi.mocked(updateScheduleShift);
    updateMock.mockClear();
    updateMock.mockRejectedValueOnce(new Error("stale shift revision"));
    window.history.pushState({}, "", "/app/schedule?date=2026-08-30");
    const { container } = render(<App />);
    const app = within(container);
    fireEvent.change(
      await app.findByRole("combobox", { name: "Workspace role" }),
      {
        target: { value: "owner" },
      },
    );
    fireEvent.click(
      app.getByRole("button", { name: "Use development identity" }),
    );
    await openPublishedScheduleEditor(app);
    expect(await app.findByRole("button", { name: "Discard" })).toBeTruthy();

    const shiftBadge = container.querySelector(".schedule-shift-badge");
    expect(shiftBadge).toBeTruthy();
    fireEvent.keyDown(shiftBadge!, { key: "Enter" });
    const dialog = await app.findByRole("dialog", { name: "Edit shift" });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Update shift" }),
    );

    expect(await app.findByText("Shift changed")).toBeTruthy();
    expect(
      app.getByText(/This shift was changed by someone else/),
    ).toBeTruthy();
    expect(app.getByRole("button", { name: "Close & reload" })).toBeTruthy();
  });

  it("creates multiple unassigned shifts from the reference-style quick editor count stepper", async () => {
    const createMock = vi.mocked(createScheduleShift);
    createMock.mockClear();
    const unassignedShift = {
      ...scheduleFixture.shifts[0]!,
      id: "77777777-7777-4777-8777-777777777781",
      employee_id: null,
      scheduled_date: "2026-08-18",
    };
    const hostJob = {
      ...scheduleFixture.jobs[0]!,
      id: "33333333-3333-4333-8333-333333333334",
      name: "Host",
      sort_order: 1,
    };
    const hostEmployee = {
      ...scheduleFixture.employees[0]!,
      id: "55555555-5555-4555-8555-555555555557",
      employee_code: "NF-003",
      display_name: "Bailey Chen",
      job_ids: [hostJob.id],
    };
    const quickEditorModel = {
      ...scheduleFixture,
      jobs: [...scheduleFixture.jobs, hostJob],
      employees: [...scheduleFixture.employees, hostEmployee],
      shifts: [...scheduleFixture.shifts, unassignedShift],
    };
    const readModelMock = vi.mocked(getScheduleReadModel);
    readModelMock.mockReset();
    readModelMock.mockImplementation((_, date) =>
      Promise.resolve(
        date === "2026-08-29" ? quickEditorModel : scheduleFixture,
      ),
    );
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({
      status: "acquired",
      session: {
        id: "77777777-7777-4777-8777-777777777782",
        workspace_id: scheduleFixture.workspace_id,
        week_start: scheduleFixture.week_start,
        source_kind: "published",
        source_draft_id: null,
        source_revision: 1,
        holder_user_id: "88888888-8888-4888-8888-888888888888",
        holder_name: "Development Owner",
        revision: 1,
        dirty: false,
        last_heartbeat: "2026-08-17T12:00:00Z",
        expires_at: "2026-08-17T12:04:00Z",
        shifts: quickEditorModel.shifts.map((shift) => ({
          ...shift,
          revision: 1,
        })),
      },
    });
    for (const revision of [2, 3, 4]) {
      createMock.mockResolvedValueOnce({
        id: "77777777-7777-4777-8777-777777777782",
        workspace_id: scheduleFixture.workspace_id,
        week_start: scheduleFixture.week_start,
        source_kind: "published",
        source_draft_id: null,
        source_revision: 1,
        holder_user_id: "88888888-8888-4888-8888-888888888888",
        holder_name: "Development Owner",
        revision,
        dirty: true,
        last_heartbeat: "2026-08-17T12:00:00Z",
        expires_at: "2026-08-17T12:04:00Z",
        shifts: quickEditorModel.shifts.map((shift) => ({
          ...shift,
          revision,
        })),
      });
    }

    window.history.pushState({}, "", "/app/schedule?date=2026-08-29");
    const { container } = render(<App />);
    const app = within(container);
    fireEvent.change(
      await app.findByRole("combobox", { name: "Workspace role" }),
      {
        target: { value: "owner" },
      },
    );
    fireEvent.click(
      app.getByRole("button", { name: "Use development identity" }),
    );
    await openPublishedScheduleEditor(app);
    expect(await app.findByRole("button", { name: "Discard" })).toBeTruthy();
    fireEvent.click(
      app.getByRole("button", {
        name: "Add shift for unassigned at Main Dining on 2026-08-17",
      }),
    );
    const dialog = await app.findByRole("dialog", { name: "Add shift" });
    const employeeSelect = within(dialog).getByRole("combobox", {
      name: "Employee",
    });
    expect(employeeSelect).toHaveProperty(
      "textContent",
      expect.stringContaining("Unassigned"),
    );
    fireEvent.click(employeeSelect);
    expect(
      within(dialog).queryByRole("option", { name: "Alex Rivera" }),
    ).toBeNull();
    fireEvent.click(within(dialog).getByRole("option", { name: "Unassigned" }));
    fireEvent.click(within(dialog).getByRole("combobox", { name: "Job" }));
    fireEvent.click(within(dialog).getByRole("option", { name: "Host" }));
    await waitFor(() =>
      expect(
        within(dialog).getByRole("combobox", { name: "Job" }),
      ).toHaveProperty("textContent", expect.stringContaining("Host")),
    );
    expect(
      within(dialog).getByRole("combobox", { name: "Employee" }),
    ).toHaveProperty("textContent", expect.stringContaining("Unassigned"));
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Increase count" }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Increase count" }),
    );
    expect(
      within(dialog).getByRole("textbox", { name: "Shift count" }),
    ).toHaveProperty("value", "3");
    expect(
      within(dialog).getByRole("combobox", { name: "Employee" }),
    ).toHaveProperty("disabled", true);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Add 3 shifts" }),
    );

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(3));
    expect(createMock.mock.calls.map((call) => call[1].revision)).toEqual([
      1, 2, 3,
    ]);
    expect(createMock.mock.calls[0]?.[2]).toMatchObject({
      employee_id: null,
      scheduled_date: "2026-08-17",
      unpaid_break_minutes: 30,
    });
    readModelMock.mockResolvedValue(scheduleFixture);
  });

  it("keeps reference-style multi-select controls for shift badges", async () => {
    const secondShift = {
      ...scheduleFixture.shifts[0]!,
      id: "77777777-7777-4777-8777-777777777779",
      scheduled_date: "2026-08-18",
      start_time: "10:00",
      end_time: "14:00",
    };
    vi.mocked(getScheduleReadModel).mockResolvedValueOnce({
      ...scheduleFixture,
      shifts: [...scheduleFixture.shifts, secondShift],
    });
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({
      status: "acquired",
      session: {
        id: "77777777-7777-4777-8777-777777777780",
        workspace_id: scheduleFixture.workspace_id,
        week_start: scheduleFixture.week_start,
        source_kind: "published",
        source_draft_id: null,
        source_revision: 1,
        holder_user_id: "88888888-8888-4888-8888-888888888888",
        holder_name: "Development Owner",
        revision: 1,
        dirty: false,
        last_heartbeat: "2026-08-17T12:00:00Z",
        expires_at: "2026-08-17T12:04:00Z",
        shifts: [...scheduleFixture.shifts, secondShift].map((shift) => ({
          ...shift,
          revision: 1,
        })),
      },
    });
    window.history.pushState({}, "", "/app/schedule?date=2026-08-25");
    const { container } = render(<App />);
    fireEvent.change(
      await screen.findByRole("combobox", { name: "Workspace role" }),
      {
        target: { value: "owner" },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Use development identity" }),
    );
    await openPublishedScheduleEditor();
    expect(await screen.findByRole("button", { name: "Discard" })).toBeTruthy();

    const badges = container.querySelectorAll("button.schedule-shift-badge");
    expect(badges).toHaveLength(2);
    expect(
      screen.getAllByRole("button", { name: /Server, .* - .*/ }),
    ).toHaveLength(2);
    fireEvent.click(badges[0]!);
    expect(screen.queryByRole("dialog", { name: "Edit shift" })).toBeNull();
    await waitFor(() =>
      expect(badges[0]?.getAttribute("data-focused")).toBe("true"),
    );
    expect(badges[0]?.getAttribute("aria-pressed")).toBe("false");
    expect(window.location.search).toContain(
      `shiftTypes=${scheduleFixture.shift_types[0]!.id}`,
    );
    expect(window.location.search).toContain(
      `jobs=${scheduleFixture.jobs[0]!.id}`,
    );
    const schedulePage = container.querySelector<HTMLElement>(".schedule-page");
    expect(schedulePage).toBeTruthy();
    fireEvent.keyDown(schedulePage!, { key: "a", ctrlKey: true });
    expect(screen.getByRole("button", { name: "Delete 2" })).toBeTruthy();
    fireEvent.pointerDown(schedulePage!);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Delete 2" })).toBeNull(),
    );
    expect(window.location.search).not.toContain("shiftTypes=");
    expect(window.location.search).not.toContain("jobs=");

    fireEvent.keyDown(schedulePage!, { key: "a", ctrlKey: true });
    expect(screen.getByRole("button", { name: "Delete 2" })).toBeTruthy();
    expect(badges[0]?.getAttribute("data-selected")).toBe("true");
    expect(badges[1]?.getAttribute("data-selected")).toBe("true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("button", { name: "Delete 2" })).toBeNull();

    const currentBadges = container.querySelectorAll(
      "button.schedule-shift-badge",
    );
    expect(currentBadges).toHaveLength(2);
    await act(async () => {
      fireEvent.mouseDown(currentBadges[0]!, { ctrlKey: true });
      fireEvent.click(currentBadges[0]!, { ctrlKey: true });
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Delete 1" })).toBeTruthy(),
    );
    const refreshedBadges = container.querySelectorAll(
      "button.schedule-shift-badge",
    );
    expect(refreshedBadges).toHaveLength(2);
    await act(async () => {
      fireEvent.mouseDown(refreshedBadges[1]!, { ctrlKey: true });
      fireEvent.click(refreshedBadges[1]!, { ctrlKey: true });
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Delete 2" })).toBeTruthy(),
    );
    const selectedBadges = container.querySelectorAll(
      "button.schedule-shift-badge",
    );
    expect(selectedBadges[0]?.getAttribute("data-selected")).toBe("true");
    expect(selectedBadges[1]?.getAttribute("data-selected")).toBe("true");
    expect(selectedBadges[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(selectedBadges[1]?.getAttribute("aria-pressed")).toBe("true");
    expect(
      container.querySelectorAll("[data-shift-selection-ring='true']"),
    ).toHaveLength(2);
    fireEvent.keyDown(selectedBadges[1]!, { key: "c", ctrlKey: true });
    expect(await screen.findByText("2 shifts copied")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Paste mode on" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.keyDown(window, { key: "v", ctrlKey: true });
    expect(
      screen
        .getByRole("button", { name: "Paste mode off" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    const editableBadges = container.querySelectorAll(
      "button.schedule-shift-badge",
    );
    expect(editableBadges).toHaveLength(2);
    await act(async () => {
      fireEvent.doubleClick(editableBadges[0]!);
      await Promise.resolve();
    });
    expect(
      await screen.findByRole("dialog", { name: "Edit shift" }),
    ).toBeTruthy();
    fireEvent.pointerDown(screen.getByRole("textbox", { name: "Start time" }));
    expect(screen.getByRole("button", { name: "Delete 2" })).toBeTruthy();
  }, 15_000);

  it("moves shifts with the reference-style pointer drag interaction", async () => {
    const updateMock = vi.mocked(updateScheduleShift);
    const createMock = vi.mocked(createScheduleShift);
    updateMock.mockClear();
    createMock.mockClear();
    updateMock.mockImplementation(
      async (_workspaceId, currentSession, shiftId, _revision, input) => ({
        ...currentSession,
        dirty: true,
        revision: currentSession.revision + 1,
        shifts: currentSession.shifts.map((shift) =>
          shift.id === shiftId
            ? { ...shift, ...input, revision: shift.revision + 1 }
            : shift,
        ),
      }),
    );
    createMock.mockImplementation(
      async (_workspaceId, currentSession, input) => ({
        ...currentSession,
        dirty: true,
        revision: currentSession.revision + 1,
        shifts: [
          ...currentSession.shifts,
          {
            ...currentSession.shifts[0]!,
            ...input,
            id: "66666666-6666-4666-8666-666666666668",
            revision: 1,
            warning_codes: [],
          },
        ],
      }),
    );
    window.history.pushState({}, "", "/app/schedule?date=2026-08-26");
    const { container } = render(<App />);
    fireEvent.change(
      await screen.findByRole("combobox", { name: "Workspace role" }),
      {
        target: { value: "owner" },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Use development identity" }),
    );
    await openPublishedScheduleEditor();
    expect(await screen.findByRole("button", { name: "Discard" })).toBeTruthy();

    const shiftBadge = container.querySelector(".schedule-shift-badge");
    expect(
      container.querySelector(
        `[data-schedule-employee-row="${scheduleFixture.employees[0]!.id}"]`,
      ),
    ).toBeTruthy();
    const targetCell = container.querySelector(
      '.schedule-cell[data-date="2026-08-18"]',
    );
    expect(shiftBadge).toBeTruthy();
    expect(targetCell).toBeTruthy();
    const originalElementFromPoint = document.elementFromPoint;
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => targetCell as Element),
    });
    const dispatchPointer = (
      target: Window | Document | Node | Element,
      type: string,
      init: {
        readonly clientX: number;
        readonly clientY: number;
        readonly pointerId: number;
        readonly button?: number;
        readonly ctrlKey?: boolean;
        readonly metaKey?: boolean;
      },
    ) => {
      const eventInit = {
        button: init.button ?? 0,
        buttons: type === "pointerup" || type === "mouseup" ? 0 : 1,
        clientX: init.clientX,
        clientY: init.clientY,
        pointerId: init.pointerId,
        pointerType: "mouse",
        isPrimary: true,
        ctrlKey: init.ctrlKey ?? false,
        metaKey: init.metaKey ?? false,
      };
      if (type === "mousedown") {
        fireEvent.mouseDown(target, eventInit);
        return;
      }
      if (type === "mousemove") {
        fireEvent.mouseMove(target, eventInit);
        return;
      }
      if (type === "mouseup") {
        fireEvent.mouseUp(target, eventInit);
        return;
      }
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        button: { value: eventInit.button },
        buttons: { value: eventInit.buttons },
        clientX: { value: eventInit.clientX },
        clientY: { value: eventInit.clientY },
        pointerId: { value: eventInit.pointerId },
        pointerType: { value: eventInit.pointerType },
        isPrimary: { value: eventInit.isPrimary },
        ctrlKey: { value: eventInit.ctrlKey },
        metaKey: { value: eventInit.metaKey },
      });
      fireEvent(target, event);
    };

    const draggableShiftBadge = container.querySelector<HTMLElement>(
      ".schedule-shift-badge[data-shift-badge='true']",
    );
    expect(draggableShiftBadge).toBeTruthy();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    await act(async () => {
      dispatchPointer(draggableShiftBadge!, "mousedown", {
        button: 0,
        clientX: 20,
        clientY: 20,
        pointerId: 1,
      });
      await Promise.resolve();
    });
    await act(async () => {
      dispatchPointer(document, "mousemove", {
        clientX: 96,
        clientY: 96,
        pointerId: 1,
      });
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
    });
    await waitFor(() => {
      expect(
        container.querySelector(".schedule-shift-drag-preview"),
      ).toBeTruthy();
      expect(targetCell?.getAttribute("data-drop-status")).toBe("allowed");
    });
    await act(async () => {
      dispatchPointer(document, "mouseup", {
        clientX: 96,
        clientY: 96,
        pointerId: 1,
      });
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
    });

    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    expect(updateMock.mock.calls.at(-1)?.[4]).toMatchObject({
      scheduled_date: "2026-08-18",
    });
    await act(async () => {
      fireEvent.keyDown(window, { key: "z", ctrlKey: true });
      await Promise.resolve();
    });
    expect(await screen.findByText("Last edit undone")).toBeTruthy();

    const copyShiftBadge = await waitFor(() => {
      const badge = container.querySelector<HTMLElement>(
        ".schedule-shift-badge[data-shift-badge='true']",
      );
      expect(badge).toBeTruthy();
      return badge;
    });
    await act(async () => {
      dispatchPointer(copyShiftBadge!, "mousedown", {
        button: 0,
        clientX: 20,
        clientY: 20,
        pointerId: 8,
      });
      await Promise.resolve();
    });
    await act(async () => {
      dispatchPointer(document, "mousemove", {
        clientX: 112,
        clientY: 112,
        pointerId: 8,
        ctrlKey: true,
      });
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
    });
    await waitFor(() => {
      const preview = container.querySelector(".schedule-shift-drag-preview");
      expect(preview).toBeTruthy();
      expect(preview?.getAttribute("data-copy")).toBe("true");
      expect(screen.getByText("+ Copy")).toBeTruthy();
    });
    await act(async () => {
      dispatchPointer(document, "mouseup", {
        clientX: 112,
        clientY: 112,
        pointerId: 8,
        ctrlKey: true,
      });
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
    });

    await waitFor(() => expect(createMock).toHaveBeenCalled());
    expect(createMock.mock.calls.at(-1)?.[2]).toMatchObject({
      scheduled_date: "2026-08-18",
    });
    await waitFor(() =>
      expect(
        container.querySelectorAll(
          ".schedule-shift-badge[data-shift-badge='true']",
        ),
      ).toHaveLength(2),
    );
    await act(async () => {
      fireEvent.keyDown(window, { key: "z", ctrlKey: true });
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(
        container.querySelectorAll(
          ".schedule-shift-badge[data-shift-badge='true']",
        ),
      ).toHaveLength(1),
    );
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: originalElementFromPoint,
    });
  });

  it("toggles the unassigned shifts row without hiding scheduled employees", async () => {
    const unassignedModel = {
      ...scheduleFixture,
      employees: [
        ...scheduleFixture.employees,
        {
          ...scheduleFixture.employees[0]!,
          id: "55555555-5555-4555-8555-555555555556",
          employee_code: "NF-002",
          display_name: "Bailey Chen",
        },
      ],
      shifts: [
        ...scheduleFixture.shifts,
        {
          ...scheduleFixture.shifts[0]!,
          id: "77777777-7777-4777-8777-777777777778",
          employee_id: null,
          scheduled_date: "2026-08-18",
        },
      ],
    };
    const readModelMock = vi.mocked(getScheduleReadModel);
    readModelMock.mockReset();
    readModelMock.mockImplementation((_, date) =>
      Promise.resolve(
        date === "2026-08-27" ? unassignedModel : scheduleFixture,
      ),
    );
    window.history.pushState({}, "", "/app/schedule?date=2026-08-27");
    window.localStorage.setItem("newfork.development.workspaceRole", "owner");
    const { container } = render(<App />);

    expect(await screen.findByText("Unassigned")).toBeTruthy();
    expect(
      container
        .querySelector(".schedule-employee-cell[data-unassigned='true']")
        ?.getAttribute("data-schedule-unassigned-label-mode"),
    ).toBe("centered");
    const viewOnlyBadge = container.querySelector<HTMLElement>(
      `.schedule-shift-badge[data-shift-id="${scheduleFixture.shifts[0]!.id}"]`,
    );
    expect(viewOnlyBadge).toBeTruthy();
    fireEvent.click(viewOnlyBadge!);
    expect(viewOnlyBadge!.getAttribute("data-focused")).toBe("true");
    expect(viewOnlyBadge!.getAttribute("aria-pressed")).toBe("false");
    expect(window.location.search).toContain(
      `shiftTypes=${scheduleFixture.shift_types[0]!.id}`,
    );
    expect(window.location.search).toContain(
      `jobs=${scheduleFixture.jobs[0]!.id}`,
    );
    fireEvent.click(viewOnlyBadge!);
    await waitFor(() =>
      expect(window.location.search).not.toContain("shiftTypes="),
    );
    expect(viewOnlyBadge!.getAttribute("data-focused")).toBe("false");
    expect(
      container.querySelector(
        ".schedule-employee-cell[data-unassigned='true'][data-unassigned-frozen='true']",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Settings/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Unfreeze Unassigned Shifts Row" }),
    );
    expect(
      container.querySelector(
        ".schedule-employee-cell[data-unassigned='true'][data-unassigned-frozen='true']",
      ),
    ).toBeNull();
    expect(screen.getAllByText("Alex Rivera").length).toBeGreaterThan(0);
    const employeeRowLabels = () =>
      Array.from(
        container.querySelectorAll(".schedule-employee-cell strong"),
        (item) => item.textContent,
      );
    expect(employeeRowLabels()).toContain("Bailey Chen");
    fireEvent.click(screen.getByRole("button", { name: "Hide Unscheduled" }));

    expect(await screen.findByText("Unassigned")).toBeTruthy();
    expect(employeeRowLabels()).not.toContain("Bailey Chen");
    expect(
      screen.getByRole("button", { name: "Show Unscheduled" }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Hide Unassigned Shifts Row" }),
    );

    expect(screen.queryByText("Unassigned")).toBeNull();
    expect(screen.getAllByText("Alex Rivera").length).toBeGreaterThan(0);
    readModelMock.mockResolvedValue(scheduleFixture);
  });

  it("opens an employee drawer without dismissing day view or active filters", async () => {
    const query = new URLSearchParams({
      date: "2026-08-17",
      view: "day",
      locations: scheduleFixture.locations[0]!.id,
      shiftTypes: scheduleFixture.shift_types[0]!.id,
      jobs: scheduleFixture.jobs[0]!.id,
      employees: scheduleFixture.employees[0]!.id,
      hideUnscheduled: "true",
      layout: "unified",
    });
    window.history.pushState({}, "", `/app/schedule?${query.toString()}`);
    window.localStorage.setItem("newfork.development.workspaceRole", "owner");
    const { container } = render(<App />);

    const trigger = await waitFor(() => {
      const candidate = container.querySelector<HTMLElement>(
        '[data-schedule-employee-card-trigger="true"]',
      );
      expect(candidate).toBeTruthy();
      return candidate;
    });
    expect(trigger).toBeTruthy();
    const searchBeforeClick = window.location.search;

    fireEvent.pointerDown(trigger!);
    fireEvent.click(trigger!);

    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(window.location.search).toBe(searchBeforeClick);
  });

  it("uses the reference-style unassigned row header mode for multiple open shifts", async () => {
    vi.mocked(getScheduleReadModel).mockResolvedValueOnce({
      ...scheduleFixture,
      shifts: [
        ...scheduleFixture.shifts,
        {
          ...scheduleFixture.shifts[0]!,
          id: "77777777-7777-4777-8777-777777777781",
          employee_id: null,
          scheduled_date: "2026-08-18",
        },
        {
          ...scheduleFixture.shifts[0]!,
          id: "77777777-7777-4777-8777-777777777782",
          employee_id: null,
          scheduled_date: "2026-08-19",
        },
      ],
    });
    window.history.pushState({}, "", "/app/schedule?date=2026-08-28");
    const { container } = render(<App />);
    fireEvent.change(
      await screen.findByRole("combobox", { name: "Workspace role" }),
      {
        target: { value: "owner" },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Use development identity" }),
    );

    expect(await screen.findByText("Unassigned")).toBeTruthy();
    const unassignedRow = container.querySelector(
      ".schedule-employee-cell[data-unassigned='true']",
    );
    expect(
      unassignedRow?.getAttribute("data-schedule-unassigned-label-mode"),
    ).toBe("header");
    expect(screen.getByText("2 open shifts")).toBeTruthy();
  });

  it("reviews soft publication findings and submits audited overrides", async () => {
    const draft = {
      id: "99999999-9999-4999-8999-999999999999",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      name: "Service week",
      revision: 2,
      created_by: "88888888-8888-4888-8888-888888888888",
      updated_by: "88888888-8888-4888-8888-888888888888",
      created_at: "2026-08-17T12:00:00Z",
      updated_at: "2026-08-17T12:00:00Z",
    };
    const publishEmployees = Array.from({ length: 15 }, (_, index) => ({
      ...scheduleFixture.employees[0]!,
      id: `55555555-5555-4555-8555-${String(600 + index).padStart(12, "0")}`,
      employee_code: `NF-${String(600 + index).padStart(3, "0")}`,
      display_name:
        index === 1
          ? "Bailey Notify"
          : `Notify ${String(index + 1).padStart(2, "0")}`,
    }));
    const affectedEmployeeIds = publishEmployees.map((employee) => employee.id);
    const readModelMock = vi.mocked(getScheduleReadModel);
    readModelMock.mockResolvedValue({
      ...scheduleFixtureForWeek("2026-10-19"),
      employees: publishEmployees,
    });
    vi.mocked(listScheduleDrafts).mockResolvedValue({ drafts: [draft] });
    vi.mocked(previewSchedulePublication).mockResolvedValueOnce({
      status: "override_required",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      draft_id: draft.id,
      draft_revision: draft.revision,
      fingerprint: "a".repeat(64),
      locations: [
        {
          location_id: scheduleFixture.locations[0]!.id,
          location_name: scheduleFixture.locations[0]!.name,
          active_publication_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          active_version: 1,
          current_shift_count: 1,
          next_shift_count: 1,
          added: 0,
          updated: 1,
          removed: 0,
          unchanged: 0,
          affected_employee_ids: affectedEmployeeIds,
        },
      ],
      findings: [
        {
          id: "closed-location-finding",
          code: "closed_location",
          severity: "soft",
          overrideable: true,
          message: "Main Dining is closed during this shift.",
          location_id: scheduleFixture.locations[0]!.id,
          employee_id: affectedEmployeeIds[0]!,
          scheduled_date: scheduleFixture.week_start,
          shift_ids: [scheduleFixture.shifts[0]!.id],
        },
      ],
    });
    vi.mocked(publishScheduleDraft).mockResolvedValueOnce({
      status: "published",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      draft_id: draft.id,
      draft_revision: draft.revision,
      location_ids: [scheduleFixture.locations[0]!.id],
      publication_ids: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
      published_shift_count: 1,
      notification_count: 0,
      notification_warning: {
        code: "notification_enqueue_unavailable",
        message:
          "Schedule published, but employee notifications could not be created.",
      },
      published_at: "2026-08-17T12:05:00Z",
    });

    window.history.pushState({}, "", "/app/schedule?date=2026-10-19");
    const { container } = render(<App />);
    fireEvent.change(
      await screen.findByRole("combobox", { name: "Workspace role" }),
      { target: { value: "owner" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Use development identity" }),
    );
    fireEvent.click(
      await screen.findByRole("link", { name: "Schedule" }, { timeout: 5000 }),
    );
    fireEvent.click(
      await screen.findByRole(
        "button",
        { name: "Published" },
        { timeout: 5000 },
      ),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Publish another draft" }),
    );
    expect(
      await screen.findByRole("dialog", {
        name: "Select locations to publish",
      }),
    ).toBeTruthy();
    expect(
      container.querySelector(
        ".schedule-publication-steps span[data-active='true']",
      )?.textContent,
    ).toContain("Locations");
    await clickReadyButton(screen, "Next");
    expect((await screen.findAllByText("1 blocker")).length).toBeGreaterThan(0);
    expect(
      container.querySelector(
        ".schedule-publication-steps span[data-active='true']",
      )?.textContent,
    ).toContain("Pre-flight");
    expect(
      screen.getAllByText(
        "Every override is recorded with the published audit trail.",
      ).length,
    ).toBeGreaterThan(0);
    expect(
      await screen.findByText("Blockers — override with a reason"),
    ).toBeTruthy();
    expect(screen.getByText("2026-08-17 · Main Dining")).toBeTruthy();
    const blockedOverrideButton = screen.getByRole("button", {
      name: "Override and continue",
    });
    expect(blockedOverrideButton).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByRole("textbox", { name: "Reason" }), {
      target: { value: "short" },
    });
    expect(screen.getByText("At least 10 characters.")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Reason" }), {
      target: { value: "Approved for a private service." },
    });
    await waitFor(() =>
      expect(blockedOverrideButton).toHaveProperty("disabled", false),
    );
    fireEvent.click(blockedOverrideButton);
    await waitFor(() =>
      expect(
        container.querySelector(
          ".schedule-publication-steps span[data-active='true']",
        )?.textContent,
      ).toContain("Notify"),
    );
    expect(
      screen.getByText("15 of 15 employees will be notified"),
    ).toBeTruthy();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Search employees" }),
      {
        target: { value: "Bailey" },
      },
    );
    const notifyList = container.querySelector<HTMLElement>(
      ".schedule-publish-notify-list",
    );
    expect(notifyList).toBeTruthy();
    expect(within(notifyList!).getByText("Bailey Notify")).toBeTruthy();
    expect(within(notifyList!).queryByText("Notify 15")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Publish 1 location" }));

    await waitFor(() =>
      expect(publishScheduleDraft).toHaveBeenCalledWith(
        scheduleFixture.workspace_id,
        expect.objectContaining({ fingerprint: "a".repeat(64) }),
        [
          {
            finding_id: "closed-location-finding",
            reason: "Approved for a private service.",
          },
        ],
        affectedEmployeeIds,
        {
          fingerprint: "a".repeat(64),
          decisions: [
            {
              finding_id: "closed-location-finding",
              reason: "Approved for a private service.",
            },
          ],
        },
        {},
      ),
    );
    expect(
      await screen.findByText("Published 1 locations · 1 changes"),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Schedule published, but employee notifications could not be created.",
      ),
    ).toBeTruthy();
    readModelMock.mockResolvedValue(scheduleFixture);
  });

  it("returns to the live schedule after publishing a draft preview", async () => {
    const draft = {
      id: "99999999-9999-4999-8999-999999999997",
      workspace_id: scheduleFixture.workspace_id,
      week_start: "2026-10-26",
      name: "Ready publish week",
      revision: 1,
      created_by: "88888888-8888-4888-8888-888888888888",
      updated_by: "88888888-8888-4888-8888-888888888888",
      created_at: "2026-08-17T12:00:00Z",
      updated_at: "2026-08-17T12:00:00Z",
    };
    const readModelMock = vi.mocked(getScheduleReadModel);
    const unpublishedFixture = {
      ...scheduleFixtureForWeek("2026-10-26"),
      locations: scheduleFixture.locations.map((location) => ({
        ...location,
        publication_status: "unpublished" as const,
      })),
    };
    readModelMock.mockResolvedValue(unpublishedFixture);
    vi.mocked(fetchSchedulePublicationStatus).mockResolvedValue({
      week_start: draft.week_start,
      week_end: "2026-11-01",
      week_start_day: "monday",
      schedule_deadline_day: "sunday",
      is_anchor_only: false,
      locations: [
        {
          id: scheduleFixture.locations[0]!.id,
          name: scheduleFixture.locations[0]!.name,
          color: "#2563EB",
          timezone: "America/Los_Angeles",
          status: "unpublished",
          reason: "missing_publication",
          publication_includes_location: false,
          published_shift_count: 0,
          worked_shift_count: 0,
          draft_shift_count: 0,
          published_at: null,
          published_by_name: null,
        },
      ],
    });
    vi.mocked(listScheduleDrafts).mockResolvedValue({ drafts: [draft] });
    vi.mocked(previewSchedulePublication).mockResolvedValueOnce({
      status: "publish_ready",
      workspace_id: scheduleFixture.workspace_id,
      week_start: draft.week_start,
      draft_id: draft.id,
      draft_revision: draft.revision,
      fingerprint: "c".repeat(64),
      locations: [
        {
          location_id: scheduleFixture.locations[0]!.id,
          location_name: scheduleFixture.locations[0]!.name,
          active_publication_id: null,
          active_version: null,
          current_shift_count: 0,
          next_shift_count: 0,
          added: 0,
          updated: 0,
          removed: 0,
          unchanged: 0,
          affected_employee_ids: [],
        },
      ],
      findings: [],
    });
    vi.mocked(publishScheduleDraft).mockResolvedValueOnce({
      status: "published",
      workspace_id: scheduleFixture.workspace_id,
      week_start: draft.week_start,
      draft_id: draft.id,
      draft_revision: draft.revision,
      location_ids: [scheduleFixture.locations[0]!.id],
      publication_ids: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc"],
      published_shift_count: 0,
      published_at: "2026-08-17T12:05:00Z",
      notification_count: 0,
    });

    window.history.pushState(
      {},
      "",
      `/app/schedule?date=2026-10-26&draft=${draft.id}`,
    );
    render(<App />);
    fireEvent.change(
      await screen.findByRole("combobox", { name: "Workspace role" }),
      { target: { value: "owner" } },
    );
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Use development identity" }),
      );
    });
    expect(
      await screen.findByRole(
        "button",
        { name: "Draft selector: Ready publish week" },
        { timeout: 5000 },
      ),
    ).toBeTruthy();
    expect(window.location.search).toContain(`draft=${draft.id}`);
    fireEvent.click(
      await screen.findByRole("button", { name: "Publish" }, { timeout: 5000 }),
    );
    const publishDialog = await screen.findByRole("dialog", {
      name: "Select locations to publish",
    });
    await clickReadyButton(within(publishDialog), "Next");
    await clickReadyButton(within(publishDialog), "Next");
    fireEvent.click(
      within(publishDialog).getByRole("button", { name: "Publish 1 location" }),
    );

    expect(
      await screen.findByText("Published 1 locations · 0 changes"),
    ).toBeTruthy();
    await waitFor(() => expect(window.location.search).not.toContain("draft="));
  }, 15_000);

  it("reopens the returned draft preview after unpublishing the live schedule", async () => {
    const weekStart = "2026-11-16";
    const draft = {
      id: "99999999-9999-4999-8999-999999999995",
      workspace_id: scheduleFixture.workspace_id,
      week_start: weekStart,
      name: "Plan A",
      revision: 2,
      created_by: "88888888-8888-4888-8888-888888888888",
      updated_by: "88888888-8888-4888-8888-888888888888",
      created_at: "2026-08-17T12:00:00Z",
      updated_at: "2026-08-17T12:00:00Z",
    };
    const liveFixture = scheduleFixtureForWeek(weekStart);
    const unpublishedFixture = {
      ...liveFixture,
      locations: liveFixture.locations.map((location) => ({
        ...location,
        publication_status: "unpublished" as const,
        published_at: null,
      })),
      shifts: [],
    };
    const draftShift = {
      ...scheduleFixture.shifts[0]!,
      id: "66666666-6666-4666-8666-666666666995",
      scheduled_date: weekStart,
      start_time: "10:00",
      end_time: "14:00",
      revision: 2,
    };
    const readModelMock = vi.mocked(getScheduleReadModel);
    readModelMock
      .mockResolvedValueOnce(liveFixture)
      .mockResolvedValue(unpublishedFixture);
    vi.mocked(listScheduleDrafts).mockResolvedValue({ drafts: [draft] });
    vi.mocked(fetchScheduleDraftShifts).mockResolvedValue({
      shifts: [draftShift],
    });
    vi.mocked(previewScheduleUnpublish).mockResolvedValueOnce({
      status: "unpublish_ready",
      workspace_id: scheduleFixture.workspace_id,
      week_start: weekStart,
      locations: [
        {
          location_id: scheduleFixture.locations[0]!.id,
          location_name: scheduleFixture.locations[0]!.name,
          publication_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          version: 1,
          shift_count: 1,
        },
      ],
      fingerprint: "f".repeat(64),
    });
    vi.mocked(unpublishSchedule).mockResolvedValueOnce({
      status: "unpublished",
      workspace_id: scheduleFixture.workspace_id,
      week_start: weekStart,
      location_ids: [scheduleFixture.locations[0]!.id],
      publication_ids: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
      kept_worked_count: 0,
      unpublished_at: "2026-08-17T12:05:00Z",
    });

    window.history.pushState({}, "", `/app/schedule?date=${weekStart}`);
    window.localStorage.setItem("newfork.development.workspaceRole", "owner");
    const { container } = render(<App />);

    fireEvent.click(
      await screen.findByRole(
        "button",
        { name: "Draft selector: New Schedule" },
        { timeout: 5000 },
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Unpublish schedule" }));
    const unpublishDialog = await screen.findByRole("dialog", {
      name: "Unpublish schedule",
    });
    fireEvent.click(within(unpublishDialog).getByLabelText(/Main Dining/));
    fireEvent.click(
      within(unpublishDialog).getByRole("button", {
        name: "Unpublish 1 locations",
      }),
    );

    await waitFor(() =>
      expect(unpublishSchedule).toHaveBeenCalledWith(
        scheduleFixture.workspace_id,
        expect.objectContaining({
          fingerprint: "f".repeat(64),
        }),
      ),
    );
    expect(
      await screen.findByText("Unpublished 1 locations · 0 worked shifts kept"),
    ).toBeTruthy();
    await waitFor(() =>
      expect(window.location.search).toContain(`draft=${draft.id}`),
    );
    expect(
      await screen.findByRole("button", { name: "Draft selector: Plan A" }),
    ).toBeTruthy();
    await waitFor(() =>
      expect(fetchScheduleDraftShifts).toHaveBeenCalledWith(
        scheduleFixture.workspace_id,
        weekStart,
        draft.id,
        [scheduleFixture.locations[0]!.id],
      ),
    );
    await waitFor(() =>
      expect(
        container.querySelector(".schedule-shift-badge")?.textContent,
      ).toContain("10:00 AM - 2:00 PM"),
    );
  }, 15_000);

  it("requires acknowledgement before publishing schedule risks", async () => {
    const draft = {
      id: "99999999-9999-4999-8999-999999999998",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      name: "Risk review week",
      revision: 3,
      created_by: "88888888-8888-4888-8888-888888888888",
      updated_by: "88888888-8888-4888-8888-888888888888",
      created_at: "2026-08-17T12:00:00Z",
      updated_at: "2026-08-17T12:00:00Z",
    };
    const readModelMock = vi.mocked(getScheduleReadModel);
    readModelMock.mockResolvedValue(scheduleFixtureForWeek("2026-10-26"));
    vi.mocked(listScheduleDrafts).mockResolvedValue({ drafts: [draft] });
    vi.mocked(previewSchedulePublication).mockResolvedValueOnce({
      status: "publish_ready",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      draft_id: draft.id,
      draft_revision: draft.revision,
      fingerprint: "b".repeat(64),
      locations: [
        {
          location_id: scheduleFixture.locations[0]!.id,
          location_name: scheduleFixture.locations[0]!.name,
          active_publication_id: null,
          active_version: null,
          current_shift_count: 0,
          next_shift_count: 1,
          added: 1,
          updated: 0,
          removed: 0,
          unchanged: 0,
          affected_employee_ids: [scheduleFixture.employees[0]!.id],
        },
      ],
      findings: [
        {
          id: "risk-advance-notice",
          code: "availability",
          severity: "soft",
          overrideable: true,
          message: "Alex Rivera has limited advance notice.",
          location_id: scheduleFixture.locations[0]!.id,
          employee_id: scheduleFixture.employees[0]!.id,
          scheduled_date: scheduleFixture.week_start,
          shift_ids: [scheduleFixture.shifts[0]!.id],
          tier: "risk",
          projected: true,
          fix_hint: "Confirm the employee can still cover the shift.",
        },
      ],
    } as unknown as Awaited<ReturnType<typeof previewSchedulePublication>>);
    vi.mocked(publishScheduleDraft).mockResolvedValueOnce({
      status: "published",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      draft_id: draft.id,
      draft_revision: draft.revision,
      location_ids: [scheduleFixture.locations[0]!.id],
      publication_ids: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc"],
      published_shift_count: 1,
      published_at: "2026-08-17T12:05:00Z",
    });

    window.history.pushState({}, "", "/app/schedule?date=2026-10-26");
    render(<App />);
    fireEvent.change(
      await screen.findByRole("combobox", { name: "Workspace role" }),
      { target: { value: "owner" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Use development identity" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Published" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Publish another draft" }),
    );
    await clickReadyButton(screen, "Next");

    expect(await screen.findByText("Risks")).toBeTruthy();
    expect(screen.getAllByText("1 risk").length).toBeGreaterThan(0);
    expect(screen.getByText("Projected")).toBeTruthy();
    expect(
      screen.getByText("Confirm the employee can still cover the shift."),
    ).toBeTruthy();
    const continueButton = screen.getByRole("button", {
      name: "Override and continue",
    });
    expect(continueButton).toHaveProperty("disabled", true);

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Publish with this risk." }),
    );

    expect(continueButton).toHaveProperty("disabled", false);
    fireEvent.click(continueButton);
    expect(screen.getByText("1 of 1 employees will be notified")).toBeTruthy();
    const publishButton = screen.getByRole("button", {
      name: "Publish 1 location",
    });
    expect(publishButton).toHaveProperty("disabled", false);
    fireEvent.click(publishButton);

    await waitFor(() =>
      expect(publishScheduleDraft).toHaveBeenCalledWith(
        scheduleFixture.workspace_id,
        expect.objectContaining({ fingerprint: "b".repeat(64) }),
        [],
        [scheduleFixture.employees[0]!.id],
        {
          fingerprint: "b".repeat(64),
          decisions: [],
        },
        {},
      ),
    );
    readModelMock.mockResolvedValue(scheduleFixture);
  }, 15_000);

  it("returns to preflight review when publish reports a stale preflight", async () => {
    const draft = {
      id: "99999999-9999-4999-8999-999999999997",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      name: "Stale preflight week",
      revision: 4,
      created_by: "88888888-8888-4888-8888-888888888888",
      updated_by: "88888888-8888-4888-8888-888888888888",
      created_at: "2026-08-17T12:00:00Z",
      updated_at: "2026-08-17T12:00:00Z",
    };
    const readModelMock = vi.mocked(getScheduleReadModel);
    readModelMock.mockResolvedValue(scheduleFixtureForWeek("2026-11-02"));
    vi.mocked(listScheduleDrafts).mockResolvedValue({ drafts: [draft] });
    vi.mocked(previewSchedulePublication).mockResolvedValueOnce({
      status: "publish_ready",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      draft_id: draft.id,
      draft_revision: draft.revision,
      fingerprint: "c".repeat(64),
      locations: [
        {
          location_id: scheduleFixture.locations[0]!.id,
          location_name: scheduleFixture.locations[0]!.name,
          active_publication_id: null,
          active_version: null,
          current_shift_count: 0,
          next_shift_count: 1,
          added: 1,
          updated: 0,
          removed: 0,
          unchanged: 0,
          affected_employee_ids: [scheduleFixture.employees[0]!.id],
        },
      ],
      findings: [],
    });
    const stalePreview = {
      status: "override_required" as const,
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      draft_id: draft.id,
      draft_revision: draft.revision,
      fingerprint: "d".repeat(64),
      locations: [
        {
          location_id: scheduleFixture.locations[0]!.id,
          location_name: scheduleFixture.locations[0]!.name,
          active_publication_id: null,
          active_version: null,
          current_shift_count: 0,
          next_shift_count: 1,
          added: 1,
          updated: 0,
          removed: 0,
          unchanged: 0,
          affected_employee_ids: [scheduleFixture.employees[0]!.id],
        },
      ],
      findings: [
        {
          id: "stale-availability-finding",
          code: "availability" as const,
          severity: "soft" as const,
          overrideable: true,
          message: "Alex Rivera is outside availability after a fresh check.",
          location_id: scheduleFixture.locations[0]!.id,
          employee_id: scheduleFixture.employees[0]!.id,
          scheduled_date: scheduleFixture.week_start,
          shift_ids: [scheduleFixture.shifts[0]!.id],
        },
      ],
    };
    vi.mocked(publishScheduleDraft)
      .mockRejectedValueOnce(
        new ScheduleRequestError("preflight review required", 409, {
          status: "preflight",
          preflight: stalePreview,
          preflight_block_reason: "stale_fingerprint",
        }),
      )
      .mockResolvedValueOnce({
        status: "published",
        workspace_id: scheduleFixture.workspace_id,
        week_start: scheduleFixture.week_start,
        draft_id: draft.id,
        draft_revision: draft.revision,
        location_ids: [scheduleFixture.locations[0]!.id],
        publication_ids: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbd"],
        published_shift_count: 1,
        published_at: "2026-08-17T12:05:00Z",
      });

    window.history.pushState({}, "", "/app/schedule?date=2026-11-02");
    const { container } = render(<App />);
    fireEvent.change(
      await screen.findByRole("combobox", { name: "Workspace role" }),
      { target: { value: "owner" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Use development identity" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Published" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Publish another draft" }),
    );
    await clickReadyButton(screen, "Next");
    await clickReadyButton(screen, "Next");
    await clickReadyButton(screen, "Publish 1 location");

    expect(
      await screen.findByText(
        "The schedule changed while this dialog was open. The findings below are refreshed — review them again.",
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        ".schedule-publication-steps span[data-active='true']",
      )?.textContent,
    ).toContain("Pre-flight");
    fireEvent.change(screen.getByRole("textbox", { name: "Reason" }), {
      target: { value: "Employee confirmed availability after recheck." },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Override and continue" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Publish 1 location" }));

    await waitFor(() =>
      expect(publishScheduleDraft).toHaveBeenLastCalledWith(
        scheduleFixture.workspace_id,
        expect.objectContaining({ fingerprint: "d".repeat(64) }),
        [
          {
            finding_id: "stale-availability-finding",
            reason: "Employee confirmed availability after recheck.",
          },
        ],
        [scheduleFixture.employees[0]!.id],
        {
          fingerprint: "d".repeat(64),
          decisions: [
            {
              finding_id: "stale-availability-finding",
              reason: "Employee confirmed availability after recheck.",
            },
          ],
        },
        {},
      ),
    );
    readModelMock.mockResolvedValue(scheduleFixture);
  });

  it("blocks publish review when publish reports schedule conflicts", async () => {
    const draft = {
      id: "99999999-9999-4999-8999-999999999996",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      name: "Conflict publish week",
      revision: 5,
      created_by: "88888888-8888-4888-8888-888888888888",
      updated_by: "88888888-8888-4888-8888-888888888888",
      created_at: "2026-08-17T12:00:00Z",
      updated_at: "2026-08-17T12:00:00Z",
    };
    const readModelMock = vi.mocked(getScheduleReadModel);
    readModelMock.mockResolvedValue(scheduleFixtureForWeek("2026-11-09"));
    vi.mocked(listScheduleDrafts).mockResolvedValue({ drafts: [draft] });
    vi.mocked(previewSchedulePublication).mockResolvedValueOnce({
      status: "publish_ready",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      draft_id: draft.id,
      draft_revision: draft.revision,
      fingerprint: "e".repeat(64),
      locations: [
        {
          location_id: scheduleFixture.locations[0]!.id,
          location_name: scheduleFixture.locations[0]!.name,
          active_publication_id: null,
          active_version: null,
          current_shift_count: 0,
          next_shift_count: 1,
          added: 1,
          updated: 0,
          removed: 0,
          unchanged: 0,
          affected_employee_ids: [scheduleFixture.employees[0]!.id],
        },
      ],
      findings: [],
    });
    vi.mocked(publishScheduleDraft).mockRejectedValueOnce(
      new ScheduleRequestError("schedule conflicts", 409, {
        status: "schedule_conflicts",
        schedule_conflicts: [
          {
            employee_id: scheduleFixture.employees[0]!.id,
            employee_name: scheduleFixture.employees[0]!.display_name,
            date: scheduleFixture.week_start,
            reason: "time_overlap",
            first: {
              shift_id: scheduleFixture.shifts[0]!.id,
              location_id: scheduleFixture.locations[0]!.id,
              location_name: scheduleFixture.locations[0]!.name,
              time_range: "4:00 PM - 7:00 PM",
              shift_type: "Dinner",
            },
            second: {
              shift_id: "66666666-6666-4666-8666-666666666667",
              location_id: scheduleFixture.locations[0]!.id,
              location_name: scheduleFixture.locations[0]!.name,
              time_range: "6:00 PM - 10:00 PM",
              shift_type: "Dinner",
            },
            introduced: true,
          },
        ],
      }),
    );

    window.history.pushState({}, "", "/app/schedule?date=2026-11-09");
    const { container } = render(<App />);
    fireEvent.change(
      await screen.findByRole("combobox", { name: "Workspace role" }),
      { target: { value: "owner" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Use development identity" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Published" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Publish another draft" }),
    );
    await clickReadyButton(screen, "Next");
    await clickReadyButton(screen, "Next");
    await clickReadyButton(screen, "Publish 1 location");

    expect(
      await screen.findByText(
        "Schedule conflicts must be fixed before publishing",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Alex Rivera: 2026-08-17, 4:00 PM - 7:00 PM and 6:00 PM - 10:00 PM",
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        ".schedule-publication-steps span[data-active='true']",
      )?.textContent,
    ).toContain("Locations");
    expect(screen.getByText("1 conflicts must be fixed")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next" })).toHaveProperty(
      "disabled",
      true,
    );

    const drawerPanel = document.createElement("div");
    drawerPanel.setAttribute("data-employee-drawer-panel", "true");
    document.body.appendChild(drawerPanel);
    fireEvent.pointerDown(drawerPanel);
    expect(
      screen.getByRole("dialog", { name: "Select locations to publish" }),
    ).toBeTruthy();
    drawerPanel.remove();

    readModelMock.mockResolvedValue(scheduleFixture);
  });

  it("downloads the active Export v2 preview after server authorization without the legacy engine", async () => {
    window.history.pushState({}, "", "/app/schedule?date=2026-08-17");
    render(<App />);
    fireEvent.change(await screen.findByRole("combobox", { name: "Workspace role" }), { target: { value: "owner" } });
    fireEvent.click(screen.getByRole("button", { name: "Use development identity" }));
    fireEvent.click(await screen.findByRole("button", { name: "Export" }));
    const panel = await screen.findByRole("region", { name: "Export settings" });
    await clickReadyButton(within(panel), "Download");
    await waitFor(() => expect(downloadExportFile).toHaveBeenCalledOnce());
    expect(authorizeScheduleExportV2).toHaveBeenCalledTimes(2);
    expect(renderExportFiles).toHaveBeenCalledWith(expect.objectContaining({
      weekStart: scheduleFixture.week_start, source: { kind: "published" },
      filename: "MAIN_2026-08-17_2026-08-23",
      shifts: expect.arrayContaining([expect.objectContaining({ id: scheduleFixture.shifts[0]!.id })]),
    }), expect.objectContaining({ format: "pdf", destination: "download" }));
    expect(previewScheduleExport).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "Export settings" })).toBeTruthy();
  });

  it("prompts Save draft for edit-mode Export, and cancellation keeps the working copy", async () => {
    window.history.pushState({}, "", "/app/schedule?date=2026-08-17");
    render(<App />);
    fireEvent.change(await screen.findByRole("combobox", { name: "Workspace role" }), { target: { value: "owner" } });
    fireEvent.click(screen.getByRole("button", { name: "Use development identity" }));
    await openPublishedScheduleEditor();
    fireEvent.click(await screen.findByRole("button", { name: "Export" }));
    const dialog = await screen.findByRole("dialog", { name: "Save draft" });
    expect(within(dialog).getByText(/Export is available in preview mode/)).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Export settings" })).toBeNull();
    expect(authorizeScheduleExportV2).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Discard" })).toBeTruthy();
    expect(window.location.search).toContain("mode=edit");
  });

  it("opens Export v2 only after a successful Save draft and reads the saved preview", async () => {
    const saved = { id: "99999999-9999-4999-8999-999999999999", workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start, name: "Export draft", revision: 1,
      created_by: "88888888-8888-4888-8888-888888888888", updated_by: "88888888-8888-4888-8888-888888888888",
      created_at: "2026-08-17T12:00:00Z", updated_at: "2026-08-17T12:00:00Z" };
    vi.mocked(saveScheduleDraft).mockImplementationOnce(async () => {
      vi.mocked(listScheduleDrafts).mockResolvedValue({ drafts: [saved] }); return saved;
    });
    window.history.pushState({}, "", "/app/schedule?date=2026-08-17");
    render(<App />);
    fireEvent.change(await screen.findByRole("combobox", { name: "Workspace role" }), { target: { value: "owner" } });
    fireEvent.click(screen.getByRole("button", { name: "Use development identity" }));
    await openPublishedScheduleEditor();
    fireEvent.click(await screen.findByRole("button", { name: "Export" }));
    const dialog = await screen.findByRole("dialog", { name: "Save draft" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Draft name" }), { target: { value: saved.name } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save draft" }));
    const panel = await screen.findByRole("region", { name: "Export settings" });
    await waitFor(() => expect(within(panel).getByText("Export draft")).toBeTruthy());
    expect(window.location.search).not.toContain("mode=edit");
    expect(fetchScheduleDraftShifts).toHaveBeenCalledWith(scheduleFixture.workspace_id, scheduleFixture.week_start, saved.id, [scheduleFixture.locations[0]!.id]);
    expect(renderExportFiles).not.toHaveBeenCalled();
  });

  it("keeps Export v2 settings open when switching from published to another saved preview", async () => {
    const draft = { id: "99999999-9999-4999-8999-999999999996", workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start, name: "Alternate export draft", revision: 2,
      created_by: "88888888-8888-4888-8888-888888888888", updated_by: "88888888-8888-4888-8888-888888888888",
      created_at: "2026-08-17T12:00:00Z", updated_at: "2026-08-17T12:00:00Z" };
    vi.mocked(listScheduleDrafts).mockResolvedValue({ drafts: [draft] });
    window.history.pushState({}, "", "/app/schedule?date=2026-08-17"); render(<App />);
    fireEvent.change(await screen.findByRole("combobox", { name: "Workspace role" }), { target: { value: "owner" } });
    fireEvent.click(screen.getByRole("button", { name: "Use development identity" }));
    fireEvent.click(await screen.findByRole("button", { name: "Export" }));
    const panel = await screen.findByRole("region", { name: "Export settings" });
    fireEvent.click(within(panel).getByLabelText("Excel"));
    fireEvent.click(screen.getByRole("button", { name: /^Draft selector:/ }));
    const row = (await screen.findByText(draft.name)).closest("[data-draft-row]");
    if (!row) throw new Error("Draft row missing"); fireEvent.click(row);
    await waitFor(() => expect(within(panel).getByText(draft.name)).toBeTruthy());
    expect((within(panel).getByLabelText("Excel") as HTMLInputElement).checked).toBe(true);
    await clickReadyButton(within(panel), "Download");
    await waitFor(() => expect(renderExportFiles).toHaveBeenCalledWith(expect.objectContaining({ source: { kind: "draft", id: draft.id, revision: 2, name: draft.name } }), expect.objectContaining({ format: "xlsx" })));
  });

  it("does not open Export v2 or emit output after Save draft fails", async () => {
    vi.mocked(saveScheduleDraft).mockRejectedValueOnce(new Error("Network dropped"));
    window.history.pushState({}, "", "/app/schedule?date=2026-08-17"); render(<App />);
    fireEvent.change(await screen.findByRole("combobox", { name: "Workspace role" }), { target: { value: "owner" } });
    fireEvent.click(screen.getByRole("button", { name: "Use development identity" }));
    await openPublishedScheduleEditor(); fireEvent.click(screen.getByRole("button", { name: "Export" }));
    const dialog = await screen.findByRole("dialog", { name: "Save draft" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Draft name" }), { target: { value: "Failed draft" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save draft" }));
    await screen.findByRole("dialog", { name: "Schedule save failed" });
    expect(screen.queryByRole("region", { name: "Export settings" })).toBeNull();
    expect(renderExportFiles).not.toHaveBeenCalled(); expect(window.location.search).toContain("mode=edit");
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByRole("button", { name: "Discard" })).toBeTruthy();
  });

  it.each(["network", "retroactive"] as const)("ignores a late %s Save-for-Export error after the edit session expires", async kind => {
    let rejectSave!: (error: Error) => void;
    vi.mocked(saveScheduleDraft).mockImplementationOnce(() => new Promise((_, reject) => { rejectSave = reject; }));
    window.history.pushState({}, "", "/app/schedule?date=2026-08-17"); render(<App />);
    fireEvent.change(await screen.findByRole("combobox", { name: "Workspace role" }), { target: { value: "owner" } });
    fireEvent.click(screen.getByRole("button", { name: "Use development identity" }));
    await openPublishedScheduleEditor(); fireEvent.click(screen.getByRole("button", { name: "Export" }));
    const dialog = await screen.findByRole("dialog", { name: "Save draft" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Draft name" }), { target: { value: "Expired export draft" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(saveScheduleDraft).toHaveBeenCalledOnce());
    expect(exportSaveIdleHarness.expire).toBeTypeOf("function");
    await act(async () => { exportSaveIdleHarness.expire!(); });
    expect(window.location.search).not.toContain("mode=edit");
    expect(screen.queryByRole("dialog", { name: "Save draft" })).toBeNull();
    await act(async () => rejectSave(kind === "network" ? new Error("Late failed export save") :
      new ScheduleRequestError("Late retroactive edit", 409, {
        status: "past_shift_edit_requires_ack", past_edits: [{ op_type: "update", shift_id: scheduleFixture.shifts[0]!.id,
          scheduled_date: "2026-08-17", location_name: "Main Dining", employee_name: "Alex Rivera", reason: "shift_started", severity: "warning" }],
        past_edit_messages: ["Late retroactive edit"],
      })));
    expect(screen.queryByRole("dialog", { name: "Schedule save failed" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "This changes shifts that already ran" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Export settings" })).toBeNull();
    expect(renderExportFiles).not.toHaveBeenCalled();
    expect(saveScheduleDraft).toHaveBeenCalledOnce();
  });

  it("does not let an expired Export save unlock or replace a newer pending save", async () => {
    let rejectOld!: (error: Error) => void, rejectNew!: (error: Error) => void;
    vi.mocked(saveScheduleDraft)
      .mockImplementationOnce(() => new Promise((_, reject) => { rejectOld = reject; }))
      .mockImplementationOnce(() => new Promise((_, reject) => { rejectNew = reject; }));
    window.history.pushState({}, "", "/app/schedule?date=2026-08-17"); render(<App />);
    fireEvent.change(await screen.findByRole("combobox", { name: "Workspace role" }), { target: { value: "owner" } });
    fireEvent.click(screen.getByRole("button", { name: "Use development identity" }));
    for (const name of ["Expired draft", "Current draft"]) {
      // The fixture deliberately resumes the same session id/revision: an old
      // operation must still be stale after the intervening preview state.
      await openPublishedScheduleEditor(); fireEvent.click(screen.getByRole("button", { name: "Export" }));
      const dialog = await screen.findByRole("dialog", { name: "Save draft" });
      fireEvent.change(within(dialog).getByRole("textbox", { name: "Draft name" }), { target: { value: name } });
      await clickReadyButton(within(dialog), "Save draft");
      if (name === "Expired draft") await act(async () => { exportSaveIdleHarness.expire!(); });
    }
    await waitFor(() => expect(saveScheduleDraft).toHaveBeenCalledTimes(2));
    await act(async () => rejectOld(new Error("Expired request error")));
    const currentDialog = screen.getByRole("dialog", { name: "Save draft" });
    expect(within(currentDialog).getByRole("textbox", { name: "Draft name" })).toHaveProperty("value", "Current draft");
    expect(within(currentDialog).getByRole("button", { name: "Saving…" })).toHaveProperty("disabled", true);
    expect(screen.queryByRole("dialog", { name: "Schedule save failed" })).toBeNull();
    await act(async () => rejectNew(new Error("Current request error")));
    expect(screen.getByRole("dialog", { name: "Schedule save failed" })).toBeTruthy();
    expect(screen.queryByText("Expired request error")).toBeNull();
    expect(renderExportFiles).not.toHaveBeenCalled();
  });

  it("lands manager sign-ins on Workspace by default", async () => {
    window.history.pushState({}, "", "/sign-in");
    render(<App />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Use development identity" }),
    );

    await waitFor(() =>
      expect(window.location.pathname).toBe("/app/workspace"),
    );
    expect(
      await screen.findByRole("heading", { name: "Workspace" }),
    ).toBeTruthy();
  });

  it(
    "keeps Account Workspaces on the switcher after manager sign-in",
    async () => {
      window.history.pushState({}, "", "/account/workspaces");
      render(<App />);

      fireEvent.click(
        await screen.findByRole("button", {
          name: "Use development identity",
        }),
      );

      await waitFor(() =>
        expect(window.location.pathname).toBe("/account/workspaces"),
      );
      expect(
        await screen.findByRole("heading", { name: "Workspaces" }),
      ).toBeTruthy();
      expect(await screen.findByText("Active workspace")).toBeTruthy();
    },
    15000,
  );

  it("reviews and applies deterministic auto-fill assignments", async () => {
    const preview = {
      status: "review_ready" as const,
      workspace_id: scheduleFixture.workspace_id,
      session_id: "77777777-7777-4777-8777-777777777777",
      session_revision: 1,
      fingerprint: "f".repeat(64),
      proposals: [
        {
          shift_id: scheduleFixture.shifts[0]!.id,
          location_name: scheduleFixture.locations[0]!.name,
          job_name: scheduleFixture.jobs[0]!.name,
          scheduled_date: scheduleFixture.week_start,
          start_time: "16:00",
          end_time: "22:00",
          recommended_employee_id: scheduleFixture.employees[0]!.id,
          candidates: [
            {
              employee_id: scheduleFixture.employees[0]!.id,
              employee_name: scheduleFixture.employees[0]!.display_name,
              scheduled_minutes: 360,
              primary_job: true,
              reasons: ["Primary job"],
            },
          ],
        },
      ],
      unfilled: [],
    };
    vi.mocked(previewScheduleAutoFill).mockResolvedValueOnce(preview);
    vi.mocked(applyScheduleAutoFill).mockImplementationOnce(
      (_workspaceId, session) =>
        Promise.resolve({
          status: "applied",
          applied: [
            {
              shift_id: scheduleFixture.shifts[0]!.id,
              employee_id: scheduleFixture.employees[0]!.id,
            },
          ],
          rejected: [],
          session,
        }),
    );
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({
      status: "acquired",
      session: {
        id: preview.session_id,
        workspace_id: scheduleFixture.workspace_id,
        week_start: scheduleFixture.week_start,
        source_kind: "published",
        source_draft_id: null,
        source_revision: 1,
        holder_user_id: "88888888-8888-4888-8888-888888888888",
        holder_name: "Development Owner",
        revision: 1,
        dirty: false,
        last_heartbeat: "2026-08-17T12:00:00Z",
        expires_at: "2026-08-17T12:04:00Z",
        shifts: scheduleFixture.shifts.map((shift) => ({
          ...shift,
          employee_id: null,
          unpaid_break_minutes: 30,
          revision: 1,
        })),
      },
    });
    window.history.pushState({}, "", "/app/schedule");
    render(<App />);
    fireEvent.change(
      await screen.findByRole("combobox", { name: "Workspace role" }),
      { target: { value: "owner" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Use development identity" }),
    );
    await openPublishedScheduleEditor();
    expect(await screen.findByRole("button", { name: "Discard" })).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: /Auto-fill/ }));
    expect(
      await screen.findByRole("dialog", { name: "Review auto-fill" }),
    ).toBeTruthy();
    expect(screen.getByText("Primary job")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: `Reject ${scheduleFixture.jobs[0]!.name} on ${scheduleFixture.week_start}`,
      }),
    );
    expect(
      screen.getByRole("button", {
        name: `Undo reject ${scheduleFixture.jobs[0]!.name} on ${scheduleFixture.week_start}`,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Apply 0 assignments" }),
    ).toHaveProperty("disabled", true);
    fireEvent.click(
      screen.getByRole("button", {
        name: `Undo reject ${scheduleFixture.jobs[0]!.name} on ${scheduleFixture.week_start}`,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Apply 1 assignments" }),
    );

    await waitFor(() =>
      expect(applyScheduleAutoFill).toHaveBeenCalledWith(
        scheduleFixture.workspace_id,
        expect.objectContaining({
          id: preview.session_id,
          revision: preview.session_revision,
        }),
        preview,
        [
          {
            shift_id: scheduleFixture.shifts[0]!.id,
            employee_id: scheduleFixture.employees[0]!.id,
          },
        ],
      ),
    );
    expect(await screen.findByText("Applied 1 shift.")).toBeTruthy();
  });

  it("keeps organization settings unavailable to managers", async () => {
    window.history.pushState({}, "", "/app/settings/general");
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Sign in to your workspace" }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Use development identity" }),
    );

    await waitFor(() =>
      expect(window.location.pathname).toBe("/app/workspace"),
    );
    expect(
      await screen.findByRole("heading", { name: "Workspace" }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Employees" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();
  });

  it("redirects employee-only users away from the manager Schedule route", async () => {
    window.history.pushState({}, "", "/app/schedule");
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Sign in to your workspace" }),
    ).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Workspace role" }), {
      target: { value: "employee" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Use development identity" }),
    );

    await waitFor(() =>
      expect(window.location.pathname).toBe("/app/employee-hub"),
    );
    expect(screen.queryByRole("heading", { name: "Schedule" })).toBeNull();
  });

  it("redirects employee-only users away from the manager Workspace route", async () => {
    window.history.pushState({}, "", "/app/workspace");
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Sign in to your workspace" }),
    ).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Workspace role" }), {
      target: { value: "employee" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Use development identity" }),
    );

    await waitFor(() =>
      expect(window.location.pathname).toBe("/app/employee-hub"),
    );
    expect(screen.queryByRole("heading", { name: "Workspace" })).toBeNull();
  });
});
