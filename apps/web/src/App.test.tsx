import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ScheduleReadModel } from "@newfork/shared";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import {
  applyScheduleAutoFill,
  listScheduleDrafts,
  previewScheduleAutoFill,
  previewScheduleExport,
  previewSchedulePublication,
  publishScheduleDraft,
} from "./schedule/schedule-data";

const scheduleFixture = vi.hoisted(() => ({
  workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
  week_start: "2026-08-17",
  week_start_day: "monday",
  locations: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Main Dining",
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
  employees: [
    {
      id: "55555555-5555-4555-8555-555555555555",
      employee_code: "NF-001",
      display_name: "Alex Rivera",
      location_ids: ["11111111-1111-4111-8111-111111111111"],
      job_ids: ["33333333-3333-4333-8333-333333333333"],
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
      end_time: "22:00",
      crosses_midnight: false,
      note: "",
      warning_codes: [],
    },
  ],
  closures: [],
})) as ScheduleReadModel;

vi.mock("./schedule/schedule-data", () => ({
  getScheduleReadModel: vi.fn().mockResolvedValue(scheduleFixture),
  listScheduleDrafts: vi.fn().mockResolvedValue({ drafts: [] }),
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
          revision: 1,
        })),
      },
    }),
  ),
  heartbeatScheduleEditSession: vi.fn(),
  createScheduleShift: vi.fn(),
  updateScheduleShift: vi.fn(),
  deleteScheduleShift: vi.fn(),
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
  downloadScheduleExport: vi.fn(),
  listScheduleExportPresets: vi.fn().mockResolvedValue({ presets: [] }),
  createScheduleExportPreset: vi.fn(),
  deleteScheduleExportPreset: vi.fn(),
}));

vi.mock("./communications/communications-data", () => ({
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
    layout: {
      widget_order: [
        "operations",
        "pending_requests",
        "open_shifts",
        "announcements",
        "notifications",
        "quick_actions",
      ],
      hidden_widget_ids: [],
    },
  }),
  saveWorkspaceLayout: vi.fn().mockResolvedValue({ status: "saved" }),
  getAnnouncements: vi.fn(),
  saveAnnouncement: vi.fn(),
  transitionAnnouncement: vi.fn(),
  actOnNotification: vi.fn(),
}));

describe("App", () => {
  it("protects workspace routes and opens the authenticated shell", async () => {
    window.history.pushState({}, "", "/app/schedule");
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Sign in to your workspace" }),
    ).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Workspace role" }), {
      target: { value: "owner" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Use development identity" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Schedule" }),
    ).toBeTruthy();
    expect(screen.getByText("Published schedule")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Switch to daily view" }),
    ).toHaveProperty("textContent", "Weekly view");
    expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Hide Unscheduled" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "New Schedule" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Published" })).toBeTruthy();
    expect(screen.getAllByText("Alex Rivera")).toHaveLength(2);
    expect(screen.getAllByText("Dinner")).toHaveLength(2);
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Employees" })).toBeTruthy();
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
  });

  it("opens Schedule editing from an explicit working-copy source", async () => {
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
    fireEvent.click(
      await screen.findByRole("button", { name: "New Schedule" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit or create" }));
    expect(
      await screen.findByRole("dialog", { name: "Edit schedule" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Published schedule/ }));
    expect(await screen.findByText("Editing draft")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Save draft/ })).toBeTruthy();
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
    vi.mocked(listScheduleDrafts).mockResolvedValueOnce({ drafts: [draft] });
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
          employee_id: scheduleFixture.employees[0]!.id,
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
      published_at: "2026-08-17T12:05:00Z",
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
    fireEvent.click(await screen.findByRole("button", { name: "Published" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Publish another draft" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Publish schedule" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Review publication" }));
    expect(await screen.findByText("Override required")).toBeTruthy();
    const publishButton = screen.getByRole("button", {
      name: "Publish locations",
    });
    expect(publishButton).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByRole("textbox", { name: "Reason" }), {
      target: { value: "Approved for a private service." },
    });
    fireEvent.click(publishButton);

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
      ),
    );
  });

  it("previews a scoped schedule export", async () => {
    vi.mocked(previewScheduleExport).mockResolvedValueOnce({
      status: "export_ready",
      workspace_id: scheduleFixture.workspace_id,
      workspace_name: "Meyhouse",
      week_start: scheduleFixture.week_start,
      source: { type: "published" },
      source_revision: 1,
      fingerprint: "e".repeat(64),
      locations: [
        {
          id: scheduleFixture.locations[0]!.id,
          name: scheduleFixture.locations[0]!.name,
        },
      ],
      rows: [],
      summary: { shift_count: 1, employee_count: 1, scheduled_minutes: 360 },
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
    fireEvent.click(await screen.findByRole("button", { name: /Export/ }));
    expect(
      await screen.findByRole("dialog", { name: "Export schedule" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Preview export" }));

    expect(
      await screen.findByText("1 shifts · 1 employees · 6.00 hours"),
    ).toBeTruthy();
    expect(previewScheduleExport).toHaveBeenCalledWith(
      scheduleFixture.workspace_id,
      expect.objectContaining({
        week_start: scheduleFixture.week_start,
        source: { type: "published" },
        location_ids: [scheduleFixture.locations[0]!.id],
        settings: expect.objectContaining({
          format: "csv",
          include_unassigned: true,
        }),
      }),
    );
  });

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
    window.history.pushState({}, "", "/app/schedule");
    render(<App />);
    fireEvent.change(
      await screen.findByRole("combobox", { name: "Workspace role" }),
      { target: { value: "owner" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Use development identity" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: /Edit/ }));
    expect(
      await screen.findByRole("dialog", { name: "Edit schedule" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Published schedule/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Auto-fill/ }));
    expect(
      await screen.findByRole("dialog", { name: "Review auto-fill" }),
    ).toBeTruthy();
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
