import type { WorkspaceSummary } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invitationPromptAnswered } from "../auth/invitation-prompt";
import {
  acceptPendingEmployeeInvitation,
  declinePendingEmployeeInvitation,
  listPendingEmployeeInvitations,
} from "../employees/employee-data";
import { listAccountWorkspaces } from "../lib/supabase";
import InvitationPromptPage from "./InvitationPromptPage";

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    account: { email: "cook@example.test" },
    context: null,
    refresh: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock("../employees/employee-data", () => ({
  listPendingEmployeeInvitations: vi.fn(),
  acceptPendingEmployeeInvitation: vi.fn(),
  declinePendingEmployeeInvitation: vi.fn(),
}));

vi.mock("../lib/supabase", () => ({
  listAccountWorkspaces: vi.fn(),
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

const sunset = {
  id: "27000000-0000-4000-8000-000000000001",
  workspaceId: "27000000-0000-4000-8000-0000000000a1",
  workspaceName: "Sunset Tacos",
  emailHint: "al***@example.test",
  expiresAt: "2099-01-01T00:00:00.000Z",
};
const juniper = {
  ...sunset,
  id: "27000000-0000-4000-8000-000000000002",
  workspaceId: "27000000-0000-4000-8000-0000000000a2",
  workspaceName: "Juniper",
};

function Probe() {
  return <output aria-label="Current path">{useLocation().pathname}</output>;
}

function renderPrompt(from?: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[{ pathname: "/invitations", state: from ? { from } : null }]}
      >
        <Routes>
          <Route path="/invitations" element={<InvitationPromptPage />} />
          <Route path="/workspaces" element={<Probe />} />
          <Route path="/app/workspace" element={<Probe />} />
          <Route path="/app/schedule" element={<Probe />} />
          <Route path="/welcome/:workspaceId" element={<Probe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// KARARLAR "Girişten sonra yönlendirme", görünüm A (Mert, 2026-10-05): one
// column, a row per invitation with a white Decline and a green Join, then a
// white "Not now" and one line saying where it goes (BL-624).
describe("InvitationPromptPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  it("lists the invitation with Decline and Join, and says where Not now goes", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([meyhouse]);
    vi.mocked(listPendingEmployeeInvitations).mockResolvedValue([sunset]);
    renderPrompt();

    expect(
      await screen.findByRole("heading", { name: "Active invitation found" }),
    ).toBeTruthy();
    expect(screen.getByText("Sunset Tacos")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Decline invitation to Sunset Tacos" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Join Sunset Tacos" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Not now" })).toBeTruthy();
    expect(
      screen.getByText("Takes you to Meyhouse. The invitation stays listed in Workspaces."),
    ).toBeTruthy();
  });

  it("names every invitation when there are several", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([meyhouse]);
    vi.mocked(listPendingEmployeeInvitations).mockResolvedValue([sunset, juniper]);
    renderPrompt();

    expect(
      await screen.findByRole("heading", { name: "Active invitations found" }),
    ).toBeTruthy();
    expect(screen.getByText("Sunset Tacos")).toBeTruthy();
    expect(screen.getByText("Juniper")).toBeTruthy();
  });

  it("takes Not now to the one workspace and does not ask again in this open", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([meyhouse]);
    vi.mocked(listPendingEmployeeInvitations).mockResolvedValue([sunset]);
    renderPrompt();

    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Current path").textContent).toBe(
        "/app/workspace",
      ),
    );
    expect(invitationPromptAnswered()).toBe(true);
  });

  it("takes Not now to Workspaces when there are several to choose from", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([meyhouse, ridgeline]);
    vi.mocked(listPendingEmployeeInvitations).mockResolvedValue([sunset]);
    renderPrompt();

    expect(
      await screen.findByText("Takes you to Workspaces, where the invitation stays listed."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Current path").textContent).toBe(
        "/workspaces",
      ),
    );
  });

  it("takes Not now back to the page a link opened", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([meyhouse, ridgeline]);
    vi.mocked(listPendingEmployeeInvitations).mockResolvedValue([sunset]);
    renderPrompt("/app/schedule");

    expect(
      await screen.findByText(
        "Takes you back to the page you opened. The invitation stays listed in Workspaces.",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Current path").textContent).toBe(
        "/app/schedule",
      ),
    );
  });

  it("offers no Not now to somebody with no workspace: the invitation comes first", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([]);
    vi.mocked(listPendingEmployeeInvitations).mockResolvedValue([sunset]);
    renderPrompt();

    expect(
      await screen.findByRole("heading", { name: "Active invitation found" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Not now" })).toBeNull();
  });

  it("counts joining as the answer for this open", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([meyhouse]);
    vi.mocked(listPendingEmployeeInvitations).mockResolvedValue([sunset]);
    vi.mocked(acceptPendingEmployeeInvitation).mockResolvedValue(sunset.workspaceId);
    renderPrompt();

    fireEvent.click(await screen.findByRole("button", { name: "Join Sunset Tacos" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Current path").textContent).toBe(
        `/welcome/${sunset.workspaceId}`,
      ),
    );
    expect(invitationPromptAnswered()).toBe(true);
  });

  it("lands as usual once the last invitation is declined", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([meyhouse]);
    vi.mocked(listPendingEmployeeInvitations)
      .mockResolvedValueOnce([sunset])
      .mockResolvedValue([]);
    vi.mocked(declinePendingEmployeeInvitation).mockResolvedValue(undefined as never);
    renderPrompt();

    fireEvent.click(
      await screen.findByRole("button", { name: "Decline invitation to Sunset Tacos" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Confirm decline" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Current path").textContent).toBe(
        "/app/workspace",
      ),
    );
    expect(invitationPromptAnswered()).toBe(true);
  });
});
