import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type {
  ActiveWorkspaceContext,
  ManagerHome,
  OwnerSetupChecklistItemId,
  WorkspaceDashboard,
} from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WorkspacePage, { dueLabel } from "./WorkspacePage";
import {
  createWorkspaceTodo,
  getManagerHome,
  getOwnerSetupChecklistProgress,
  getWorkspaceDashboard,
  markOwnerSetupChecklistItem,
  resolveWorkspaceTodo,
  saveWorkspaceLayout,
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
    access: { employee: false, management: "owner" },
    status: "active",
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
  },
  today_ends_at: null,
  announcements: [],
  todos: [],
  layout: {
    widget_order: [
      "operations",
      "pending_requests",
      "open_shifts",
      "announcements",
      "todos",
      "quick_actions",
    ],
    hidden_widget_ids: [],
  },
} satisfies WorkspaceDashboard;

// The managers' Home read (YONETICI-HOME): one location, nothing on today.
const week = Array.from({ length: 7 }, (_, index) => ({
  date: `2026-10-${String(20 + index).padStart(2, "0")}`,
  shifts: 0,
  open: 0,
  published: true,
}));
const kadikoy = {
  id: "11000000-0000-4000-8000-000000000001",
  name: "Kadikoy",
  timezone: "Europe/Istanbul",
  today: "2026-10-20",
  today_shifts: [],
  floor_managers: [],
  week,
  open_shifts: [],
  missing_documents: [],
};
const managerHome = {
  workspace_id: workspaceId,
  now: "2026-10-20T12:00:00Z",
  locations: [kadikoy],
  time_off: [],
} satisfies ManagerHome;
const greeting = { name: /^(Good morning|Good afternoon|Good evening|Up late), Meyhouse\.$/ };

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
  getManagerHome: vi.fn(),
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
    vi.mocked(getManagerHome).mockResolvedValue(managerHome);
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
    const view = render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/app/workspace"]}>
          <Routes>
            <Route path="/app/workspace" element={<WorkspacePage />} />
            <Route path="/app/employees" element={<p>Employees route</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    return { ...view, client };
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
      await screen.findByRole("heading", greeting);
      expect(vi.mocked(getWorkspaceDashboard)).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(4 * 60_000);
      expect(vi.mocked(getWorkspaceDashboard)).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(61_000);
      await waitFor(() => expect(vi.mocked(getWorkspaceDashboard)).toHaveBeenCalledTimes(2));
    } finally {
      vi.useRealTimers();
    }
  });

  // A device clock ahead of the server gets yesterday's answer back at its
  // midnight; the page keeps asking, calmly, until the server's day turns.
  it("keeps reading every 30 seconds while the server still answers the old day", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.mocked(getWorkspaceDashboard).mockResolvedValue({
        ...dashboard,
        today_ends_at: new Date(Date.now() - 1_000).toISOString(),
      });
      renderPage();
      await screen.findByRole("heading", greeting);
      expect(vi.mocked(getWorkspaceDashboard)).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(29_000);
      expect(vi.mocked(getWorkspaceDashboard)).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(2_000);
      await waitFor(() => expect(vi.mocked(getWorkspaceDashboard)).toHaveBeenCalledTimes(2));
      await vi.advanceTimersByTimeAsync(31_000);
      await waitFor(() => expect(vi.mocked(getWorkspaceDashboard)).toHaveBeenCalledTimes(3));
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the no-access card, not the raw error, when the API refuses this workspace (FB-6.1.9)", async () => {
    vi.mocked(getWorkspaceDashboard).mockRejectedValue(new RequestError("Forbidden", "authz.missing_permission", undefined, 403));
    renderPage();
    expect(await screen.findByRole("heading", { name: "You don't have access to Home" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Home" })).toBeTruthy();
    expect(screen.queryByText("Forbidden")).toBeNull();
  });

  // BL-810 (E5-09): the box shows five at most and links to the whole list.
  it("links the announcements box to all announcements", async () => {
    vi.mocked(getWorkspaceDashboard).mockResolvedValue({
      ...dashboard,
      announcements: [
        { id: "a9700000-0000-4000-8000-000000000021", title: "Patio opens", category: "general", body: "From Friday", author_name: "Olcay", published_at: null },
      ] as never,
    });
    renderPage();
    const link = await screen.findByRole("link", { name: "View all announcements" });
    expect(link.getAttribute("href")).toBe("/app/announcements");
    // From your team (Daylight): a notice opens its own page.
    const row = screen.getByRole("link", { name: /Patio opens/ });
    expect(row.getAttribute("href")).toBe("/app/announcements/a9700000-0000-4000-8000-000000000021");
  });

  // BILDIRIM-06 (KARARLAR S-123, S-96): the old notification system is gone,
  // and with it the Notifications card: six sections, on the page and in
  // Customize, under Home's names (YONETICI-HOME, S-210 (a)).
  it("has six sections and no Notifications section, also in Customize", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Todos" });
    expect(screen.queryByRole("heading", { name: "Notifications" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Customize/ }));
    expect(screen.getAllByRole("button", { name: /^Hide / }).map((button) => button.getAttribute("aria-label"))).toEqual([
      "Hide Your locations",
      "Hide Needs you",
      "Hide Open shifts",
      "Hide From your team",
      "Hide Todos",
      "Hide Next 7 days",
    ]);
    expect(screen.queryByRole("button", { name: "Hide Notifications" })).toBeNull();
  });

  // BL-813 (E5-13): a hidden card in Customize is a preview, not a form; six
  // hidden cards leave a line saying so; the eye icons are decoration.
  it("keeps a hidden card's content out of reach and its eye icons decorative", async () => {
    vi.mocked(getWorkspaceDashboard).mockResolvedValue({
      ...dashboard,
      layout: { ...dashboard.layout, hidden_widget_ids: ["todos"] },
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Customize/ }));
    const todos = screen.getByRole("heading", { name: "Todos" }).closest(".mh-cz")!;
    expect(todos.querySelector("[inert]")?.querySelector("input")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Show Todos" }).querySelector("svg")?.getAttribute("aria-hidden"),
    ).toBe("true");
    // Showing it again keeps the typed todo: the card is not rebuilt.
    fireEvent.change(todos.querySelector("input")!, { target: { value: "Call the plumber" } });
    fireEvent.click(screen.getByRole("button", { name: "Show Todos" }));
    expect(todos.querySelector("[inert]")).toBeNull();
    expect(todos.querySelector("input")?.value).toBe("Call the plumber");
    expect(
      screen.getByRole("button", { name: "Hide From your team" }).querySelector("svg")
        ?.getAttribute("aria-hidden"),
    ).toBe("true");
  });
  it("says every card is hidden instead of an empty page", async () => {
    vi.mocked(getWorkspaceDashboard).mockResolvedValue({
      ...dashboard,
      layout: { ...dashboard.layout, hidden_widget_ids: [...dashboard.layout.widget_order] },
    });
    renderPage();
    expect(
      await screen.findByText("Every card is hidden. Use Customize to show them again."),
    ).toBeTruthy();
  });

  // BL-814 (E5-14): a dropped connection or a server failure reads as one
  // plain sentence, never the browser's or the server's words.
  it("words a failed page read for the person", async () => {
    vi.mocked(getWorkspaceDashboard).mockRejectedValue(new TypeError("Failed to fetch"));
    renderPage();
    const card = await screen.findByRole("alert");
    expect(within(card).getByRole("heading", { name: "We couldn't load Home" })).toBeTruthy();
    expect(screen.queryByText("Failed to fetch")).toBeNull();
  });

  // Loading and error in the "B" look (Mert 2026-10-14).
  it("outlines the cards while Home loads, then loads again from Try again", async () => {
    vi.mocked(getWorkspaceDashboard).mockReturnValueOnce(new Promise(() => {}) as never);
    const { unmount } = renderPage();
    expect(screen.getAllByRole("status").some((node) => node.textContent === "Loading Home")).toBe(true);
    expect(screen.queryByText("Loading Home...")).toBeNull();
    unmount();

    vi.mocked(getWorkspaceDashboard).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderPage();
    const card = await screen.findByRole("alert");
    fireEvent.click(within(card).getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", greeting)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "We couldn't load Home" })).toBeNull();
  });

  // The checklist sits above the cards: if it painted after them, every card
  // would jump down under the owner's thumb (CI run 39023052297, 405 px on a
  // phone). The outline stays until both have answered; they paint together.
  it("keeps the outline until the setup checklist has answered, so the cards never jump", async () => {
    let answer!: (progress: Awaited<ReturnType<typeof getOwnerSetupChecklistProgress>>) => void;
    vi.mocked(getOwnerSetupChecklistProgress).mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    renderPage();
    await waitFor(() => expect(getWorkspaceDashboard).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    // Both reads start at once, not one after the other.
    expect(getOwnerSetupChecklistProgress).toHaveBeenCalledWith(workspaceId);
    expect(screen.getAllByRole("status").some((node) => node.textContent === "Loading Home")).toBe(true);
    const cards = [...document.querySelectorAll(".mh-loc")];
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((card) => card.querySelector(".nf-skeleton"))).toBe(true);
    expect(screen.queryByRole("heading", greeting)).toBeNull();

    await act(async () => {
      answer({ workspace_id: workspaceId, user_id: userId, completed_item_ids: [], closed_at: null });
    });
    expect(await screen.findByRole("region", { name: "Setup checklist" })).toBeTruthy();
    expect(screen.getByRole("heading", greeting)).toBeTruthy();
  });

  it("keeps the last cards and says so when a refresh fails", async () => {
    const { client } = renderPage();
    expect(await screen.findByRole("heading", greeting)).toBeTruthy();
    const cards = document.querySelectorAll(".dl-sec").length;
    expect(cards).toBeGreaterThan(0);
    vi.mocked(getWorkspaceDashboard).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await act(async () => {
      await client.refetchQueries({ queryKey: ["workspace-dashboard"] });
    });
    expect(
      await screen.findByText("Home didn't refresh. These are the last numbers that loaded."),
    ).toBeTruthy();
    expect(document.querySelectorAll(".dl-sec").length).toBe(cards);
    expect(screen.queryByText("Failed to fetch")).toBeNull();
  });
  it("words a failed layout save for the person", async () => {
    vi.mocked(saveWorkspaceLayout).mockRejectedValue(
      new RequestError("Internal server error", undefined, undefined, 500),
    );
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Customize/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save layout" }));
    expect(
      await screen.findByText("Newfork could not finish that. Try again in a moment."),
    ).toBeTruthy();
    expect(screen.queryByText("Internal server error")).toBeNull();
  });
  it("says the checklist could not be loaded when its read fails", async () => {
    vi.mocked(getOwnerSetupChecklistProgress).mockRejectedValue(new TypeError("Failed to fetch"));
    renderPage();
    const card = await screen.findByRole("heading", { name: "We couldn't load the setup checklist" });
    expect(card.tagName).toBe("H3");
    expect(screen.queryByText("Setup checklist progress could not be saved.")).toBeNull();
    // Unknown is not zero: no "0 of N" and no list of unvisited steps.
    expect(screen.queryByText(/required visits complete/)).toBeNull();
    expect(screen.queryByText("Failed to fetch")).toBeNull();
  });

  // BL-278 (7): a failed check must not show zero shift changes waiting.
  it("does not show zero shift changes when they could not be checked", async () => {
    currentContext = { ...context, actions: [...context.actions, "exchange.read"] };
    vi.mocked(getExchanges).mockRejectedValue(new Error("Offline"));
    renderPage();
    await screen.findByRole("heading", { name: "Needs you" });
    await waitFor(() => expect(vi.mocked(getExchanges)).toHaveBeenCalled());
    // Unknown is not zero: "Needs you" says the check failed instead of "all caught up" alone.
    expect(await screen.findByText("Shift changes couldn't be checked.")).toBeTruthy();
  });

  // BL-176: whether shift changes are counted is the core's answer.
  it("does not ask for shift changes on the permission alone", async () => {
    currentContext = { ...context, permissions: [...context.permissions, "schedule.shift_change_requests.read"] };
    vi.mocked(getExchanges).mockClear();
    renderPage();
    await screen.findByRole("heading", { name: "Needs you" });
    expect(vi.mocked(getExchanges)).not.toHaveBeenCalled();
  });

  it("keeps the last checklist visits and says so when a refresh fails", async () => {
    const { client } = renderPage();
    const checklist = await screen.findByRole("region", { name: "Setup checklist" });
    const items = checklist.querySelectorAll(".owner-setup-checklist-item").length;
    expect(items).toBeGreaterThan(0);
    vi.mocked(getOwnerSetupChecklistProgress).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await act(async () => {
      await client.refetchQueries({ queryKey: ["owner-setup-checklist"] });
    });
    expect(
      await screen.findByText("The setup checklist didn't refresh. These are the last visits that loaded."),
    ).toBeTruthy();
    expect(checklist.querySelectorAll(".owner-setup-checklist-item").length).toBe(items);
    expect(within(checklist).getByText(/required visits complete/)).toBeTruthy();
  });

  it("shows a visit-based setup checklist to owner roles", async () => {
    renderPage();

    expect(await screen.findByRole("heading", greeting)).toBeTruthy();
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
      membership: { ...context.membership, access: { employee: true, management: null } },
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
    // BL-666 (2): a due date does not hide whose document it is.
    const row = screen.getByRole("link", { name: /Employee document expires soon/ });
    expect(row.textContent).toContain("Taylor Reed - Food handler card");
    expect(row.textContent).toMatch(/Due (in )?\d+[mhd]( ago)?/);
    // BL-666 (4): a row that goes somewhere keeps its arrow.
    expect(row.querySelector(".lucide-arrow-right")).toBeTruthy();
  });

  // BL-666 (4): only a row that goes somewhere carries the arrow.
  it("draws the row arrow only on todos that link somewhere", async () => {
    vi.mocked(getWorkspaceDashboard).mockResolvedValue({
      ...dashboard,
      todos: [
        {
          id: "a9700000-0000-4000-8000-000000000002",
          workspace_id: workspaceId,
          title: "Restock napkins",
          body: "",
          severity: "info",
          status: "open",
          system_generated: false,
          source_type: null,
          source_id: null,
          source_key: null,
          employee_id: null,
          due_at: null,
          action_url: null,
          created_at: "2026-09-05T12:00:00.000Z",
        },
      ] as never,
    });
    renderPage();
    const title = await screen.findByText("Restock napkins");
    const row = title.closest(".workspace-todo-row")!;
    expect(row.querySelector(".lucide-arrow-right")).toBeNull();
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
      membership: { ...context.membership, access: { employee: true, management: null } },
    };
    renderPage();

    expect(await screen.findByRole("heading", greeting)).toBeTruthy();
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

    expect(await screen.findByRole("heading", greeting)).toBeTruthy();
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

  // YONETICI-HOME (KARARLAR S-210): "Locations first".
  describe("Locations first", () => {
    const now = Date.now();
    const besiktas = {
      ...kadikoy,
      id: "11000000-0000-4000-8000-000000000002",
      name: "Besiktas",
      // One person on the floor right now; one more shift later today.
      today_shifts: [
        { starts_at: new Date(now - 3_600_000).toISOString(), ends_at: new Date(now + 3_600_000).toISOString(), open: false },
        { starts_at: new Date(now + 7_200_000).toISOString(), ends_at: new Date(now + 9_000_000).toISOString(), open: true },
      ],
      missing_documents: [
        { employee_id: "aa000000-0000-4000-8000-000000000001", name: "Sam Ortiz", document: "Alcohol Server Permit" },
      ],
    };
    const two = {
      ...managerHome,
      locations: [besiktas, kadikoy],
      time_off: [
        { id: "ab000000-0000-4000-8000-000000000001", employee_id: "aa000000-0000-4000-8000-000000000002", employee_name: "Emre Demir",
          first_date: "2026-10-23", last_date: "2026-10-25", location_ids: [kadikoy.id] },
      ],
    } satisfies ManagerHome;
    const needs = () => screen.getByRole("region", { name: "Needs you" });
    const rows = () => within(needs()).getAllByRole("link").map((row) => row.querySelector("b")?.textContent);

    it("draws a card per location with who is on the floor and a badge, and groups Needs you by location", async () => {
      vi.mocked(getManagerHome).mockResolvedValue(two);
      renderPage();
      const card = await screen.findByRole("button", { name: /^Besiktas:/ });
      expect(card.getAttribute("aria-pressed")).toBe("false");
      expect(card.querySelector(".mh-loc-n")?.textContent).toMatch(/^1on now/);
      expect(within(card).getByLabelText("1 person working without a required document").textContent).toBe("1 document");
      expect(within(screen.getByRole("button", { name: /^Kadikoy:/ })).getByLabelText("1 thing need you here")).toBeTruthy();
      expect(screen.getByRole("heading", { name: "Your locations" })).toBeTruthy();
      // S-206's warning first, in red; each location under its own heading.
      expect(within(needs()).getAllByRole("listitem").map((item) => item.querySelector("b")?.textContent ?? item.textContent)).toEqual([
        "Besiktas",
        "Sam Ortiz is working without a required document",
        "Kadikoy",
        "Emre Demir asks for time off",
      ]);
      expect(needs().querySelector(".dl-cnt")?.className).toContain("is-warn");
      expect(screen.getByText(/1 person on the floor across 2 locations\. 2 things need you\./)).toBeTruthy();
    });

    it("narrows the page to a location from its card or its chip, and back to all", async () => {
      vi.mocked(getManagerHome).mockResolvedValue(two);
      renderPage();
      fireEvent.click(await screen.findByRole("button", { name: /^Kadikoy:/ }));
      expect(screen.getByRole("button", { name: /^Kadikoy:/ }).getAttribute("aria-pressed")).toBe("true");
      expect(rows()).toEqual(["Emre Demir asks for time off"]);
      expect(screen.getByRole("heading", { name: "Next 7 days · Kadikoy" })).toBeTruthy();
      const chips = screen.getByRole("group", { name: "Location" });
      fireEvent.click(within(chips).getByRole("button", { name: "Besiktas" }));
      expect(rows()).toEqual(["Sam Ortiz is working without a required document"]);
      fireEvent.click(within(chips).getByRole("button", { name: "All locations" }));
      expect(rows()).toHaveLength(2);
    });

    it("draws one card and no chips for one location", async () => {
      renderPage();
      await screen.findByRole("heading", greeting);
      expect(screen.getByRole("heading", { name: "Your location" })).toBeTruthy();
      expect(document.querySelectorAll(".mh-loc")).toHaveLength(1);
      expect(screen.queryByRole("group", { name: "Location" })).toBeNull();
      expect(screen.queryByRole("button", { name: /^Kadikoy:/ })).toBeNull();
    });

    it("keeps the rest of Home when the locations' read fails", async () => {
      vi.mocked(getManagerHome).mockRejectedValue(new TypeError("Failed to fetch"));
      renderPage();
      expect(await screen.findByRole("heading", { name: "We couldn't load your locations" })).toBeTruthy();
      expect(screen.getByRole("heading", { name: "Todos" })).toBeTruthy();
      expect(screen.queryByText("Failed to fetch")).toBeNull();
    });
  });
});

// BL-1013: a to-do due later read "Due 1m ago".
describe("dueLabel", () => {
  const now = Date.parse("2026-10-11T12:00:00Z");
  it("says how far ahead a due time is", () => {
    expect(dueLabel("2026-10-11T12:20:00Z", now)).toBe("Due in 20m");
    expect(dueLabel("2026-10-11T15:00:00Z", now)).toBe("Due in 3h");
    expect(dueLabel("2026-10-14T12:00:00Z", now)).toBe("Due in 3d");
  });
  it("says how long ago a due time went by", () => {
    expect(dueLabel("2026-10-11T11:30:00Z", now)).toBe("Due 30m ago");
    expect(dueLabel("2026-10-09T12:00:00Z", now)).toBe("Due 2d ago");
  });
});
