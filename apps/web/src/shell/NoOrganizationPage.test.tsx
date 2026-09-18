import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listPendingEmployeeInvitations } from "../employees/employee-data";
import { createOwnerWorkspace, loadAccountEverLinked } from "../lib/supabase";
import NoOrganizationPage from "./NoOrganizationPage";

const signOut = vi.fn();
const refresh = vi.fn();

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    account: { email: "cook@example.test" },
    refresh,
    signOut,
  }),
}));

vi.mock("../employees/employee-data", () => ({
  listPendingEmployeeInvitations: vi.fn(),
}));

vi.mock("../lib/supabase", () => ({
  createOwnerWorkspace: vi.fn(),
  loadAccountEverLinked: vi.fn(),
  setTabWorkspaceId: vi.fn(),
  supabaseClient: {},
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
  return <output aria-label="Current path">{location.pathname}</output>;
}

function renderPage() {
  return renderWithQuery(
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
        <Route path="/onboarding" element={<LocationProbe />} />
        <Route path="/invitations/pending" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("NoOrganizationPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refresh.mockResolvedValue(null);
    vi.mocked(listPendingEmployeeInvitations).mockResolvedValue([]);
    vi.mocked(loadAccountEverLinked).mockResolvedValue(true);
    vi.mocked(createOwnerWorkspace).mockResolvedValue(
      "26000000-0000-4000-8000-000000000001",
    );
  });

  it("welcomes an account that has never been linked to an organization", async () => {
    vi.mocked(loadAccountEverLinked).mockResolvedValue(false);
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Welcome to Newfork" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "I have an invitation" }),
    ).toBeTruthy();
  });

  it("does not welcome an account that has lost its organizations", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Welcome back" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "I have an invitation" }),
    ).toBeTruthy();
  });

  it("starts employer onboarding directly, without an account detour", async () => {
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "Create your business" }),
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Current path").textContent).toBe(
        "/onboarding",
      ),
    );
    expect(createOwnerWorkspace).toHaveBeenCalledTimes(1);
  });

  it("reports that no invitation is waiting", async () => {
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "I have an invitation" }),
    );

    expect(
      await screen.findByRole("heading", { name: "No invitation yet" }),
    ).toBeTruthy();
    expect(
      screen.getByText(/Nothing has been sent to cook@example\.test so far/),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Create your business" }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(
      screen.getByRole("heading", { name: "Welcome back" }),
    ).toBeTruthy();
  });

  it("checks again and opens a newly arrived invitation", async () => {
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "I have an invitation" }),
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

  it("can sign out from the no invitation state", async () => {
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "I have an invitation" }),
    );
    // Wait for the state itself: the checking frame has a Sign out too.
    await screen.findByRole("heading", { name: "No invitation yet" });
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("can sign out from the landing itself", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
