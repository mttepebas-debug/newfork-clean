import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  abandonPasswordResetSession,
  openPasswordResetSession,
  saveNewPassword,
} from "../lib/supabase";
import ResetPasswordPage from "./ResetPasswordPage";

vi.mock("../lib/supabase", () => ({
  abandonPasswordResetSession: vi.fn(),
  openPasswordResetSession: vi.fn(),
  saveNewPassword: vi.fn(),
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ account: null, authenticated: false, signOut: vi.fn() }),
}));

function renderPage(entry = "/reset-password#token_hash=hash-1") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/forgot-password" element={<p>Forgot destination</p>} />
        <Route path="/app" element={<p>Signed in destination</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function fill(password: string, confirm = password) {
  fireEvent.change(screen.getByLabelText("New password"), {
    target: { value: password },
  });
  fireEvent.change(screen.getByLabelText("Confirm password"), {
    target: { value: confirm },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save password" }));
}

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(openPasswordResetSession).mockResolvedValue(true);
    vi.mocked(saveNewPassword).mockResolvedValue(undefined);
  });

  it("opens the session only with the link's token, saves the new password and lets the person in", async () => {
    renderPage();
    expect(openPasswordResetSession).not.toHaveBeenCalled();

    fill("new-password-1");

    await waitFor(() =>
      expect(openPasswordResetSession).toHaveBeenCalledWith("hash-1"),
    );
    expect(saveNewPassword).toHaveBeenCalledWith("new-password-1");
    expect(await screen.findByText("Signed in destination")).toBeTruthy();
    // A saved password keeps the session it was saved with.
    expect(abandonPasswordResetSession).not.toHaveBeenCalled();
  });

  it("does not read a token from the query string, which reaches server logs", () => {
    renderPage("/reset-password?token_hash=hash-1");
    expect(
      screen.getByText("This reset link has expired or was already used."),
    ).toBeTruthy();
  });

  it("signs out a session the link opened when the person leaves without saving", async () => {
    vi.mocked(saveNewPassword).mockRejectedValue(new Error("Password is too weak."));
    const { unmount } = renderPage();
    fill("new-password-1");
    await screen.findByRole("alert");
    expect(abandonPasswordResetSession).not.toHaveBeenCalled();

    unmount();
    expect(abandonPasswordResetSession).toHaveBeenCalledTimes(1);
  });

  it("has nothing to sign out when the person leaves before using the link", () => {
    const { unmount } = renderPage();
    unmount();
    expect(abandonPasswordResetSession).not.toHaveBeenCalled();
  });

  it("refuses a confirmation that does not match before touching the link", async () => {
    renderPage();
    fill("new-password-1", "new-password-2");
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Passwords do not match.",
    );
    expect(openPasswordResetSession).not.toHaveBeenCalled();
  });

  it("asks for at least eight characters, as sign-up does", () => {
    renderPage();
    expect(screen.getByLabelText("New password").getAttribute("minLength")).toBe("8");
    expect(screen.getByLabelText("Confirm password").getAttribute("minLength")).toBe("8");
  });

  it("tells an expired or used link apart and offers a new one", async () => {
    vi.mocked(openPasswordResetSession).mockResolvedValue(false);
    renderPage();
    fill("new-password-1");

    expect(
      await screen.findByText("This reset link has expired or was already used."),
    ).toBeTruthy();
    expect(saveNewPassword).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("link", { name: "Request a new link" }));
    expect(await screen.findByText("Forgot destination")).toBeTruthy();
  });

  it("shows the invalid-link state at once when the link carries no token", () => {
    renderPage("/reset-password");
    expect(
      screen.getByText("This reset link has expired or was already used."),
    ).toBeTruthy();
    expect(screen.queryByLabelText("New password")).toBeNull();
  });

  it("keeps the opened session when the password is refused, so a second try needs no new link", async () => {
    vi.mocked(saveNewPassword)
      .mockRejectedValueOnce(
        new Error("New password should be different from the old password."),
      )
      .mockResolvedValueOnce(undefined);
    renderPage();
    fill("old-password-1");

    expect((await screen.findByRole("alert")).textContent).toBe(
      "New password should be different from the old password.",
    );
    fill("new-password-1");
    expect(await screen.findByText("Signed in destination")).toBeTruthy();
    expect(openPasswordResetSession).toHaveBeenCalledTimes(1);
  });
});
