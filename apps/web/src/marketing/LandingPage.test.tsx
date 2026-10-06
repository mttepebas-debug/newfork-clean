import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../App";
import { COOKIE_NOTICE_KEY } from "./CookieNotice";
import {
  annualSavingsPercent,
  FAQS,
  monthlyTotal,
  PRICING,
} from "./landing-content";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.history.pushState({}, "", "/");
});

async function openLanding(path = "/") {
  window.history.pushState({}, "", path);
  render(<App />);
  return screen.findByRole(
    "heading",
    { level: 1, name: /run every shift from one cockpit/i },
    { timeout: 5000 },
  );
}

describe("public landing page", () => {
  it("opens at the site root without signing in and bridges to sign-up and sign-in", async () => {
    await openLanding();

    const main = screen.getByRole("main");
    const trialLinks = within(main).getAllByRole("link", {
      name: /start (your \d+-day )?free trial/i,
    });
    expect(trialLinks.length).toBeGreaterThan(1);
    for (const link of trialLinks)
      expect(link).toHaveProperty("pathname", "/sign-up");

    const signInLinks = screen.getAllByRole("link", { name: "Sign in" });
    expect(signInLinks.length).toBeGreaterThan(0);
    for (const link of signInLinks)
      expect(link).toHaveProperty("pathname", "/sign-in");
  });

  it("links every legal page from the footer", async () => {
    await openLanding();

    const legal = screen.getByRole("navigation", { name: "Legal" });
    const paths = within(legal)
      .getAllByRole("link")
      .map((link) => (link as HTMLAnchorElement).pathname);
    expect(paths).toEqual([
      "/privacy",
      "/terms",
      "/cookies",
      "/accessibility",
      "/your-privacy-choices",
    ]);
  });

  it("answers every FAQ in a native disclosure", async () => {
    await openLanding("/faq");

    const faq = document.getElementById("faq");
    expect(faq).not.toBeNull();
    expect(faq!.querySelectorAll("details")).toHaveLength(FAQS.length);
    expect(
      within(faq!).getByText("Does Newfork do time clocks, payroll or tips?"),
    ).toBeTruthy();
  });

  it("prices per location and recalculates when the cycle or count changes", async () => {
    await openLanding("/pricing");

    const pricing = document.getElementById("pricing")!;
    expect(
      within(pricing).getByText(`$${PRICING.annualPerLocation}`),
    ).toBeTruthy();

    fireEvent.click(within(pricing).getByRole("radio", { name: "Monthly" }));
    expect(
      within(pricing).getByText(`$${PRICING.monthlyPerLocation}`),
    ).toBeTruthy();

    fireEvent.change(within(pricing).getByRole("slider"), {
      target: { value: "3" },
    });
    expect(
      within(pricing).getByText(`$${PRICING.monthlyPerLocation * 3}`),
    ).toBeTruthy();
  });

  it("remembers that the cookie notice was read", async () => {
    await openLanding();

    const notice = screen.getByRole("complementary", { name: "Cookie notice" });
    expect(
      within(notice).getByRole("link", { name: "Cookie policy" }),
    ).toHaveProperty("pathname", "/cookies");
    fireEvent.click(within(notice).getByRole("button", { name: "OK" }));

    expect(
      screen.queryByRole("complementary", { name: "Cookie notice" }),
    ).toBeNull();
    expect(window.localStorage.getItem(COOKIE_NOTICE_KEY)).toBe("1");
  });

  it("opens the sign-in page in create-account mode at /sign-up", async () => {
    window.history.pushState({}, "", "/sign-up");
    render(<App />);

    expect(
      await screen.findByRole(
        "heading",
        { level: 1, name: "Create your workspace account" },
        { timeout: 5000 },
      ),
    ).toBeTruthy();
  });
});

describe("landing pricing rules", () => {
  it("multiplies the per-location price and clamps the count to the self-serve range", () => {
    expect(monthlyTotal(2, "monthly")).toBe(PRICING.monthlyPerLocation * 2);
    expect(monthlyTotal(2, "annual")).toBe(PRICING.annualPerLocation * 2);
    expect(monthlyTotal(0, "monthly")).toBe(PRICING.monthlyPerLocation);
    expect(monthlyTotal(99, "annual")).toBe(
      PRICING.annualPerLocation * PRICING.maxSelfServeLocations,
    );
  });

  it("never advertises an annual price above the monthly one", () => {
    expect(PRICING.annualPerLocation).toBeLessThanOrEqual(
      PRICING.monthlyPerLocation,
    );
    expect(annualSavingsPercent()).toBeGreaterThanOrEqual(0);
  });
});
