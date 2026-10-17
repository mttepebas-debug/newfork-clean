import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isSchedulePath, markScheduleSeen } from "./home-card-memory";
import { PhoneAlertsHome } from "./PhoneAlertsHome";
import type { PhoneAlertsState } from "./push-client";
import { isAppPath } from "./use-phone-alerts-shell";

// BILDIRIM-15 (variant A, KARARLAR S-123): Home's card asks once, after the person opened their schedule
// on this device, while phone alerts are set up and the workspace has them on.
const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const publicKey = "B" + "k".repeat(86);
const api = vi.hoisted(() => ({ apiRequest: vi.fn() }));
const toasts = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() }));
const alerts = vi.hoisted(() => ({
  current: { state: "off" as PhoneAlertsState | null, busy: false, failed: false, turnOn: vi.fn(), turnOff: vi.fn() },
}));

vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ context: { workspace: { id: workspaceId, name: "Harbor & Vine" } } }) }));
vi.mock("../lib/supabase", () => ({ supabaseClient: {}, apiRequest: api.apiRequest }));
vi.mock("./use-phone-alerts", () => ({ usePhoneAlerts: () => alerts.current }));
vi.mock("@newfork/ui", async (original) => ({ ...(await original<typeof import("@newfork/ui")>()), useToast: () => toasts }));

function serve(options: { push?: boolean; workspacePush?: boolean } = {}) {
  api.apiRequest.mockImplementation(async (_client: unknown, path: string) => {
    if (path === "/v1/account/notification-channels") {
      return { email: { available: true }, push: options.push === false ? { available: false, public_key: null } : { available: true, public_key: publicKey } };
    }
    return {
      channels: {
        in_app: { locked: true },
        email: { workspace_enabled: true, address_on_file: true, suppressed: false },
        push: { workspace_enabled: options.workspacePush ?? true, devices: 0 },
        sms: { available: false, workspace_enabled: false },
      },
      topics: [],
    };
  });
}

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PhoneAlertsHome audience="employee" />
    </QueryClientProvider>,
  );
}

const card = () => screen.findByRole("complementary", { name: /Get alerts on this/ });

describe("Home's phone alerts card", () => {
  beforeEach(() => {
    window.localStorage.clear();
    api.apiRequest.mockReset();
    Object.values(toasts).forEach((fn) => fn.mockReset());
    alerts.current = { state: "off", busy: false, failed: false, turnOn: vi.fn(async () => "on" as const), turnOff: vi.fn() };
  });

  it("waits until the person has opened their schedule on this device", async () => {
    serve();
    const { unmount } = renderCard();
    await waitFor(() => expect(api.apiRequest).not.toHaveBeenCalledWith({}, `/v1/workspaces/${workspaceId}/notification-preferences`));
    expect(screen.queryByRole("complementary")).toBeNull();
    unmount();

    markScheduleSeen();
    renderCard();
    expect(await card()).toBeTruthy();
  });

  it("Turn on asks with the server's key and the card goes", async () => {
    markScheduleSeen();
    serve();
    renderCard();
    fireEvent.click((await card()).querySelector("button")!);
    expect(alerts.current.turnOn).toHaveBeenCalledWith(publicKey);
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith("Phone alerts are on."));
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("Not now hides it on this device for good, and says where it is", async () => {
    markScheduleSeen();
    serve();
    const { unmount } = renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(toasts.info).toHaveBeenCalledWith("You can turn them on any time in Account → Notifications.");
    unmount();
    renderCard();
    await act(async () => undefined);
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("never asks before phone alerts are set up, with the workspace's off, or once on or blocked", async () => {
    markScheduleSeen();
    for (const setup of [
      () => serve({ push: false }),
      () => serve({ workspacePush: false }),
      () => {
        serve();
        alerts.current = { ...alerts.current, state: "on" };
      },
      () => {
        serve();
        alerts.current = { ...alerts.current, state: "blocked" };
      },
      () => {
        serve();
        alerts.current = { ...alerts.current, state: "unsupported" };
      },
    ]) {
      setup();
      const { unmount } = renderCard();
      await act(async () => undefined);
      await act(async () => undefined);
      expect(screen.queryByRole("complementary")).toBeNull();
      unmount();
    }
  });

  it("knows the schedule pages and the app's own links", () => {
    expect(isSchedulePath("/app/schedule")).toBe(true);
    expect(isSchedulePath("/app/schedule/templates")).toBe(true);
    expect(isSchedulePath("/app/employee-hub/schedule")).toBe(true);
    expect(isSchedulePath("/app/employee-hub")).toBe(false);
    expect(isSchedulePath("/app/schedules")).toBe(false);
    expect(isAppPath("/app/requests")).toBe(true);
    expect(isAppPath("//evil.example")).toBe(false);
    expect(isAppPath("/\\evil")).toBe(false);
    expect(isAppPath("https://evil.example/app")).toBe(false);
    expect(isAppPath(42)).toBe(false);
  });
});
