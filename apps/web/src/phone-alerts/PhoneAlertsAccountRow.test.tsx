import type { NotificationPreferences } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NotificationPreferencesPage from "../notification-settings/NotificationPreferencesPage";
import type { PhoneAlertsState } from "./push-client";

// BILDIRIM-15: Account → Notifications → "Where you get notified" → Phone alerts says where this device
// stands once phone alerts are set up, and turns it on or off; email says On once it sends.
const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const publicKey = "B" + "k".repeat(86);
const api = vi.hoisted(() => ({ apiRequest: vi.fn() }));
const alerts = vi.hoisted(() => ({
  current: { state: "off" as PhoneAlertsState | null, busy: false, failed: false, turnOn: vi.fn(), turnOff: vi.fn() },
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ account: { email: "maria@example.test" }, context: { workspace: { id: workspaceId, name: "Harbor & Vine" } } }),
}));
vi.mock("../lib/supabase", () => ({ supabaseClient: {}, apiRequest: api.apiRequest }));
vi.mock("./use-phone-alerts", () => ({ usePhoneAlerts: () => alerts.current }));

function preferences(devices: number, workspacePush = true): NotificationPreferences {
  return {
    channels: {
      in_app: { locked: true },
      email: { workspace_enabled: true, address_on_file: true, suppressed: false },
      push: { workspace_enabled: workspacePush, devices },
      sms: { available: false, workspace_enabled: false },
    },
    topics: [
      { key: "my_schedule", name: "My schedule", level: "important", description: "A new week is out, or one of your shifts is added, moved or removed.",
        email: { choice: null, default: true }, push: { choice: null, default: true } },
    ],
  };
}

function serve(devices: number, options: { push?: boolean; workspacePush?: boolean } = {}) {
  api.apiRequest.mockImplementation(async (_client: unknown, path: string) => {
    if (path === "/v1/account/notification-channels") {
      return {
        email: { available: true },
        push: options.push === false ? { available: false, public_key: null } : { available: true, public_key: publicKey },
      };
    }
    return preferences(devices, options.workspacePush);
  });
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NotificationPreferencesPage />
    </QueryClientProvider>,
  );
}

/** The Phone alerts row once it says this. */
async function rowWith(text: RegExp | string) {
  const line = await screen.findByText(text);
  return line.closest(".ns-row") as HTMLElement;
}

describe("Account > Notifications > Phone alerts", () => {
  beforeEach(() => {
    api.apiRequest.mockReset();
    alerts.current = { state: "off", busy: false, failed: false, turnOn: vi.fn(), turnOff: vi.fn() };
  });

  it("email is On once it sends; the account row is ticked for email and phone", async () => {
    serve(0);
    renderPage();
    const channels = await screen.findByRole("group", { name: "Where you get notified" });
    expect(await within(channels).findByText("maria@example.test")).toBeTruthy();
    expect(within(channels).queryByText("Coming soon")).toBeNull();
    expect(screen.getByLabelText("Account and security by email, always on")).toBeTruthy();
    expect(screen.getByLabelText("Account and security by phone alerts, always on")).toBeTruthy();
  });

  it("off on this device: Turn on asks with the server's key", async () => {
    serve(2);
    renderPage();
    const row = await rowWith(/Off on this device\. Alerts pop up even when the app is closed\. Also on 2 other devices\./);
    fireEvent.click(within(row).getByRole("button", { name: "Turn on" }));
    expect(alerts.current.turnOn).toHaveBeenCalledWith(publicKey);
  });

  it("on for this device: a switch turns it off, the others are counted", async () => {
    alerts.current.state = "on";
    serve(3);
    renderPage();
    const row = await rowWith(/On for this computer\. Also on 2 other devices\./);
    const toggle = within(row).getByRole("switch", { name: "Phone alerts on this device" });
    fireEvent.click(toggle);
    expect(alerts.current.turnOff).toHaveBeenCalled();
  });

  it("an iPhone tab shows the Home Screen steps; a blocked browser says where to allow it", async () => {
    alerts.current.state = "needs-install";
    serve(0);
    const { unmount } = renderPage();
    const row = await rowWith(/Add Newfork to your Home Screen/);
    fireEvent.click(within(row).getByRole("button", { name: "Show me how" }));
    expect(screen.getByRole("dialog", { name: "One step first on iPhone" })).toBeTruthy();
    unmount();

    alerts.current = { ...alerts.current, state: "blocked" };
    serve(0);
    renderPage();
    const blocked = await rowWith(/Blocked in this browser’s settings/);
    expect(within(blocked).queryByRole("button")).toBeNull();
  });

  it("a browser without alerts says so; a failed change says so", async () => {
    alerts.current = { ...alerts.current, state: "unsupported", failed: true };
    serve(1);
    renderPage();
    await rowWith(/This browser can’t show alerts\. Also on 1 other device\./);
    expect(screen.getByRole("alert").textContent).toMatch(/couldn’t be changed on this device/);
  });

  it("before phone alerts are set up, or with the workspace's off, promises nothing", async () => {
    serve(0, { push: false });
    const { unmount } = renderPage();
    const row = await rowWith("Alerts on your phone start soon; your choices below are kept.");
    expect(within(row).getByText("Coming soon")).toBeTruthy();
    expect(within(row).queryByRole("button")).toBeNull();
    unmount();

    serve(0, { workspacePush: false });
    renderPage();
    await rowWith("Harbor & Vine turned phone alerts off.");
  });
});
