import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ActiveWorkspaceContext, WorkspaceSummary } from "@newfork/shared";
import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, type InitialEntry, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { accountWorkspacesKey } from "./legal-name-data";
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
import { RequestError } from "../lib/request-error";
import { whoIsInIt } from "./WorkspacesPage";

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
    access: { employee: false, management: "manager" },
    status: "active",
  },
  permissions: ["workspace.read"],
  actions: [],
  onboarding: { status: "complete", currentStep: 2 },
  documentAccess: { restricted: false },
  locationScope: { allLocations: true, locationIds: [] },
} satisfies ActiveWorkspaceContext;
// A fresh sign-in hands out a new session, and AuthContext a new context
// object with the same content. Tests swap it to act that out.
let authContext: ActiveWorkspaceContext = context;

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

// A scheduled closure only stays on the list while it is still ahead, so the
// fixture dates from today instead of a day that eventually falls behind.
const scheduledClosureAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
const scheduledClosureLabel = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
}).format(new Date(scheduledClosureAt));

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
  useAuth: () => ({ account, context: authContext, refresh }),
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

function renderPage(
  entry: InitialEntry = "/account/workspaces",
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
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
          <Route path="/workspaces" element={<LocationProbe />} />
          <Route path="/welcome/:workspaceId" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openWorkspaceActions(name = "Meyhouse") {
  const trigger = await screen.findByRole("button", {
    name: `Actions for ${name}`,
  });
  fireEvent.click(trigger);
  return {
    trigger,
    menu: screen.getByRole("menu", { name: `Actions for ${name}` }),
  };
}

describe("WorkspacesPage", () => {
  // BL-149: somebody else changed this person's role; coming back to the tab
  // shows it instead of the role from when the page opened.
  it("shows a role changed elsewhere when the tab regains focus", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([{ ...ownerWorkspace, role: "manager" }]);
    renderPage();
    const row = await screen.findByRole("button", { name: "Open Meyhouse" });
    expect(row.closest("[role=listitem]")?.textContent).toContain("Manager");

    vi.mocked(listAccountWorkspaces).mockResolvedValue([{ ...ownerWorkspace, role: "admin" }]);
    act(() => { focusManager.setFocused(false); focusManager.setFocused(true); });

    await waitFor(() => expect(screen.getByRole("button", { name: "Open Meyhouse" }).closest("[role=listitem]")?.textContent).toContain("Admin"));
    focusManager.setFocused(undefined);
  });

  it.each(["admin", "manager", "employee"] as const)("hides create for %s without another owned workspace", async role => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([{ ...ownerWorkspace, role }]);
    renderPage();
    await screen.findByRole("button", { name: "Open Meyhouse" });
    expect(screen.queryByRole("button", { name: "Create workspace" })).toBeNull();
    expect(screen.getByRole("button", { name: "Actions for Meyhouse" })).toBeTruthy();
  });

  it("sorts the current tab first and enables create for an owner in another workspace", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([{ ...ownerWorkspace, isActive: false }, { ...workspaces[1]!, isActive: true }]);
    renderPage();
    const createButton = await screen.findByRole("button", { name: "Create workspace" });
    expect(createButton.closest(".account-header-action")).toBeTruthy();
    expect(document.querySelector(".pb-row strong")?.textContent).toBe("Meyhouse");
    expect(screen.getByRole("button", { name: "Open West Room" }).className).toContain("pb-btn-primary");
  });

  it("offers first workspace creation from the empty state", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText("Create your first workspace to continue.")).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "Workspaces" })).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Workspace switcher" })).toBeNull();
    const buttons = screen.getAllByRole("button", { name: "Create workspace" });
    expect(buttons).toHaveLength(2);
    expect(document.querySelectorAll("#create-workspace-trigger")).toHaveLength(1);
    // The empty state's own button starts setup too, with no name window.
    fireEvent.click(buttons[1]!);
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() =>
      expect(screen.getByLabelText("Current path").textContent).toBe("/onboarding"),
    );
    expect(createOwnerWorkspace).toHaveBeenCalledWith(supabaseClientMock, "New workspace");
    expect(setTabWorkspaceId).toHaveBeenCalledWith(secondWorkspaceId);
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
    const rows = within(screen.getByRole("list", { name: "Workspaces" })).getAllByRole("listitem");
    expect(rows.map(row => row.querySelector("strong")?.textContent)).toEqual(["Northstar", "Meyhouse"]);
    expect(rows[0]?.textContent).toContain("Invitation");
    // The badge counts days from today, so only its first word is stable.
    expect(rows[0]?.textContent).toContain("Expires");
    expect(screen.queryByRole("region", { name: "Invitation to Northstar" })).toBeNull();
  });

  it("continues the onboarding of an accepted invitation", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([
      ownerWorkspace,
      { ...workspaces[1]!, role: "employee", status: "pending", isActive: false },
    ]);
    renderPage();
    expect(await screen.findByText("Onboarding in progress")).toBeTruthy();
    expect(screen.getByText("Employee")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue onboarding for West Room" }));
    expect(screen.getByLabelText("Current path").textContent).toBe(`/welcome/${workspaces[1]!.id}`);
    expect(selectActiveWorkspace).not.toHaveBeenCalled();
  });

  it("continues an unfinished setup instead of opening it", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([
      ownerWorkspace,
      { ...ownerWorkspace, id: secondWorkspaceId, name: "West Room", isActive: false, onboarding: { status: "incomplete", currentStep: 1 } },
    ]);
    renderPage();
    const resume = await screen.findByRole("button", { name: "Continue setup for West Room" });
    expect(resume.textContent).toBe("Continue");
    expect(resume.className).toContain("pb-btn-primary");
    expect(screen.getByText("Setup in progress")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open West Room" })).toBeNull();
    fireEvent.click(resume);
    await waitFor(() => expect(selectActiveWorkspace).toHaveBeenCalledWith(supabaseClientMock, secondWorkspaceId));
  });

  // nf-guvenlik @b2655180: the server resumes an unfinished setup and would
  // write "New workspace" over the name typed in step 1, so Create continues
  // the draft instead of creating one.
  it("Create workspace continues an unfinished setup and keeps its name", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([
      ownerWorkspace,
      { ...ownerWorkspace, id: secondWorkspaceId, name: "Taco Bros", isActive: false, onboarding: { status: "incomplete", currentStep: 1 } },
    ]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Create workspace" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Current path").textContent).toBe("/onboarding"),
    );
    expect(createOwnerWorkspace).not.toHaveBeenCalled();
    expect(setTabWorkspaceId).toHaveBeenCalledWith(secondWorkspaceId);
  });

  it("keeps Continue on a draft that is also this tab's business", async () => {
    // Creating a business selects it for the tab, so the Current pill would
    // otherwise hide the only way back into its setup.
    vi.mocked(listAccountWorkspaces).mockResolvedValue([
      { ...ownerWorkspace, onboarding: { status: "incomplete", currentStep: 1 } },
    ]);
    renderPage();
    const resume = await screen.findByRole("button", { name: `Continue setup for ${ownerWorkspace.name}` });
    expect(resume.closest("[role='listitem']")?.getAttribute("aria-current")).toBe("true");
    expect(screen.queryByRole("button", { name: `Open ${ownerWorkspace.name}` })).toBeNull();
  });

  it("lets another member open a business whose owner is still setting up", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([
      ownerWorkspace,
      { ...ownerWorkspace, id: secondWorkspaceId, name: "West Room", role: "manager", isActive: false, onboarding: { status: "incomplete", currentStep: 1 } },
    ]);
    renderPage();
    const open = await screen.findByRole("button", { name: "Open West Room" });
    expect(open.textContent).toBe("Open");
    expect(screen.queryByText("Setup in progress")).toBeNull();
  });

  it("fails closed after a workspace list error", async () => {
    vi.mocked(listAccountWorkspaces).mockRejectedValueOnce(new Error("Unavailable"));
    renderPage();
    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: "Create workspace" })).toBeNull();
  });

  it("shows a loading outline, then a card with Try again instead of the raw error", async () => {
    vi.mocked(listAccountWorkspaces).mockReturnValueOnce(new Promise(() => {}) as never);
    const { unmount } = renderPage();
    expect(screen.getAllByRole("status").some(node => node.textContent?.includes("Loading workspaces"))).toBe(true);
    expect(screen.queryByText("No workspaces yet")).toBeNull();
    unmount();

    vi.mocked(listAccountWorkspaces).mockRejectedValueOnce(new Error("Unavailable"));
    renderPage();
    const card = await screen.findByRole("alert");
    expect(within(card).getByRole("heading", { name: "We couldn't load your workspaces" })).toBeTruthy();
    expect(screen.queryByText("Unavailable")).toBeNull();
    expect(screen.queryByText("No workspaces yet")).toBeNull();
    vi.mocked(listAccountWorkspaces).mockResolvedValue([ownerWorkspace]);
    fireEvent.click(within(card).getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Open Meyhouse" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "We couldn't load your workspaces" })).toBeNull();
  });

  it("leaves the failed card last on the page, so it can sit in the middle, unless invitations follow", async () => {
    vi.mocked(listAccountWorkspaces).mockRejectedValueOnce(new Error("Unavailable"));
    const { unmount } = renderPage();
    const card = await screen.findByRole("alert");
    expect(card.nextElementSibling).toBeNull();
    expect(screen.queryByRole("list", { name: "Workspaces" })).toBeNull();
    unmount();

    vi.mocked(listAccountWorkspaces).mockRejectedValueOnce(new Error("Unavailable"));
    vi.mocked(listPendingEmployeeInvitations).mockResolvedValue([invitation]);
    renderPage();
    expect(await screen.findByRole("button", { name: "Join Northstar" })).toBeTruthy();
    expect(screen.getByRole("alert").nextElementSibling?.getAttribute("aria-label")).toBe("Workspaces");
  });

  it("keeps the last workspaces and says so when a refresh fails", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(listAccountWorkspaces).mockResolvedValue([ownerWorkspace]);
    renderPage("/account/workspaces", queryClient);
    expect(await screen.findByRole("button", { name: "Open Meyhouse" })).toBeTruthy();
    vi.mocked(listAccountWorkspaces).mockRejectedValueOnce(new Error("Unavailable"));
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: accountWorkspacesKey });
    });
    const line = await screen.findByRole("alert");
    expect(line.textContent).toContain("Your workspaces didn't refresh.");
    expect(screen.getByRole("button", { name: "Open Meyhouse" })).toBeTruthy();
    expect(screen.queryByText("Unavailable")).toBeNull();
    // A list that may be stale doesn't offer to create a workspace.
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
    refreshedContext = another ? { ...context, workspace: { ...context.workspace, id: secondWorkspaceId }, membership: { ...context.membership, access: { employee: true, management: null }, workspaceId: secondWorkspaceId } } : null;
    renderPage();
    await openWorkspaceActions();
    fireEvent.click(screen.getByRole("menuitem", { name: "Close immediately" }));
    fireEvent.change(screen.getByLabelText("Type the workspace name"), { target: { value: "Meyhouse" } });
    fireEvent.change(screen.getByLabelText("Account password"), { target: { value: "fresh-password" } });
    fireEvent.click(screen.getByLabelText(/I understand everyone loses access/));
    fireEvent.click(screen.getByRole("button", { name: "Close immediately" }));
    await waitFor(() => expect(screen.getByLabelText("Current path").textContent).toBe(another ? "/app/employee-hub" : "/workspaces"));
    expect(clearTabWorkspaceId).toHaveBeenCalled();
    if (another) expect(selectActiveWorkspace).toHaveBeenCalledWith(supabaseClientMock, secondWorkspaceId);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    authContext = context;
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
    expect(screen.getByLabelText("Current path").textContent).toBe(
      "/account/workspaces",
    );
  });

  it("marks the current tab, which stays openable, and labels the saved default separately", async () => {
    renderPage();
    const open = await screen.findByRole("button", { name: "Open Meyhouse" });
    const row = open.closest<HTMLElement>("[role='listitem']")!;
    expect(row.getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("button", { name: "Open West Room" }).closest("[role='listitem']")?.getAttribute("aria-current")).toBeNull();
    // The tint and aria-current mark it; there is no separate "Current" badge.
    expect(within(row).queryByText("Current")).toBeNull();
    expect(within(row).getByText("Default")).toBeTruthy();
    await openWorkspaceActions();
    expect(screen.getByRole("menuitem", { name: "Default workspace" })).toHaveProperty("disabled", true);
    expect(selectActiveWorkspace).not.toHaveBeenCalled();
  });

  it("walks the actions menu with the arrow keys, skipping the disabled item", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([ownerWorkspace]);
    renderPage();

    const trigger = await screen.findByRole("button", { name: "Actions for Meyhouse" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const menu = await screen.findByRole("menu", { name: "Actions for Meyhouse" });
    const item = (name: string) => screen.getByRole("menuitem", { name });
    await waitFor(() => expect(document.activeElement).toBe(item("Transfer ownership")));

    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(item("Schedule closure"));
    fireEvent.keyDown(menu, { key: "End" });
    expect(document.activeElement).toBe(item("Close immediately"));
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(item("Transfer ownership"));
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(document.activeElement).toBe(item("Close immediately"));
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
      "Schedule closure",
      "Close immediately",
    ]);
    expect(menu.querySelector('[role="separator"]')).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Close immediately" }).className).toContain("workspace-actions-danger");

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
    expect(screen.getByRole("button", { name: "Open Meyhouse" })).toBeTruthy();
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
    expect(screen.getByRole("menu", { name: "Actions for West Room" })).toBeTruthy();

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
    expect(screen.getByRole("menuitem", { name: "Cancel closure" })).toBeTruthy();
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
        access: { employee: true, management: null },
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
    // KARAR-001: no name window; owner setup step 1 asks for the name.
    fireEvent.click(await screen.findByRole("button", { name: "Create workspace" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Workspace name" })).toBeNull();

    await waitFor(() =>
      expect(createOwnerWorkspace).toHaveBeenCalledWith(
        supabaseClientMock,
        "New workspace",
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
          closureEffectiveAt: scheduledClosureAt,
        },
        workspaces[1]!,
      ]);
    renderPage();

    await openWorkspaceActions();
    fireEvent.click(screen.getByRole("menuitem", { name: "Schedule closure" }));
    expect(
      screen.getByRole("region", { name: "Schedule closure for Meyhouse" }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByLabelText(/I understand everyone loses access/),
    );
    // SEC-003: scheduling is not a lesser thing than closing now.
    const scheduleButton = screen.getByRole("button", { name: "Schedule closure" });
    expect(scheduleButton).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Account password"), {
      target: { value: "fresh-password" },
    });
    fireEvent.click(scheduleButton);

    await waitFor(() =>
      expect(requestWorkspaceClosure).toHaveBeenCalledWith(
        supabaseClientMock,
        {
          workspaceId,
          mode: "scheduled_end_period",
          typedWorkspaceName: null,
          password: "fresh-password",
        },
      ),
    );
    expect(
      await screen.findByText(`Scheduled closure · ${scheduledClosureLabel}`),
    ).toBeTruthy();
  });

  it("requires the exact organization name before immediate closure", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([ownerWorkspace]);
    renderPage();

    await openWorkspaceActions();
    fireEvent.click(screen.getByRole("menuitem", { name: "Close immediately" }));
    const closureRegion = screen.getByRole("region", {
      name: "Close Meyhouse immediately",
    });
    expect(closureRegion).toBeTruthy();
    expect(closureRegion.getAttribute("aria-describedby")).toBe(
      "workspace-closure-description",
    );
    expect(
      document.getElementById("workspace-closure-description")?.textContent,
    ).toContain("Nobody, including support, can bring it back");
    fireEvent.click(
      screen.getByLabelText(/I understand everyone loses access/),
    );

    const submitButton = screen.getByRole("button", {
      name: "Close immediately",
    });
    expect(submitButton).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Type the workspace name"), {
      target: { value: "Meyhouse" },
    });
    fireEvent.change(screen.getByLabelText("Account password"), {
      target: { value: "fresh-password" },
    });
    fireEvent.click(submitButton);

    await waitFor(() =>
      expect(requestWorkspaceClosure).toHaveBeenCalledWith(
        supabaseClientMock,
        {
          workspaceId,
          mode: "immediate",
          typedWorkspaceName: "Meyhouse",
          password: "fresh-password",
        },
      ),
    );
    // SEC-003: the server checks the password; the browser no longer signs in.
    expect(supabaseClientMock.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("says the password did not match when the server refuses it", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([ownerWorkspace]);
    vi.mocked(requestWorkspaceClosure).mockRejectedValueOnce(
      new RequestError(
        "Current password is incorrect",
        "session.password_incorrect",
        undefined,
        403,
      ),
    );
    renderPage();

    await openWorkspaceActions();
    fireEvent.click(screen.getByRole("menuitem", { name: "Close immediately" }));
    fireEvent.click(
      screen.getByLabelText(/I understand everyone loses access/),
    );
    fireEvent.change(screen.getByLabelText("Type the workspace name"), {
      target: { value: "Meyhouse" },
    });
    fireEvent.change(screen.getByLabelText("Account password"), {
      target: { value: "wrong-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Close immediately" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "That password did not match. Type it again.",
    );
    expect(screen.queryByText(/Current password is incorrect/)).toBeNull();
    expect(supabaseClientMock.auth.signInWithPassword).not.toHaveBeenCalled();
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
    ).toContain("they become the owner and you become an admin");

    const submitButton = screen.getByRole("button", { name: "Start transfer" });
    expect(submitButton).toHaveProperty("disabled", true);

    fireEvent.change(screen.getByLabelText("Find an admin by name or email"), {
      target: { value: "Admin" },
    });
    fireEvent.click(await screen.findByRole("radio", { name: /Eligible Admin/ }));
    fireEvent.click(
      screen.getByLabelText(/I understand I cannot undo this/),
    );
    fireEvent.change(screen.getByLabelText("Account password"), {
      target: { value: "fresh-password" },
    });
    fireEvent.click(submitButton);

    await waitFor(() =>
      expect(initiateWorkspaceOwnershipTransfer).toHaveBeenCalledWith(
        supabaseClientMock,
        {
          workspaceId,
          targetUserId,
          password: "fresh-password",
        },
      ),
    );
    expect(supabaseClientMock.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  // BL-080: the business goes only to somebody whose legal name is on file.
  it("says why a transfer to somebody without a legal name was refused", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([ownerWorkspace]);
    vi.mocked(initiateWorkspaceOwnershipTransfer).mockRejectedValueOnce(
      new RequestError(
        "the new owner has no legal name on file yet",
        "transfer.target_legal_name_missing",
        undefined,
        400,
      ),
    );
    renderPage();

    await openWorkspaceActions();
    fireEvent.click(screen.getByRole("menuitem", { name: "Transfer ownership" }));
    fireEvent.change(screen.getByLabelText("Find an admin by name or email"), {
      target: { value: "Admin" },
    });
    fireEvent.click(await screen.findByRole("radio", { name: /Eligible Admin/ }));
    fireEvent.click(screen.getByLabelText(/I understand I cannot undo this/));
    fireEvent.change(screen.getByLabelText("Account password"), {
      target: { value: "fresh-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start transfer" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "That person has no legal name on file here yet, and an owner needs one because documents and signatures use it. Ask them to finish setting up their account, then start the transfer again.",
    );
    expect(screen.queryByText(/the new owner has no legal name/)).toBeNull();
  });

  // The password check signs in again; the session refresh that follows used to
  // reload the list, wipe the refusal and flash "Loading workspaces..." (BL-080).
  it("keeps a transfer refusal and the list on screen when the session refreshes", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([ownerWorkspace]);
    vi.mocked(initiateWorkspaceOwnershipTransfer).mockRejectedValueOnce(
      new RequestError(
        "the new owner has no legal name on file yet",
        "transfer.target_legal_name_missing",
        undefined,
        400,
      ),
    );
    renderPage();

    await openWorkspaceActions();
    fireEvent.click(screen.getByRole("menuitem", { name: "Transfer ownership" }));
    fireEvent.change(screen.getByLabelText("Find an admin by name or email"), {
      target: { value: "Admin" },
    });
    fireEvent.click(await screen.findByRole("radio", { name: /Eligible Admin/ }));
    fireEvent.click(screen.getByLabelText(/I understand I cannot undo this/));
    fireEvent.change(screen.getByLabelText("Account password"), {
      target: { value: "fresh-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start transfer" }));

    const refusal = (await screen.findByRole("alert")).textContent;
    expect(refusal).toContain("no legal name on file here yet");
    // The session refresh lands a moment later: same person, same workspace,
    // a new context object. Any render picks it up.
    authContext = { ...context };
    fireEvent.change(screen.getByLabelText("Account password"), {
      target: { value: "fresh-password " },
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(screen.getByRole("alert").textContent).toBe(refusal);
    expect(screen.queryByText("Loading workspaces...")).toBeNull();
    expect(listAccountWorkspaces).toHaveBeenCalledTimes(1);
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
      name: "Take over Meyhouse",
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
      expect(respondWorkspaceOwnershipTransfer).toHaveBeenCalledWith(
        supabaseClientMock,
        {
          workspaceId,
          transferId,
          action: "accept",
          password: "fresh-password",
        },
      ),
    );
    expect(supabaseClientMock.auth.signInWithPassword).not.toHaveBeenCalled();
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
      screen.getByRole("region", { name: "Turn down Meyhouse" }),
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

  // BL-278 (3): the account badge counts transfers waiting on this person.
  it("refreshes the account badge after answering a transfer", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([{ ...ownerWorkspace, role: "admin", pendingOwnershipTransfer: { id: transferId, role: "target", expiresAt: "2026-09-12T12:00:00.000Z" } }]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["account-attention", "user-1"], { documents: 0, workspaces: 1 });
    renderPage(undefined, client);
    fireEvent.click(await screen.findByRole("button", { name: "Reject owner transfer for Meyhouse" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject transfer" }));
    await waitFor(() => expect(client.getQueryState(["account-attention", "user-1"])?.isInvalidated).toBe(true));
  });

  async function openScheduledClosure() {
    await openWorkspaceActions();
    fireEvent.click(screen.getByRole("menuitem", { name: "Schedule closure" }));
    fireEvent.click(screen.getByLabelText(/I understand everyone loses access/));
    fireEvent.change(screen.getByLabelText("Account password"), {
      target: { value: "fresh-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Schedule closure" }));
  }

  // A setup its owner never finished holds nothing worth a password; the
  // server does not ask for one, so neither does the screen.
  it.each([
    ["Schedule closure", "Schedule closure", "scheduled_end_period"],
    ["Close immediately", "Close immediately", "immediate"],
  ] as const)("closes an unfinished setup without a password: %s", async (item, button, mode) => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([
      { ...ownerWorkspace, onboarding: { status: "incomplete", currentStep: 2 } },
    ]);
    renderPage();

    await openWorkspaceActions();
    fireEvent.click(screen.getByRole("menuitem", { name: item }));
    expect(screen.queryByLabelText("Account password")).toBeNull();
    if (mode === "immediate")
      fireEvent.change(screen.getByLabelText("Type the workspace name"), {
        target: { value: "Meyhouse" },
      });
    fireEvent.click(screen.getByLabelText(/I understand everyone loses access/));
    fireEvent.click(screen.getByRole("button", { name: button }));

    await waitFor(() =>
      expect(requestWorkspaceClosure).toHaveBeenCalledWith(
        supabaseClientMock,
        {
          workspaceId,
          mode,
          typedWorkspaceName: mode === "immediate" ? "Meyhouse" : null,
        },
      ),
    );
  });

  it("states the rule that blocks a closure once, with the way out of it", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([ownerWorkspace]);
    vi.mocked(requestWorkspaceClosure).mockRejectedValueOnce(
      new Error("pending ownership transfer must be resolved before workspace closure"),
    );
    renderPage();

    await openScheduledClosure();

    expect((await screen.findByRole("alert")).textContent).toBe(
      "An ownership transfer is still waiting on this workspace. Cancel it from the actions menu, then close the workspace.",
    );
    expect(screen.queryByText(/pending ownership transfer must be resolved/)).toBeNull();
  });

  // The key is the contract, not the prose. Somebody rewording the raise in a
  // migration must not be able to take this sentence off the screen.
  it("answers the key the server raised, whatever sentence came with it", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([ownerWorkspace]);
    vi.mocked(requestWorkspaceClosure).mockRejectedValueOnce(
      new RequestError(
        "a wording nobody on this screen has ever seen",
        "workspace.closure.transfer_pending",
      ),
    );
    renderPage();

    await openScheduledClosure();

    expect((await screen.findByRole("alert")).textContent).toBe(
      "An ownership transfer is still waiting on this workspace. Cancel it from the actions menu, then close the workspace.",
    );
    expect(screen.queryByText(/a wording nobody/)).toBeNull();
  });

  // The API raises this one itself rather than passing it on from the database.
  it("answers a missing password by its key", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([ownerWorkspace]);
    vi.mocked(requestWorkspaceClosure).mockRejectedValueOnce(
      new RequestError("Current password required", "session.password_required", undefined, 400),
    );
    renderPage();

    await openScheduledClosure();

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Type your account password to continue.",
    );
    expect(screen.queryByText(/Current password required/)).toBeNull();
  });

  // The refusal names the transfer standing in the way, so the way out is a
  // button rather than directions to a menu.
  it("offers to cancel the transfer the refusal named", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([ownerWorkspace]);
    vi.mocked(requestWorkspaceClosure).mockRejectedValueOnce(
      new RequestError(
        "pending ownership transfer must be resolved before workspace closure",
        "workspace.closure.transfer_pending",
        "77777777-7777-4777-8777-777777777777",
      ),
    );
    vi.mocked(cancelWorkspaceOwnershipTransfer).mockResolvedValue(undefined);
    renderPage();

    await openScheduledClosure();
    fireEvent.click(
      await screen.findByRole("button", { name: "Cancel that transfer" }),
    );

    await waitFor(() =>
      expect(cancelWorkspaceOwnershipTransfer).toHaveBeenCalledWith(
        expect.anything(),
        ownerWorkspace.id,
        "77777777-7777-4777-8777-777777777777",
      ),
    );
  });

  it("offers nothing to press when the refusal named nothing", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([ownerWorkspace]);
    vi.mocked(requestWorkspaceClosure).mockRejectedValueOnce(
      new RequestError(
        "workspace closure requires explicit acknowledgement",
        "workspace.closure.acknowledgement_required",
      ),
    );
    renderPage();

    await openScheduledClosure();

    await screen.findByRole("alert");
    expect(
      screen.queryByRole("button", { name: "Cancel that transfer" }),
    ).toBeNull();
  });

  it("keeps a server sentence it does not know off the screen", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([ownerWorkspace]);
    vi.mocked(requestWorkspaceClosure).mockRejectedValueOnce(
      new Error("new row violates check constraint workspace_closure_requests_mode_check"),
    );
    renderPage();

    await openScheduledClosure();

    expect((await screen.findByRole("alert")).textContent).toBe(
      "This workspace was not closed. Reload the page and try again.",
    );
    expect(screen.queryByText(/violates check constraint/)).toBeNull();
  });

  it("puts the failure inside the panel that failed", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([ownerWorkspace]);
    vi.mocked(requestWorkspaceClosure).mockRejectedValueOnce(
      new Error("workspace owner access required"),
    );
    renderPage();

    await openScheduledClosure();

    const region = screen.getByRole("region", { name: "Schedule closure for Meyhouse" });
    expect((await within(region).findByRole("alert")).textContent).toBe(
      "Only the owner of this workspace can do that, and you are not the owner any more. Reload the page to see where you stand.",
    );
  });

  it("does not print the server's sentence when the admin search fails", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([ownerWorkspace]);
    vi.mocked(searchWorkspaceOwnershipCandidates).mockRejectedValue(
      new Error("permission denied for relation workspace_memberships"),
    );
    renderPage();

    await openWorkspaceActions();
    fireEvent.click(screen.getByRole("menuitem", { name: "Transfer ownership" }));
    fireEvent.change(screen.getByLabelText("Find an admin by name or email"), {
      target: { value: "Admin" },
    });

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Admins could not be searched right now. Try the search again.",
    );
    expect(screen.queryByText(/permission denied for relation/)).toBeNull();
  });

  it("names the next step when nobody can take the workspace over", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([ownerWorkspace]);
    vi.mocked(searchWorkspaceOwnershipCandidates).mockResolvedValue([]);
    renderPage();

    await openWorkspaceActions();
    fireEvent.click(screen.getByRole("menuitem", { name: "Transfer ownership" }));
    fireEvent.change(screen.getByLabelText("Find an admin by name or email"), {
      target: { value: "Admin" },
    });

    expect(
      await screen.findByText(/Make someone an admin in Employees/),
    ).toBeTruthy();
  });

  it("never calls a workspace an organization while it is being closed", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([ownerWorkspace]);
    renderPage();

    await openWorkspaceActions();
    fireEvent.click(screen.getByRole("menuitem", { name: "Close immediately" }));
    expect(
      screen.getByRole("region", { name: "Close Meyhouse immediately" }).textContent,
    ).not.toMatch(/organi[sz]ation|business|tenant/i);
  });

  it("tells a target admin when the request runs out", async () => {
    const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const label = new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(expiresAt));
    vi.mocked(listAccountWorkspaces).mockResolvedValue([
      {
        ...ownerWorkspace,
        role: "admin",
        pendingOwnershipTransfer: { id: transferId, role: "target", expiresAt },
      },
    ]);
    renderPage();

    expect(
      (await screen.findByRole("region", { name: "Ownership request for Meyhouse" }))
        .textContent,
    ).toContain(`Answer by ${label}`);
  });

  it("speaks for the person when an expired transfer is answered", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([
      {
        ...ownerWorkspace,
        role: "admin",
        pendingOwnershipTransfer: {
          id: transferId,
          role: "target",
          expiresAt: "2099-01-01T00:00:00Z",
        },
      },
    ]);
    vi.mocked(respondWorkspaceOwnershipTransfer).mockRejectedValueOnce(
      new Error("ownership transfer has expired"),
    );
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "Reject owner transfer for Meyhouse" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Reject transfer" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "This request ran out of time. Ask the owner to send it again.",
    );
    expect(screen.queryByText(/ownership transfer has expired/)).toBeNull();
  });

  it("speaks for the person when a cancelled closure is already gone", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([
      {
        ...ownerWorkspace,
        lifecycleStatus: "closure_scheduled",
        closureEffectiveAt: scheduledClosureAt,
      },
    ]);
    vi.mocked(cancelWorkspaceClosure).mockRejectedValueOnce(
      new Error("workspace closure is not scheduled"),
    );
    renderPage();

    await openWorkspaceActions();
    fireEvent.click(screen.getByRole("menuitem", { name: "Cancel closure" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "This workspace has no closure scheduled any more. Reload the page to see its current state.",
    );
    expect(screen.queryByText(/workspace closure is not scheduled/)).toBeNull();
  });

  it("speaks for the person when a cancelled transfer is already gone", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([
      {
        ...ownerWorkspace,
        pendingOwnershipTransfer: {
          id: transferId,
          role: "initiator",
          expiresAt: "2099-01-01T00:00:00Z",
        },
      },
    ]);
    vi.mocked(cancelWorkspaceOwnershipTransfer).mockRejectedValueOnce(
      new Error("pending ownership transfer not found"),
    );
    renderPage();

    await openWorkspaceActions();
    fireEvent.click(screen.getByRole("menuitem", { name: "Cancel transfer" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "This request is no longer waiting for an answer. Reload the page to see the workspaces you have.",
    );
    expect(screen.queryByText(/pending ownership transfer not found/)).toBeNull();
  });
});

describe("closing later", () => {
  it("says the date the closure would land on, from the rule the database owns", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([
      {
        ...ownerWorkspace,
        defaultClosureEffectiveAt: "2026-10-06T00:00:00.000Z",
      } as typeof ownerWorkspace,
    ]);
    renderPage();

    await openWorkspaceActions();
    fireEvent.click(screen.getByRole("menuitem", { name: "Schedule closure" }));

    // The instant is formatted where the reader is, so the expected text is
    // built the same way rather than pinned to one zone.
    const localDate = new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date("2026-10-06T00:00:00.000Z"));
    expect(
      await screen.findByText(
        new RegExp(`Everyone keeps access until ${localDate},`),
      ),
    ).toBeTruthy();
    // KARARLAR "Workspace kapatma düğmeleri" (Mert, 2026-10-08): the owner is
    // told the closure deletes the data, in these words.
    expect(
      document.getElementById("workspace-closure-description")?.textContent,
    ).toMatch(/Then the workspace and its data are permanently deleted\.$/);
  });

  // Rather than work the rule out again and risk a different answer from the
  // one that will actually be applied.
  it("falls back to naming no date when the payload carries none", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([ownerWorkspace]);
    renderPage();

    await openWorkspaceActions();
    fireEvent.click(screen.getByRole("menuitem", { name: "Schedule closure" }));

    expect(
      await screen.findByText(/Everyone keeps access until the closure date/),
    ).toBeTruthy();
    expect(
      document.getElementById("workspace-closure-description")?.textContent,
    ).toMatch(/Then the workspace and its data are permanently deleted\.$/);
  });
});

describe("whoIsInIt", () => {
  const sized = (
    otherMemberCount?: number,
    pendingInvitationCount?: number,
  ) =>
    ({
      ...ownerWorkspace,
      otherMemberCount,
      pendingInvitationCount,
    }) as typeof ownerWorkspace;

  it("counts everybody but the reader, and the invitations separately", () => {
    expect(whoIsInIt(sized(11, 3))).toBe(
      "11 other people have access and 3 invitations are waiting for an answer here.",
    );
  });

  it("reads as one person rather than one people", () => {
    expect(whoIsInIt(sized(1, 1))).toBe(
      "1 other person has access and 1 invitation is waiting for an answer here.",
    );
  });

  it("says so plainly when the workspace is the reader alone", () => {
    expect(whoIsInIt(sized(0, 0))).toBe(
      "Nobody else has access to this workspace yet.",
    );
  });

  it("drops the invitation half when none are waiting", () => {
    expect(whoIsInIt(sized(4, 0))).toBe("4 other people have access here.");
  });

  // Rather than guess a number onto a screen that asks for a confirmation.
  it("says nothing at all when the count did not arrive", () => {
    expect(whoIsInIt(sized(undefined, undefined))).toBe("");
  });
});
