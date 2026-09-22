import type { WorkspaceSummary } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listAccountWorkspaces } from "../lib/supabase";
import WorkspaceStatusPage from "./WorkspaceStatusPage";

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    account: { email: "member@example.test", displayName: "Member" },
    authenticated: true,
    signOut: vi.fn(),
  }),
}));
vi.mock("../lib/supabase", () => ({
  listAccountWorkspaces: vi.fn(),
  supabaseClient: {},
}));

const workspaceId = "41000000-0000-4000-8000-000000000001";

function workspace(overrides: Partial<WorkspaceSummary>): WorkspaceSummary {
  return {
    id: workspaceId,
    name: "Harbour & Co",
    role: "employee",
    status: "active",
    isActive: false,
    onboarding: { status: "complete", currentStep: 4, revision: 1 },
    ...overrides,
  } as WorkspaceSummary;
}

function renderStatus() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/workspaces/status/${workspaceId}`]}>
        <Routes>
          <Route
            path="/workspaces/status/:workspaceId"
            element={<WorkspaceStatusPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("WorkspaceStatusPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("names the workspace on hold and says the others are unaffected", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([
      workspace({ status: "suspended" }),
    ]);
    renderStatus();

    expect(
      await screen.findByRole("heading", { name: "Harbour & Co is on hold" }),
    ).toBeTruthy();
    expect(screen.getByText(/other workspaces are unaffected/)).toBeTruthy();
  });

  // The three endings used to arrive as the same "on hold" screen, and two of
  // them never arrived at all because the list filtered them out.
  it("tells an account whose access was taken what happened to their history", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([
      workspace({ status: "suspended", accessRemoved: true }),
    ]);
    renderStatus();

    expect(
      await screen.findByRole("heading", {
        name: "You no longer have access to Harbour & Co",
      }),
    ).toBeTruthy();
    expect(screen.getByText(/work history there is kept/)).toBeTruthy();
  });

  it("says when a closed workspace closed", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([
      workspace({
        status: "suspended",
        lifecycleStatus: "deleted",
        closureEffectiveAt: "2026-09-01T12:00:00.000Z",
      }),
    ]);
    renderStatus();

    expect(
      await screen.findByRole("heading", { name: "Harbour & Co has closed" }),
    ).toBeTruthy();
    expect(screen.getByText(/closed on/)).toBeTruthy();
  });

  it("calls a workspace closed once its scheduled date has passed", async () => {
    // Nothing flips the stored status when the day comes -- the date is what
    // ends access -- so the screen has to read the date, or it falls through
    // to a sentence about the person instead of the workspace.
    vi.mocked(listAccountWorkspaces).mockResolvedValue([
      workspace({
        status: "active",
        lifecycleStatus: "closure_scheduled",
        closureEffectiveAt: "2026-09-01T12:00:00.000Z",
      }),
    ]);
    renderStatus();

    expect(
      await screen.findByRole("heading", { name: "Harbour & Co has closed" }),
    ).toBeTruthy();
    expect(screen.getByText(/not your access to it/)).toBeTruthy();
  });

  it("leaves a workspace closing later alone", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([
      workspace({
        status: "suspended",
        lifecycleStatus: "closure_scheduled",
        closureEffectiveAt: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    ]);
    renderStatus();

    expect(
      await screen.findByRole("heading", { name: "Harbour & Co is on hold" }),
    ).toBeTruthy();
  });

  it("says closed rather than on hold when closing suspended the membership", async () => {
    // Closing a workspace suspends every membership in it. Reading the
    // membership first would promise an owner who could lift the hold.
    vi.mocked(listAccountWorkspaces).mockResolvedValue([
      workspace({
        status: "suspended",
        accessRemoved: true,
        lifecycleStatus: "closed",
        closureEffectiveAt: "2026-09-01T12:00:00.000Z",
      }),
    ]);
    renderStatus();

    expect(
      await screen.findByRole("heading", { name: "Harbour & Co has closed" }),
    ).toBeTruthy();
  });

  it("does not guess when the workspace is not in the account's list", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([]);
    renderStatus();

    expect(
      await screen.findByRole("heading", {
        name: "That workspace isn't open to you",
      }),
    ).toBeTruthy();
  });

  it("always offers a way on", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([
      workspace({ status: "suspended" }),
    ]);
    renderStatus();

    expect(
      await screen.findByRole("button", { name: "Choose a workspace" }),
    ).toBeTruthy();
  });
});
