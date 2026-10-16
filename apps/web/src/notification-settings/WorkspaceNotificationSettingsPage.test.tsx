import type { NotificationWorkspaceSettings } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RequestError } from "../lib/request-error";
import WorkspaceNotificationSettingsPage from "./WorkspaceNotificationSettingsPage";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const api = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    context: {
      workspace: { id: workspaceId, name: "Harbor & Vine" },
      membership: { role: "owner" },
      actions: ["settings.organization.write"],
      permissions: [],
    },
  }),
}));
vi.mock("../lib/supabase", () => ({ supabaseClient: {}, apiRequest: api.apiRequest }));

function settings(): NotificationWorkspaceSettings {
  return {
    email_enabled: true,
    push_enabled: true,
    sms_enabled: false,
    sms_available: false,
    optional: [
      { key: "shift_changes.open_shift_available", area: "shift_changes", description: "An extra shift you can take is open", enabled: true },
      { key: "people.joined", area: "people", description: "Somebody you invited joined", enabled: false },
    ],
    always_sent: [
      { key: "time_off.requested", area: "time_off", level: "important", description: "Somebody asked for time off" },
      { key: "account.password_changed", area: "account", level: "required", description: "Your password was changed" },
    ],
  };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={["/app/settings/notifications"]}>
      <QueryClientProvider client={client}>
        <WorkspaceNotificationSettingsPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const toggle = (name: string) => screen.getByRole("switch", { name }) as HTMLInputElement;

describe("Settings > Notifications", () => {
  beforeEach(() => {
    api.apiRequest.mockReset();
  });

  it("shows the channels, the optional types as switches and what is always sent", async () => {
    api.apiRequest.mockResolvedValue(settings());
    renderPage();
    const channels = await screen.findByRole("group", { name: "Channels" });
    expect(toggle("Email").checked).toBe(true);
    expect(toggle("Phone alerts").checked).toBe(true);
    // Text messages are paid and stay off: a state, not a control.
    expect(within(channels).queryByRole("switch", { name: "Text messages" })).toBeNull();
    expect(within(channels).getByText("Not available")).toBeTruthy();
    expect(within(channels).getAllByText("Coming soon")).toHaveLength(2);

    const optional = screen.getByRole("group", { name: "Optional notifications" });
    expect(within(optional).getAllByRole("switch")).toHaveLength(2);
    expect(toggle("An extra shift you can take is open").checked).toBe(true);
    expect(toggle("Somebody you invited joined").checked).toBe(false);

    const always = screen.getByText("Always sent").closest("details")!;
    expect(always.open).toBe(false);
    expect(within(always).getByText("Somebody asked for time off")).toBeTruthy();
    expect(within(always).getByText("Also by email")).toBeTruthy();
    expect(within(always).queryByRole("switch")).toBeNull();
    expect(api.apiRequest).toHaveBeenCalledWith({}, `/v1/workspaces/${workspaceId}/settings/notifications`);
  });

  it("saves the whole setting at once and closes Save again", async () => {
    api.apiRequest.mockResolvedValue(settings());
    renderPage();
    await screen.findByRole("group", { name: "Channels" });
    const save = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(toggle("An extra shift you can take is open"));
    fireEvent.click(toggle("Somebody you invited joined"));
    fireEvent.click(toggle("Email"));
    expect(save.disabled).toBe(false);

    const after = settings();
    after.email_enabled = false;
    after.optional = after.optional.map((type) => ({ ...type, enabled: !type.enabled }));
    api.apiRequest.mockResolvedValueOnce(after);
    fireEvent.click(save);
    await screen.findByText("Notification settings saved");
    expect(api.apiRequest).toHaveBeenLastCalledWith({}, `/v1/workspaces/${workspaceId}/settings/notifications`, {
      method: "PUT",
      body: JSON.stringify({ email_enabled: false, push_enabled: true, muted_types: ["shift_changes.open_shift_available"] }),
    });
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
    expect(toggle("Email").checked).toBe(false);
  });

  it("puts a choice back and Save closes again", async () => {
    api.apiRequest.mockResolvedValue(settings());
    renderPage();
    await screen.findByRole("group", { name: "Channels" });
    fireEvent.click(toggle("Phone alerts"));
    expect(screen.getByRole("button", { name: "Discard" })).toBeTruthy();
    fireEvent.click(toggle("Phone alerts"));
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Discard" })).toBeNull();
  });

  it("shows the no-access card when the API says no", async () => {
    api.apiRequest.mockImplementation(async () => {
      throw new RequestError("Not allowed", "authz.out_of_scope", "settings.organization.write", 403);
    });
    renderPage();

    expect(await screen.findByRole("heading", { name: "You don't have access to Notifications" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Channels" })).toBeNull();
  });
});
