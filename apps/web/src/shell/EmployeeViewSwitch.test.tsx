import { render, screen, within } from "@testing-library/react";
import type { ActiveWorkspaceContext } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

// FB-6.2.8 DEV variants of "Switch to employee view": only someone with an
// employee record of their own (employee_hub.read) gets the switch.

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
const owner = {
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
    role: "owner",
    status: "active",
    allLocations: true,
  },
  permissions: ["workspace.read", "schedule.read", "employees.read", "notifications.read"],
  actions: ["employee_hub.read"],
  onboarding: { status: "complete", currentStep: 2 },
  documentAccess: { restricted: false },
  locationScope: { allLocations: true, locationIds: [] },
} satisfies ActiveWorkspaceContext;

let current: ActiveWorkspaceContext = owner;
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ context: current, signOut: vi.fn() }),
}));
vi.mock("../communications/communications-data", () => ({
  getNotifications: vi.fn().mockResolvedValue({ unread_count: 0, items: [] }),
  notificationChangeEventName: "newfork:notifications-changed",
  notificationChangeStorageKey: "newfork.notifications.changed",
}));

const sidebar = () => within(screen.getByRole("complementary", { name: "Application sidebar" }));

function renderAt(path: string, variant: string | null) {
  window.history.replaceState(null, "", variant ? `/?v8=${variant}` : "/?v8=off");
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/app/*" element={<AppShell />}>
            <Route path="*" element={<p>page</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  current = owner;
  window.sessionStorage.clear();
});

describe("employee view switch (FB-6.2.8 variants)", () => {
  it("is not there on main (no variant)", () => {
    renderAt("/app/workspace", null);
    expect(sidebar().queryByText("Employee view")).toBeNull();
  });

  it("is not offered to someone without an employee record", () => {
    current = { ...owner, actions: [] };
    renderAt("/app/workspace", "a");
    expect(sidebar().queryByText("Employee view")).toBeNull();
  });

  it("A: goes to the employee view and back from the sidebar", () => {
    renderAt("/app/workspace", "a");
    expect(sidebar().getByRole("link", { name: /Employee view/ }).getAttribute("href")).toBe("/app/employee-hub");
  });

  it("A: in the employee view the sidebar is the employee's own and leads back", () => {
    renderAt("/app/employee-hub", "a");
    expect(sidebar().getByRole("link", { name: /Shift Hub/ })).toBeTruthy();
    expect(sidebar().queryByRole("link", { name: /Employees/ })).toBeNull();
    expect(sidebar().getByRole("link", { name: /Management view/ }).getAttribute("href")).toBe("/app/workspace");
  });

  it("C: keeps the management frame and shows a strip with the way back", () => {
    renderAt("/app/employee-hub", "c");
    expect(sidebar().getByRole("link", { name: /Employees/ })).toBeTruthy();
    const strip = screen.getByRole("region", { name: "Employee view" });
    expect(within(strip).getByRole("link", { name: "Back to management" })).toBeTruthy();
  });
});
