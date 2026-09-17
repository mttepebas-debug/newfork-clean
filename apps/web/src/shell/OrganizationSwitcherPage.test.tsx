import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ActiveWorkspaceContext, WorkspaceSummary } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OrganizationSwitcherPage from "./OrganizationSwitcherPage";
import {
  acceptPendingEmployeeInvitation,
  listPendingEmployeeInvitations,
} from "../employees/employee-data";
import {
  listAccountWorkspaces,
  selectActiveWorkspace,
} from "../lib/supabase";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const employeeWorkspaceId = "7ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";

let refreshedContext: ActiveWorkspaceContext | null;
const refresh = vi.fn(async () => refreshedContext);

const managerContext = {
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

const employeeContext = {
  ...managerContext,
  workspace: {
    ...managerContext.workspace,
    id: employeeWorkspaceId,
    name: "West Room",
  },
  membership: {
    ...managerContext.membership,
    workspaceId: employeeWorkspaceId,
    role: "employee",
  },
} satisfies ActiveWorkspaceContext;

const workspaces = [
  {
    id: workspaceId,
    name: "Meyhouse",
    role: "manager",
    status: "active",
    isActive: true,
    onboarding: { status: "complete", currentStep: 2 },
  },
  {
    id: employeeWorkspaceId,
    name: "West Room",
    role: "employee",
    status: "active",
    isActive: false,
    onboarding: { status: "complete", currentStep: 2 },
  },
] satisfies WorkspaceSummary[];

const signOut = vi.fn();

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ context: managerContext, refresh, signOut }),
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

vi.mock("../lib/supabase", () => ({
  supabaseClient: {},
  listAccountWorkspaces: vi.fn(),
  selectActiveWorkspace: vi.fn(),
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
      <MemoryRouter initialEntries={["/organization-switcher"]}>
        <Routes>
          <Route
            path="/organization-switcher"
            element={
              <>
                <OrganizationSwitcherPage />
                <LocationProbe />
              </>
            }
          />
          <Route path="/app/workspace" element={<LocationProbe />} />
          <Route path="/app/employee-hub" element={<LocationProbe />} />
          <Route path="/account/workspaces" element={<LocationProbe />} />
          <Route path="/no-organization" element={<LocationProbe />} />
          <Route path="/welcome/:workspaceId" element={<LocationProbe />} />
          <Route
            path="/organization-switcher/suspended/:workspaceId"
            element={<LocationProbe />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("OrganizationSwitcherPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refreshedContext = managerContext;
    vi.mocked(listAccountWorkspaces).mockResolvedValue(workspaces);
    vi.mocked(selectActiveWorkspace).mockResolvedValue(undefined);
    vi.mocked(listPendingEmployeeInvitations).mockResolvedValue([]);
  });

  it("lists organizations without promoting workspace creation", async () => {
    const { container } = renderPage();

    expect(
      await screen.findByRole("heading", { name: "Choose organization" }),
    ).toBeTruthy();
    await screen.findByText("Meyhouse");
    expect(
      container
        .querySelector("[aria-labelledby='organization-switcher-title']")
        ?.getAttribute("aria-busy"),
    ).toBe("false");
    expect(screen.getByRole("list", { name: "Organizations" })).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Meyhouse")).toBeTruthy();
    expect(screen.getByText("West Room")).toBeTruthy();
    expect(
      screen.getByText(
        "Select the organization you want to work in. Suspended organizations open a limited status view.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Create/i })).toBeNull();
    expect(
      screen.getByRole("link", { name: "Manage account workspaces" }),
    ).toBeTruthy();
  });

  it("uses the sign-in panel layout", async () => {
    const { container } = renderPage();
    await screen.findByText("Meyhouse");
    expect(container.querySelector("main.sign-in-page > section.sign-in-panel")).toBeTruthy();
    expect(screen.getByText("NEWFORK").className).toBe("product-mark");
  });

  it("sends accounts without organizations to the no-organization page", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([]);
    renderPage();
    await waitFor(() =>
      expect(screen.getByLabelText("Current path").textContent).toBe(
        "/no-organization",
      ),
    );
    expect(screen.queryByRole("heading", { name: "Choose organization" })).toBeNull();
  });

  it("selects an organization before opening its role landing", async () => {
    refreshedContext = employeeContext;
    renderPage();

    expect(
      await screen.findByRole("button", { name: "Open Meyhouse" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open West Room" }));

    await waitFor(() =>
      expect(selectActiveWorkspace).toHaveBeenCalledWith(
        {},
        employeeWorkspaceId,
      ),
    );
    expect(refresh).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByLabelText("Current path").textContent).toBe(
        "/app/employee-hub",
      ),
    );
  });

  it("lists invitations above organizations and joins into that onboarding", async () => {
    vi.mocked(listPendingEmployeeInvitations).mockResolvedValue([invitation]);
    vi.mocked(acceptPendingEmployeeInvitation).mockResolvedValue(
      invitation.workspaceId,
    );
    renderPage();

    expect(await screen.findByText("Northstar")).toBeTruthy();
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toContain("Northstar");
    expect(
      screen.getByRole("button", { name: "Decline invitation to Northstar" }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Join Northstar" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Current path").textContent).toBe(
        `/welcome/${invitation.workspaceId}`,
      ),
    );
  });

  it("stays on the switcher when only invitations exist", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([]);
    vi.mocked(listPendingEmployeeInvitations).mockResolvedValue([invitation]);
    renderPage();

    expect(await screen.findByText("Northstar")).toBeTruthy();
    expect(screen.getByLabelText("Current path").textContent).toBe(
      "/organization-switcher",
    );
  });

  it("offers recovery when organizations cannot be loaded", async () => {
    vi.mocked(listAccountWorkspaces).mockRejectedValueOnce(
      new Error("Service unavailable"),
    );
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Organizations unavailable" }),
    ).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("Service unavailable");

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Meyhouse")).toBeTruthy();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("signs out from the recovery view", async () => {
    vi.mocked(listAccountWorkspaces).mockRejectedValue(
      new Error("Service unavailable"),
    );
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("continues onboarding for pending organizations and limits suspended ones", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([
      {
        id: "8ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
        name: "Pending Room",
        role: "employee",
        status: "pending",
        isActive: false,
        onboarding: { status: "incomplete", currentStep: 1 },
      },
      {
        id: "9ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
        name: "Suspended Room",
        role: "manager",
        status: "suspended",
        isActive: false,
        onboarding: { status: "complete", currentStep: 2 },
      },
    ]);
    renderPage();

    expect(await screen.findByText("Pending Room")).toBeTruthy();
    expect(screen.getByText("employee · onboarding in progress")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "View status for Suspended Room" }),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Continue onboarding for Pending Room",
      }),
    );
    expect(selectActiveWorkspace).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByLabelText("Current path").textContent).toBe(
        "/welcome/8ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
      ),
    );
  });

  it("routes suspended organizations to the suspended status surface", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([
      {
        id: "9ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
        name: "Suspended Room",
        role: "manager",
        status: "suspended",
        isActive: false,
        onboarding: { status: "complete", currentStep: 2 },
      },
    ]);
    renderPage();

    expect(await screen.findByText("Suspended Room")).toBeTruthy();
    expect(screen.getByText("manager · suspended")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "View status for Suspended Room" }),
    );

    expect(selectActiveWorkspace).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByLabelText("Current path").textContent).toBe(
        "/organization-switcher/suspended/9ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
      ),
    );
  });
});
