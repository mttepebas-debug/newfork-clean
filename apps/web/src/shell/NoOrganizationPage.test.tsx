import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { describe, expect, it } from "vitest";
import NoOrganizationPage from "./NoOrganizationPage";

function LocationProbe() {
  const location = useLocation();
  return (
    <output aria-label="Current path">
      {location.pathname}
      {(location.state as { openCreate?: boolean } | null)?.openCreate
        ? " openCreate"
        : ""}
    </output>
  );
}

describe("NoOrganizationPage", () => {
  it("offers business creation without adding it to the organization switcher", async () => {
    render(
      <MemoryRouter initialEntries={["/no-organization"]}>
        <Routes>
          <Route
            path="/no-organization"
            element={
              <>
                <NoOrganizationPage />
                <LocationProbe />
              </>
            }
          />
          <Route path="/account/workspaces" element={<LocationProbe />} />
          <Route path="/invitations/pending" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "No organization found" }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("link", {
        name: "Create your business organization",
      }),
    );
    expect(screen.getByLabelText("Current path").textContent).toBe(
      "/account/workspaces openCreate",
    );
  });

  it("lets the user wait for another invitation", async () => {
    render(
      <MemoryRouter initialEntries={["/no-organization"]}>
        <Routes>
          <Route path="/no-organization" element={<NoOrganizationPage />} />
          <Route path="/invitations/pending" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "I'm waiting for another invitation",
      }),
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Current path").textContent).toBe(
        "/invitations/pending",
      ),
    );
  });
});
