import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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

  it("lists businesses without promoting business creation", async () => {
    renderPage();

    // The title claims nothing before both lists have answered.
    expect(
      screen.getByRole("heading", { name: "Loading your businesses" }),
    ).toBeTruthy();
    expect(
      await screen.findByRole("heading", { name: "Choose a business" }),
    ).toBeTruthy();
    const rows = within(
      screen.getByRole("list", { name: "Your businesses" }),
    ).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Meyhouse")).toBeTruthy();
    expect(screen.getByText("West Room")).toBeTruthy();
    expect(screen.getByText("Manager")).toBeTruthy();
    // The tab's business is marked, in words and for a screen reader.
    expect(rows[0]?.getAttribute("aria-current")).toBe("true");
    expect(within(rows[0]!).getByText("Current")).toBeTruthy();
    expect(rows[1]?.getAttribute("aria-current")).toBeNull();
    expect(within(rows[1]!).queryByText("Current")).toBeNull();
    expect(screen.queryByRole("button", { name: /Create/i })).toBeNull();
    expect(
      screen.getByRole("link", { name: "Manage your businesses" }),
    ).toBeTruthy();
  });

  it("keeps Sign out on the list through the account block", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Choose a business" });
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("sends accounts without organizations to the no-organization page", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([]);
    renderPage();
    await waitFor(() =>
      expect(screen.getByLabelText("Current path").textContent).toBe(
        "/no-organization",
      ),
    );
    expect(
      screen.queryByRole("heading", { name: "Choose a business" }),
    ).toBeNull();
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

  it("says a failed open in plain words on that row", async () => {
    vi.mocked(selectActiveWorkspace).mockRejectedValueOnce(
      new Error("workspace membership not found"),
    );
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "Open West Room" }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("This business could not be opened");
    expect(alert.closest("[role='listitem']")?.textContent).toContain(
      "West Room",
    );
    expect(screen.getByLabelText("Current path").textContent).toBe(
      "/organization-switcher",
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
      await screen.findByRole("heading", {
        name: "Your businesses didn't load",
      }),
    ).toBeTruthy();
    // A fixed sentence: the server's own message never reaches the screen.
    expect(screen.getByRole("alert").textContent).toBe(
      "Your businesses could not be loaded",
    );
    expect(screen.queryByText(/Service unavailable/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Meyhouse")).toBeTruthy();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("signs out from the recovery view", async () => {
    vi.mocked(listAccountWorkspaces).mockRejectedValue(
      new Error("Service unavailable"),
    );
    renderPage();

    // The loading frame has Sign out too, so wait for the recovery view itself.
    await screen.findByRole("heading", { name: "Your businesses didn't load" });
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("gives each row the action set of its state", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([
      workspaces[0]!,
      {
        id: "aea5d512-bc7f-4cf3-aad4-2f0815de00fd",
        name: "Draft Room",
        role: "owner",
        status: "active",
        isActive: false,
        onboarding: { status: "incomplete", currentStep: 1 },
      },
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
      {
        // Its owner has not finished setup. A manager cannot finish or delete
        // it, so it is a business to open (and wait in), not a draft.
        id: "bea5d512-bc7f-4cf3-aad4-2f0815de00fd",
        name: "Waiting Room",
        role: "manager",
        status: "active",
        isActive: false,
        onboarding: { status: "incomplete", currentStep: 1 },
      },
    ]);
    renderPage();
    await screen.findByRole("heading", { name: "Choose a business" });

    const rowsOf = (list: string) =>
      within(screen.getByRole("list", { name: list }))
        .getAllByRole("listitem")
        .map((row) => ({
          name: row.querySelector("strong")?.textContent,
          // Role first, then the state: the same order on every screen.
          meta: [...row.querySelectorAll(".pb-row-meta > *")].map(
            (part) => part.textContent,
          ),
          actions: within(row)
            .getAllByRole("button")
            .map((button) => button.getAttribute("aria-label")),
        }));

    // A setup somebody still has to finish is continued, never opened.
    expect(rowsOf("In progress")).toEqual([
      {
        name: "Draft Room",
        meta: ["Owner", "Setup in progress"],
        actions: [
          "Discard setup for Draft Room",
          "Continue setup for Draft Room",
        ],
      },
      {
        name: "Pending Room",
        meta: ["Employee", "Onboarding in progress"],
        actions: [
          "Decline onboarding for Pending Room",
          "Continue onboarding for Pending Room",
        ],
      },
    ]);
    expect(rowsOf("Your businesses")).toEqual([
      {
        name: "Meyhouse",
        meta: ["Manager", "Current"],
        actions: ["Open Meyhouse"],
      },
      {
        name: "Suspended Room",
        meta: ["Manager", "Suspended"],
        actions: ["View status for Suspended Room"],
      },
      {
        name: "Waiting Room",
        meta: ["Manager"],
        actions: ["Open Waiting Room"],
      },
    ]);
    expect(
      screen.queryByRole("button", { name: "Discard setup for Waiting Room" }),
    ).toBeNull();
    // Opening is green; looking at a suspended business is the white side route.
    expect(
      screen.getByRole("button", { name: "Open Meyhouse" }).className,
    ).toContain("pb-btn-primary");
    expect(
      screen.getByRole("button", { name: "View status for Suspended Room" })
        .className,
    ).toContain("pb-btn-secondary");
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
    expect(screen.getByText("Onboarding in progress")).toBeTruthy();
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
    expect(screen.getByText("Suspended")).toBeTruthy();
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
