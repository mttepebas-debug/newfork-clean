import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AcceptInvitationPage from "./AcceptInvitationPage";
import {
  acceptEmployeeInvitation,
  previewEmployeeInvitation,
} from "./employee-data";

const signOut = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    authenticated: true,
    ready: true,
    signOut,
  }),
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
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(previewEmployeeInvitation).mockResolvedValue({
      workspaceName: "Northstar",
      emailHint: "ne**********@example.test",
      expiresAt: "2026-09-12T12:00:00.000Z",
    });
    vi.mocked(acceptEmployeeInvitation).mockRejectedValue(
      new Error("invitation email does not match authenticated account"),
    );
  });

  it("shows a masked-email switch-account flow for wrong authenticated accounts", async () => {
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "Accept invitation" }),
    );

    expect(
      await screen.findByText(/This invitation is for ne\*+@example\.test/i),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Accept invitation" }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Switch account" }));

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByLabelText("Current path").textContent).toBe(
        "/sign-in",
      ),
    );
  });
});
