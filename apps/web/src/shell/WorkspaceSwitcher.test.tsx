import type { WorkspaceSummary } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listPendingEmployeeInvitations } from "../employees/employee-data";
import { listAccountWorkspaces } from "../lib/supabase";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

const context = {
  workspace: { id: "31000000-0000-4000-8000-000000000001", name: "Meyhouse" },
  membership: { role: "owner" },
} as never;

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ context, refresh: vi.fn() }),
}));
vi.mock("../employees/employee-data", () => ({
  listPendingEmployeeInvitations: vi.fn(),
}));
vi.mock("../lib/supabase", () => ({
  listAccountWorkspaces: vi.fn(),
  selectActiveWorkspace: vi.fn(),
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
  id: "31000000-0000-4000-8000-000000000001",
  name: "Meyhouse",
});
const ridgeline = workspace({
  id: "31000000-0000-4000-8000-000000000002",
  name: "Ridgeline",
  role: "manager",
});
const halfBuilt = workspace({
  id: "31000000-0000-4000-8000-000000000003",
  name: "Palo Alto",
  onboarding: { status: "incomplete", currentStep: 2, revision: 1 },
});

function renderSwitcher(collapsed = false) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <WorkspaceSwitcher workspaceName="Meyhouse" collapsed={collapsed} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("WorkspaceSwitcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listPendingEmployeeInvitations).mockResolvedValue([]);
  });

  it("stays a plain name when there is nowhere else to go", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([meyhouse]);
    renderSwitcher();

    expect(await screen.findByText("Meyhouse")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("becomes a control once there is a second workspace", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([meyhouse, ridgeline]);
    renderSwitcher();

    const trigger = await screen.findByRole("button");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);

    expect(screen.getByText("You are in")).toBeTruthy();
    expect(screen.getByText("Switch to")).toBeTruthy();
    expect(screen.getByText("Ridgeline")).toBeTruthy();
    expect(screen.getByText("Manager")).toBeTruthy();
  });

  it("says which workspace is still being set up", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([meyhouse, halfBuilt]);
    renderSwitcher();

    fireEvent.click(await screen.findByRole("button"));

    expect(screen.getByText(/Setup unfinished/)).toBeTruthy();
  });

  it("carries a waiting invitation without interrupting the work", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([meyhouse]);
    vi.mocked(listPendingEmployeeInvitations).mockResolvedValue([
      {
        id: "32000000-0000-4000-8000-000000000001",
        workspaceId: ridgeline.id,
        workspaceName: "Juniper",
        emailHint: "co***@example.test",
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
    ]);
    renderSwitcher();

    // One workspace and one invitation: the count is the whole reason the
    // control exists here.
    const trigger = await screen.findByRole("button");
    expect(trigger.textContent).toContain("1");
    fireEvent.click(trigger);

    expect(screen.getByText("Invitation")).toBeTruthy();
    expect(screen.getByText("Juniper")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Answer" })).toBeTruthy();
    expect(screen.queryByText("Switch to")).toBeNull();
  });

  it("keeps a mark and its dot when the rail is collapsed", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([meyhouse, ridgeline]);
    renderSwitcher(true);

    expect(
      await screen.findByLabelText(/Meyhouse .* choose a workspace/),
    ).toBeTruthy();
  });
});
