import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listPendingEmployeeInvitations } from "../employees/employee-data";
import {
  invitationPromptAnswered,
  markInvitationPromptAnswered,
} from "./invitation-prompt";
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

function FromProbe() {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "";
  return (
    <output aria-label="Current path">{`${location.pathname} from ${from}`}</output>
  );
}

function renderRoute(entry = "/app/workspace") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route
            path="/app/workspace"
            element={
              <ProtectedRoute workspace="complete">
                <h1>Workspace</h1>
              </ProtectedRoute>
            }
          />
          <Route path="/workspaces" element={<LocationProbe />} />
          <Route path="/invitations" element={<FromProbe />} />
          <Route
            path="/onboarding"
            element={
              <ProtectedRoute workspace="any">
                <LocationProbe />
              </ProtectedRoute>
            }
          />
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

  it("says a workspace did not load without repeating the server at the reader", () => {
    renderRoute();

    expect(
      screen.getByRole("heading", { name: "That workspace didn't load" }),
    ).toBeTruthy();
    // "Could not query the database" reads as an accusation and tells nobody
    // what to do next.
    expect(screen.queryByText(/Could not query the database/)).toBeNull();
    expect(
      screen.getByText(/went wrong on our side, not yours/),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(authState.value.refresh).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(authState.value.signOut).toHaveBeenCalledTimes(1);
  });

  it("routes authenticated no-context workspace access to the hub", () => {
    authState.value.error = null;
    renderRoute();

    expect(screen.getByLabelText("Current path").textContent).toBe(
      "/workspaces",
    );
    expect(listPendingEmployeeInvitations).not.toHaveBeenCalled();
  });

  // The setup is a decision the hub offers, not a place the guard drags the
  // owner into: that was the old behaviour and the plan's R3 reverses it.
  it("offers an unfinished owner setup in the hub instead of forcing it", async () => {
    authState.value.error = null;
    authState.value.context = {
      membership: { access: { employee: false, management: "owner" } },
      onboarding: { status: "incomplete", currentStep: 2 },
    } as never;
    renderRoute();

    expect((await screen.findByLabelText("Current path")).textContent).toBe(
      "/workspaces",
    );
  });

  it.each(["admin", "manager", "employee"] as const)(
    "keeps an active %s out of the owner setup while it is unfinished",
    async (role) => {
      authState.value.error = null;
      authState.value.context = {
        workspace: { name: "Harbor Grill" },
        membership: { access: role === "employee" ? { employee: true, management: null } : { employee: false, management: role } },
        onboarding: { status: "incomplete", currentStep: 2 },
      } as never;
      renderRoute();

      expect(
        await screen.findByRole("heading", {
          name: "Almost ready",
        }),
      ).toBeTruthy();
      expect(
        screen.getByText(/Harbor Grill is still being set up/),
      ).toBeTruthy();
      // A status view, not a redirect: nothing to loop on.
      expect(screen.queryByLabelText("Current path")).toBeNull();
      expect(screen.queryByRole("heading", { name: "Workspace" })).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Check again" }));
      expect(authState.value.refresh).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
      expect(authState.value.signOut).toHaveBeenCalledTimes(1);
    },
  );

  it("shows the same status when a non-owner opens the owner setup directly", async () => {
    authState.value.error = null;
    authState.value.context = {
      workspace: { name: "Harbor Grill" },
      membership: { access: { employee: true, management: null } },
      onboarding: { status: "incomplete", currentStep: 2 },
    } as never;
    renderRoute("/onboarding");

    expect(
      await screen.findByRole("heading", { name: "Almost ready" }),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Current path")).toBeNull();
  });

  it("lets the owner into the setup route", async () => {
    authState.value.error = null;
    authState.value.context = {
      membership: { access: { employee: false, management: "owner" } },
      onboarding: { status: "incomplete", currentStep: 2 },
    } as never;
    renderRoute("/onboarding");

    expect((await screen.findByLabelText("Current path")).textContent).toBe(
      "/onboarding",
    );
  });

  // KARARLAR "Girişten sonra yönlendirme": a waiting invitation is the first
  // screen of every app open, also for somebody with a workspace (BL-624).
  it("opens on the waiting invitation before the page, and remembers the page", async () => {
    authState.value.error = null;
    authState.value.context = {
      onboarding: { status: "complete", currentStep: 4 },
    } as never;
    vi.mocked(listPendingEmployeeInvitations).mockResolvedValue([invitation]);
    renderRoute("/app/workspace");

    expect((await screen.findByLabelText("Current path")).textContent).toBe(
      "/invitations from /app/workspace",
    );
    expect(screen.queryByRole("heading", { name: "Workspace" })).toBeNull();
  });

  it("does not ask again in an open where the invitation was already answered", async () => {
    authState.value.error = null;
    authState.value.context = {
      onboarding: { status: "complete", currentStep: 4 },
    } as never;
    markInvitationPromptAnswered();
    vi.mocked(listPendingEmployeeInvitations).mockResolvedValue([invitation]);
    renderRoute();

    expect(screen.getByRole("heading", { name: "Workspace" })).toBeTruthy();
    expect(listPendingEmployeeInvitations).not.toHaveBeenCalled();
  });

  it("checks once per open: with nothing waiting it shows the page and stops asking", async () => {
    authState.value.error = null;
    authState.value.context = {
      onboarding: { status: "complete", currentStep: 4 },
    } as never;
    renderRoute();

    expect(
      await screen.findByRole("heading", { name: "Workspace" }),
    ).toBeTruthy();
    expect(invitationPromptAnswered()).toBe(true);
  });

  it("lets the page through when the invitations cannot be read, and asks again later", async () => {
    authState.value.error = null;
    authState.value.context = {
      onboarding: { status: "complete", currentStep: 4 },
    } as never;
    vi.mocked(listPendingEmployeeInvitations).mockRejectedValue(new Error("down"));
    renderRoute();

    expect(
      await screen.findByRole("heading", { name: "Workspace" }),
    ).toBeTruthy();
    expect(invitationPromptAnswered()).toBe(false);
  });
});
