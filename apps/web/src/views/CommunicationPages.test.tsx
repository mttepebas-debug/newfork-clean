import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ActiveWorkspaceContext } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { NotificationsPage } from "./NotificationsPage";
import { WorkspacePage } from "./WorkspacePage";
import {
  actOnNotification,
  getNotifications,
  getWorkspaceDashboard,
  saveWorkspaceLayout,
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
        .getByRole("link", { name: "Password changed" })
        .getAttribute("href"),
    ).toBe("/account/security");
  });

  it("draws notifications as one table with Today and Yesterday sub-heading rows", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const base = {
      workspace_id: workspaceId,
      category: "announcement",
      type_key: "communications.announcement.available",
      severity: "info",
      action_url: null,
      source_type: "announcement",
      source_id: null,
      read_at: null,
      visibility_state: "visible",
    } as const;
    vi.mocked(getNotifications).mockResolvedValue({
      workspace_id: workspaceId,
      unread_count: 2,
      next_cursor: null,
      notifications: [
        { ...base, id: "a8300000-0000-4000-8000-000000000011", title: "Menu tasting", body: "Oct 15", safe_preview: "Oct 15", created_at: new Date().toISOString() },
        { ...base, id: "a8300000-0000-4000-8000-000000000012", title: "Schedule live", body: "Week of Oct 6", safe_preview: "Week of Oct 6", created_at: yesterday.toISOString() },
      ],
    });
    renderRoute("/app/notifications", <NotificationsPage />);
    await screen.findByText("Menu tasting");
    const table = screen.getByRole("table", { name: "Notifications" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["", "Notification", "Category", "Received", "Actions", "Today", "Yesterday"]);
    const rows = within(table).getAllByRole("row").map((row) => row.textContent ?? "");
    expect(rows.findIndex((row) => row === "Today")).toBeLessThan(
      rows.findIndex((row) => row.includes("Menu tasting")),
    );
    expect(rows.findIndex((row) => row === "Yesterday")).toBeLessThan(
      rows.findIndex((row) => row.includes("Schedule live")),
    );
    expect(rows.findIndex((row) => row.includes("Menu tasting"))).toBeLessThan(
      rows.findIndex((row) => row === "Yesterday"),
    );
  });

  it("keeps the heading row over an empty notification table", async () => {
    vi.mocked(getNotifications).mockResolvedValue({
      workspace_id: workspaceId,
      unread_count: 0,
      next_cursor: null,
      notifications: [],
    });
    renderRoute("/app/notifications", <NotificationsPage />);
    const table = await screen.findByRole("table", { name: "Notifications" });
    expect(within(table).getByRole("columnheader", { name: "Notification" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "No unread notifications" })).toBeTruthy();
    expect(screen.getByText("Updates matching these filters will appear here.")).toBeTruthy();
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
      today_ends_at: null,
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
    const markRead = screen.getByRole("button", { name: "Mark as read" });
    expect(markRead).toHaveProperty("disabled", true);
    expect(screen.getByText("0 selected")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select Service briefing" }),
    );
    expect(screen.getByText("1 selected")).toBeTruthy();
    expect(
      screen.getByRole("checkbox", { name: "Select Service briefing" }).closest("tr")
        ?.getAttribute("data-selected"),
    ).toBe("true");
    fireEvent.click(markRead);
    await waitFor(() =>
      expect(actOnNotification).toHaveBeenCalledWith(workspaceId, {
        notification_id: "a8300000-0000-4000-8000-000000000001",
        action: "read",
      }),
    );
  });

  it("splits the inbox into Unread and Read tabs with a category list and no bulk links", async () => {
    const item = (id: string, title: string, read: boolean) => ({
      id,
      workspace_id: workspaceId,
      category: "announcement" as const,
      type_key: "communications.announcement.available",
      severity: "info" as const,
      safe_preview: `${title} details`,
      title,
      body: `${title} details`,
      action_url: null,
      source_type: "announcement",
      source_id: null,
      created_at: new Date().toISOString(),
      read_at: read ? new Date().toISOString() : null,
      visibility_state: "visible" as const,
    });
    vi.mocked(getNotifications).mockImplementation(async (_ws, options) => ({
      workspace_id: workspaceId,
      unread_count: 2,
      next_cursor: null,
      notifications:
        options?.readState === "read"
          ? [item("a8300000-0000-4000-8000-000000000021", "Old memo", true)]
          : [
              item("a8300000-0000-4000-8000-000000000022", "New memo", false),
              item("a8300000-0000-4000-8000-000000000023", "Late memo", false),
            ],
    }));
    renderRoute("/app/notifications", <NotificationsPage />);
    expect(await screen.findByText("New memo")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Unread (2)" }).getAttribute("aria-selected")).toBe("true");
    await screen.findByRole("tab", { name: "Read (1)" });
    // BL-602: the tab list is one Tab stop.
    expect(screen.getByRole("tab", { name: "Unread (2)" }).tabIndex).toBe(0);
    expect(screen.getByRole("tab", { name: "Read (1)" }).tabIndex).toBe(-1);
    expect(screen.getByRole("combobox", { name: "Notification category" })).toBeTruthy();
    for (const gone of ["Mark all read", "Select all", "Deselect all", "Unread only"])
      expect(screen.queryByText(gone)).toBeNull();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select all shown notifications" }),
    );
    expect(screen.getByText("2 selected")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select all shown notifications" }),
    );
    expect(screen.getByText("0 selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Read (1)" }));
    expect(await screen.findByText("Old memo")).toBeTruthy();
    expect(screen.queryByText("New memo")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Old memo" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark as unread" }));
    await waitFor(() =>
      expect(actOnNotification).toHaveBeenCalledWith(workspaceId, {
        notification_id: "a8300000-0000-4000-8000-000000000021",
        action: "unread",
      }),
    );
  });
});

describe("no access (FB-6.1.9)", () => {
  it("shows the no-access card, not the raw error, when the API refuses notifications (FB-6.1.9)", async () => {
    vi.mocked(getNotifications).mockRejectedValue(new RequestError("Forbidden", "authz.missing_permission", undefined, 403));
    renderRoute("/app/notifications", <NotificationsPage />);
    expect(await screen.findByRole("heading", { name: "You don't have access to notifications" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Home" })).toBeTruthy();
    expect(screen.queryByText("Forbidden")).toBeNull();
  });
});
