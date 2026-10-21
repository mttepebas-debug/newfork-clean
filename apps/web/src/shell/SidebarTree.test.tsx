// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Link, MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

// The desktop left menu as a tree (SIDEBAR-TREE, Mert 2026-10-19): Lineup hangs
// under Schedule, Requests is a page of its own, and a group closes even while
// its child page is open, the parent then standing in for it. Only the open
// page's group is open: reaching a group opens it, leaving it closes it
// (SIDEBAR-ACCORDION, Mert 2026-10-19).
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
            <Route path="workspace" element={<h1>Workspace page</h1>} />
            <Route path="employees" element={<h1>Employees page</h1>} />
            <Route path="employees/documents" element={<h1>Documents page</h1>} />
            <Route path="schedule" element={<h1>Schedule page</h1>} />
            <Route path="schedule/lineup" element={<Link to="/app/workspace">Leave lineup</Link>} />
            <Route path="schedule/export" element={<h1>Export page</h1>} />
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
  it("shows a cut workspace name whole on hover (QA 50)", () => {
    mount("/app/schedule");
    expect(document.querySelector(".sidebar-workspace-name")?.getAttribute("title")).toBe("Meyhouse");
  });

  it("puts Lineup under Schedule and Requests on its own row after it", () => {
    mount("/app/schedule");
    const order = within(primary())
      .getAllByRole("link", { hidden: true })
      .map((element) => element.textContent);
    expect(order.slice(0, 4)).toEqual(["Home", "Schedule", "Lineup", "Requests"]);
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
    // A screen reader hears where the person is, too.
    expect(link("Schedule").getAttribute("aria-current")).toBe("location");

    fireEvent.click(within(primary()).getByRole("button", { name: "Expand Schedule" }));
    expect(group("Lineup")?.getAttribute("data-open")).toBe("true");
    expect(group("Lineup")?.hasAttribute("inert")).toBe(false);
    expect(link("Schedule").className).not.toContain("active");
    expect(link("Schedule").getAttribute("aria-current")).toBeNull();
    expect(link("Lineup").getAttribute("aria-current")).toBe("page");
  });

  it("keeps every group open in the narrow rail, where no toggle sits", () => {
    mount("/app/schedule");
    fireEvent.click(within(primary()).getByRole("button", { name: "Collapse Schedule" }));
    expect(group("Lineup")?.getAttribute("data-open")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Collapse menu" }));
    expect(group("Lineup")?.getAttribute("data-open")).toBe("true");
    expect(group("Lineup")?.hasAttribute("inert")).toBe(false);
    // Back to the wide menu, the group is as the person left it.
    fireEvent.click(screen.getByRole("button", { name: "Expand menu" }));
    expect(group("Lineup")?.getAttribute("data-open")).toBe("false");
  });

  it("opens a closed group again when its child page is reached", () => {
    mount("/app/schedule/requests");
    // Requests is no child of Schedule: Schedule is not the open page there,
    // and its group stays shut.
    expect(link("Requests").className).toContain("active");
    expect(link("Schedule").className).not.toContain("active");
    expect(group("Lineup")?.getAttribute("data-open")).toBe("false");
    fireEvent.click(screen.getByRole("link", { name: "Go to lineup" }));
    expect(group("Lineup")?.getAttribute("data-open")).toBe("true");
    expect(link("Lineup").className).toContain("active");
  });

  it("opens only the open page's group, and closes it when another page is reached", () => {
    mount("/app/workspace");
    expect(group("Lineup")?.getAttribute("data-open")).toBe("false");
    expect(group("Documents")?.getAttribute("data-open")).toBe("false");

    fireEvent.click(link("Schedule"));
    expect(group("Lineup")?.getAttribute("data-open")).toBe("true");
    expect(group("Documents")?.getAttribute("data-open")).toBe("false");

    fireEvent.click(link("Lineup"));
    expect(group("Lineup")?.getAttribute("data-open")).toBe("true");

    fireEvent.click(link("Employees"));
    expect(group("Lineup")?.getAttribute("data-open")).toBe("false");
    expect(group("Documents")?.getAttribute("data-open")).toBe("true");
  });

  it("closes a group opened by hand once the person goes to another page", () => {
    mount("/app/workspace");
    fireEvent.click(within(primary()).getByRole("button", { name: "Expand Schedule" }));
    expect(group("Lineup")?.getAttribute("data-open")).toBe("true");
    fireEvent.click(link("Requests"));
    expect(group("Lineup")?.getAttribute("data-open")).toBe("false");
  });

  it("opens the group again when its parent is clicked while already open", () => {
    mount("/app/schedule");
    fireEvent.click(within(primary()).getByRole("button", { name: "Collapse Schedule" }));
    expect(group("Lineup")?.getAttribute("data-open")).toBe("false");
    fireEvent.click(link("Schedule"));
    expect(group("Lineup")?.getAttribute("data-open")).toBe("true");
  });

  it("keeps a group open on its parent's own sub-pages, the parent not the open page there", () => {
    mount("/app/schedule/export");
    expect(group("Lineup")?.getAttribute("data-open")).toBe("true");
    expect(link("Schedule").className).not.toContain("active");
    expect(link("Schedule").getAttribute("aria-current")).toBeNull();
  });

  it("does not open a group on a click that leaves the page where it is", () => {
    mount("/app/workspace");
    // A new-tab click: the page stays, so does the group.
    fireEvent.click(link("Schedule"), { ctrlKey: true });
    expect(group("Lineup")?.getAttribute("data-open")).toBe("false");
  });

  it("hands the focus to the group's toggle when the group shuts around it", () => {
    mount("/app/schedule/lineup");
    link("Lineup").focus();
    expect(document.activeElement).toBe(link("Lineup"));
    // Leaving without moving the focus, the way Back does.
    fireEvent.click(screen.getByRole("link", { name: "Leave lineup" }));
    expect(group("Lineup")?.getAttribute("data-open")).toBe("false");
    expect(document.activeElement).toBe(
      within(primary()).getByRole("button", { name: "Expand Schedule" }),
    );
  });
});
