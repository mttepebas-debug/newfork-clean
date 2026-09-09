import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ActiveWorkspaceContext, WorkspaceSummary } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WorkspacesPage from "./WorkspacesPage";
import {
  cancelWorkspaceClosure,
  createOwnerWorkspace,
  initiateWorkspaceOwnershipTransfer,
  listAccountWorkspaces,
  requestWorkspaceClosure,
  respondWorkspaceOwnershipTransfer,
  selectActiveWorkspace,
  setTabWorkspaceId,
} from "../lib/supabase";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const secondWorkspaceId = "7ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
const targetUserId = "10000000-0000-4000-8000-000000000003";
const transferId = "81000000-0000-4000-8000-000000000001";
const supabaseClientMock = vi.hoisted(() => ({
  auth: {
    signInWithPassword: vi.fn(
      async (): Promise<{
        data: Record<string, never>;
        error: { message: string } | null;
      }> => ({ data: {}, error: null }),
    ),
  },
}));

let refreshedContext: ActiveWorkspaceContext | null;
const refresh = vi.fn(async () => refreshedContext);
const account = {
  userId,
  email: "owner@example.test",
  displayName: "Owner User",
  phone: null,
  theme: "system",
};

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
    role: "manager",
    status: "active",
    allLocations: true,
  },
  permissions: ["workspace.read"],
  onboarding: { status: "complete", currentStep: 2 },
  locationScope: { allLocations: true, locationIds: [] },
} satisfies ActiveWorkspaceContext;

const workspaces = [
  {
    id: workspaceId,
    name: "Meyhouse",
    role: "manager",
    status: "active",
    isActive: true,
    onboarding: { status: "complete", currentStep: 2 },
    lifecycleStatus: "active",
    closureEffectiveAt: null,
  },
  {
    id: secondWorkspaceId,
    name: "West Room",
    role: "employee",
    status: "active",
    isActive: false,
    onboarding: { status: "complete", currentStep: 2 },
    lifecycleStatus: "active",
    closureEffectiveAt: null,
  },
] satisfies WorkspaceSummary[];

const ownerWorkspace = {
  id: workspaceId,
  name: "Meyhouse",
  role: "owner",
  status: "active",
  isActive: true,
  onboarding: { status: "complete", currentStep: 2 },
  lifecycleStatus: "active",
  closureEffectiveAt: null,
} satisfies WorkspaceSummary;

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ account, context, refresh }),
}));

vi.mock("../lib/supabase", () => ({
  supabaseClient: supabaseClientMock,
  createOwnerWorkspace: vi.fn(),
  cancelWorkspaceClosure: vi.fn(),
  initiateWorkspaceOwnershipTransfer: vi.fn(),
  listAccountWorkspaces: vi.fn(),
  requestWorkspaceClosure: vi.fn(),
  respondWorkspaceOwnershipTransfer: vi.fn(),
  selectActiveWorkspace: vi.fn(),
  setTabWorkspaceId: vi.fn(),
}));

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="Current path">{location.pathname}</output>;
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/account/workspaces"]}>
        <Routes>
          <Route
            path="/account/workspaces"
            element={
              <>
                <WorkspacesPage />
                <LocationProbe />
              </>
            }
          />
          <Route path="/app/workspace" element={<LocationProbe />} />
          <Route path="/app/employee-hub" element={<LocationProbe />} />
          <Route path="/onboarding" element={<LocationProbe />} />
          <Route path="/organization-switcher" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("WorkspacesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refreshedContext = context;
    vi.mocked(createOwnerWorkspace).mockResolvedValue(secondWorkspaceId);
    vi.mocked(listAccountWorkspaces).mockResolvedValue(workspaces);
    vi.mocked(selectActiveWorkspace).mockResolvedValue(undefined);
    vi.mocked(requestWorkspaceClosure).mockResolvedValue(undefined);
    vi.mocked(cancelWorkspaceClosure).mockResolvedValue(undefined);
    vi.mocked(initiateWorkspaceOwnershipTransfer).mockResolvedValue(undefined);
    vi.mocked(respondWorkspaceOwnershipTransfer).mockResolvedValue(undefined);
    supabaseClientMock.auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: null,
    });
  });

  it("loads account workspaces even when an active workspace context exists", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Workspaces" }),
    ).toBeTruthy();
    await waitFor(() => expect(listAccountWorkspaces).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Meyhouse")).toBeTruthy();
    expect(screen.getByText("West Room")).toBeTruthy();
    expect(screen.getByText("Active workspace")).toBeTruthy();
    expect(screen.getByLabelText("Current path").textContent).toBe(
      "/account/workspaces",
    );
  });

  it("opens the active workspace through the tab-local selector", async () => {
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "Open app for Meyhouse" }),
    );

    await waitFor(() =>
      expect(selectActiveWorkspace).toHaveBeenCalledWith(
        supabaseClientMock,
        workspaceId,
      ),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Current path").textContent).toBe(
        "/app/workspace",
      ),
    );
  });

  it("selects an inactive workspace before opening its role landing", async () => {
    refreshedContext = {
      ...context,
      workspace: {
        ...context.workspace,
        id: secondWorkspaceId,
        name: "West Room",
      },
      membership: {
        ...context.membership,
        workspaceId: secondWorkspaceId,
        role: "employee",
      },
    };
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "Open West Room" }),
    );

    await waitFor(() =>
      expect(selectActiveWorkspace).toHaveBeenCalledWith(
        supabaseClientMock,
        secondWorkspaceId,
      ),
    );
    expect(refresh).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByLabelText("Current path").textContent).toBe(
        "/app/employee-hub",
      ),
    );
  });

  it("stores a newly created workspace as the tab-local context before onboarding", async () => {
    renderPage();

    fireEvent.change(
      await screen.findByRole("textbox", { name: "Create workspace" }),
      {
        target: { value: "New Business" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(createOwnerWorkspace).toHaveBeenCalledWith(
        supabaseClientMock,
        "New Business",
      ),
    );
    expect(setTabWorkspaceId).toHaveBeenCalledWith(secondWorkspaceId);
    expect(refresh).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByLabelText("Current path").textContent).toBe(
        "/onboarding",
      ),
    );
  });

  it("lets an owner schedule a workspace closure", async () => {
    vi.mocked(listAccountWorkspaces)
      .mockResolvedValueOnce([ownerWorkspace, workspaces[1]!])
      .mockResolvedValueOnce([
        {
          ...ownerWorkspace,
          lifecycleStatus: "closure_scheduled",
          closureEffectiveAt: "2026-09-19T12:00:00.000Z",
        },
        workspaces[1]!,
      ]);
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "Close later for Meyhouse" }),
    );
    expect(
      screen.getByRole("region", { name: "Schedule organization closure" }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByLabelText(/I understand the organization closure impact/),
    );
    fireEvent.click(screen.getByRole("button", { name: "Schedule close" }));

    await waitFor(() =>
      expect(requestWorkspaceClosure).toHaveBeenCalledWith(
        supabaseClientMock,
        {
          workspaceId,
          mode: "scheduled_end_period",
          typedWorkspaceName: null,
        },
      ),
    );
    expect(await screen.findByText(/closes Sep 19, 2026/)).toBeTruthy();
  });

  it("requires the exact organization name before immediate closure", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([ownerWorkspace]);
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "Close now for Meyhouse" }),
    );
    const closureRegion = screen.getByRole("region", {
      name: "Close organization now",
    });
    expect(closureRegion).toBeTruthy();
    expect(closureRegion.getAttribute("aria-describedby")).toBe(
      "workspace-closure-description",
    );
    expect(
      document.getElementById("workspace-closure-description")?.textContent,
    ).toContain("It cannot be restored by support");
    fireEvent.click(
      screen.getByLabelText(/I understand the organization closure impact/),
    );

    const submitButton = screen.getByRole("button", {
      name: "Close now",
    });
    expect(submitButton).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Type organization name"), {
      target: { value: "Meyhouse" },
    });
    fireEvent.change(screen.getByLabelText("Account password"), {
      target: { value: "fresh-password" },
    });
    fireEvent.click(submitButton);

    await waitFor(() =>
      expect(supabaseClientMock.auth.signInWithPassword).toHaveBeenCalledWith({
        email: "owner@example.test",
        password: "fresh-password",
      }),
    );
    await waitFor(() =>
      expect(requestWorkspaceClosure).toHaveBeenCalledWith(
        supabaseClientMock,
        {
          workspaceId,
          mode: "immediate",
          typedWorkspaceName: "Meyhouse",
        },
      ),
    );
  });

  it("does not request immediate closure when reauthentication fails", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([ownerWorkspace]);
    supabaseClientMock.auth.signInWithPassword.mockResolvedValueOnce({
      data: {},
      error: { message: "Invalid login credentials" },
    });
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "Close now for Meyhouse" }),
    );
    fireEvent.click(
      screen.getByLabelText(/I understand the organization closure impact/),
    );
    fireEvent.change(screen.getByLabelText("Type organization name"), {
      target: { value: "Meyhouse" },
    });
    fireEvent.change(screen.getByLabelText("Account password"), {
      target: { value: "wrong-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Close now" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Recent reauthentication failed",
    );
    expect(requestWorkspaceClosure).not.toHaveBeenCalled();
  });

  it("requires explicit acknowledgement and a target admin id before owner transfer starts", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([ownerWorkspace]);
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Transfer owner for Meyhouse",
      }),
    );
    const transferRegion = screen.getByRole("region", {
      name: "Transfer ownership",
    });
    expect(transferRegion).toBeTruthy();
    expect(transferRegion.getAttribute("aria-describedby")).toBe(
      "workspace-transfer-description",
    );
    expect(
      document.getElementById("workspace-transfer-description")?.textContent,
    ).toContain("requires billing details to be added again");

    const submitButton = screen.getByRole("button", { name: "Start transfer" });
    expect(submitButton).toHaveProperty("disabled", true);

    fireEvent.change(screen.getByLabelText("Target admin user ID"), {
      target: { value: targetUserId },
    });
    fireEvent.click(
      screen.getByLabelText(/I understand ownership transfer cannot be reversed/),
    );
    fireEvent.change(screen.getByLabelText("Account password"), {
      target: { value: "fresh-password" },
    });
    fireEvent.click(submitButton);

    await waitFor(() =>
      expect(supabaseClientMock.auth.signInWithPassword).toHaveBeenCalledWith({
        email: "owner@example.test",
        password: "fresh-password",
      }),
    );
    await waitFor(() =>
      expect(initiateWorkspaceOwnershipTransfer).toHaveBeenCalledWith(
        supabaseClientMock,
        {
          workspaceId,
          targetUserId,
        },
      ),
    );
  });

  it("lets a target admin accept a pending ownership transfer", async () => {
    const targetWorkspace = {
      ...ownerWorkspace,
      role: "admin",
      pendingOwnershipTransfer: {
        id: transferId,
        role: "target",
        expiresAt: "2026-09-12T12:00:00.000Z",
      },
    } satisfies WorkspaceSummary;
    vi.mocked(listAccountWorkspaces).mockResolvedValue([targetWorkspace]);
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Accept owner transfer for Meyhouse",
      }),
    );
    const responseRegion = screen.getByRole("region", {
      name: "Accept ownership transfer",
    });
    expect(responseRegion).toBeTruthy();
    expect(responseRegion.getAttribute("aria-describedby")).toBe(
      "workspace-transfer-response-description",
    );
    fireEvent.change(screen.getByLabelText("Account password"), {
      target: { value: "fresh-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Accept transfer" }));

    await waitFor(() =>
      expect(supabaseClientMock.auth.signInWithPassword).toHaveBeenCalledWith({
        email: "owner@example.test",
        password: "fresh-password",
      }),
    );
    await waitFor(() =>
      expect(respondWorkspaceOwnershipTransfer).toHaveBeenCalledWith(
        supabaseClientMock,
        {
          workspaceId,
          transferId,
          action: "accept",
        },
      ),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("lets a target admin reject a pending ownership transfer", async () => {
    const targetWorkspace = {
      ...ownerWorkspace,
      role: "admin",
      pendingOwnershipTransfer: {
        id: transferId,
        role: "target",
        expiresAt: "2026-09-12T12:00:00.000Z",
      },
    } satisfies WorkspaceSummary;
    vi.mocked(listAccountWorkspaces).mockResolvedValue([targetWorkspace]);
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Reject owner transfer for Meyhouse",
      }),
    );
    expect(
      screen.getByRole("region", { name: "Reject ownership transfer" }),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Account password"), {
      target: { value: "fresh-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reject transfer" }));

    await waitFor(() =>
      expect(supabaseClientMock.auth.signInWithPassword).toHaveBeenCalledWith({
        email: "owner@example.test",
        password: "fresh-password",
      }),
    );
    await waitFor(() =>
      expect(respondWorkspaceOwnershipTransfer).toHaveBeenCalledWith(
        supabaseClientMock,
        {
          workspaceId,
          transferId,
          action: "reject",
        },
      ),
    );
    expect(refresh).toHaveBeenCalled();
  });
});
