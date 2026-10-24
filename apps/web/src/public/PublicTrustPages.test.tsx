import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../App";

afterEach(() => {
  cleanup();
  window.history.pushState({}, "", "/");
});

describe("Phase 9 public trust pages", () => {
  it.each([
    ["/privacy", "Privacy"],
    ["/terms", "Terms"],
    ["/accessibility", "Accessibility"],
    ["/contact", "Contact"],
    ["/cookies", "Cookie policy"],
    ["/your-privacy-choices", "Your privacy choices"],
  ])("opens %s without authentication", async (path, heading) => {
    window.history.pushState({}, "", path);
    render(<App />);

    expect(
      await screen.findByRole(
        "heading",
        { level: 1, name: heading },
        { timeout: 5000 },
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("navigation", { name: "Trust pages" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("navigation", { name: "Trust and legal" }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveProperty(
      "pathname",
      "/sign-in",
    );
  });

  it("reports accessibility as unassessed instead of claiming conformance", async () => {
    window.history.pushState({}, "", "/accessibility");
    render(<App />);

    expect(
      await screen.findByText(
        "Newfork Clean has not completed a formal accessibility evaluation.",
        { exact: false },
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/fully conformant/i)).toBeNull();
  });

  it("uses the configured development support email without a public form", async () => {
    window.history.pushState({}, "", "/contact");
    render(<App />);

    const emailLink = await screen.findByRole("link", {
      name: "support@newfork.test",
    });
    expect(emailLink.getAttribute("href")).toBe("mailto:support@newfork.test");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /send/i })).toBeNull();
  });

  it("makes trust pages discoverable from sign in", async () => {
    window.history.pushState({}, "", "/sign-in");
    render(<App />);

    const trustNavigation = await screen.findByRole("navigation", {
      name: "Trust and legal",
    });
    expect(trustNavigation).toBeTruthy();
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveProperty(
      "pathname",
      "/privacy",
    );
    expect(screen.getByRole("link", { name: "Terms" })).toHaveProperty(
      "pathname",
      "/terms",
    );
  });
});
