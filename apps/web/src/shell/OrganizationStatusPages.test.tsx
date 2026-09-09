import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import PendingOrganizationStatusPage from "./PendingOrganizationStatusPage";
import SuspendedOrganizationStatusPage from "./SuspendedOrganizationStatusPage";

describe("organization status pages", () => {
  it("keeps pending organizations out of the normal app shell", () => {
    render(
      <MemoryRouter>
        <PendingOrganizationStatusPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "Onboarding pending" }),
    ).toBeTruthy();
    expect(screen.getByText("Normal app access is disabled")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Continue onboarding" }).getAttribute(
        "href",
      ),
    ).toBe("/welcome");
    expect(screen.queryByText("Schedule")).toBeNull();
    expect(screen.queryByText("Employees")).toBeNull();
  });

  it("keeps suspended organizations on a limited status surface", () => {
    render(
      <MemoryRouter>
        <SuspendedOrganizationStatusPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Access suspended" })).toBeTruthy();
    expect(screen.getByText("Limited account view only")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Back to organization switcher" })
        .getAttribute("href"),
    ).toBe("/organization-switcher");
    expect(screen.queryByText("Documents")).toBeNull();
    expect(screen.queryByText("Notifications")).toBeNull();
  });
});
