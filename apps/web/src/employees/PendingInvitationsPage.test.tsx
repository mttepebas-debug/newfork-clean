import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PendingInvitationsPage from "./PendingInvitationsPage";
import {
  acceptPendingEmployeeInvitation,
  declinePendingEmployeeInvitation,
  listPendingEmployeeInvitations,
} from "./employee-data";
import { listAccountWorkspaces } from "../lib/supabase";

vi.mock("./employee-data", () => ({
  acceptPendingEmployeeInvitation: vi.fn(),
  declinePendingEmployeeInvitation: vi.fn(),
  listPendingEmployeeInvitations: vi.fn(),
}));

vi.mock("../lib/supabase", () => ({
  invitationsCheckedStorageKey: "newfork.invitationsChecked",
  listAccountWorkspaces: vi.fn(),
  supabaseClient: {},
}));

const authState = vi.hoisted(() => ({
  value: { context: null as unknown, refresh: vi.fn() },
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => authState.value,
}));

const ownerContext = {
  membership: { role: "owner" },
  permissions: ["workspace.read"],
};
const northstar = {
  id: "26000000-0000-4000-8000-000000000001",
  name: "Northstar",
  role: "owner" as const,
  status: "active" as const,
  isActive: true,
  onboarding: { status: "complete" as const, currentStep: 4 },
};

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
      <MemoryRouter initialEntries={["/invitations/pending"]}>
        <Routes>
          <Route
            path="/invitations/pending"
            element={
              <>
                <PendingInvitationsPage />
                <LocationProbe />
              </>
            }
          />
          <Route path="/welcome" element={<LocationProbe />} />
          <Route path="/welcome/:workspaceId" element={<LocationProbe />} />
          <Route path="/app/workspace" element={<LocationProbe />} />
          <Route path="/organization-switcher" element={<LocationProbe />} />
          <Route path="/no-organization" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PendingInvitationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    authState.value.context = null;
    authState.value.refresh.mockResolvedValue(null);
    vi.mocked(listPendingEmployeeInvitations).mockResolvedValue([
      {
        id: "46000000-0000-4000-8000-000000000001",
        workspaceId: "26000000-0000-4000-8000-000000000001",
        workspaceName: "Northstar",
        emailHint: "ne**********@example.test",
        expiresAt: "2026-09-12T12:00:00.000Z",
      },
    ]);
    vi.mocked(acceptPendingEmployeeInvitation).mockResolvedValue(
      "26000000-0000-4000-8000-000000000001",
    );
    vi.mocked(declinePendingEmployeeInvitation).mockResolvedValue(undefined);
    vi.mocked(listAccountWorkspaces).mockResolvedValue([]);
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("shows active invitations without showing a person name", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Active invitation found" }),
    ).toBeTruthy();
    expect(await screen.findByText("Northstar")).toBeTruthy();
    expect(screen.queryByText(/Alex|Taylor|Employee One/i)).toBeNull();
  });

  it("is a hard stop for an invited account without any organization", async () => {
    renderPage();

    expect(
      await screen.findByText(
        "Join the organization that invited you. Declining cannot be undone.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: "Start my own organization" }),
    ).toBeNull();
    expect(screen.queryByRole("link", { name: "Not now" })).toBeNull();
  });

  it("lets a member postpone the invitation for this tab session", async () => {
    authState.value.context = ownerContext;
    vi.mocked(listAccountWorkspaces).mockResolvedValue([northstar]);
    renderPage();

    fireEvent.click(await screen.findByRole("link", { name: "Not now" }));

    expect(screen.getByLabelText("Current path").textContent).toBe(
      "/app/workspace",
    );
    expect(window.sessionStorage.getItem("newfork.invitationsChecked")).toBe(
      "1",
    );
  });

  it("lets an account that is mid-onboarding elsewhere return to it", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([
      { ...northstar, role: "employee", status: "pending", isActive: false },
    ]);
    renderPage();

    fireEvent.click(await screen.findByRole("link", { name: "Not now" }));

    expect(screen.getByLabelText("Current path").textContent).toBe("/welcome");
  });

  it("accepts an invitation by id and sends the user to onboarding", async () => {
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "Join Northstar" }),
    );

    await waitFor(() =>
      expect(acceptPendingEmployeeInvitation).toHaveBeenCalledWith(
        "46000000-0000-4000-8000-000000000001",
        expect.anything(),
      ),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Current path").textContent).toBe(
        "/welcome/26000000-0000-4000-8000-000000000001",
      ),
    );
  });

  it("requires explicit confirmation before declining", async () => {
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Decline invitation to Northstar",
      }),
    );

    expect(window.confirm).toHaveBeenCalledWith(
      "Declining this invitation cannot be undone. You will need a new invitation to join later.",
    );
    await waitFor(() =>
      expect(declinePendingEmployeeInvitation).toHaveBeenCalledWith(
        "46000000-0000-4000-8000-000000000001",
        expect.anything(),
      ),
    );
  });

  it("routes an account with no invitations or organizations to the no-org state", async () => {
    vi.mocked(listPendingEmployeeInvitations).mockResolvedValue([]);

    renderPage();

    await waitFor(() =>
      expect(screen.getByLabelText("Current path").textContent).toBe(
        "/no-organization",
      ),
    );
  });

  it("lands in the only organization once nothing is left to decide", async () => {
    vi.mocked(listPendingEmployeeInvitations).mockResolvedValue([]);
    vi.mocked(listAccountWorkspaces).mockResolvedValue([northstar]);
    authState.value.refresh.mockResolvedValue(ownerContext);

    renderPage();

    await waitFor(() =>
      expect(screen.getByLabelText("Current path").textContent).toBe(
        "/app/workspace",
      ),
    );
  });

  it("continues to the switcher when several organizations remain", async () => {
    vi.mocked(listPendingEmployeeInvitations).mockResolvedValue([]);
    vi.mocked(listAccountWorkspaces).mockResolvedValue([
      northstar,
      { ...northstar, id: "26000000-0000-4000-8000-000000000002", name: "Second" },
    ]);

    renderPage();

    await waitFor(() =>
      expect(screen.getByLabelText("Current path").textContent).toBe(
        "/organization-switcher",
      ),
    );
  });

  it("sends accepted pending members to employee onboarding when no invitation remains", async () => {
    vi.mocked(listPendingEmployeeInvitations).mockResolvedValue([]);
    vi.mocked(listAccountWorkspaces).mockResolvedValue([
      {
        id: "26000000-0000-4000-8000-000000000001",
        name: "Northstar",
        role: "employee",
        status: "pending",
        isActive: false,
        onboarding: { status: "complete", currentStep: 4 },
      },
    ]);

    renderPage();

    await waitFor(() =>
      expect(screen.getByLabelText("Current path").textContent).toBe(
        "/welcome",
      ),
    );
  });
});
