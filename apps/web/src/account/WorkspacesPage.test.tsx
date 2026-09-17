import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ActiveWorkspaceContext, WorkspaceSummary } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, type InitialEntry, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WorkspacesPage from "./WorkspacesPage";
import { listPendingEmployeeInvitations } from "../employees/employee-data";
import {
  cancelWorkspaceClosure,
  cancelWorkspaceOwnershipTransfer,
  searchWorkspaceOwnershipCandidates,
  clearTabWorkspaceId,
  createOwnerWorkspace,
  initiateWorkspaceOwnershipTransfer,
  listAccountWorkspaces,
  requestWorkspaceClosure,
  respondWorkspaceOwnershipTransfer,
  selectActiveWorkspace,
  setDefaultWorkspace,
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
  cancelWorkspaceOwnershipTransfer: vi.fn(),
  searchWorkspaceOwnershipCandidates: vi.fn(),
  clearTabWorkspaceId: vi.fn(),
  initiateWorkspaceOwnershipTransfer: vi.fn(),
  listAccountWorkspaces: vi.fn(),
  requestWorkspaceClosure: vi.fn(),
  respondWorkspaceOwnershipTransfer: vi.fn(),
  selectActiveWorkspace: vi.fn(),
  setDefaultWorkspace: vi.fn(),
  setTabWorkspaceId: vi.fn(),
}));

vi.mock("../employees/employee-data", () => ({
  acceptPendingEmployeeInvitation: vi.fn(),
  declinePendingEmployeeInvitation: vi.fn(),
  listPendingEmployeeInvitations: vi.fn(),
}));

const invitation = {
  id: "46000000-0000-4000-8000-000000000001",
  workspaceId: "26000000-0000-4000-8000-000000000001",
  workspaceName: "Northstar",
  emailHint: "ne**********@example.test",
  expiresAt: "2026-10-01T12:00:00.000Z",
};

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="Current path">{location.pathname}</output>;
}

function renderPage(entry: InitialEntry = "/account/workspaces") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
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
          <Route path="/welcome/:workspaceId" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openWorkspaceActions(name = "Meyhouse") {
  const trigger = await screen.findByRole("button", {
    name: `Workspace actions for ${name}`,
  });
  fireEvent.click(trigger);
  return {
    trigger,
    menu: screen.getByRole("menu", { name: `Workspace actions for ${name}` }),
  };
}

describe("WorkspacesPage", () => {
  it.each(["admin", "manager", "employee"] as const)("hides create for %s without another owned workspace", async role => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([{ ...ownerWorkspace, role }]);
    renderPage();
    await screen.findByLabelText("Meyhouse is the current workspace");
    expect(screen.queryByRole("button", { name: "Create workspace" })).toBeNull();
    expect(screen.getByRole("button", { name: "Workspace actions for Meyhouse" })).toBeTruthy();
  });

  it("sorts the current tab first and enables create for an owner in another workspace", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([{ ...ownerWorkspace, isActive: false }, { ...workspaces[1]!, isActive: true }]);
    renderPage();
    const createButton = await screen.findByRole("button", { name: "Create workspace" });
    expect(createButton.closest(".account-header-action")).toBeTruthy();
    expect(document.querySelector(".workspace-row strong")?.textContent).toBe("Meyhouse");
    expect(screen.getByRole("button", { name: "Open West Room" }).className).toContain("secondary-button");
  });

  it("offers first workspace creation from the empty state", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText("Create your first workspace to continue.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Workspace switcher" })).toBeNull();
    const buttons = screen.getAllByRole("button", { name: "Create workspace" });
    expect(buttons).toHaveLength(2);
    expect(document.querySelectorAll("#create-workspace-trigger")).toHaveLength(1);
    fireEvent.click(buttons[1]!);
    expect(screen.getByRole("dialog", { name: "Create workspace" })).toBeTruthy();
  });

  it("opens the create dialog when navigation requests it", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([]);
    renderPage({ pathname: "/account/workspaces", state: { openCreate: true } });
    expect(await screen.findByRole("dialog", { name: "Create workspace" })).toBeTruthy();
  });

  it("hides create for an invited account that has no organization yet", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([]);
    vi.mocked(listPendingEmployeeInvitations).mockResolvedValue([invitation]);
    renderPage();
    expect(await screen.findByText("Respond to your invitation to continue.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create workspace" })).toBeNull();
    expect(screen.getByRole("button", { name: "Join Northstar" })).toBeTruthy();
  });

  it("keeps create for an owner who also has an invitation", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([ownerWorkspace]);
    vi.mocked(listPendingEmployeeInvitations).mockResolvedValue([invitation]);
    renderPage();
    expect(await screen.findByRole("button", { name: "Join Northstar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create workspace" })).toBeTruthy();
  });

  it("continues the onboarding of an accepted invitation", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([
      ownerWorkspace,
      { ...workspaces[1]!, role: "employee", status: "pending", isActive: false },
    ]);
    renderPage();
    expect(await screen.findByText(/employee · onboarding in progress/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue onboarding for West Room" }));
    expect(screen.getByLabelText("Current path").textContent).toBe(`/welcome/${workspaces[1]!.id}`);
    expect(selectActiveWorkspace).not.toHaveBeenCalled();
  });

  it("fails closed after a workspace list error", async () => {
    vi.mocked(listAccountWorkspaces).mockRejectedValueOnce(new Error("Unavailable"));
    renderPage();
    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: "Create workspace" })).toBeNull();
  });

  it("lets a sender cancel pending transfer without a password", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValueOnce([{ ...ownerWorkspace, pendingOwnershipTransfer: { id: transferId, role: "initiator", expiresAt: "2099-01-01T00:00:00Z" } }]).mockResolvedValue([ownerWorkspace]);
    renderPage();
    const { menu } = await openWorkspaceActions();
    expect(menu.querySelectorAll('[role="menuitem"]')).toHaveLength(2);
    fireEvent.click(screen.getByRole("menuitem", { name: "Cancel transfer" }));
    await waitFor(() => expect(cancelWorkspaceOwnershipTransfer).toHaveBeenCalledWith(supabaseClientMock, workspaceId, transferId));
    expect(supabaseClientMock.auth.signInWithPassword).not.toHaveBeenCalled();
    await openWorkspaceActions();
    await screen.findByRole("menuitem", { name: "Transfer ownership" });
  });

  it.each([false, true])("leaves a closed active workspace safely; another workspace=%s", async another => {
    vi.mocked(listAccountWorkspaces).mockResolvedValueOnce([ownerWorkspace]).mockResolvedValue(another ? [workspaces[1]!] : []);
    refreshedContext = another ? { ...context, workspace: { ...context.workspace, id: secondWorkspaceId }, membership: { ...context.membership, role: "employee", workspaceId: secondWorkspaceId } } : null;
    renderPage();
    await openWorkspaceActions();
    fireEvent.click(screen.getByRole("menuitem", { name: "Close now" }));
    fireEvent.change(screen.getByLabelText("Type organization name"), { target: { value: "Meyhouse" } });
    fireEvent.change(screen.getByLabelText("Account password"), { target: { value: "fresh-password" } });
    fireEvent.click(screen.getByLabelText(/I understand the organization closure impact/));
    fireEvent.click(screen.getByRole("button", { name: "Close now" }));
    await waitFor(() => expect(screen.getByLabelText("Current path").textContent).toBe(another ? "/app/employee-hub" : "/organization-switcher"));
    expect(clearTabWorkspaceId).toHaveBeenCalled();
    if (another) expect(selectActiveWorkspace).toHaveBeenCalledWith(supabaseClientMock, secondWorkspaceId);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
    vi.mocked(searchWorkspaceOwnershipCandidates).mockResolvedValue([{ userId: targetUserId, name: "Eligible Admin", email: "admin@example.test" }]);
    vi.mocked(cancelWorkspaceOwnershipTransfer).mockResolvedValue(undefined);
    refreshedContext = context;
    vi.mocked(createOwnerWorkspace).mockResolvedValue(secondWorkspaceId);
    vi.mocked(listAccountWorkspaces).mockResolvedValue(workspaces);
    vi.mocked(listPendingEmployeeInvitations).mockResolvedValue([]);
    vi.mocked(selectActiveWorkspace).mockResolvedValue(undefined);
    vi.mocked(setDefaultWorkspace).mockResolvedValue(undefined);
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
    expect(screen.getByText("Current")).toBeTruthy();
    expect(screen.getByLabelText("Current path").textContent).toBe(
      "/account/workspaces",
    );
  });

  it("marks the current tab without offering an Open action and labels the saved default separately", async () => {
    renderPage();
    expect(await screen.findByLabelText("Meyhouse is the current workspace")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open app for Meyhouse" })).toBeNull();
    await openWorkspaceActions();
    expect(screen.getByRole("menuitem", { name: "Default workspace" })).toHaveProperty("disabled", true);
    expect(selectActiveWorkspace).not.toHaveBeenCalled();
  });

  it("keeps owner actions in one accessible menu and returns focus on Escape", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([ownerWorkspace]);
    renderPage();

    const { trigger, menu } = await openWorkspaceActions();
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByRole("menuitem").map(item => item.textContent?.trim())).toEqual([
      "Default workspace",
      "Transfer ownership",
      "Close later",
      "Close now",
    ]);
    expect(menu.querySelector('[role="separator"]')).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Close now" }).className).toContain("workspace-actions-danger");

    trigger.focus();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("lets a non-owner set an accessible workspace as the account default", async () => {
    renderPage();
    const { trigger } = await openWorkspaceActions("West Room");

    fireEvent.click(screen.getByRole("menuitem", { name: "Set as default" }));

    await waitFor(() => expect(setDefaultWorkspace).toHaveBeenCalledWith(
      supabaseClientMock,
      secondWorkspaceId,
    ));
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(screen.getByLabelText("Meyhouse is the current workspace")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open West Room" })).toBeTruthy();
    await openWorkspaceActions("West Room");
    expect(screen.getByRole("menuitem", { name: "Default workspace" })).toHaveProperty("disabled", true);
    expect(selectActiveWorkspace).not.toHaveBeenCalled();
  });

  it("closes an owner menu on outside pointer input and only opens one at a time", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([
      ownerWorkspace,
      { ...ownerWorkspace, id: secondWorkspaceId, name: "West Room", isActive: false },
    ]);
    renderPage();

    await openWorkspaceActions();
    const { trigger } = await openWorkspaceActions("West Room");
    expect(screen.getAllByRole("menu")).toHaveLength(1);
    expect(screen.getByRole("menu", { name: "Workspace actions for West Room" })).toBeTruthy();

    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("shows only cancellation for an owner workspace with scheduled closure", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([{
      ...ownerWorkspace,
      lifecycleStatus: "closure_scheduled",
      closureEffectiveAt: "2099-01-01T00:00:00.000Z",
    }]);
    renderPage();

    await openWorkspaceActions();
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
    expect(screen.getByRole("menuitem", { name: "Default workspace" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Cancel close" })).toBeTruthy();
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
    vi.mocked(listAccountWorkspaces).mockResolvedValue([ownerWorkspace]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Create workspace" }));
    expect(screen.getByRole("dialog", { name: "Create workspace" })).toBeTruthy();

    fireEvent.change(
      await screen.findByRole("textbox", { name: "Workspace name" }),
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

    await openWorkspaceActions();
    fireEvent.click(screen.getByRole("menuitem", { name: "Close later" }));
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

    await openWorkspaceActions();
    fireEvent.click(screen.getByRole("menuitem", { name: "Close now" }));
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

    await openWorkspaceActions();
    fireEvent.click(screen.getByRole("menuitem", { name: "Close now" }));
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

    await openWorkspaceActions();
    fireEvent.click(screen.getByRole("menuitem", { name: "Transfer ownership" }));
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

    fireEvent.change(screen.getByLabelText("Find an admin by name or email"), {
      target: { value: "Admin" },
    });
    fireEvent.click(await screen.findByRole("radio", { name: /Eligible Admin/ }));
    fireEvent.click(
      screen.getByLabelText(/I understand an accepted ownership transfer/),
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
    expect(screen.queryByLabelText("Account password")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reject transfer" }));

    expect(supabaseClientMock.auth.signInWithPassword).not.toHaveBeenCalled();
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
