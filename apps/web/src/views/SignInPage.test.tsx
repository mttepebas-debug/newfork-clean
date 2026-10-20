import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  MemoryRouter,
  Route,
  Routes,
  type InitialEntry,
  useLocation,
} from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ForgotPasswordPage from "./ForgotPasswordPage";
import { SignInPage } from "./SignInPage";

const auth = vi.hoisted(() => ({
  authenticated: false,
  context: null,
  error: null,
  signIn: vi.fn(),
  signUp: vi.fn(),
  supabaseConfigured: true,
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => auth,
}));

function renderPage(entry: InitialEntry = "/sign-in") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <SignInPage />
    </MemoryRouter>,
  );
}

function renderPageWithProbe(entry: InitialEntry = "/sign-in") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function LocationProbe() {
  const location = useLocation();
  return (
    <output aria-label="Current path">
      {location.pathname}
      {location.search}
    </output>
  );
}

describe("SignInPage", () => {
  beforeEach(() => {
    auth.authenticated = false;
    auth.context = null;
    auth.error = null;
    auth.supabaseConfigured = true;
    auth.signIn.mockReset();
    auth.signIn.mockResolvedValue(true);
    auth.signUp.mockReset();
    auth.signUp.mockResolvedValue(true);
  });

  // QA 64: the address already typed goes along, in the page's state, never the URL.
  it("carries the typed email to the password reset page", () => {
    render(
      <MemoryRouter initialEntries={["/sign-in"]}>
        <Routes>
          <Route path="/sign-in" element={<SignInPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ayse@example.test" },
    });
    const forgot = screen.getByRole("link", { name: "Forgot password?" });
    expect(forgot.getAttribute("href")).toBe("/forgot-password");
    fireEvent.click(forgot);

    expect(
      (screen.getByLabelText("Email") as HTMLInputElement).value,
    ).toBe("ayse@example.test");
  });

  it("offers a way to reset a forgotten password when signing in, not when creating an account", () => {
    renderPage();
    const forgot = screen.getByRole("link", { name: "Forgot password?" });
    expect(forgot.getAttribute("href")).toBe("/forgot-password");
    expect(forgot.className).toBe("pb-link");

    fireEvent.click(
      screen.getByRole("button", { name: "Create a workspace account" }),
    );
    expect(screen.queryByRole("link", { name: "Forgot password?" })).toBeNull();
  });

  it("lets a potential customer switch from sign-in to workspace account creation", async () => {
    renderPage();

    expect(
      screen.getByRole("heading", { name: "Sign in" }),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Create a workspace account" }),
    );

    expect(
      screen.getByRole("heading", { name: "Create your workspace account" }),
    ).toBeTruthy();
    // Creating an account is an email and a password. The name is asked where
    // an employment record needs one, which is the setup wizard.
    expect(screen.queryByLabelText("Full name")).toBeNull();
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "future-owner@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "newfork-local" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(auth.signUp).toHaveBeenCalledWith(
        "future-owner@example.test",
        "newfork-local",
      ),
    );
    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it("asks a new account to confirm its email instead of signing it in", async () => {
    auth.signUp.mockResolvedValue("email_confirmation_required");
    renderPageWithProbe();
    fireEvent.click(
      screen.getByRole("button", { name: "Create a workspace account" }),
    );
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: " future-owner@example.test " },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "newfork-local" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    const sent = await screen.findByTestId("signup-check-email");
    expect(sent.getAttribute("role")).toBe("status");
    expect(sent.textContent).toBe(
      "Confirmation link sent to future-owner@example.test.",
    );
    const heading = screen.getByRole("heading", { name: "Check your email" });
    // The form is gone, so focus goes to the heading rather than the page.
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(screen.getByText(/then sign in\. Nothing after a few minutes\? Check your spam folder/)).toBeTruthy();
    // No session yet, so nothing to go to.
    expect(screen.queryByLabelText("Current path")).toBeNull();

    const back = screen.getByRole("button", { name: "Back to sign in" });
    expect(back.className).toBe("pb-link");
    fireEvent.click(back);
    const signIn = screen.getByRole("heading", { name: "Sign in" });
    await waitFor(() => expect(document.activeElement).toBe(signIn));
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.queryByTestId("signup-check-email")).toBeNull();
  });

  it("goes straight in when the new account is signed in already", async () => {
    auth.signUp.mockResolvedValue("signed_in");
    renderPageWithProbe();
    fireEvent.click(
      screen.getByRole("button", { name: "Create a workspace account" }),
    );
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "future-owner@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "newfork-local" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(
      (await screen.findByLabelText("Current path")).textContent,
    ).toBe("/app");
    expect(screen.queryByTestId("signup-check-email")).toBeNull();
  });

  it("starts with an empty email and no local development copy", () => {
    renderPage();
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("");
    // Sign-in carries no explanation: the heading and the two fields say it.
    expect(screen.queryByText(/password\./)).toBeNull();
    expect(screen.queryByText(/local Supabase/i)).toBeNull();
  });

  it("keeps invite-link visitors in employee account creation mode by default", () => {
    renderPage({
      pathname: "/sign-in",
      state: { from: `/invite/accept?token=${"a".repeat(64)}` },
    });

    expect(
      screen.getByRole("heading", { name: "Create your employee account" }),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Full name")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "I already have an account" }),
    );

    expect(
      screen.getByRole("heading", { name: "Sign in" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Create a new account" }),
    ).toBeTruthy();
  });

  it("does not treat invite route lookalikes as employee invitation signup", () => {
    renderPage({
      pathname: "/sign-in",
      state: { from: "/invite/acceptevil?token=spoofed" },
    });

    expect(
      screen.getByRole("heading", { name: "Sign in" }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Create a workspace account" }),
    );
    expect(
      screen.getByRole("heading", { name: "Create your workspace account" }),
    ).toBeTruthy();
  });

  it("falls back to the app entry for external sign-in destinations", async () => {
    renderPageWithProbe({
      pathname: "/sign-in",
      state: { from: "https://outside.example/phish" },
    });

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "owner@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "newfork-local" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Current path").textContent).toBe("/app"),
    );
  });

  it("explains a session the server ended", () => {
    window.sessionStorage.setItem("newfork.sessionExpired", "1");
    renderPage();

    expect(
      screen.getByText("Your session ended. Sign in again to pick up where you left off."),
    ).toBeTruthy();
    window.sessionStorage.clear();
  });
});
