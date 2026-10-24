import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../App";
import { cookieNoticeStorageKey } from "./CookieNotice";

beforeEach(() => {
  window.localStorage.clear();
  window.history.pushState({}, "", "/");
});

afterEach(() => {
  cleanup();
  window.history.pushState({}, "", "/");
});

async function openLanding() {
  render(<App />);
  return screen.findByRole("heading", { level: 1, name: /Run every shift/ }, { timeout: 5000 });
}

describe("public landing page", () => {
  it("opens at / without authentication and covers every marketing section", async () => {
    await openLanding();
    const main = screen.getByRole("navigation", { name: "Main" });
    for (const label of ["Product", "Cockpit", "Employee app", "Pricing", "FAQ", "Contact"]) {
      expect(within(main).getByRole("link", { name: label })).toBeTruthy();
    }
    for (const id of ["how", "cockpit", "crew", "features", "pricing", "faq", "contact"]) {
      expect(document.getElementById(id)).toBeTruthy();
    }
  });

  it("bridges Start free to the sign-up form and Sign in to the sign-in form", async () => {
    await openLanding();
    const header = screen.getByRole("banner");
    for (const signIn of within(header).getAllByRole("link", { name: "Sign in" })) {
      expect(signIn).toHaveProperty("pathname", "/sign-in");
    }
    const startFree = within(header).getAllByRole("link", { name: /Start free/ })[0]!;
    expect(startFree.getAttribute("href")).toBe("/sign-in?mode=signup");

    await act(async () => {
      fireEvent.click(startFree);
    });
    expect(
      await screen.findByRole("heading", { name: "Create your workspace account" }, { timeout: 5000 }),
    ).toBeTruthy();
  });

  it("links every legal page from the footer", async () => {
    await openLanding();
    const legal = screen.getByRole("navigation", { name: "Legal" });
    const paths = within(legal)
      .getAllByRole("link")
      .map((link) => (link as HTMLAnchorElement).pathname);
    expect(paths).toEqual(["/privacy", "/terms", "/cookies", "/accessibility", "/your-privacy-choices"]);
  });

  it("switches pricing between annual and monthly", async () => {
    await openLanding();
    expect(screen.getByText("$39")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Monthly" }));
    expect(screen.getByText("$49")).toBeTruthy();
  });

  it("switches cockpit tabs with the keyboard", async () => {
    await openLanding();
    const schedule = screen.getByRole("tab", { name: "Schedule" });
    expect(schedule.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(schedule, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Requests" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("heading", { name: /swap, pickup and drop/ })).toBeTruthy();
  });

  it("lets a visitor pause the hero animation", async () => {
    await openLanding();
    const pause = screen.getByRole("button", { name: "Pause animation" });
    fireEvent.click(pause);
    expect(screen.getByRole("button", { name: "Play animation" })).toBeTruthy();
  });

  it("shows the essential-cookie notice once", async () => {
    await openLanding();
    const notice = screen.getByRole("complementary", { name: "Cookie notice" });
    fireEvent.click(within(notice).getByRole("button", { name: "Got it" }));
    expect(screen.queryByRole("complementary", { name: "Cookie notice" })).toBeNull();
    expect(window.localStorage.getItem(cookieNoticeStorageKey)).toBe("seen");
  });
});
