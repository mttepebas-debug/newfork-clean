import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestPasswordReset } from "../lib/supabase";
import ForgotPasswordPage from "./ForgotPasswordPage";

vi.mock("../lib/supabase", () => ({
  requestPasswordReset: vi.fn(),
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ account: null, authenticated: false, signOut: vi.fn() }),
}));

const sameAnswer = "If an account exists for this email, we sent a reset link.";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/forgot-password"]}>
      <ForgotPasswordPage />
    </MemoryRouter>,
  );
}

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requestPasswordReset).mockResolvedValue(undefined);
  });

  it("sends the typed email and shows the one answer that does not say whether an account exists", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "  ayse@example.test " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() =>
      expect(requestPasswordReset).toHaveBeenCalledWith("ayse@example.test"),
    );
    // The answer is announced and reads as the app's success message.
    const answer = await screen.findByRole("status");
    expect(answer.textContent).toBe(sameAnswer);
    expect(answer.className).toBe("form-success");
    expect(screen.queryByLabelText("Email")).toBeNull();
    const back = screen.getByRole("link", { name: "Back to sign in" });
    expect(back.getAttribute("href")).toBe("/sign-in");
    expect(back.className).toBe("pb-link");
  });

  it("shows a refusal such as the rate limit and keeps the form", async () => {
    vi.mocked(requestPasswordReset).mockRejectedValue(
      new Error("Too many reset requests. Try again later."),
    );
    renderPage();
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ayse@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Too many reset requests. Try again later.",
    );
    expect(screen.queryByText(sameAnswer)).toBeNull();
    expect(screen.getByLabelText("Email")).toBeTruthy();
  });
});
