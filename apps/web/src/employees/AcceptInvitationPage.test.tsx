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

vi.mock("./employee-data", () => ({
  acceptEmployeeInvitation: vi.fn(),
  previewEmployeeInvitation: vi.fn(),
}));

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
      workspaceName: "Northstar",
      emailHint: "ne**********@example.test",
      expiresAt: "2026-09-12T12:00:00.000Z",
    });
    vi.mocked(acceptEmployeeInvitation).mockRejectedValue(
      new Error("invitation email does not match authenticated account"),
    );
  });

  it("names the invited address for a wrong account and leaves Sign out as the way out", async () => {
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "Accept invitation" }),
    );

    const alert = await screen.findByText(
      /This invitation is for ne\*+@example\.test/i,
    );
    expect(alert.getAttribute("role")).toBe("alert");
    // The server's own sentence only picks the state; it is never printed.
    expect(screen.queryByText(/does not match/i)).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Accept invitation" }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(auth.signOut).toHaveBeenCalledTimes(1);
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
