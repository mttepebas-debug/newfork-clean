import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ActiveWorkspaceContext } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";
import { getNotifications } from "../communications/communications-data";
import { useAvailabilityNavigationGuard } from "../availability/availability-navigation";
import { PermissionRoute } from "../auth/PermissionRoute";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";

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
    role: "owner",
    status: "active",
    allLocations: true,
  },
  permissions: [
    "workspace.read",
    "workspace.manage",
    "schedule.read",
    "schedule.time_off_requests.read",
    "employees.read",
    "availability.read",
    "important_dates.read",
    "announcements.read",
    "notifications.read",
  ],
  actions: [],
  onboarding: { status: "complete", currentStep: 2 },
  documentAccess: { restricted: false },
  locationScope: { allLocations: true, locationIds: [] },
} satisfies ActiveWorkspaceContext;

const employeeContext = {
  ...context,
  membership: {
    ...context.membership,
    role: "employee",
  },
  permissions: ["workspace.read", "announcements.read", "notifications.read"],
} satisfies ActiveWorkspaceContext;

let currentContext: ActiveWorkspaceContext = context;
const signOut = vi.fn();
function GuardedRoute() {
  const dialog = useAvailabilityNavigationGuard({dirty:true,busy:false});
  return <><p>Guarded availability route</p>{dialog}</>;
}

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ context: currentContext, signOut }),
}));

vi.mock("../communications/communications-data", () => ({
  getNotifications: vi.fn(),
  notificationChangeEventName: "newfork:notifications-changed",
  notificationChangeStorageKey: "newfork.notifications.changed",
}));

vi.mock("../settings/organization-data", () => ({
  loadSchedulingSettings: vi.fn().mockResolvedValue({
    workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
    week_start_day: "monday",
    schedule_deadline_day: "sunday",
    time_format: "12h",
  }),
}));

describe("AppShell notification badge", () => {
  beforeEach(() => {
    currentContext = context;
    vi.clearAllMocks();
    vi.mocked(getNotifications).mockReset();
    vi.mocked(getNotifications).mockResolvedValue({
      workspace_id: workspaceId,
      unread_count: 0,
      next_cursor: null,
      notifications: [],
    });
  });

  function renderShell(initialEntry = "/app/workspace") {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route path="/app" element={<AppShell />}>
              <Route path="workspace" element={<p>Workspace route</p>} />
              <Route path="schedule" element={<p>Schedule route</p>} />
              <Route
                path="schedule/requests"
                element={<p>Schedule Requests route</p>}
              />
              <Route path="employees" element={<p>Employees route</p>} />
              <Route path="availability" element={
                <PermissionRoute roles={["owner", "admin", "manager"]} anyOf={["schedule.read"]}>
                  <p>Team Availability route</p>
                </PermissionRoute>
              } />
              <Route path="availability-test" element={<GuardedRoute />} />
              <Route
                path="important-dates"
                element={<p>Important Dates route</p>}
              />
              <Route
                path="employee-hub/*"
                element={<p>Employee Hub route</p>}
              />
              <Route
                path="announcements"
                element={<p>Announcements route</p>}
              />
              <Route
                path="notifications"
                element={<p>Notifications route</p>}
              />
              <Route path="settings" element={<p>Settings route</p>} />
            </Route>
            <Route path="/account/profile" element={<p>Account route</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("protects guarded drafts before sign out", async () => {
    vi.mocked(getNotifications).mockResolvedValue({workspace_id:workspaceId,unread_count:0,next_cursor:null,notifications:[]});
    renderShell("/app/availability-test");
    await screen.findByText("Guarded availability route");
    fireEvent.click(screen.getByRole("button",{name:"Sign out"}));
    expect(signOut).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Stay here"}));
    fireEvent.click(screen.getByRole("button",{name:"Sign out"}));
    fireEvent.click(screen.getByRole("button",{name:"Discard and leave"}));
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("refreshes after a cross-tab notification invalidation", async () => {
    vi.mocked(getNotifications)
      .mockResolvedValueOnce({
        workspace_id: workspaceId,
        unread_count: 0,
        next_cursor: null,
        notifications: [],
      })
      .mockResolvedValue({
        workspace_id: workspaceId,
        unread_count: 2,
        next_cursor: null,
        notifications: [],
      });
    renderShell();

    expect(await screen.findByText("Workspace route")).toBeTruthy();
    await waitFor(() => expect(getNotifications).toHaveBeenCalledTimes(1));
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "newfork.notifications.changed",
        newValue: JSON.stringify({ workspaceId, changedAt: Date.now() }),
      }),
    );

    expect(await screen.findByLabelText("2 unread")).toBeTruthy();
  });

  it("keeps collapsed rail labels in flyout spans across primary and footer items", async () => {
    vi.mocked(getNotifications).mockResolvedValue({
      workspace_id: workspaceId,
      unread_count: 7,
      next_cursor: null,
      notifications: [],
    });

    const { container } = renderShell();

    expect(await screen.findByText("Workspace route")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Collapse menu" }));

    expect(
      container
        .querySelector(".app-shell")
        ?.getAttribute("data-sidebar-collapsed"),
    ).toBe("true");
    expect(container.querySelector(".app-sidebar")).toBeTruthy();

    const expandMenuButton = screen.getByRole("button", {
      name: "Expand menu",
    });
    expect(expandMenuButton.className).toContain("rail-peek-item");
    expect(expandMenuButton.hasAttribute("data-rail-peek")).toBe(true);
    expect(expandMenuButton.getAttribute("title")).toBeNull();
    expect(expandMenuButton.querySelector(".rail-flyout")?.textContent).toBe(
      "Expand menu",
    );

    const availabilityLink = screen.getByRole("link", { name: "Availability" });
    expect(availabilityLink.className).toContain("rail-peek-item");
    expect(availabilityLink.hasAttribute("data-rail-peek")).toBe(true);
    expect(availabilityLink.getAttribute("title")).toBeNull();
    expect(availabilityLink.querySelector(".rail-flyout")?.textContent).toBe(
      "Availability",
    );

    const workspaceLink = screen.getByRole("link", { name: "Workspace" });
    expect(workspaceLink.className).toContain("rail-peek-item");
    expect(workspaceLink.hasAttribute("data-rail-peek")).toBe(true);
    expect(workspaceLink.getAttribute("data-rail-active")).toBe("true");
    expect(workspaceLink.getAttribute("title")).toBeNull();
    expect(workspaceLink.querySelector(".rail-flyout")?.textContent).toBe(
      "Workspace",
    );

    expect(
      screen.getByRole("link", { name: "Requests" }).getAttribute("href"),
    ).toBe("/app/schedule/requests");

    const notificationsLink = screen.getByRole("link", {
      name: "Notifications",
    });
    expect(notificationsLink.className).toContain("rail-peek-item");
    expect(notificationsLink.querySelector(".rail-flyout")?.textContent).toBe(
      "Notifications",
    );
    expect(
      notificationsLink.querySelector(".nav-unread-collapsed")?.textContent,
    ).toBe("7");
    expect(
      notificationsLink
        .querySelector(".nav-unread")
        ?.getAttribute("aria-label"),
    ).toBe("7 unread");

    const footerItems = Array.from(
      container.querySelectorAll(".sidebar-footer .nav-item"),
    );
    expect(
      footerItems.map(
        (item) => item.querySelector(".rail-flyout")?.textContent,
      ),
    ).toEqual(["Settings", "Account", "Sign out"]);
    footerItems.forEach((item) => {
      expect(item.className).toContain("rail-peek-item");
      expect(item.hasAttribute("data-rail-peek")).toBe(true);
    });
  });

  it("marks a collapsed footer rail item active when its route owns the page", async () => {
    vi.mocked(getNotifications).mockResolvedValue({
      workspace_id: workspaceId,
      unread_count: 0,
      next_cursor: null,
      notifications: [],
    });

    const { container } = renderShell("/app/settings");

    expect(await screen.findByText("Settings route")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Collapse menu" }));

    const settingsLink = screen.getByRole("link", { name: "Settings" });
    expect(settingsLink.getAttribute("data-rail-active")).toBe("true");
    expect(settingsLink.querySelector(".rail-flyout")?.textContent).toBe(
      "Settings",
    );
    expect(container.querySelector(".sidebar-footer .nav-item.active")).toBe(
      settingsLink,
    );
  });

  it("keeps Schedule inactive when an expanded Schedule child route owns the page", async () => {
    vi.mocked(getNotifications).mockResolvedValue({
      workspace_id: workspaceId,
      unread_count: 0,
      next_cursor: null,
      notifications: [],
    });

    renderShell("/app/schedule/requests");

    expect(await screen.findByText("Schedule Requests route")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Collapse menu" }));

    const scheduleLink = screen.getByRole("link", { name: "Schedule" });
    const requestsLink = screen.getByRole("link", { name: "Requests" });

    expect(scheduleLink.className).not.toContain("active");
    expect(scheduleLink.getAttribute("aria-current")).toBeNull();
    expect(scheduleLink.getAttribute("data-rail-active")).toBeNull();
    expect(requestsLink.className).toContain("active");
    expect(requestsLink.getAttribute("aria-current")).toBe("page");
    expect(requestsLink.getAttribute("data-rail-active")).toBe("true");
  });

  it("shows Schedule child pages only while the Schedule group is expanded", async () => {
    vi.mocked(getNotifications).mockResolvedValue({
      workspace_id: workspaceId,
      unread_count: 0,
      next_cursor: null,
      notifications: [],
    });

    renderShell();

    expect(await screen.findByText("Workspace route")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Collapse Schedule" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(screen.getByRole("link", { name: "Requests" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Collapse Schedule" }));

    expect(
      screen
        .getByRole("button", { name: "Expand Schedule" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    expect(screen.queryByRole("link", { name: "Requests" })).toBeNull();
  });

  it("orders management navigation before shared navigation", async () => {
    vi.mocked(getNotifications).mockResolvedValue({
      workspace_id: workspaceId,
      unread_count: 0,
      next_cursor: null,
      notifications: [],
    });

    const { container } = renderShell();

    expect(await screen.findByText("Workspace route")).toBeTruthy();
    // The slot used to be a placeholder marked "tbd"; it carries the switcher
    // now, and with one workspace and nothing waiting it is the plain name.
    expect(
      container.querySelector(".organization-context-slot")?.textContent,
    ).toBe("Meyhouse");
    const labels = Array.from(
      container.querySelectorAll(".sidebar-nav .nav-item"),
    ).map((item) => item.textContent);

    expect(labels).toEqual([
      "Workspace",
      "Schedule",
      "Requests",
      "Employees",
      "Availability",
      "Important Dates",
      "Announcements",
      "Notifications",
    ]);
  });

  it("does not expose request queues solely through employee-record access", async () => {
    currentContext = { ...context, permissions: ["workspace.read", "employees.read"] };
    renderShell();
    expect(await screen.findByText("Workspace route")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Requests" })).toBeNull();
    expect(document.querySelector('a[href="/app/schedule"]')).toBeNull();
    expect(screen.queryByRole("link", { name: "Availability" })).toBeNull();
  });

  it.each(["schedule.time_off_requests.read", "schedule.shift_change_requests.read"] as const)("keeps Requests reachable with %s without Schedule access", async permission => {
    currentContext = { ...context, permissions: ["workspace.read", permission] };
    renderShell();
    await screen.findByText("Workspace route");
    expect(screen.getByRole("link", { name: "Requests" }).getAttribute("href")).toBe("/app/schedule/requests");
    expect(document.querySelector('a[href="/app/schedule"]')).toBeNull();
  });

  it.each(["owner", "admin", "manager"] as const)("keeps %s in the management shell when opening team availability", async (role) => {
    currentContext = { ...context, membership: { ...context.membership, role } };
    const { container } = renderShell("/app/availability");
    await screen.findByText("Team Availability route");
    const link = screen.getByRole("link", { name: "Availability" });
    expect(link.getAttribute("href")).toBe("/app/availability");
    expect(link.getAttribute("aria-current")).toBe("page");
    expect(container.querySelector(".app-shell")?.getAttribute("data-employee-shell")).toBe("false");
    expect(screen.queryByText("Employee Hub route")).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "Workspace" }));
    await screen.findByText("Workspace route");
    fireEvent.click(screen.getByRole("button", { name: "Collapse Schedule" }));
    fireEvent.click(screen.getByRole("link", { name: "Availability" }));
    await screen.findByText("Team Availability route");
    fireEvent.click(screen.getByRole("button", { name: "Collapse menu" }));
    expect(screen.getByRole("link", { name: "Availability" }).getAttribute("data-rail-active")).toBe("true");
  });

  it("does not expose team availability to an employee opening its direct URL", async () => {
    currentContext = employeeContext;
    renderShell("/app/availability");
    await screen.findByText("Employee Hub route");
    expect(screen.queryByText("Team Availability route")).toBeNull();
    expect(screen.queryByRole("link", { name: "Availability" })).toBeNull();
    expect(screen.getByRole("link", { name: "My Availability" })).toBeTruthy();
  });

  it("orders employee navigation without exposing management routes", async () => {
    currentContext = employeeContext;
    vi.mocked(getNotifications).mockResolvedValue({
      workspace_id: workspaceId,
      unread_count: 0,
      next_cursor: null,
      notifications: [],
    });

    const { container } = renderShell("/app/employee-hub");

    expect(await screen.findByText("Employee Hub route")).toBeTruthy();
    const labels = Array.from(
      container.querySelectorAll(".sidebar-nav .nav-item"),
    ).map((item) => item.textContent);

    expect(labels).toEqual([
      "Home",
      "Schedule",
      "Shift Hub",
      "My Availability",
      "Announcements",
      "Notifications",
    ]);
    expect(screen.queryByRole("link", { name: "Workspace" })).toBeNull();
    expect(
      container
        .querySelector('.sidebar-nav a[href="/app/employee-hub/schedule"]')
        ?.textContent,
    ).toBe("Schedule");
    expect(document.querySelector('a[href="/app/schedule"]')).toBeNull();
    expect(screen.queryByRole("link", { name: "Employees" })).toBeNull();
  });

  it("keeps Employee Hub inactive when an employee child route owns the page", async () => {
    currentContext = employeeContext;
    vi.mocked(getNotifications).mockResolvedValue({
      workspace_id: workspaceId,
      unread_count: 0,
      next_cursor: null,
      notifications: [],
    });

    const { container } = renderShell("/app/employee-hub/shift-hub");

    expect(await screen.findByText("Employee Hub route")).toBeTruthy();

    const hubLink = container.querySelector(
      '.sidebar-nav a[href="/app/employee-hub"]',
    )!;
    const shiftHubLink = screen.getByRole("link", { name: "Shift Hub" });

    expect(hubLink.className).not.toContain("active");
    expect(shiftHubLink.className).toContain("active");
  });
});
