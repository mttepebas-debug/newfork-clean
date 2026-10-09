import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { restoreAccountDeletionWithToken } from "../lib/supabase";
import AccountRecoveryPage from "./AccountRecoveryPage";

vi.mock("../lib/supabase", () => ({
  restoreAccountDeletionWithToken: vi.fn(),
}));

// The page draws in the shared frame now; nobody has a session on a link from
// a recovery email, so the frame shows no account block.
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ account: null, authenticated: false, signOut: vi.fn() }),
}));

describe("AccountRecoveryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(restoreAccountDeletionWithToken).mockResolvedValue({
      status: "restored",
      loginUrl: "/sign-in",
    });
  });

  it("restores with the one-time token and requires a fresh sign-in", async () => {
    const token = "a".repeat(48);
    render(
      <MemoryRouter initialEntries={[`/account-recovery?token=${token}`]}>
        <Routes>
          <Route path="/account-recovery" element={<AccountRecoveryPage />} />
          <Route path="/sign-in" element={<p>Sign in destination</p>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Restore my account" }));

    await waitFor(() =>
      expect(restoreAccountDeletionWithToken).toHaveBeenCalledWith(token),
    );
    expect(
      await screen.findByRole("heading", { name: "Your account is back" }),
    ).toBeTruthy();
    expect(screen.getByText(/sign in to pick up/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /sign out/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Go to sign in" }));
    expect(await screen.findByText("Sign in destination")).toBeTruthy();
  });
});
