import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ActiveWorkspaceContext } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { WorkspacePage } from "./WorkspacePage";
import {
  getWorkspaceDashboard,
  saveWorkspaceLayout,
} from "../communications/communications-data";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
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
});
