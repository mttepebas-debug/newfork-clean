import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import SuspendedOrganizationStatusPage from "./SuspendedOrganizationStatusPage";

describe("organization status pages", () => {
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
