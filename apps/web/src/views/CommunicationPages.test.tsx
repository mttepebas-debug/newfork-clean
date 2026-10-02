import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type {
  ActiveWorkspaceContext,
  AnnouncementRecord,
} from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { AnnouncementsPage } from "./AnnouncementsPage";
import { NotificationsPage } from "./NotificationsPage";
import { WorkspacePage } from "./WorkspacePage";
import {
  acknowledgeAnnouncement,
  actOnNotification,
  getAnnouncements,
  getNotifications,
  getWorkspaceDashboard,
  saveAnnouncement,
  saveWorkspaceLayout,
  transitionAnnouncement,
} from "../communications/communications-data";

import { RequestError } from "../lib/request-error";
const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const now = "2026-09-11T12:00:00.000Z";
const context = {
  userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
  workspace: {
    id: workspaceId,
    name: "Meyhouse",
    logo_url: null,
    logo_file_name: null,
    logo_updated_at: null,
    schedule_logo_placement: { scale: 1, offset_x: 0, offset_y: 0 },
  },
  membership: {
    id: "bd6b757b-c9ad-4e47-a47e-0a90a43bc0e4",
    userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
    workspaceId,
    role: "owner",
    status: "active",
    allLocations: true,
  },
  permissions: [
    "workspace.read",
    "announcements.read",
    "announcements.manage",
    "notifications.read",
  ],
  actions: [],
  onboarding: { status: "complete", currentStep: 2 },
  documentAccess: { restricted: false },
  locationScope: { allLocations: true, locationIds: [] },
} as ActiveWorkspaceContext;

vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ context }) }));
vi.mock("../communications/communications-data", () => ({
  getWorkspaceDashboard: vi.fn(),
  saveWorkspaceLayout: vi.fn().mockResolvedValue({ status: "saved" }),
  getAnnouncements: vi.fn(),
  acknowledgeAnnouncement: vi.fn().mockResolvedValue({ status: "saved" }),
  saveAnnouncement: vi.fn(),
  transitionAnnouncement: vi.fn(),
  getNotifications: vi.fn(),
  actOnNotification: vi
    .fn()
    .mockResolvedValue({ status: "saved", affected: 1 }),
}));

function renderRoute(path: string, element: React.ReactNode, routePath = "*") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={routePath} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Phase 8 communication pages", () => {
  it("keeps the account notification inbox independent of a stale workspace context", async () => {
    vi.mocked(getNotifications).mockResolvedValue({
      workspace_id: null,
      unread_count: 1,
      next_cursor: null,
      notifications: [
        {
          id: "a8200000-0000-4000-8000-000000000099",
          workspace_id: null,
          scope: "account",
          category: "security",
          type_key: "security.account.password_changed",
          title: "Password changed",
          body: "Security update",
          safe_preview: "Security update",
          action_url: "/app/account/security",
          source_type: "account_security",
          source_id: null,
          created_at: now,
          read_at: null,
          visibility_state: "visible",
        },
      ],
    });
    renderRoute("/account/inbox", <NotificationsPage />);
    await screen.findByText("Password changed");
    expect(getNotifications).toHaveBeenCalledWith("", expect.anything());
    expect(
      screen
        .getByRole("link", { name: "Open notification: Password changed" })
        .getAttribute("href"),
    ).toBe("/account/security");
  });

  it("uses Archived as an exclusive announcement status filter", async () => {
    const activeDraft = announcement({
      id: "a8200000-0000-4000-8000-000000000002",
      title: "Active draft",
      status: "draft",
    });
    const activePublished = announcement({
      id: "a8200000-0000-4000-8000-000000000003",
      title: "Active published",
      status: "published",
    });
    const activeScheduled = announcement({
      id: "a8200000-0000-4000-8000-000000000005",
      title: "Active scheduled",
      status: "scheduled",
    });
    const archivedDraft = announcement({
      id: "a8200000-0000-4000-8000-000000000004",
      title: "Archived draft",
      status: "draft",
      archived_at: now,
    });
    const archivedScheduled = announcement({
      id: "a8200000-0000-4000-8000-000000000006",
      title: "Archived scheduled",
      status: "scheduled",
      archived_at: now,
    });
    vi.mocked(getAnnouncements).mockResolvedValue({
      workspace_id: workspaceId,
      can_manage: true,
      locations: [],
      announcements: [
        activeDraft,
        activePublished,
        activeScheduled,
        archivedDraft,
        archivedScheduled,
      ],
    });
    renderRoute("/app/announcements", <AnnouncementsPage />);

    expect(await screen.findByText("Active draft")).toBeTruthy();
    expect(screen.getByText("Active published")).toBeTruthy();
    expect(screen.getByText("Active scheduled")).toBeTruthy();
    expect(screen.queryByText("Archived draft")).toBeNull();
    expect(screen.queryByText("Archived scheduled")).toBeNull();
    expect(screen.getByRole("tab", { name: "Draft (1)" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Scheduled (1)" })).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Archived" }));
    expect(await screen.findByText("Archived draft")).toBeTruthy();
    expect(screen.getByText("Archived scheduled")).toBeTruthy();
    expect(screen.queryByText("Active draft")).toBeNull();
    expect(screen.queryByText("Active published")).toBeNull();
    expect(screen.queryByText("Active scheduled")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Draft (1)" }));
    expect(await screen.findByText("Active draft")).toBeTruthy();
    expect(screen.queryByText("Archived draft")).toBeNull();
    expect(screen.queryByText("Active published")).toBeNull();
    expect(screen.queryByText("Active scheduled")).toBeNull();
  });

  it("shows employees a read-only list they can acknowledge", async () => {
    const readOnly = { can_edit: false, can_publish: false, can_archive: false };
    vi.mocked(getAnnouncements).mockResolvedValue({
      workspace_id: workspaceId,
      can_manage: false,
      locations: [],
      announcements: [
        announcement({
          id: "a8200000-0000-4000-8000-000000000007",
          title: "Unread update",
          status: "published",
          published_at: now,
          ...readOnly,
        }),
        announcement({
          id: "a8200000-0000-4000-8000-000000000008",
          title: "Seen update",
          status: "published",
          published_at: now,
          acknowledged_at: now,
          ...readOnly,
        }),
      ],
    });
    renderRoute("/app/announcements", <AnnouncementsPage />);

    expect(await screen.findByText("Unread update")).toBeTruthy();
    expect(screen.getByText("Seen update")).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Add announcement" }),
    ).toBeNull();
    expect(
      screen.getAllByRole("columnheader").map((cell) => cell.textContent),
    ).toEqual(["Announcement", "Published date", "Published by", "Status", ""]);
    expect(screen.getByRole("img", { name: "Acknowledged" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Acknowledge" }));
    await waitFor(() =>
      expect(acknowledgeAnnouncement).toHaveBeenCalledWith(
        workspaceId,
        "a8200000-0000-4000-8000-000000000007",
      ),
    );
  });

  it("filters announcements by location", async () => {
    const main = "11000000-0000-4000-8000-000000000001";
    const patio = "11000000-0000-4000-8000-000000000002";
    vi.mocked(getAnnouncements).mockResolvedValue({
      workspace_id: workspaceId,
      can_manage: true,
      locations: [
        { id: main, name: "Main Dining" },
        { id: patio, name: "Patio" },
      ],
      announcements: [
        announcement({
          id: "a8200000-0000-4000-8000-000000000005",
          title: "Main update",
          status: "published",
          location_ids: [main],
          location_names: ["Main Dining"],
        }),
        announcement({
          id: "a8200000-0000-4000-8000-000000000006",
          title: "Patio update",
          status: "published",
          location_ids: [patio],
          location_names: ["Patio"],
        }),
      ],
    });
    renderRoute("/app/announcements", <AnnouncementsPage />);

    expect(await screen.findByText("Main update")).toBeTruthy();
    expect(screen.getByText("Patio update")).toBeTruthy();

    fireEvent.change(
      screen.getByLabelText("Filter announcements by location"),
      {
        target: { value: patio },
      },
    );
    expect(await screen.findByText("Patio update")).toBeTruthy();
    expect(screen.queryByText("Main update")).toBeNull();
  });

  it("saves a personalized Workspace layout", async () => {
    vi.mocked(getWorkspaceDashboard).mockResolvedValue({
      workspace_id: workspaceId,
      display_name: "Taylor",
      metrics: {
        today_shift_count: 12,
        today_open_shift_count: 2,
        pending_time_off_count: 3,
        unread_notification_count: 4,
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
    });
    renderRoute("/app/workspace", <WorkspacePage />);
    expect(
      await screen.findByRole("heading", { name: "Workspace" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Customize" }));
    fireEvent.click(screen.getByRole("button", { name: "Hide Quick actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Save layout" }));
    await waitFor(() =>
      expect(saveWorkspaceLayout).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({ hidden_widget_ids: ["quick_actions"] }),
      ),
    );
  });

  it("creates a targeted announcement draft", async () => {
    vi.mocked(getAnnouncements).mockResolvedValue({
      workspace_id: workspaceId,
      can_manage: true,
      // An owner or admin: a one-location writer would start at their location (K1).
      can_target_workspace: true,
      locations: [
        { id: "11000000-0000-4000-8000-000000000001", name: "Main Dining" },
      ],
      announcements: [],
    });
    vi.mocked(saveAnnouncement).mockResolvedValue({
      status: "draft",
      announcement_id: "a8200000-0000-4000-8000-000000000001",
      revision: 1,
      recipient_count: 0,
    });
    renderRoute("/app/announcements", <AnnouncementsPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Add announcement" }),
    );
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Service briefing" },
    });
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Doors open at four." },
    });
    fireEvent.click(screen.getByLabelText("Main Dining"));
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() =>
      expect(saveAnnouncement).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({
          announcement: expect.objectContaining({
            title: "Service briefing",
            location_ids: ["11000000-0000-4000-8000-000000000001"],
          }),
        }),
      ),
    );
  });

  it("starts a one-location manager's new announcement at their location (K1)", async () => {
    vi.mocked(getAnnouncements).mockResolvedValue({
      workspace_id: workspaceId,
      can_manage: true,
      can_target_workspace: false,
      locations: [{ id: "11000000-0000-4000-8000-000000000001", name: "Main Dining" }],
      announcements: [],
    });
    renderRoute("/app/announcements", <AnnouncementsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Add announcement" }));
    expect((screen.getByLabelText("Main Dining") as HTMLInputElement).checked).toBe(true);
  });

  it("requires a second animated delete click without opening a confirmation panel", async () => {
    const draft = announcement({
      id: "a8200000-0000-4000-8000-000000000007",
      title: "Draft to delete",
      status: "draft",
    });
    vi.mocked(transitionAnnouncement).mockClear();
    vi.mocked(transitionAnnouncement).mockImplementation(
      () => new Promise(() => {}),
    );
    vi.mocked(getAnnouncements).mockResolvedValue({
      workspace_id: workspaceId,
      can_manage: true,
      locations: [],
      announcements: [draft],
    });
    renderRoute(
      `/app/announcements/${draft.id}`,
      <AnnouncementsPage />,
      "/app/announcements/:announcementId",
    );

    const editor = await screen.findByRole("dialog", {
      name: "Edit announcement",
    });
    fireEvent.click(within(editor).getByRole("button", { name: "Delete" }));

    expect(transitionAnnouncement).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("group", { name: "Confirm deletion" }),
    ).toBeNull();
    const confirm = within(editor).getByRole("button", {
      name: "Confirm delete",
    });
    expect(confirm.getAttribute("data-confirming")).toBe("true");

    fireEvent.click(confirm);
    await waitFor(() =>
      expect(transitionAnnouncement).toHaveBeenCalledWith(
        workspaceId,
        draft.id,
        "archive",
        draft.revision,
      ),
    );
  });

  it("marks a personal notification read", async () => {
    vi.mocked(getNotifications).mockResolvedValue({
      workspace_id: workspaceId,
      unread_count: 1,
      next_cursor: null,
      notifications: [
        {
          id: "a8300000-0000-4000-8000-000000000001",
          workspace_id: workspaceId,
          category: "announcement",
          type_key: "communications.announcement.available",
          severity: "info",
          safe_preview: "Service briefing",
          title: "Service briefing",
          body: "Doors open at four.",
          action_url: "/app/announcements/a8200000-0000-4000-8000-000000000001",
          source_type: "announcement",
          source_id: "a8200000-0000-4000-8000-000000000001",
          created_at: new Date().toISOString(),
          read_at: null,
          visibility_state: "visible",
        },
      ],
    });
    renderRoute("/app/notifications", <NotificationsPage />);
    expect(await screen.findByText("Announcements · Update")).toBeTruthy();
    expect(
      screen.queryByText("communications.announcement.available"),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Mark Service briefing read" }),
    );
    await waitFor(() =>
      expect(actOnNotification).toHaveBeenCalledWith(workspaceId, {
        notification_id: "a8300000-0000-4000-8000-000000000001",
        action: "read",
      }),
    );
  });
});

function announcement(
  override: Partial<AnnouncementRecord> &
    Pick<AnnouncementRecord, "id" | "title" | "status">,
): AnnouncementRecord {
  const { id, title, status, ...rest } = override;
  return {
    id,
    workspace_id: workspaceId,
    title,
    body: `${title} details`,
    category: "general",
    status,
    audience_roles: [],
    location_ids: [],
    location_names: [],
    department_ids: [],
    department_names: [],
    job_ids: [],
    job_names: [],
    archived_at: override.archived_at ?? null,
    publish_at: null,
    published_at: null,
    expires_at: null,
    action_url: null,
    author_name: "Taylor",
    revision: 1,
    created_at: now,
    updated_at: now,
    read_at: null,
    can_edit: true,
    can_publish: true,
    can_archive: true,
    ...rest,
  };
}

describe("no access (FB-6.1.9)", () => {
  it("shows the no-access card, not the raw error, when the API refuses announcements (FB-6.1.9)", async () => {
    vi.mocked(getAnnouncements).mockRejectedValue(new RequestError("Forbidden", "authz.missing_permission", undefined, 403));
    renderRoute("/app/announcements", <AnnouncementsPage />);
    expect(await screen.findByRole("heading", { name: "You don't have access to announcements" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Home" })).toBeTruthy();
    expect(screen.queryByText("Forbidden")).toBeNull();
  });
  it("shows the no-access card, not the raw error, when the API refuses notifications (FB-6.1.9)", async () => {
    vi.mocked(getNotifications).mockRejectedValue(new RequestError("Forbidden", "authz.missing_permission", undefined, 403));
    renderRoute("/app/notifications", <NotificationsPage />);
    expect(await screen.findByRole("heading", { name: "You don't have access to notifications" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Home" })).toBeTruthy();
    expect(screen.queryByText("Forbidden")).toBeNull();
  });
});
