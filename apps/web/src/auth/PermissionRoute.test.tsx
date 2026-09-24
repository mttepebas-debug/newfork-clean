import type { ActiveWorkspaceContext } from "@newfork/shared";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionRoute } from "./PermissionRoute";

const baseContext = {
  userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
  workspace: {
    id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
    name: "Meyhouse",
    logo_url: null,
    logo_file_name: null,
    logo_updated_at: null,
    schedule_logo_placement: { scale: 1, offset_x: 0, offset_y: 0 },
  },
  membership: {
    id: "bd6b757b-c9ad-4e47-a47e-0a90a43bc0e4",
    userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
    workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
    role: "employee",
    status: "active",
    allLocations: true,
  },
  permissions: ["workspace.read"],
  actions: [],
  onboarding: { status: "complete", currentStep: 4 },
  locationScope: { allLocations: true, locationIds: [] },
} satisfies ActiveWorkspaceContext;

let currentContext: ActiveWorkspaceContext | null = baseContext;

vi.mock("./AuthContext", () => ({
  useAuth: () => ({ context: currentContext }),
}));

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="Current path">{location.pathname}</output>;
}

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={["/app/employees"]}>
      <Routes>
        <Route
          path="/app/employees"
          element={
            <PermissionRoute
              roles={["owner", "admin", "manager"]}
              anyOf={["employees.read"]}
            >
              <h1>Employees</h1>
              <LocationProbe />
            </PermissionRoute>
          }
        />
        <Route
          path="/app/employee-hub"
          element={
            <>
              <h1>Employee Hub</h1>
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PermissionRoute", () => {
  beforeEach(() => {
    currentContext = baseContext;
  });

  it("redirects an employee away from a management direct URL", () => {
    renderGuard();

    expect(screen.getByRole("heading", { name: "Employee Hub" })).toBeTruthy();
    expect(screen.getByLabelText("Current path").textContent).toBe(
      "/app/employee-hub",
    );
  });

  it("allows manager-class routes when role and permission match", () => {
    currentContext = {
      ...baseContext,
      membership: {
        ...baseContext.membership,
        role: "manager",
      },
      permissions: ["workspace.read", "employees.read"],
    };

    renderGuard();

    expect(screen.getByRole("heading", { name: "Employees" })).toBeTruthy();
    expect(screen.getByLabelText("Current path").textContent).toBe(
      "/app/employees",
    );
  });
});
