import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listAccountWorkspaces } from "../lib/supabase";
import { WorkspaceSetupPending } from "./WorkspaceSetupPending";

vi.mock("./AuthContext", () => ({
  useAuth: () => ({
    context: { workspace: { name: "Harbor Grill" } },
    refresh: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock("../lib/supabase", () => ({
  listAccountWorkspaces: vi.fn(),
  supabaseClient: {},
}));

const workspace = {
  id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
  name: "Harbor Grill",
  role: "employee" as const,
  status: "active" as const,
  isActive: true,
  onboarding: { status: "incomplete" as const, currentStep: 2 },
};

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/app/employee-hub"]}>
        <Routes>
          <Route path="/app/employee-hub" element={<WorkspaceSetupPending />} />
          <Route path="/workspaces" element={<p>Switcher</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("WorkspaceSetupPending", () => {
  beforeEach(() => vi.clearAllMocks());

  it("offers the switcher only when there is another organization", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([
      workspace,
      { ...workspace, id: "7ea5d512-bc7f-4cf3-aad4-2f0815de00fd", name: "West Room" },
    ]);
    renderPanel();

    fireEvent.click(
      await screen.findByRole("button", { name: "Choose a workspace" }),
    );
    expect(screen.getByText("Switcher")).toBeTruthy();
  });

  it("has nowhere to switch to with a single organization", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([workspace]);
    renderPanel();

    await screen.findByRole("button", { name: "Check again" });
    await vi.waitFor(() => expect(listAccountWorkspaces).toHaveBeenCalled());
    expect(
      screen.queryByRole("button", { name: "Choose a workspace" }),
    ).toBeNull();
  });
});
