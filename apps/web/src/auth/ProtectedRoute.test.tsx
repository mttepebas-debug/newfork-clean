import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listPendingEmployeeInvitations } from "../employees/employee-data";
import { ProtectedRoute } from "./ProtectedRoute";

const authState = vi.hoisted(() => ({
  value: {
    authenticated: true,
    context: null,
    error: "Could not query the database for the schema cache. Retrying." as
      | string
      | null,
    ready: true,
    refresh: vi.fn(),
    signOut: vi.fn(),
  },
}));

vi.mock("./AuthContext", () => ({
  useAuth: () => authState.value,
}));

vi.mock("../employees/employee-data", () => ({
  listPendingEmployeeInvitations: vi.fn(),
}));

const invitation = {
  id: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  workspaceName: "Harbor Grill",
  emailHint: "o***@newfork.test",
  expiresAt: "2026-10-01T00:00:00.000Z",
};

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="Current path">{location.pathname}</output>;
}

function renderRoute() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/app/workspace"]}>
        <Routes>
          <Route
            path="/app/workspace"
            element={
              <ProtectedRoute workspace="complete">
                <h1>Workspace</h1>
              </ProtectedRoute>
            }
          />
          <Route path="/invitations/pending" element={<LocationProbe />} />
          <Route path="/onboarding" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    authState.value.authenticated = true;
    authState.value.context = null;
    authState.value.error =
      "Could not query the database for the schema cache. Retrying.";
    authState.value.ready = true;
    authState.value.refresh.mockClear();
    authState.value.signOut.mockClear();
    vi.mocked(listPendingEmployeeInvitations).mockReset();
    vi.mocked(listPendingEmployeeInvitations).mockResolvedValue([]);
  });

  it("shows workspace resolution errors instead of a blank loading screen", () => {
    renderRoute();

    expect(
      screen.getByRole("heading", { name: "Workspace unavailable" }),
    ).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain(
      "Could not query the database",
    );

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(authState.value.refresh).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(authState.value.signOut).toHaveBeenCalledTimes(1);
  });

  it("routes authenticated no-context workspace access to pending invitation review", () => {
    authState.value.error = null;
    renderRoute();

    expect(screen.getByLabelText("Current path").textContent).toBe(
      "/invitations/pending",
    );
    expect(listPendingEmployeeInvitations).not.toHaveBeenCalled();
  });

  it("routes incomplete owner onboarding contexts away from the app shell", async () => {
    authState.value.error = null;
    authState.value.context = {
      onboarding: { status: "incomplete", currentStep: 2 },
    } as never;
    renderRoute();

    expect((await screen.findByLabelText("Current path")).textContent).toBe(
      "/onboarding",
    );
  });

  it("shows a new invitation to a member once per tab session", async () => {
    authState.value.error = null;
    authState.value.context = {
      onboarding: { status: "complete", currentStep: 4 },
    } as never;
    vi.mocked(listPendingEmployeeInvitations).mockResolvedValue([invitation]);
    renderRoute();

    expect((await screen.findByLabelText("Current path")).textContent).toBe(
      "/invitations/pending",
    );
    await waitFor(() =>
      expect(
        window.sessionStorage.getItem("newfork.invitationsChecked"),
      ).toBe("1"),
    );
  });

  it("lets the member through once the invitation check has run", async () => {
    authState.value.error = null;
    authState.value.context = {
      onboarding: { status: "complete", currentStep: 4 },
    } as never;
    window.sessionStorage.setItem("newfork.invitationsChecked", "1");
    vi.mocked(listPendingEmployeeInvitations).mockResolvedValue([invitation]);
    renderRoute();

    expect(screen.getByRole("heading", { name: "Workspace" })).toBeTruthy();
    expect(listPendingEmployeeInvitations).not.toHaveBeenCalled();
  });

  it("never blocks the app when the invitation check fails", async () => {
    authState.value.error = null;
    authState.value.context = {
      onboarding: { status: "complete", currentStep: 4 },
    } as never;
    vi.mocked(listPendingEmployeeInvitations).mockRejectedValue(
      new Error("offline"),
    );
    renderRoute();

    expect(
      await screen.findByRole("heading", { name: "Workspace" }),
    ).toBeTruthy();
  });
});
