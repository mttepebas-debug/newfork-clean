import type { NotificationPreferences } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NotificationPreferencesPage from "./NotificationPreferencesPage";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const auth = vi.hoisted(() => ({ context: null as unknown }));
const api = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    account: { email: "maria@example.test" },
    context: auth.context,
  }),
}));
vi.mock("../lib/supabase", () => ({ supabaseClient: {}, apiRequest: api.apiRequest }));

function preferences(overrides: Partial<NotificationPreferences["channels"]> = {}): NotificationPreferences {
  return {
    channels: {
      in_app: { locked: true },
      email: { workspace_enabled: true, address_on_file: true, suppressed: false },
      push: { workspace_enabled: true, devices: 0 },
      sms: { available: false, workspace_enabled: false },
      ...overrides,
    },
    topics: [
      { key: "my_schedule", name: "My schedule", email: { choice: null, default: true }, push: { choice: null, default: true } },
      { key: "open_shifts", name: "Open shifts", email: { choice: true, default: false }, push: { choice: null, default: true } },
    ],
  };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NotificationPreferencesPage />
    </QueryClientProvider>,
  );
}

const cell = (name: string) => screen.getByRole("checkbox", { name }) as HTMLInputElement;

describe("Account > Notifications", () => {
  beforeEach(() => {
    api.apiRequest.mockReset();
    auth.context = { workspace: { id: workspaceId, name: "Harbor & Vine" } };
  });

  it("shows the channels honestly: the list always on, email and phone not sending yet, text not available", async () => {
    api.apiRequest.mockResolvedValue(preferences());
    renderPage();
    const channels = await screen.findByRole("group", { name: "Where you get notified" });
    expect(within(channels).getByText("Always on")).toBeTruthy();
    expect(within(channels).getAllByText("Coming soon")).toHaveLength(2);
    expect(within(channels).getByText("Not available")).toBeTruthy();
    expect(within(channels).getByText(/maria@example\.test/)).toBeTruthy();
    // No switch pretends to turn a channel on.
    expect(within(channels).queryByRole("switch")).toBeNull();
    expect(within(channels).queryByRole("checkbox")).toBeNull();
    expect(api.apiRequest).toHaveBeenCalledWith({}, `/v1/workspaces/${workspaceId}/notification-preferences`);
  });

  it("shows each topic's stored choice, else its default, and locks the required row", async () => {
    api.apiRequest.mockResolvedValue(preferences());
    renderPage();
    await screen.findByRole("table", { name: "What reaches you" });
    expect(cell("My schedule by email").checked).toBe(true);
    expect(cell("Open shifts by email").checked).toBe(true);
    expect(cell("Open shifts by phone alerts").checked).toBe(true);
    // Required, and honest while email is not connected: no ticked email box.
    expect(screen.getByText("Required")).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: /Account and security/ })).toBeNull();
    expect(screen.getByLabelText("Account and security by email, coming soon")).toBeTruthy();
    expect(screen.getByText(/by email once emails start/)).toBeTruthy();
    expect(screen.getAllByRole("row")).toHaveLength(4);
  });

  it("disables a channel's column the workspace turned off", async () => {
    api.apiRequest.mockResolvedValue(preferences({ email: { workspace_enabled: false, address_on_file: true, suppressed: false } }));
    renderPage();
    await screen.findByRole("table", { name: "What reaches you" });
    expect(cell("My schedule by email").disabled).toBe(true);
    expect(cell("My schedule by email").checked).toBe(false);
    expect(cell("My schedule by phone alerts").disabled).toBe(false);
    expect(screen.getByText("Harbor & Vine turned email off.")).toBeTruthy();
  });

  it("opens Save only while something differs and sends only what changed", async () => {
    api.apiRequest.mockResolvedValue(preferences());
    renderPage();
    await screen.findByRole("table", { name: "What reaches you" });
    const save = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(cell("My schedule by email"));
    expect(save.disabled).toBe(false);
    fireEvent.click(cell("My schedule by email"));
    expect(save.disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Discard" })).toBeNull();

    fireEvent.click(cell("Open shifts by phone alerts"));
    const after = preferences();
    after.topics[1]!.push.choice = false;
    api.apiRequest.mockResolvedValueOnce(after);
    fireEvent.click(save);
    await screen.findByText("Notification choices saved");
    expect(api.apiRequest).toHaveBeenLastCalledWith({}, `/v1/workspaces/${workspaceId}/notification-preferences`, {
      method: "PUT",
      body: JSON.stringify({ choices: [{ topic: "open_shifts", channel: "push", enabled: false }] }),
    });
    expect(cell("Open shifts by phone alerts").checked).toBe(false);
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps the draft and says so when the save fails", async () => {
    api.apiRequest.mockResolvedValue(preferences());
    renderPage();
    await screen.findByRole("table", { name: "What reaches you" });
    fireEvent.click(cell("My schedule by email"));
    api.apiRequest.mockRejectedValueOnce(new Error("Request could not be completed"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toContain("weren’t saved");
    expect(cell("My schedule by email").checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(cell("My schedule by email").checked).toBe(true);
  });

  it("says what failed when the choices do not load", async () => {
    api.apiRequest.mockRejectedValue(new Error("offline"));
    renderPage();
    expect(await screen.findByText("We couldn't load your notification choices")).toBeTruthy();
  });

  it("asks for a workspace when none is open", () => {
    auth.context = null;
    renderPage();
    expect(screen.getByText(/Open one to choose how it reaches you/)).toBeTruthy();
    expect(api.apiRequest).not.toHaveBeenCalled();
  });

  it("asks before leaving with unsaved choices", async () => {
    api.apiRequest.mockResolvedValue(preferences());
    renderPage();
    await screen.findByRole("table", { name: "What reaches you" });
    fireEvent.click(cell("My schedule by email"));
    const { requestAppNavigation } = await import("../shell/leave-guard");
    const navigate = vi.fn();
    requestAppNavigation(navigate);
    await waitFor(() => expect(screen.getByRole("button", { name: "Stay here" })).toBeTruthy());
    expect(navigate).not.toHaveBeenCalled();
  });
});
