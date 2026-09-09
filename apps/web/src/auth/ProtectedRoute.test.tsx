import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

describe("ProtectedRoute", () => {
  beforeEach(() => {
    authState.value.authenticated = true;
    authState.value.context = null;
    authState.value.error =
      "Could not query the database for the schema cache. Retrying.";
    authState.value.ready = true;
    authState.value.refresh.mockClear();
    authState.value.signOut.mockClear();
  });

  it("shows workspace resolution errors instead of a blank loading screen", () => {
    render(
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
        </Routes>
      </MemoryRouter>,
    );

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

    function LocationProbe() {
      const location = useLocation();
      return <output aria-label="Current path">{location.pathname}</output>;
    }

    render(
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
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByLabelText("Current path").textContent).toBe(
      "/invitations/pending",
    );
  });

  it("routes incomplete owner onboarding contexts away from the app shell", () => {
    authState.value.error = null;
    authState.value.context = {
      onboarding: { status: "incomplete", currentStep: 2 },
    } as never;

    function LocationProbe() {
      const location = useLocation();
      return <output aria-label="Current path">{location.pathname}</output>;
    }

    render(
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
          <Route path="/onboarding" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByLabelText("Current path").textContent).toBe(
      "/onboarding",
    );
  });
});
