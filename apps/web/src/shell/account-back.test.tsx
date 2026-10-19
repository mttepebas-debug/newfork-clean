// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AccountLayout from "../account/AccountLayout";
import { AppShell } from "./AppShell";

// "Back to workspace" in Account returns to the page the person left, in the
// view they left it in (ACCOUNT-BACK, Mert 2026-10-18): a manager who is also
// an employee went to Account from the employee view and came back in the
// management view, because the view lives only in the address.
let context: {
  workspace: { id: string; name: string };
  userId: string;
  membership: { access: { employee: boolean; management: string | null } };
  permissions: string[];
  actions: string[];
};
let userId = "u";

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ context, account: { userId, displayName: "Ali" }, signOut: vi.fn() }),
}));
vi.mock("../lib/supabase", () => ({
  supabaseClient: null,
  countAccountAttention: vi.fn(),
}));
vi.mock("../account/AccountAvatar", () => ({
  AccountAvatar: () => null,
  CurrentUserAvatar: () => null,
}));
vi.mock("../employee-hub/shift-exchanges/useExchangeRealtime", () => ({
  useExchangeRealtime: vi.fn(),
}));

// Ali: Manager at Kadıköy with an employee record of his own.
const dualRole = {
  workspace: { id: "w", name: "Meyhouse" },
  userId: "u",
  membership: { access: { employee: false, management: "manager" } },
  permissions: ["workspace.read", "schedule.read", "employees.read"],
  actions: ["workspace.read", "schedule.read", "employee_hub.read"],
};

function mount(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/app" element={<AppShell />}>
            <Route index element={<h1>App home</h1>} />
            <Route path="workspace" element={<h1>Workspace page</h1>} />
            <Route path="schedule" element={<h1>Schedule page</h1>} />
            <Route path="employees" element={<h1>Employees page</h1>} />
            <Route path="employee-hub" element={<h1>Hub page</h1>} />
            <Route path="employee-hub/schedule" element={<h1>My schedule page</h1>} />
          </Route>
          <Route path="/account" element={<AccountLayout />}>
            <Route path="profile" element={<h1>Profile page</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function goToAccountAndBack() {
  fireEvent.click(screen.getAllByRole("link", { name: /^Account/ })[0]!);
  screen.getByRole("heading", { name: "Profile page" });
  fireEvent.click(screen.getByRole("button", { name: "Back to workspace" }));
}

describe("Back to workspace", () => {
  beforeEach(() => {
    context = dualRole;
    userId = "u";
    window.sessionStorage.clear();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined })));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("returns to the employee view's page it came from", () => {
    mount("/app/employee-hub/schedule");
    goToAccountAndBack();
    expect(screen.getByRole("heading", { name: "My schedule page" })).toBeTruthy();
  });

  it("returns to the management page it came from, query and all", () => {
    mount("/app/employees?employeeId=e1&section=profile");
    goToAccountAndBack();
    expect(screen.getByRole("heading", { name: "Employees page" })).toBeTruthy();
  });

  // Account → Workspaces can switch the workspace; the page left behind
  // belongs to the old one, so the new one opens on its own home.
  it("opens the workspace's home after a workspace switch", () => {
    mount("/app/employee-hub/schedule");
    fireEvent.click(screen.getAllByRole("link", { name: /^Account/ })[0]!);
    cleanup();
    context = { ...dualRole, workspace: { id: "w2", name: "Other" } };
    mount("/account/profile");
    fireEvent.click(screen.getByRole("button", { name: "Back to workspace" }));
    expect(screen.getByRole("heading", { name: "App home" })).toBeTruthy();
  });

  // A shared tablet: the next person in the same workspace does not land on
  // the page the last one left.
  it("opens the workspace's home for another person in the same tab", () => {
    mount("/app/employee-hub/schedule");
    fireEvent.click(screen.getAllByRole("link", { name: /^Account/ })[0]!);
    cleanup();
    userId = "someone-else";
    context = { ...dualRole, userId: "someone-else" };
    mount("/account/profile");
    fireEvent.click(screen.getByRole("button", { name: "Back to workspace" }));
    expect(screen.getByRole("heading", { name: "App home" })).toBeTruthy();
  });

  it("opens the workspace's home when Account was opened first", () => {
    mount("/account/profile");
    fireEvent.click(screen.getByRole("button", { name: "Back to workspace" }));
    expect(screen.getByRole("heading", { name: "App home" })).toBeTruthy();
  });
});
