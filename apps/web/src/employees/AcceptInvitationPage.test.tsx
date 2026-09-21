import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AcceptInvitationPage from "./AcceptInvitationPage";
import {
  acceptEmployeeInvitation,
  InvitationError,
  previewEmployeeInvitation,
} from "./employee-data";

// Mutable, so a test can render the page signed out.
const auth = vi.hoisted(() => ({
  authenticated: true,
  ready: true,
  signOut: vi.fn(async () => undefined),
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => auth,
}));

vi.mock("./employee-data", async () => {
  const actual = await vi.importActual<typeof import("./employee-data")>(
    "./employee-data",
  );
  return {
    InvitationError: actual.InvitationError,
    acceptEmployeeInvitation: vi.fn(),
    previewEmployeeInvitation: vi.fn(),
  };
});

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="Current path">{location.pathname}</output>;
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[
          `/invite/accept?token=${"a".repeat(64)}`,
        ]}
      >
        <Routes>
          <Route
            path="/invite/accept"
            element={
              <>
                <AcceptInvitationPage />
                <LocationProbe />
              </>
            }
          />
          <Route path="/sign-in" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AcceptInvitationPage", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    auth.authenticated = true;
    vi.mocked(previewEmployeeInvitation).mockResolvedValue({
      state: "valid",
      workspaceName: "Northstar",
      emailHint: "ne**********@example.test",
      expiresAt: "2026-09-12T12:00:00.000Z",
    });
    vi.mocked(acceptEmployeeInvitation).mockRejectedValue(
      new InvitationError("invitation_email_mismatch"),
    );
  });

  it("gives a wrong account its own screen and a way across to the right one", async () => {
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "Accept invitation" }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "This invitation is for another address",
      }),
    ).toBeTruthy();
    expect(screen.getByText(/ne\*+@example\.test/)).toBeTruthy();
    // The server's own sentence picks the state; it is never printed.
    expect(screen.queryByText(/does not match/i)).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Accept invitation" }),
    ).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Sign in with that address" }),
    );

    expect(auth.signOut).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["expired", "This link doesn't work anymore"],
    ["revoked", "This invitation was withdrawn"],
    ["declined", "You declined this invitation"],
    ["accepted", "You have already joined Northstar"],
    ["workspace_unavailable", "Northstar isn't open right now"],
  ] as const)(
    "gives the %s invitation its own screen with a way out",
    async (state, heading) => {
      vi.mocked(previewEmployeeInvitation).mockResolvedValue({
        state,
        workspaceName: "Northstar",
        emailHint: "ne**********@example.test",
        expiresAt: "2026-09-12T12:00:00.000Z",
      });
      renderPage();

      expect(await screen.findByRole("heading", { name: heading })).toBeTruthy();
      expect(
        screen.queryByRole("button", { name: "Accept invitation" }),
      ).toBeNull();
      expect(
        screen.getByRole("button", { name: "Go to your workspaces" }),
      ).toBeTruthy();
    },
  );

  it("treats a token no invitation carries as its own ending", async () => {
    vi.mocked(previewEmployeeInvitation).mockResolvedValue(null);
    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "This link doesn't work anymore",
      }),
    ).toBeTruthy();
  });

  it("offers onboarding once the invitation is accepted", async () => {
    vi.mocked(acceptEmployeeInvitation).mockResolvedValue(
      "5f0f1e2d-1111-4111-8111-111111111111",
    );
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "Accept invitation" }),
    );

    expect(
      await screen.findByRole("heading", { name: "You're in" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Start onboarding" }),
    ).toBeTruthy();
  });

  it("sends a signed-out visitor to sign-in", async () => {
    auth.authenticated = false;
    renderPage();

    await waitFor(() =>
      expect(screen.getByLabelText("Current path").textContent).toBe(
        "/sign-in",
      ),
    );
  });
});
