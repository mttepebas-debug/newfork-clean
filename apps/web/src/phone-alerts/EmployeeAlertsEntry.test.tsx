import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EmployeeAlertsEntry } from "./EmployeeAlertsEntry";
import type { PhoneAlertsState } from "./push-client";

// TELEFON-TUR2 (K26): one phone alerts entry per Home opening. This device's first Home gets the thin
// offer under "Your day"; later openings the block under Updates; the result stays inside the card.
const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const publicKey = "B" + "k".repeat(86);
const api = vi.hoisted(() => ({ apiRequest: vi.fn() }));
const toasts = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() }));
const testAlert = vi.hoisted(() => vi.fn(async () => true));
const alerts = vi.hoisted(() => ({
  current: { state: "off" as PhoneAlertsState | null, busy: false, failed: false, turnOn: vi.fn(), turnOff: vi.fn() },
}));

vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ context: { workspace: { id: workspaceId, name: "Harbor & Vine" } } }) }));
vi.mock("../lib/supabase", () => ({ supabaseClient: {}, apiRequest: api.apiRequest }));
vi.mock("./use-phone-alerts", () => ({ usePhoneAlerts: () => alerts.current }));
vi.mock("./push-client", async (original) => ({ ...(await original<object>()), showTestAlert: testAlert }));
vi.mock("@newfork/ui", async (original) => ({ ...(await original<object>()), useToast: () => toasts }));

const IPHONE_27 =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.1 Mobile/15E148 Safari/604.1";
const MAIL_VIEW = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";

function device(userAgent: string) {
  vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(userAgent);
  Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
}

function serve(workspacePush = true) {
  api.apiRequest.mockImplementation(async (_client: unknown, path: string) => {
    if (path === "/v1/account/notification-channels") return { email: { available: true }, push: { available: true, public_key: publicKey } };
    return {
      channels: {
        in_app: { locked: true },
        email: { workspace_enabled: true, address_on_file: true, suppressed: false },
        push: { workspace_enabled: workspacePush, devices: 0 },
        sms: { available: false, workspace_enabled: false },
      },
      topics: [],
    };
  });
}

function home(hasShifts = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <div data-testid="first">
        <EmployeeAlertsEntry place="first" hasShifts={hasShifts} />
      </div>
      <div data-testid="block">
        <EmployeeAlertsEntry place="block" hasShifts={hasShifts} />
      </div>
    </QueryClientProvider>,
  );
}

/** A later opening of the app: a new tab session on the same device. */
function nextOpening() {
  cleanup();
  window.sessionStorage.clear();
  vi.resetModules();
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  api.apiRequest.mockReset();
  testAlert.mockClear();
  Object.values(toasts).forEach((fn) => fn.mockReset());
  alerts.current = { state: "off", busy: false, failed: false, turnOn: vi.fn(async () => "on" as const), turnOff: vi.fn() };
  device(ANDROID);
  serve();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Employee Home's phone alerts entry", () => {
  it("first Home: the thin offer under Your day, and no block in the same opening", async () => {
    home();
    const band = await within(screen.getByTestId("first")).findByRole("complementary", { name: /Your schedule is here\./ });
    expect(band.textContent).toContain("Get an alert when it changes.");
    expect(within(screen.getByTestId("block")).queryByRole("complementary")).toBeNull();
  });

  it("with no shifts this week the offer says so", async () => {
    home(false);
    expect(await screen.findByRole("complementary", { name: /No shifts yet\. Get an alert when your schedule is posted\./ })).toBeTruthy();
  });

  it("a later opening shows the block instead", async () => {
    home();
    await screen.findByRole("complementary");
    nextOpening();
    const { EmployeeAlertsEntry: Fresh } = await import("./EmployeeAlertsEntry");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Fresh place="first" hasShifts />
        <Fresh place="block" hasShifts />
      </QueryClientProvider>,
    );
    const block = await screen.findByRole("complementary", { name: "Get shift alerts on this phone" });
    expect(block.textContent).toContain("Example");
    expect(screen.getAllByRole("complementary")).toHaveLength(1);
  });

  it("the offer's ✕ is a Not now: gone, and the next opening stays quiet for 3 days", async () => {
    home();
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(Number(window.localStorage.getItem("newfork.phoneAlerts.quietUntil"))).toBeGreaterThan(Date.now() + 2.9 * 86_400_000);
  });

  it("Turn on alerts asks from the tap; the result stays in the card with a test alert", async () => {
    home();
    const band = await screen.findByRole("complementary");
    fireEvent.click(within(band).getByRole("button", { name: "Turn on alerts" }));
    expect(alerts.current.turnOn).toHaveBeenCalledWith(publicKey);
    alerts.current = { ...alerts.current, state: "on" };
    expect(await within(band).findByText("Alerts are on")).toBeTruthy();
    expect(within(band).getByText(/Test alert sent · /)).toBeTruthy();
    expect(testAlert).toHaveBeenCalledWith("phone");
    // The card keeps its name with the answer in it.
    expect(within(screen.getByRole("complementary", { name: /Your schedule is here\./ })).getByText("Alerts are on")).toBeTruthy();
  });

  it("a no keeps the card with the way to turn it on; a question Chrome would not show says so", async () => {
    alerts.current.turnOn = vi.fn(async () => "blocked" as const);
    home();
    const band = await screen.findByRole("complementary");
    fireEvent.click(within(band).getByRole("button", { name: "Turn on alerts" }));
    expect(await within(band).findByText("Alerts are blocked on this phone")).toBeTruthy();
    fireEvent.click(within(band).getByRole("button", { name: "How to turn them on" }));
    expect(band.textContent).toContain("Tap Permissions, then Notifications.");
    cleanup();

    window.localStorage.clear();
    alerts.current.turnOn = vi.fn(async () => "off" as const);
    home();
    const again = await screen.findByRole("complementary");
    fireEvent.click(within(again).getByRole("button", { name: "Turn on alerts" }));
    expect(await within(again).findByText("Chrome isn’t asking right now")).toBeTruthy();
  });

  it("iPhone Safari: Show me how opens the guide; after it the strip takes the offer's place", async () => {
    device(IPHONE_27);
    alerts.current.state = "needs-install";
    home();
    const band = await screen.findByRole("complementary");
    fireEvent.click(within(band).getByRole("button", { name: "Show me how" }));
    const guide = screen.getByRole("dialog", { name: "Add Newfork to your Home Screen" });
    fireEvent.click(within(guide).getByRole("button", { name: "Close guide" }));
    const strip = within(screen.getByTestId("first")).getByRole("region", { name: "Steps to add Newfork" });
    expect(within(strip).getByRole("button", { name: "Show again" })).toBeTruthy();
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("an email app's browser: Show me how leads to Safari and carries the steps in the address", async () => {
    device(MAIL_VIEW);
    alerts.current.state = "other";
    home();
    const band = await screen.findByRole("complementary");
    fireEvent.click(within(band).getByRole("button", { name: "Show me how" }));
    expect(band.textContent).toContain("Your email app opened this page in its own browser.");
    expect(window.location.search).toBe("?setup=alerts");
    window.history.replaceState(null, "", "/");
  });

  it("promises nothing while the workspace has phone alerts off", async () => {
    serve(false);
    home();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole("complementary")).toBeNull();
  });
});
