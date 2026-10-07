import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type {
  ActiveWorkspaceContext,
  OwnerSetupChecklistItemId,
  WorkspaceDashboard,
} from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WorkspacePage from "./WorkspacePage";
import {
  createWorkspaceTodo,
  getOwnerSetupChecklistProgress,
  getWorkspaceDashboard,
  markOwnerSetupChecklistItem,
  resolveWorkspaceTodo,
} from "../communications/communications-data";

import { RequestError } from "../lib/request-error";
import { getExchanges } from "../employee-hub/shift-exchanges/exchange-data";
const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";

const context = {
  userId,
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
    userId,
    workspaceId,
    role: "owner",
    status: "active",
    allLocations: true,
  },
  permissions: ["workspace.read", "workspace.manage"],
  actions: [],
  onboarding: { status: "complete", currentStep: 4 },
  documentAccess: { restricted: false },
  locationScope: { allLocations: true, locationIds: [] },
} satisfies ActiveWorkspaceContext;

const dashboard = {
  workspace_id: workspaceId,
  display_name: "Meyhouse",
  metrics: {
    today_shift_count: 0,
    today_open_shift_count: 0,
    pending_time_off_count: 0,
    unread_notification_count: 0,
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
} satisfies WorkspaceDashboard;

let currentContext: ActiveWorkspaceContext = context;
let completedChecklistItemIds: OwnerSetupChecklistItemId[] = [];

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ context: currentContext }),
}));

vi.mock("../employee-hub/shift-exchanges/exchange-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../employee-hub/shift-exchanges/exchange-data")>()),
  getExchanges: vi.fn(),
}));

vi.mock("../communications/communications-data", () => ({
  createWorkspaceTodo: vi.fn(),
  getOwnerSetupChecklistProgress: vi.fn(),
  getWorkspaceDashboard: vi.fn(),
  markOwnerSetupChecklistItem: vi.fn(),
  resolveWorkspaceTodo: vi.fn(),
  saveWorkspaceLayout: vi.fn(),
}));

describe("WorkspacePage setup checklist", () => {
  beforeEach(() => {
    currentContext = context;
    completedChecklistItemIds = [];
    vi.clearAllMocks();
    vi.mocked(getWorkspaceDashboard).mockResolvedValue(dashboard);
    vi.mocked(getOwnerSetupChecklistProgress).mockImplementation(async () => ({
      workspace_id: workspaceId,
      user_id: userId,
      completed_item_ids: completedChecklistItemIds,
      closed_at: null,
    }));
    vi.mocked(markOwnerSetupChecklistItem).mockImplementation(
      async (_workspaceId, itemId) => {
        if (!completedChecklistItemIds.includes(itemId)) {
          completedChecklistItemIds = [...completedChecklistItemIds, itemId];
        }
        return {
          workspace_id: workspaceId,
          user_id: userId,
          completed_item_ids: completedChecklistItemIds,
          closed_at: null,
        };
      },
    );
    vi.mocked(createWorkspaceTodo).mockResolvedValue({
      id: "a9700000-0000-4000-8000-000000000011",
      workspace_id: workspaceId,
      title: "Call supplier",
      body: "",
      severity: "info",
      status: "open",
      system_generated: false,
      source_type: "manual",
      source_id: "a9700000-0000-4000-8000-000000000012",
      source_key: "manual:a9700000-0000-4000-8000-000000000012",
      employee_id: null,
      due_at: null,
      action_url: null,
      created_at: "2026-09-05T12:00:00.000Z",
    });
    vi.mocked(resolveWorkspaceTodo).mockResolvedValue({
      id: "a9700000-0000-4000-8000-000000000011",
      workspace_id: workspaceId,
      title: "Call supplier",
      body: "",
      severity: "info",
      status: "resolved",
      system_generated: false,
      source_type: "manual",
      source_id: "a9700000-0000-4000-8000-000000000012",
      source_key: "manual:a9700000-0000-4000-8000-000000000012",
      employee_id: null,
      due_at: null,
      action_url: null,
      created_at: "2026-09-05T12:00:00.000Z",
    });
  });

  function renderPage() {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/app/workspace"]}>
          <Routes>
            <Route path="/app/workspace" element={<WorkspacePage />} />
            <Route path="/app/employees" element={<p>Employees route</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  // BL-804: at the locations' midnight the counts move to the new day on
  // their own, without a reload or a once-a-minute read.
  it("reads the dashboard again when the locations' day ends, not before", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.mocked(getWorkspaceDashboard).mockResolvedValue({
        ...dashboard,
        today_ends_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      });
      renderPage();
      await screen.findByText("Scheduled today");
      expect(vi.mocked(getWorkspaceDashboard)).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(4 * 60_000);
      expect(vi.mocked(getWorkspaceDashboard)).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(61_000);
      await waitFor(() => expect(vi.mocked(getWorkspaceDashboard)).toHaveBeenCalledTimes(2));
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the no-access card, not the raw error, when the API refuses this workspace (FB-6.1.9)", async () => {
    vi.mocked(getWorkspaceDashboard).mockRejectedValue(new RequestError("Forbidden", "authz.missing_permission", undefined, 403));
    renderPage();
    expect(await screen.findByRole("heading", { name: "You don't have access to this workspace" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Home" })).toBeTruthy();
    expect(screen.queryByText("Forbidden")).toBeNull();
  });

  // BL-278 (7): a failed check must not show zero shift changes waiting.
  it("does not show zero shift changes when they could not be checked", async () => {
    currentContext = { ...context, actions: [...context.actions, "exchange.read"] };
    vi.mocked(getExchanges).mockRejectedValue(new Error("Offline"));
    renderPage();
    const label = await screen.findByText("Shift changes");
    await waitFor(() => expect(vi.mocked(getExchanges)).toHaveBeenCalled());
    await waitFor(() => expect(label.previousElementSibling?.textContent).toBe("—"));
  });

  // BL-176: whether shift changes are counted is the core's answer.
  it("does not ask for shift changes on the permission alone", async () => {
    currentContext = { ...context, permissions: [...context.permissions, "schedule.shift_change_requests.read"] };
    vi.mocked(getExchanges).mockClear();
    renderPage();
    await screen.findByText("Shift changes");
    expect(vi.mocked(getExchanges)).not.toHaveBeenCalled();
  });

  it("shows a visit-based setup checklist to owner roles", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "Workspace" })).toBeTruthy();
    const checklist = await screen.findByRole("region", {
      name: "Setup checklist",
    });
    expect(within(checklist).getByRole("heading", { name: "Setup checklist" })).toBeTruthy();
    expect(within(checklist).getByRole("link", { name: /employees/i })).toBeTruthy();
    expect(within(checklist).getByRole("link", { name: /billing/i })).toBeTruthy();
    expect(within(checklist).getByRole("button", { name: /app tour/i })).toBeTruthy();
  });

  it("stores checklist visits per user and workspace on the server", async () => {
    renderPage();
    const checklist = await screen.findByRole("region", {
      name: "Setup checklist",
    });

    fireEvent.click(within(checklist).getByRole("link", { name: /employees/i }));

    expect(await screen.findByText("Employees route")).toBeTruthy();
    await waitFor(() =>
      expect(markOwnerSetupChecklistItem).toHaveBeenCalledWith(
        workspaceId,
        "employees",
      ),
    );
  });

  it("hides checklist after demotion and restores the same progress after re-promotion", async () => {
    const rendered = renderPage();
    const checklist = await screen.findByRole("region", {
      name: "Setup checklist",
    });

    fireEvent.click(within(checklist).getByRole("button", { name: /app tour/i }));
    await waitFor(() =>
      expect(markOwnerSetupChecklistItem).toHaveBeenCalledWith(
        workspaceId,
        "app_tour",
      ),
    );
    await waitFor(() =>
      expect(
        within(checklist).getByText("1 of 2 required visits complete"),
      ).toBeTruthy(),
    );

    currentContext = {
      ...context,
      membership: { ...context.membership, role: "employee" },
    };
    rendered.rerender(
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: {
              queries: { retry: false },
              mutations: { retry: false },
            },
          })
        }
      >
        <MemoryRouter initialEntries={["/app/workspace"]}>
          <Routes>
            <Route path="/app/workspace" element={<WorkspacePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.queryByRole("heading", { name: "Setup checklist" })).toBeNull();

    currentContext = context;
    rendered.rerender(
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: {
              queries: { retry: false },
              mutations: { retry: false },
            },
          })
        }
      >
        <MemoryRouter initialEntries={["/app/workspace"]}>
          <Routes>
            <Route path="/app/workspace" element={<WorkspacePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const restoredChecklist = await screen.findByRole("region", {
      name: "Setup checklist",
    });
    await waitFor(() =>
      expect(
        within(restoredChecklist).getByText("1 of 2 required visits complete"),
      ).toBeTruthy(),
    );
  });

  it("shows open workspace todos from the dashboard", async () => {
    vi.mocked(getWorkspaceDashboard).mockResolvedValue({
      ...dashboard,
      todos: [
        {
          id: "a9700000-0000-4000-8000-000000000001",
          workspace_id: workspaceId,
          title: "Employee document expires soon",
          body: "Taylor Reed - Food handler card",
          severity: "warning",
          status: "open",
          system_generated: true,
          source_type: "employee_document_expiry",
          source_id: "a9800000-0000-4000-8000-000000000001",
          source_key: "requirement:a9900000-0000-4000-8000-000000000001",
          employee_id: "aa000000-0000-4000-8000-000000000001",
          due_at: "2026-09-19T00:00:00.000Z",
          action_url: "/app/employees",
          created_at: "2026-09-05T12:00:00.000Z",
        },
      ],
    });
    renderPage();

    const todos = await screen.findByRole("heading", { name: "Todos" });
    expect(todos).toBeTruthy();
    expect(screen.getByText("Employee document expires soon")).toBeTruthy();
  });

  it("creates manual workspace todos from the widget", async () => {
    renderPage();

    const input = await screen.findByLabelText("New todo");
    fireEvent.change(input, { target: { value: "Call supplier" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(createWorkspaceTodo).toHaveBeenCalledWith(workspaceId, {
        title: "Call supplier",
        body: "",
        employee_id: null,
        due_at: null,
      }),
    );
  });

  it("resolves manual workspace todos without exposing system todo completion", async () => {
    vi.mocked(getWorkspaceDashboard).mockResolvedValue({
      ...dashboard,
      todos: [
        {
          id: "a9700000-0000-4000-8000-000000000011",
          workspace_id: workspaceId,
          title: "Call supplier",
          body: "",
          severity: "info",
          status: "open",
          system_generated: false,
          source_type: "manual",
          source_id: "a9700000-0000-4000-8000-000000000012",
          source_key: "manual:a9700000-0000-4000-8000-000000000012",
          employee_id: null,
          due_at: null,
          action_url: null,
          created_at: "2026-09-05T12:00:00.000Z",
        },
        {
          id: "a9700000-0000-4000-8000-000000000013",
          workspace_id: workspaceId,
          title: "Employee document expires soon",
          body: "Taylor Reed - Food handler card",
          severity: "warning",
          status: "open",
          system_generated: true,
          source_type: "employee_document_expiry",
          source_id: "a9800000-0000-4000-8000-000000000001",
          source_key: "requirement:a9900000-0000-4000-8000-000000000001",
          employee_id: "aa000000-0000-4000-8000-000000000001",
          due_at: null,
          action_url: null,
          created_at: "2026-09-05T12:00:00.000Z",
        },
      ],
    });
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "Resolve Call supplier" }),
    );

    await waitFor(() =>
      expect(resolveWorkspaceTodo).toHaveBeenCalledWith(
        workspaceId,
        "a9700000-0000-4000-8000-000000000011",
      ),
    );
    expect(
      screen.queryByRole("button", {
        name: "Resolve Employee document expires soon",
      }),
    ).toBeNull();
  });

  it("hides the setup checklist from employee roles", async () => {
    currentContext = {
      ...context,
      membership: { ...context.membership, role: "employee" },
    };
    renderPage();

    expect(await screen.findByRole("heading", { name: "Workspace" })).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Setup checklist" })).toBeNull(),
    );
  });

  it("hides the setup checklist when it is closed in settings", async () => {
    vi.mocked(getOwnerSetupChecklistProgress).mockImplementation(async () => ({
      workspace_id: workspaceId,
      user_id: userId,
      completed_item_ids: ["app_tour"],
      closed_at: "2026-09-05T12:00:00.000Z",
    }));
    renderPage();

    expect(await screen.findByRole("heading", { name: "Workspace" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Setup checklist" })).toBeNull();
  });

  it("describes checklist progress as visits instead of completed setup", async () => {
    renderPage();
    const checklist = await screen.findByRole("region", {
      name: "Setup checklist",
    });

    expect(
      within(checklist).getByText("0 of 2 required visits complete"),
    ).toBeTruthy();
    expect(within(checklist).getAllByText("Optional visit").length).toBeGreaterThan(0);
    expect(within(checklist).queryByText(/setup complete/i)).toBeNull();
  });
});
