import type { WorkspaceSummary } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listPendingEmployeeInvitations } from "../employees/employee-data";
import {
  listAccountWorkspaces,
  loadAccountEverLinked,
  selectActiveWorkspace,
} from "../lib/supabase";
import WorkspaceHubPage from "./WorkspaceHubPage";

const refresh = vi.fn();

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    account: { email: "cook@example.test" },
    context: null,
    refresh,
    signOut: vi.fn(),
  }),
}));

vi.mock("../employees/employee-data", () => ({
  listPendingEmployeeInvitations: vi.fn(),
  acceptPendingEmployeeInvitation: vi.fn(),
  declinePendingEmployeeInvitation: vi.fn(),
}));

vi.mock("../lib/supabase", () => ({
  createOwnerWorkspace: vi.fn(),
  listAccountWorkspaces: vi.fn(),
  loadAccountEverLinked: vi.fn(),
  selectActiveWorkspace: vi.fn(),
  setTabWorkspaceId: vi.fn(),
  supabaseClient: {},
}));

function workspace(
  overrides: Partial<WorkspaceSummary> & Pick<WorkspaceSummary, "id" | "name">,
): WorkspaceSummary {
  return {
    role: "owner",
    status: "active",
    isActive: false,
    onboarding: { status: "complete", currentStep: 4, revision: 1 },
    ...overrides,
  } as WorkspaceSummary;
}

const meyhouse = workspace({
  id: "26000000-0000-4000-8000-000000000001",
  name: "Meyhouse",
});
const ridgeline = workspace({
  id: "26000000-0000-4000-8000-000000000002",
  name: "Ridgeline",
  role: "manager",
});
const halfBuilt = workspace({
  id: "26000000-0000-4000-8000-000000000003",
  name: "Palo Alto",
  onboarding: { status: "incomplete", currentStep: 2, revision: 1 },
});

const invitation = {
  id: "27000000-0000-4000-8000-000000000001",
  workspaceId: ridgeline.id,
  workspaceName: "Juniper",
  emailHint: "co***@example.test",
  expiresAt: "2099-01-01T00:00:00.000Z",
};

function Probe() {
  return <output aria-label="Current path">{useLocation().pathname}</output>;
}

function renderHub(landing = true) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[{ pathname: "/workspaces", state: { landing } }]}
      >
        <Routes>
          <Route path="/workspaces" element={<WorkspaceHubPage />} />
          <Route path="/app/workspace" element={<Probe />} />
          <Route path="/app/employee-hub" element={<Probe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("WorkspaceHubPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refresh.mockResolvedValue(null);
    vi.mocked(loadAccountEverLinked).mockResolvedValue(false);
    vi.mocked(selectActiveWorkspace).mockResolvedValue(undefined as never);
  });

  it("welcomes an account that belongs nowhere and offers both ways in (R6)", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([]);
    vi.mocked(listPendingEmployeeInvitations).mockResolvedValue([]);
    renderHub();

    expect(
      await screen.findByRole("heading", { name: "Welcome to Newfork" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Create your workspace/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "I am waiting for an invitation" }),
    ).toBeTruthy();
  });

  it("does not welcome an account that has been linked before", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([]);
    vi.mocked(listPendingEmployeeInvitations).mockResolvedValue([]);
    vi.mocked(loadAccountEverLinked).mockResolvedValue(true);
    renderHub();

    expect(
      await screen.findByRole("heading", { name: "Welcome back" }),
    ).toBeTruthy();
    // KARARLAR "Welcome back": the second way in says "another invitation".
    fireEvent.click(
      screen.getByRole("button", { name: "I am waiting for another invitation" }),
    );
    // E16-L-welcome-metin: "it" read as the person; the address is meant.
    expect(
      await screen.findByText(
        "Nothing has been sent to this address so far — ask your manager to invite this email.",
      ),
    ).toBeTruthy();
  });

  it("lists a waiting invitation for an account with nowhere to work (R2)", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([]);
    vi.mocked(listPendingEmployeeInvitations).mockResolvedValue([invitation]);
    renderHub();

    expect(
      await screen.findByRole("heading", { name: "You have an invitation" }),
    ).toBeTruthy();
    expect(screen.getByText("Juniper")).toBeTruthy();
  });

  it("offers an unfinished setup instead of forcing it (R3)", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([halfBuilt]);
    vi.mocked(listPendingEmployeeInvitations).mockResolvedValue([]);
    renderHub();

    expect(
      await screen.findByRole("heading", { name: "Your workspaces" }),
    ).toBeTruthy();
    expect(screen.getByText("In progress")).toBeTruthy();
    expect(screen.getByText("Palo Alto")).toBeTruthy();
  });

  it("hands an account with one workspace and nothing open straight to it (R4)", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([meyhouse]);
    vi.mocked(listPendingEmployeeInvitations).mockResolvedValue([]);
    renderHub();

    await waitFor(() =>
      expect(screen.getByLabelText("Current path").textContent).toBe(
        "/app/workspace",
      ),
    );
  });

  it("lands on the workspace used last rather than asking which one (R5)", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([
      workspace({ ...meyhouse, lastUsedAt: "2026-09-01T00:00:00.000Z" }),
      workspace({ ...ridgeline, lastUsedAt: "2026-09-20T00:00:00.000Z" }),
    ]);
    vi.mocked(listPendingEmployeeInvitations).mockResolvedValue([]);
    renderHub();

    await waitFor(() =>
      expect(screen.getByLabelText("Current path").textContent).toBe(
        "/app/workspace",
      ),
    );
  });

  it("keeps several workspaces on the hub and names each one's role (R5)", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([meyhouse, ridgeline]);
    vi.mocked(listPendingEmployeeInvitations).mockResolvedValue([]);
    renderHub(false);

    expect(await screen.findByText("Where you work")).toBeTruthy();
    expect(screen.getByText("Meyhouse")).toBeTruthy();
    expect(screen.getByText("Ridgeline")).toBeTruthy();
    expect(screen.getByText("Manager")).toBeTruthy();
  });

  it("shows an invitation beside the workspaces instead of interrupting (R7)", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([meyhouse, ridgeline]);
    vi.mocked(listPendingEmployeeInvitations).mockResolvedValue([invitation]);
    renderHub();

    expect(
      await screen.findByRole("heading", { name: "You have an invitation" }),
    ).toBeTruthy();
    expect(screen.getByText("Where you work")).toBeTruthy();
  });

  // Three ways a workspace stops being somewhere to work. Two of them used to
  // be filtered out of the list entirely, which reads as never having existed.
  it.each([
    [{ status: "suspended" as const }, "On hold"],
    [{ status: "suspended" as const, accessRemoved: true }, "Access removed"],
    [
      { status: "suspended" as const, lifecycleStatus: "deleted" as const },
      "Closed",
    ],
  ])("sorts an ended workspace under its own ending (%#)", async (state, badge) => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([
      workspace({ ...meyhouse, ...state }),
      ridgeline,
    ]);
    vi.mocked(listPendingEmployeeInvitations).mockResolvedValue([]);
    renderHub(false);

    expect(await screen.findByText("No longer open to you")).toBeTruthy();
    expect(screen.getByText(badge)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Why Meyhouse is not open" }),
    ).toBeTruthy();
    // It is not offered as somewhere to work.
    expect(
      screen.queryByRole("button", { name: "Open Meyhouse" }),
    ).toBeNull();
  });

  it("says so plainly when the list does not load", async () => {
    vi.mocked(listAccountWorkspaces).mockRejectedValue(new Error("boom"));
    vi.mocked(listPendingEmployeeInvitations).mockResolvedValue([]);
    renderHub();

    expect(
      await screen.findByRole("heading", { name: "Your workspaces didn't load" }),
    ).toBeTruthy();
    expect(screen.queryByText("boom")).toBeNull();
  });

  it("does not offer a second setup while one is already unfinished", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([halfBuilt, ridgeline]);
    vi.mocked(listPendingEmployeeInvitations).mockResolvedValue([]);
    renderHub();

    await screen.findByText("In progress");
    expect(screen.queryByText("Your own workspace")).toBeNull();
  });
});
