import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ActiveWorkspaceContext } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { AnnouncementsPage } from "./AnnouncementsPage";
import { NotificationsPage } from "./NotificationsPage";
import { WorkspacePage } from "./WorkspacePage";
import {
  actOnNotification,
  getAnnouncements,
  getNotifications,
  getWorkspaceDashboard,
  saveAnnouncement,
  saveWorkspaceLayout,
} from "../communications/communications-data";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const context = {
  userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
  workspace: { id: workspaceId, name: "Meyhouse" },
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
  onboarding: { status: "complete", currentStep: 2 },
  locationScope: { allLocations: true, locationIds: [] },
} as ActiveWorkspaceContext;

vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ context }) }));
vi.mock("../communications/communications-data", () => ({
  getWorkspaceDashboard: vi.fn(),
  saveWorkspaceLayout: vi.fn().mockResolvedValue({ status: "saved" }),
  getAnnouncements: vi.fn(),
  saveAnnouncement: vi.fn(),
  transitionAnnouncement: vi.fn(),
  getNotifications: vi.fn(),
  actOnNotification: vi
    .fn()
    .mockResolvedValue({ status: "saved", affected: 1 }),
}));

function renderRoute(path: string, element: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Phase 8 communication pages", () => {
  it("saves a personalized Workspace layout", async () => {
    vi.mocked(getWorkspaceDashboard).mockResolvedValue({
      workspace_id: workspaceId,
      display_name: "Taylor",
      metrics: {
        today_shift_count: 12,
        today_open_shift_count: 2,
        pending_time_off_count: 3,
        pending_shift_change_count: 1,
        unread_notification_count: 4,
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
      await screen.findByRole("button", { name: "New announcement" }),
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
          title: "Service briefing",
          body: "Doors open at four.",
          action_url: "/app/announcements/a8200000-0000-4000-8000-000000000001",
          source_type: "announcement",
          source_id: "a8200000-0000-4000-8000-000000000001",
          created_at: new Date().toISOString(),
          read_at: null,
        },
      ],
    });
    renderRoute("/app/notifications", <NotificationsPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Mark Service briefing read" }),
    );
    await waitFor(() =>
      expect(actOnNotification).toHaveBeenCalledWith(workspaceId, {
        notification_id: "a8300000-0000-4000-8000-000000000001",
        action: "read",
      }),
    );
  });
});
