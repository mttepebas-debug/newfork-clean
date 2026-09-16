import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Link, MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";
import { AppSidebarPanel } from "./AppSidebarPanel";

vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({
  context: { workspace: { id: "w", name: "Workspace" }, userId: "u", membership: { role: "owner" }, permissions: ["schedule.read"] },
  account: { userId: "u" }, signOut: vi.fn(),
}) }));
vi.mock("../lib/supabase", () => ({ supabaseClient: null }));
vi.mock("../account/AccountAvatar", () => ({ CurrentUserAvatar: () => <span>Avatar</span> }));
vi.mock("../communications/use-account-notification-realtime", () => ({ useAccountNotificationRealtime: vi.fn() }));
vi.mock("../employee-hub/shift-exchanges/useExchangeRealtime", () => ({ useExchangeRealtime: vi.fn() }));
vi.mock("../communications/communications-data", () => ({
  getNotifications: vi.fn().mockResolvedValue({ unread_count: 0 }), notificationChangeEventName: "notice", notificationChangeStorageKey: "notice-key",
}));

function Page() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  return <section><button onClick={() => setOpen(true)}>Open panel</button>
    <button onClick={() => setCount(value => value + 1)}>Grid {count}</button><Link to="/app/elsewhere">Change route</Link>
    {open && <AppSidebarPanel>{({ collapsed, onToggle }) => <section aria-label="Test export">
      <span>{collapsed ? "Rail" : "Expanded"}</span><button onClick={onToggle}>Toggle panel</button>
      <button onClick={() => setOpen(false)}>Close panel</button>
    </section>}</AppSidebarPanel>}
  </section>;
}

function mount() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={["/app/schedule"]}><Routes><Route path="/app" element={<AppShell />}>
      <Route path="schedule" element={<Page />} /><Route path="elsewhere" element={<h1>Other page</h1>} />
    </Route></Routes></MemoryRouter>
  </QueryClientProvider>);
}

describe("AppShell sidebar slot integration", () => {
  it("replaces the real sidebar without replacing the main page, then restores the prior collapsed navigation", async () => {
    const { container } = mount();
    fireEvent.click(screen.getByLabelText("Collapse menu"));
    fireEvent.click(screen.getByText("Open panel"));
    const panel = await screen.findByRole("region", { name: "Test export" });
    expect(panel.closest("aside")?.getAttribute("aria-label")).toBe("Application sidebar");
    expect(container.querySelector(".app-shell")?.getAttribute("data-sidebar-collapsed")).toBe("false");
    expect(screen.queryByRole("navigation", { name: "Primary" })).toBeNull();
    fireEvent.click(screen.getByText("Grid 0"));
    expect(screen.getByText("Grid 1")).toBeTruthy();
    fireEvent.click(screen.getByText("Toggle panel"));
    expect(screen.getByText("Rail")).toBeTruthy();
    fireEvent.click(screen.getByText("Close panel"));
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeTruthy();
    expect(screen.getByLabelText("Expand menu")).toBeTruthy();
  });

  it("releases panel ownership when its route unmounts", async () => {
    mount(); fireEvent.click(screen.getByText("Open panel"));
    await screen.findByRole("region", { name: "Test export" });
    fireEvent.click(screen.getByText("Change route"));
    expect(await screen.findByRole("heading", { name: "Other page" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Test export" })).toBeNull();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeTruthy();
  });
});
