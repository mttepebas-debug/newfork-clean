import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SignInPage } from "../views/SignInPage";
import type { PhoneAlertsState } from "./push-client";

// TELEFON-TUR2, V3-A: the Home Screen app's first open on iPhone. Added ✓, sign in (today's email and
// password, no new workspace account), then one Turn on alerts; Safari's sign-in does not come along.
const publicKey = "B" + "k".repeat(86);
const auth = vi.hoisted(() => ({
  authenticated: false,
  context: null,
  error: null as string | null,
  signIn: vi.fn(async () => true),
  signUp: vi.fn(),
  supabaseConfigured: true,
}));
const api = vi.hoisted(() => ({ apiRequest: vi.fn() }));
const testAlert = vi.hoisted(() => vi.fn(async () => true));
const alerts = vi.hoisted(() => ({
  current: { state: "off" as PhoneAlertsState | null, busy: false, failed: false, turnOn: vi.fn(), turnOff: vi.fn() },
}));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../lib/supabase", async (original) => ({ ...(await original<object>()), supabaseClient: {}, apiRequest: api.apiRequest }));
vi.mock("./use-phone-alerts", () => ({ usePhoneAlerts: () => alerts.current }));
vi.mock("./push-client", async (original) => ({ ...(await original<object>()), showTestAlert: testAlert }));

const HOME_SCREEN = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";

function homeScreenApp(permission: NotificationPermission = "default") {
  vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(HOME_SCREEN);
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
  vi.stubGlobal("Notification", { permission, requestPermission: vi.fn() });
}

function Probe() {
  return <output aria-label="Current path">{useLocation().pathname}</output>;
}

function open(from = "/app") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[{ pathname: "/sign-in", state: { from } }]}>
        <Routes>
          <Route path="/sign-in" element={<SignInPage />} />
          <Route path="*" element={<Probe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  auth.authenticated = false;
  auth.error = null;
  auth.signIn.mockClear();
  testAlert.mockClear();
  api.apiRequest.mockResolvedValue({ email: { available: true }, push: { available: true, public_key: publicKey } });
  alerts.current = { state: "off", busy: false, failed: false, turnOn: vi.fn(async () => "on" as const), turnOff: vi.fn() };
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Home Screen app's first open", () => {
  it("says where the person is and signs in with today's email and password, never a new workspace", async () => {
    homeScreenApp();
    open();
    expect(screen.getByRole("heading", { name: "Welcome back. One last step." })).toBeTruthy();
    expect(screen.getByText("Added to your Home Screen")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create a workspace account" })).toBeNull();
    expect(screen.getByLabelText("Email").getAttribute("autocomplete")).toBe("username");
    expect(screen.getByLabelText("Password").getAttribute("autocomplete")).toBe("current-password");
    expect(screen.getByRole("link", { name: "Forgot password?" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ali@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret-pass" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(auth.signIn).toHaveBeenCalledWith("ali@example.test", "secret-pass");
  });

  it("once signed in: one Turn on alerts from the tap, a test alert, then Home", async () => {
    homeScreenApp();
    auth.authenticated = true;
    open();
    expect(screen.getByText("Signed in")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "Turn on alerts" }));
    expect(alerts.current.turnOn).toHaveBeenCalledWith(publicKey);
    expect(await screen.findByRole("heading", { name: "Alerts are on" })).toBeTruthy();
    expect(testAlert).toHaveBeenCalledWith("iphone");
    fireEvent.click(screen.getByRole("button", { name: "Go to Home" }));
    expect(screen.getByLabelText("Current path").textContent).toBe("/app");
  });

  it("Don't Allow: iPhone Settings first, the icon's remove-and-add second", async () => {
    homeScreenApp();
    auth.authenticated = true;
    alerts.current.turnOn = vi.fn(async () => "blocked" as const);
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Turn on alerts" }));
    const row = (await screen.findByText("Alerts are off for this iPhone")).closest("li")!;
    expect(within(row).getByText(/Settings › Notifications › Newfork/)).toBeTruthy();
    expect(row.textContent).toContain("Not in the list? Touch and hold the Newfork icon");
  });

  it("Not now goes Home and the screen does not come back", async () => {
    homeScreenApp();
    auth.authenticated = true;
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
    expect(screen.getByLabelText("Current path").textContent).toBe("/app");
    expect(window.localStorage.getItem("newfork.phoneAlerts.appFirstDone")).toBe("1");
  });

  it("an invite link keeps today's form, where the invited person can create their account", () => {
    homeScreenApp();
    open(`/invite/accept?token=${"a".repeat(64)}`);
    expect(screen.queryByText("Welcome back. One last step.")).toBeNull();
    expect(screen.getByRole("heading", { name: "Create your employee account" })).toBeTruthy();
  });

  it("Safari, or a Home Screen app that was asked before, gets today's sign-in", () => {
    homeScreenApp("granted");
    open();
    expect(screen.queryByText("Welcome back. One last step.")).toBeNull();
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
  });
});
