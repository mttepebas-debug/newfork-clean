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
  membership: { access: { employee: boolean; management: string | null } };
  permissions: string[];
  actions: string[];
};
const signOut = vi.fn();

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ context, account: { userId: "u" }, signOut }),
}));
vi.mock("../lib/supabase", () => ({ supabaseClient: null }));
// What the open workspace asks of the person (MY-DOCUMENTS).
let ownList: { kind: string; status: string }[] = [];
vi.mock("../documents/document-data", () => ({
  listDocuments: vi.fn(async () => ownList),
  documentQueryKey: (audience: { workspaceId: string }, userId: string) => ["documents", audience.workspaceId, userId],
}));
vi.mock("../account/AccountAvatar", () => ({ CurrentUserAvatar: () => null }));
vi.mock("../employee-hub/shift-exchanges/useExchangeRealtime", () => ({
  useExchangeRealtime: vi.fn(),
}));

const owner = {
  workspace: { id: "w", name: "Meyhouse" },
  userId: "u",
  membership: { access: { employee: false, management: "owner" } },
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
    // Still a key in the role's list; since BILDIRIM-02 it opens no page.
    "notifications.read",
  ],
  actions: [] as string[],
};
// A manager without the dashboard, documents or any settings permission.
const manager = {
  ...owner,
  membership: { access: { employee: false, management: "manager" } },
  permissions: [
    "schedule.read",
    "schedule.time_off_requests.read",
    "employees.read",
    "availability.read",
  ],
};

function mount(path = "/app/schedule") {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/app" element={<AppShell />}>
            <Route path="schedule" element={<h1>Schedule page</h1>} />
            <Route path="schedule/lineup" element={<h1>Lineup page</h1>} />
            <Route path="employees" element={<h1>Employees page</h1>} />
            <Route path="settings" element={<h1>Settings page</h1>} />
            <Route path="employee-hub" element={<h1>Hub page</h1>} />
            <Route path="employee-hub/my-availability" element={<h1>My availability page</h1>} />
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
  ownList = [];
});

describe("ManagementMobileNav in the app shell", () => {
  it("owner: four pages in the bar, everything else they can open under More", () => {
    context = owner;
    mount();
    // Lineup opens on a phone too (Mert 2026-10-14); a real phone has no Schedule entry.
    expect(names(bar())).toEqual(["Home", "Schedule", "Requests", "Lineup", "More"]);
    expect(names(morePages())).toEqual([
      "Employees",
      "Documents",
      "Availability",
      "Announcements",
      "Important Dates",
      "Settings",
      "Account",
      "Sign out",
    ]);
  });

  it("manager: pages they cannot open never appear, Settings included", () => {
    context = manager;
    mount();
    expect(names(bar())).toEqual(["Schedule", "Requests", "Lineup", "Employees", "More"]);
    expect(names(morePages())).toEqual(["Availability", "Account", "Sign out"]);
  });

  it("manager who reads the Settings catalog: More offers Settings (BL-680)", () => {
    context = { ...manager, permissions: [...manager.permissions, "settings.jobs.read"], actions: ["settings.jobs.read"] };
    mount();
    expect(names(morePages())).toEqual(["Availability", "Settings", "Account", "Sign out"]);
  });

  it("to a manager who also works shifts, More offers the employee view (FB-6.2.8, ROL-CIFT 6.2)", () => {
    context = { ...manager, membership: { access: { employee: true, management: "manager" } }, actions: ["employee_hub.read"] };
    mount();
    expect(names(morePages())).toEqual(["Availability", "Employee view", "Account", "Sign out"]);
  });

  // Mert 2026-10-23: the view switch sits right above Account, below My documents.
  it("puts Employee view right above Account, after My documents", async () => {
    ownList = [{ kind: "document", status: "missing" }];
    context = { ...manager, membership: { access: { employee: true, management: "manager" } }, actions: ["employee_hub.read"] };
    mount();
    await within(morePages()).findByRole("link", { name: "My documents, 1 waiting on you", hidden: true });
    expect(names(morePages())).toEqual(["Availability", "My documents1", "Employee view", "Account", "Sign out"]);
  });

  it("employee: no management bar (the Employee Hub bar serves them)", () => {
    context = { ...owner, membership: { access: { employee: true, management: null } }, permissions: ["workspace.read"] };
    mount("/app/employee-hub");
    expect(screen.queryByRole("navigation", { name: "Main navigation" })).toBeNull();
  });

  it("moves Schedule → Lineup → Settings, closing More on the way", () => {
    context = owner;
    mount();
    fireEvent.click(within(bar()).getByRole("link", { name: "Lineup" }));
    expect(screen.getByRole("heading", { name: "Lineup page" })).toBeTruthy();
    expect(within(bar()).getByRole("link", { name: "Lineup" }).className).toBe("active");

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

// CALISAN-MORE (Mert 2026-10-17): the employee view's More opens the very
// sheet management's More opens, with the employee's own pages in it.
// One's own documents, a page of its own (MY-DOCUMENTS, Mert 2026-10-19): the
// employee's More always has Documents; management's has My documents, just
// above Account, only when the workspace asks the person for any.
describe("own documents under More", () => {
  it("shows My documents to somebody who manages only when something is asked of them, with what waits", async () => {
    context = owner;
    mount();
    fireEvent.click(within(bar()).getByRole("button", { name: "More" }));
    expect(names(morePages())).not.toContain("My documents");
    cleanup();

    ownList = [
      { kind: "document", status: "missing" },
      { kind: "acknowledgement", status: "missing" },
      { kind: "document", status: "completed" },
    ];
    context = owner;
    mount();
    fireEvent.click(within(bar()).getByRole("button", { name: "More" }));
    const row = await within(morePages()).findByRole("link", { name: "My documents, 2 waiting on you", hidden: true });
    expect(row.getAttribute("href")).toBe("/app/my-documents");
    const list = names(morePages());
    expect(list.indexOf("My documents2")).toBe(list.indexOf("Account") - 1);
  });

  it("takes the employee to Documents in her own interface, with what waits", async () => {
    ownList = [{ kind: "document", status: "rejected" }];
    context = {
      ...owner,
      membership: { access: { employee: true, management: null } },
      permissions: ["workspace.read"],
    };
    mount("/app/employee-hub");
    const row = await within(morePages()).findByRole("link", { name: "Documents, 1 waiting on you", hidden: true });
    expect(row.getAttribute("href")).toBe("/app/employee-hub/documents");
  });
});

describe("the employee view's phone bar", () => {
  const employee = {
    ...owner,
    membership: { access: { employee: true, management: null } },
    permissions: ["workspace.read", "announcements.read"],
  };
  const employeeBar = () => screen.getByRole("navigation", { name: "Employee navigation" });

  it("opens the same More sheet, with the employee's pages and Sign out", () => {
    context = owner;
    mount();
    fireEvent.click(within(bar()).getByRole("button", { name: "More" }));
    const managementSheet = screen.getByRole("dialog", { name: "More" }).className;
    cleanup();

    context = employee;
    mount("/app/employee-hub");
    expect(names(employeeBar())).toEqual(["Home", "Schedule", "Requests", "More"]);
    const more = within(employeeBar()).getByRole("button", { name: "More" });
    expect(more.getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(more);
    const sheet = screen.getByRole("dialog", { name: "More" });
    expect(sheet.hasAttribute("open")).toBe(true);
    expect(sheet.className).toBe(managementSheet);
    expect(within(sheet).getByRole("button", { name: "Close", hidden: true })).toBeTruthy();
    expect(names(morePages())).toEqual([
      "My availability",
      "Announcements",
      "Documents",
      "My account",
      "Switch workspace",
      "Sign out",
    ]);
  });

  it("offers the way back to management in a manager's employee view (FB-6.2.8)", () => {
    context = { ...manager, membership: { access: { employee: true, management: "manager" } }, actions: ["employee_hub.read"] };
    mount("/app/employee-hub");
    // Right above My account (Mert 2026-10-23).
    expect(names(morePages())).toEqual([
      "My availability",
      "Documents",
      "Management view",
      "My account",
      "Switch workspace",
      "Sign out",
    ]);
    expect(within(morePages()).getByRole("link", { name: "Management view", hidden: true }).getAttribute("href")).toBe(
      "/app/workspace",
    );
    cleanup();
    context = { ...employee, permissions: ["workspace.read"] };
    mount("/app/employee-hub");
    expect(names(morePages())).toEqual(["My availability", "Documents", "My account", "Switch workspace", "Sign out"]);
  });

  it("goes to a page and closes, Escape closes, and Sign out signs out", () => {
    context = employee;
    mount("/app/employee-hub");
    const more = () => within(employeeBar()).getByRole("button", { name: "More" });
    fireEvent.click(more());
    const sheet = screen.getByRole("dialog", { name: "More" });
    fireEvent.click(within(morePages()).getByRole("link", { name: "My availability" }));
    expect(screen.getByRole("heading", { name: "My availability page" })).toBeTruthy();
    expect(sheet.hasAttribute("open")).toBe(false);
    // My availability lives under More, so More carries the active state.
    expect(more().className).toBe("active");

    fireEvent.click(more());
    fireEvent.keyDown(sheet, { key: "Escape" });
    expect(sheet.hasAttribute("open")).toBe(false);

    fireEvent.click(more());
    fireEvent.click(within(morePages()).getByRole("button", { name: "Sign out", hidden: true }));
    expect(signOut).toHaveBeenCalledOnce();
  });
});

// BILDIRIM-13 (Mert 2026-10-16, variant A): on a phone the management pages
// have a top bar: the workspace (to switch), the notification bell and Account;
// since 2026-10-17 the employee's pages too (MOBIL-BASLIK).
describe("the management phone's top bar", () => {
  const phoneWidth = (matches: boolean) =>
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: matches && query.includes("max-width"), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
  afterEach(() => vi.unstubAllGlobals());
  const topBar = () => screen.queryByRole("banner", { name: "Workspace bar" });

  it("shows the workspace, the bell and Account; Notifications leaves More", () => {
    phoneWidth(true);
    context = { ...owner, actions: ["notifications.read_own"] };
    mount();
    const bar = topBar()!;
    expect(within(bar).getByRole("link", { name: "Meyhouse. Switch workspace" }).getAttribute("href")).toBe("/account/workspaces");
    expect(within(bar).getByRole("button", { name: /^Notifications/ }).getAttribute("aria-haspopup")).toBe("dialog");
    expect(within(bar).getByRole("link", { name: "Account" }).getAttribute("href")).toBe("/account/profile");
    expect(names(morePages())).not.toContain("Notifications");
  });

  it("has no bell for someone the core does not let read their own list", () => {
    phoneWidth(true);
    context = owner;
    mount();
    expect(within(topBar()!).queryByRole("button", { name: /^Notifications/ })).toBeNull();
  });

  it("is not drawn on a computer", () => {
    phoneWidth(false);
    context = { ...owner, actions: ["notifications.read_own"] };
    mount();
    expect(topBar()).toBeNull();
  });

  // Mert 2026-10-17: "çalışan sayfalarına da üst çubuk ekleyelim".
  it("is drawn in the employee's own frame too", () => {
    phoneWidth(true);
    context = { ...owner, membership: { access: { employee: true, management: null } }, permissions: ["workspace.read"], actions: ["notifications.read_own"] };
    mount("/app/employee-hub");
    const bar = topBar()!;
    expect(within(bar).getByRole("link", { name: "Meyhouse. Switch workspace" })).toBeTruthy();
    expect(within(bar).getByRole("button", { name: /^Notifications/ })).toBeTruthy();
    expect(within(bar).getByRole("link", { name: "Account" }).getAttribute("href")).toBe("/account/profile");
  });
});
