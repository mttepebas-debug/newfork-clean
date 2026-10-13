// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

// The phone bar reads the sidebar's permission-filtered list inside the real
// shell, so these tests mount AppShell with each role's permissions (BL-192).
let context: {
  workspace: { id: string; name: string };
  userId: string;
  membership: { role: string };
  permissions: string[];
  actions: string[];
};
const signOut = vi.fn();

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ context, account: { userId: "u" }, signOut }),
}));
vi.mock("../lib/supabase", () => ({ supabaseClient: null }));
vi.mock("../account/AccountAvatar", () => ({ CurrentUserAvatar: () => null }));
vi.mock("../communications/use-account-notification-realtime", () => ({
  useAccountNotificationRealtime: vi.fn(),
}));
vi.mock("../employee-hub/shift-exchanges/useExchangeRealtime", () => ({
  useExchangeRealtime: vi.fn(),
}));
vi.mock("../communications/communications-data", () => ({
  getNotifications: vi.fn().mockResolvedValue({ unread_count: 0 }),
  notificationChangeEventName: "notice",
  notificationChangeStorageKey: "notice-key",
}));

const owner = {
  workspace: { id: "w", name: "Meyhouse" },
  userId: "u",
  membership: { role: "owner" },
  permissions: [
    "workspace.read",
    "workspace.manage",
    "schedule.read",
    "schedule.time_off_requests.read",
    "employees.read",
    "employee_documents.read",
    "availability.read",
    "important_dates.read",
    "announcements.read",
    "notifications.read",
  ],
  actions: [] as string[],
};
// A manager without the dashboard, documents or any settings permission.
const manager = {
  ...owner,
  membership: { role: "manager" },
  permissions: [
    "schedule.read",
    "schedule.time_off_requests.read",
    "employees.read",
    "availability.read",
    "notifications.read",
  ],
};

function mount(path = "/app/schedule") {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/app" element={<AppShell />}>
            <Route path="schedule" element={<h1>Schedule page</h1>} />
            <Route path="employees" element={<h1>Employees page</h1>} />
            <Route path="settings" element={<h1>Settings page</h1>} />
            <Route path="employee-hub" element={<h1>Hub page</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const names = (container: HTMLElement) =>
  within(container)
    .getAllByRole("link", { hidden: true })
    .concat(within(container).queryAllByRole("button", { hidden: true }))
    .map((element) => element.textContent);
const bar = () => screen.getByRole("navigation", { name: "Main navigation" });
const morePages = () => screen.getByRole("navigation", { name: "More pages", hidden: true });

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(() => {
  cleanup();
  signOut.mockClear();
});

describe("ManagementMobileNav in the app shell", () => {
  it("owner: four pages in the bar, everything else they can open under More", () => {
    context = owner;
    mount();
    expect(names(bar())).toEqual(["Workspace", "Schedule", "Requests", "Employees", "More"]);
    expect(names(morePages())).toEqual([
      "Documents",
      "Availability",
      "Announcements",
      "Important Dates",
      "Notifications",
      "Settings",
      "Account",
      "Sign out",
    ]);
  });

  it("manager: pages they cannot open never appear, Settings included", () => {
    context = manager;
    mount();
    expect(names(bar())).toEqual(["Schedule", "Requests", "Employees", "Availability", "More"]);
    expect(names(morePages())).toEqual(["Notifications", "Account", "Sign out"]);
  });

  it("with an employee record of their own, More offers the employee view (FB-6.2.8)", () => {
    context = { ...manager, actions: ["employee_hub.read"] };
    mount();
    expect(names(morePages())).toEqual(["Notifications", "Employee view", "Account", "Sign out"]);
  });

  it("employee: no management bar (the Employee Hub bar serves them)", () => {
    context = { ...owner, membership: { role: "employee" }, permissions: ["workspace.read"] };
    mount("/app/employee-hub");
    expect(screen.queryByRole("navigation", { name: "Main navigation" })).toBeNull();
  });

  it("moves Schedule → Employees → Settings, closing More on the way", () => {
    context = owner;
    mount();
    fireEvent.click(within(bar()).getByRole("link", { name: "Employees" }));
    expect(screen.getByRole("heading", { name: "Employees page" })).toBeTruthy();
    expect(within(bar()).getByRole("link", { name: "Employees" }).className).toBe("active");

    fireEvent.click(within(bar()).getByRole("button", { name: "More" }));
    const sheet = screen.getByRole("dialog", { name: "More" });
    expect(sheet.hasAttribute("open")).toBe(true);
    fireEvent.click(within(morePages()).getByRole("link", { name: "Settings" }));
    expect(screen.getByRole("heading", { name: "Settings page" })).toBeTruthy();
    expect(sheet.hasAttribute("open")).toBe(false);
    // Settings lives under More, so More carries the active state.
    expect(within(bar()).getByRole("button", { name: "More" }).className).toBe("active");
  });

  it("Escape closes More, and Sign out signs out", () => {
    context = owner;
    mount();
    fireEvent.click(within(bar()).getByRole("button", { name: "More" }));
    const sheet = screen.getByRole("dialog", { name: "More" });
    fireEvent.keyDown(sheet, { key: "Escape" });
    expect(sheet.hasAttribute("open")).toBe(false);

    fireEvent.click(within(bar()).getByRole("button", { name: "More" }));
    fireEvent.click(within(morePages()).getByRole("button", { name: "Sign out", hidden: true }));
    expect(signOut).toHaveBeenCalledOnce();
  });
});
