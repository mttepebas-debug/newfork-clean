import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { feedPage, notice } from "./notification-fixtures.test-util";

const w = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const me = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
const apiRequest = vi.fn();
vi.mock("../lib/supabase", () => ({
  supabaseClient: {},
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  getTabWorkspaceId: () => null,
}));
let actions: string[] = [];
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ context: { userId: me, workspace: { id: w, name: "Harbor & Vine" }, membership: { access: { employee: false, management: "manager" } }, permissions: [], actions } }),
}));
const { NotificationsNavEntry } = await import("./NotificationsNavEntry");

function mount(collapsed = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <NotificationsNavEntry collapsed={collapsed} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  actions = ["notifications.read_own"];
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_client: unknown, path: string) =>
    path.endsWith("/count")
      ? { unseen_count: 1, unread_count: 3, needs_action_count: 0 }
      : path.endsWith("/seen")
        ? { unseen_count: 0 }
        : feedPage([notice()]),
  );
});
afterEach(cleanup);

describe("the left menu's Notifications", () => {
  // One number for the person: the badge is the Unread tab's count (S-213), so opening
  // the panel leaves it as it is, though it marks the list seen for New / Earlier (S-247);
  // reading a row or "Mark all read" lowers it.
  it("shows the unread count and keeps it when the panel opens", async () => {
    mount();
    const item = await screen.findByRole("button", { name: "Notifications, 3 unread" });
    expect(item.getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(item);
    expect(screen.getByRole("dialog", { name: "Notifications" })).toBeTruthy();
    await waitFor(() => expect(apiRequest.mock.calls.some(([, path]) => String(path).endsWith("/seen"))).toBe(true));
    expect(screen.getByRole("button", { name: "Notifications, 3 unread" }).getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Notifications, 3 unread" }));
  });

  it("is not there for someone the core does not let read their own list", () => {
    actions = [];
    mount();
    expect(screen.queryByRole("button", { name: /Notifications/ })).toBeNull();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
