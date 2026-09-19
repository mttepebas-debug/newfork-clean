import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import SuspendedOrganizationStatusPage from "./SuspendedOrganizationStatusPage";

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    account: { email: "member@example.test", displayName: "Member" },
    authenticated: true,
    signOut: vi.fn(),
  }),
}));

describe("organization status pages", () => {
  it("keeps suspended organizations on a limited status surface", () => {
    render(
      <MemoryRouter initialEntries={["/organization-switcher/suspended"]}>
        <Routes>
          <Route
            path="/organization-switcher/suspended"
            element={<SuspendedOrganizationStatusPage />}
          />
          <Route path="/organization-switcher" element={<p>Switcher</p>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "This business is on hold" }),
    ).toBeTruthy();
    expect(screen.queryByText("Documents")).toBeNull();
    expect(screen.queryByText("Notifications")).toBeNull();
    // Still a way out, and the frame's account block still carries Sign out.
    expect(screen.getByRole("button", { name: /sign out/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Choose a business" }));
    expect(screen.getByText("Switcher")).toBeTruthy();
  });
});
