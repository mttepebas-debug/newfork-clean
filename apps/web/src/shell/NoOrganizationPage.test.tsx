import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listPendingEmployeeInvitations } from "../employees/employee-data";
import {
  createOwnerWorkspace,
  listAccountWorkspaces,
  loadAccountEverLinked,
} from "../lib/supabase";
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
  listAccountWorkspaces: vi.fn(),
  loadAccountEverLinked: vi.fn(),
  setTabWorkspaceId: vi.fn(),
  supabaseClient: {},
}));

const northstar = {
  id: "26000000-0000-4000-8000-000000000001",
  name: "Northstar",
  role: "owner" as const,
  status: "active" as const,
  isActive: true,
  onboarding: { status: "complete" as const, currentStep: 4 },
};

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
        <Route path="/organization-switcher" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("NoOrganizationPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refresh.mockResolvedValue(null);
    vi.mocked(listPendingEmployeeInvitations).mockResolvedValue([]);
    vi.mocked(listAccountWorkspaces).mockResolvedValue([]);
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
      await screen.findByRole("button", { name: "Create your workspace" }),
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
      screen.getByRole("button", { name: "Create your workspace" }),
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

    // The "Checking your account" frame also has Sign out, so wait for the landing.
    await screen.findByRole("heading", { name: "Welcome back" });
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("sends an account that has a ready business to the switcher", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([northstar]);
    renderPage();

    await waitFor(() =>
      expect(screen.getByLabelText("Current path").textContent).toBe(
        "/organization-switcher",
      ),
    );
    expect(screen.queryByRole("heading", { name: "Welcome back" })).toBeNull();
  });

  it("sends an account that has an unfinished setup to the landing first", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([
      northstar,
      {
        ...northstar,
        id: "26000000-0000-4000-8000-000000000002",
        role: "employee",
        status: "pending",
        isActive: false,
      },
    ]);
    renderPage();

    await waitFor(() =>
      expect(screen.getByLabelText("Current path").textContent).toBe(
        "/invitations/pending",
      ),
    );
  });

  it("stays when no business is ready or unfinished", async () => {
    // The landing sends a suspended-only account here: bouncing it back would loop.
    vi.mocked(listAccountWorkspaces).mockResolvedValue([
      { ...northstar, status: "suspended", isActive: false },
    ]);
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Welcome back" }),
    ).toBeTruthy();
    expect(screen.getByLabelText("Current path").textContent).toBe(
      "/no-organization",
    );
  });

  it("still shows the page when the businesses cannot be loaded", async () => {
    vi.mocked(listAccountWorkspaces).mockRejectedValue(new Error("offline"));
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Welcome back" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Create your workspace" }),
    ).toBeTruthy();
  });

  it("does not bounce to the landing while its own Create starts a business", async () => {
    // Create refetches the list before it navigates: the draft it just made is
    // not an account arriving with an unfinished setup.
    refresh.mockReturnValue(new Promise(() => {}));
    vi.mocked(listAccountWorkspaces)
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        { ...northstar, onboarding: { status: "incomplete", currentStep: 1 } },
      ]);
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "Create your workspace" }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    // Let the refetched list reach the page before reading the path.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(listAccountWorkspaces).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText("Current path").textContent).toBe(
      "/no-organization",
    );
  });
});
