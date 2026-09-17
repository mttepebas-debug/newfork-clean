import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listPendingEmployeeInvitations } from "../employees/employee-data";
import NoOrganizationPage from "./NoOrganizationPage";

const signOut = vi.fn();

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ account: { email: "cook@example.test" }, signOut }),
}));

vi.mock("../employees/employee-data", () => ({
  listPendingEmployeeInvitations: vi.fn(),
}));

function renderWithQuery(children: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  );
}

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
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listPendingEmployeeInvitations).mockResolvedValue([]);
  });

  it("offers business creation without adding it to the organization switcher", async () => {
    renderWithQuery(
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
    renderWithQuery(
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

    expect(
      await screen.findByRole("heading", { name: "Waiting for an invitation" }),
    ).toBeTruthy();
    expect(
      screen.getByText(/No pending invitation for cook@example\.test\./),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(
      screen.getByRole("heading", { name: "No organization found" }),
    ).toBeTruthy();
  });

  it("checks again and opens a newly arrived invitation", async () => {
    renderWithQuery(
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
    await screen.findByRole("button", { name: "Check again" });
    vi.mocked(listPendingEmployeeInvitations).mockResolvedValue([
      {
        id: "46000000-0000-4000-8000-000000000001",
        workspaceId: "26000000-0000-4000-8000-000000000001",
        workspaceName: "Northstar",
        emailHint: "co**@example.test",
        expiresAt: "2026-10-01T12:00:00.000Z",
      },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Check again" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Current path").textContent).toBe(
        "/invitations/pending",
      ),
    );
  });

  it("switches account from the waiting state", async () => {
    renderWithQuery(
      <MemoryRouter initialEntries={["/no-organization"]}>
        <NoOrganizationPage />
      </MemoryRouter>,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "I'm waiting for another invitation",
      }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Switch account" }),
    );
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
