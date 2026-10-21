import { render, screen, within } from "@testing-library/react";
import type { ActiveWorkspaceContext } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

// "Switch to employee view": only somebody who holds both accesses, a
// management one and the employee one, gets the switch (ROL-CIFT 6.2, design
// §4.1), and the way back is the same row.

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
    access: { employee: true, management: "owner" },
    status: "active",
  },
  permissions: ["workspace.read", "schedule.read", "employees.read"],
  actions: ["employee_hub.read"],
  onboarding: { status: "complete", currentStep: 2 },
  documentAccess: { restricted: false },
  locationScope: { allLocations: true, locationIds: [] },
} satisfies ActiveWorkspaceContext;

let current: ActiveWorkspaceContext = owner;
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ context: current, signOut: vi.fn() }),
}));

const sidebar = () => within(screen.getByRole("complementary", { name: "Application sidebar" }));

function Where() {
  const location = useLocation();
  return <output data-testid="where">{location.pathname}</output>;
}

function renderAt(path: string) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/app/*" element={<AppShell />}>
            <Route path="*" element={<Where />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  current = owner;
});

describe("employee view switch (FB-6.2.8)", () => {
  it("is not offered to somebody who only manages", () => {
    current = { ...owner, membership: { ...owner.membership, access: { employee: false, management: "owner" } } };
    renderAt("/app/workspace");
    expect(sidebar().queryByText("Employee view")).toBeNull();
  });

  it("is not offered to an employee, whose only view is the employee view", () => {
    current = { ...owner, membership: { ...owner.membership, access: { employee: true, management: null } } };
    renderAt("/app/employee-hub");
    expect(sidebar().queryByText("Employee view")).toBeNull();
    expect(sidebar().queryByText("Management view")).toBeNull();
  });

  it("goes to the employee view from the sidebar", () => {
    renderAt("/app/workspace");
    expect(sidebar().getByRole("link", { name: /Employee view/ }).getAttribute("href")).toBe("/app/employee-hub");
  });

  it("is not offered to somebody with both accesses the core does not let into the hub", () => {
    current = { ...owner, actions: [] };
    renderAt("/app/workspace");
    expect(sidebar().queryByText("Employee view")).toBeNull();
  });

  it("offers it to a manager who also works shifts", () => {
    current = { ...owner, membership: { ...owner.membership, access: { employee: true, management: "manager" } } };
    renderAt("/app/schedule");
    expect(sidebar().getByRole("link", { name: /Employee view/ }).getAttribute("href")).toBe("/app/employee-hub");
  });

  it("in the employee view the sidebar is the employee's own and leads back", () => {
    renderAt("/app/employee-hub");
    expect(sidebar().getByRole("link", { name: /Shift Hub/ })).toBeTruthy();
    expect(sidebar().queryByRole("link", { name: /Employees/ })).toBeNull();
    expect(sidebar().queryByRole("link", { name: /Settings/ })).toBeNull();
    expect(sidebar().getByRole("link", { name: /Management view/ }).getAttribute("href")).toBe("/app/workspace");
  });

  it("in the employee view Announcements opens inside the employee view", () => {
    current = { ...owner, permissions: [...owner.permissions, "announcements.read"] };
    renderAt("/app/employee-hub");
    const announcements = sidebar().getByRole("link", { name: /Announcements/ });
    expect(announcements.getAttribute("href")).toBe("/app/employee-hub/announcements");
  });

  it("an announcement opened in the employee view keeps the employee's sidebar", () => {
    current = { ...owner, permissions: [...owner.permissions, "announcements.read"] };
    renderAt("/app/employee-hub/announcements/a9700000-0000-4000-8000-000000000021");
    expect(sidebar().getByRole("link", { name: /Management view/ })).toBeTruthy();
    expect(sidebar().queryByRole("link", { name: /Employees/ })).toBeNull();
  });

  it("a phone alert tapped while the app is open opens in the view the person is in (NOTICE-VIEW)", () => {
    const worker = new EventTarget();
    Object.defineProperty(navigator, "serviceWorker", { value: worker, configurable: true });
    try {
      current = { ...owner, permissions: [...owner.permissions, "announcements.read"] };
      renderAt("/app/employee-hub/schedule");
      const post = "a9700000-0000-4000-8000-000000000021";
      act(() => {
        worker.dispatchEvent(new MessageEvent("message", { data: { type: "newfork:open", url: `/app/announcements/${post}` } }));
      });
      expect(screen.getByTestId("where").textContent).toBe(`/app/employee-hub/announcements/${post}`);
    } finally {
      Reflect.deleteProperty(navigator, "serviceWorker");
    }
  });
});
