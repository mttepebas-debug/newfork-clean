// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Link, MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

// The desktop left menu as a tree (SIDEBAR-TREE, Mert 2026-10-19): Lineup hangs
// under Schedule, Requests is a page of its own, and a group closes even while
// its child page is open, the parent then standing in for it.
const context = {
  workspace: { id: "w", name: "Meyhouse" },
  userId: "u",
  membership: { access: { employee: false, management: "owner" } },
  permissions: [
    "workspace.read",
    "schedule.read",
    "schedule.time_off_requests.read",
    "employees.read",
    "employee_documents.read",
    "availability.read",
  ],
  actions: [] as string[],
};

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ context, account: { userId: "u" }, signOut: vi.fn() }),
}));
vi.mock("../lib/supabase", () => ({ supabaseClient: null }));
vi.mock("../account/AccountAvatar", () => ({ CurrentUserAvatar: () => null }));
vi.mock("../employee-hub/shift-exchanges/useExchangeRealtime", () => ({
  useExchangeRealtime: vi.fn(),
}));

function mount(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/app" element={<AppShell />}>
            <Route path="schedule" element={<h1>Schedule page</h1>} />
            <Route path="schedule/lineup" element={<h1>Lineup page</h1>} />
            <Route path="schedule/requests" element={<Link to="/app/schedule/lineup">Go to lineup</Link>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const primary = () => screen.getByRole("navigation", { name: "Primary" });
const link = (name: string) => within(primary()).getByRole("link", { name, hidden: true });
const group = (name: string) => link(name).closest(".nav-children");

afterEach(cleanup);

describe("the desktop left menu tree", () => {
  it("puts Lineup under Schedule and Requests on its own row after it", () => {
    mount("/app/schedule");
    const order = within(primary())
      .getAllByRole("link", { hidden: true })
      .map((element) => element.textContent);
    expect(order.slice(0, 4)).toEqual(["Workspace", "Schedule", "Lineup", "Requests"]);
    expect(group("Lineup")).not.toBeNull();
    expect(group("Requests")).toBeNull();
    expect(link("Requests").className).not.toContain("nav-item-child");
  });

  it("closes Schedule while Lineup is open, and Schedule then shows as the open page", () => {
    mount("/app/schedule/lineup");
    expect(link("Lineup").className).toContain("active");
    expect(link("Schedule").className).not.toContain("active");

    fireEvent.click(within(primary()).getByRole("button", { name: "Collapse Schedule" }));
    expect(group("Lineup")?.getAttribute("data-open")).toBe("false");
    expect(group("Lineup")?.hasAttribute("inert")).toBe(true);
    expect(link("Schedule").className).toContain("active");

    fireEvent.click(within(primary()).getByRole("button", { name: "Expand Schedule" }));
    expect(group("Lineup")?.getAttribute("data-open")).toBe("true");
    expect(group("Lineup")?.hasAttribute("inert")).toBe(false);
    expect(link("Schedule").className).not.toContain("active");
  });

  it("opens a closed group again when its child page is reached", () => {
    mount("/app/schedule/requests");
    // Requests is no child of Schedule: Schedule is not the open page there.
    expect(link("Requests").className).toContain("active");
    expect(link("Schedule").className).not.toContain("active");
    fireEvent.click(within(primary()).getByRole("button", { name: "Collapse Schedule" }));
    expect(group("Lineup")?.getAttribute("data-open")).toBe("false");
    fireEvent.click(screen.getByRole("link", { name: "Go to lineup" }));
    expect(group("Lineup")?.getAttribute("data-open")).toBe("true");
    expect(link("Lineup").className).toContain("active");
  });
});
