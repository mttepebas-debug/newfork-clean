import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";

const supabaseMock = vi.hoisted(() => ({
  clearTabWorkspaceId: vi.fn(),
  developmentBearerToken: vi.fn(() => "development-owner-token"),
  ensureSessionAlive: vi.fn(async () => true),
  getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
  getTabWorkspaceId: vi.fn(() => null as string | null),
  onAuthStateChange: vi.fn((_callback: (event: string, session: unknown) => void) => ({
    data: { subscription: { unsubscribe: vi.fn() } },
  })),
  loadAccountProfile: vi.fn(),
  resolveWorkspaceContext: vi.fn(),
  saveAccountProfile: vi.fn(),
  signOut: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock("../lib/supabase", () => ({
  accountProfileSchema: undefined,
  activeWorkspaceContextSchema: undefined,
  clearTabWorkspaceId: supabaseMock.clearTabWorkspaceId,
  developmentBearerToken: supabaseMock.developmentBearerToken,
  developmentIdentityAllowed: true,
  developmentIdentityRoleStorageKey: "newfork.development.workspaceRole",
  ensureSessionAlive: supabaseMock.ensureSessionAlive,
  invitationsCheckedStorageKey: "newfork.invitationsChecked",
  getTabWorkspaceId: supabaseMock.getTabWorkspaceId,
  loadAccountProfile: supabaseMock.loadAccountProfile,
  resolveWorkspaceContext: supabaseMock.resolveWorkspaceContext,
  saveAccountProfile: supabaseMock.saveAccountProfile,
  supabaseClient: {
    auth: {
      getSession: supabaseMock.getSession,
      onAuthStateChange: supabaseMock.onAuthStateChange,
      signOut: supabaseMock.signOut,
    },
  },
}));

function AccountProbe() {
  const { account, updateAccount } = useAuth();
  if (!account) return <p>Loading</p>;
  return (
    <button
      type="button"
      onClick={() => void updateAccount("Local Dev", "dark", "5551234567")}
    >
      {account.displayName} / {account.theme}
    </button>
  );
}

function RefreshProbe() {
  const { context, refresh } = useAuth();
  if (!context) return <p>Loading</p>;
  return (
    <button
      type="button"
      onClick={async () => {
        const refreshed = await refresh();
        if (!refreshed) throw new Error("Expected development context");
      }}
    >
      {context.workspace.id}
    </button>
  );
}

function AuthStateProbe() {
  const { authenticated, context, error, ready } = useAuth();
  return (
    <dl>
      <dt>ready</dt>
      <dd>{ready ? "ready" : "loading"}</dd>
      <dt>authenticated</dt>
      <dd>{authenticated ? "authenticated" : "anonymous"}</dd>
      <dt>workspace</dt>
      <dd>{context?.workspace.name ?? "no-context"}</dd>
      <dt>error</dt>
      <dd>{error ?? "no-error"}</dd>
    </dl>
  );
}

describe("AuthProvider development identity", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem("newfork.development.workspaceRole", "owner");
    supabaseMock.clearTabWorkspaceId.mockClear();
    supabaseMock.developmentBearerToken.mockClear();
    supabaseMock.ensureSessionAlive.mockReset();
    supabaseMock.ensureSessionAlive.mockResolvedValue(true);
    supabaseMock.getSession.mockReset();
    supabaseMock.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    supabaseMock.getTabWorkspaceId.mockReset();
    supabaseMock.getTabWorkspaceId.mockReturnValue(null);
    supabaseMock.loadAccountProfile.mockClear();
    supabaseMock.loadAccountProfile.mockResolvedValue({
      userId: "new-user",
      email: "new-user@example.test",
      displayName: "New User",
      phone: null,
      theme: "system",
    });
    supabaseMock.onAuthStateChange.mockClear();
    supabaseMock.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: supabaseMock.unsubscribe } },
    });
    supabaseMock.resolveWorkspaceContext.mockClear();
    supabaseMock.saveAccountProfile.mockClear();
    supabaseMock.signOut.mockClear();
    supabaseMock.unsubscribe.mockClear();
  });

  it("keeps development account updates local instead of hitting Supabase RLS", async () => {
    render(
      <AuthProvider>
        <AccountProbe />
      </AuthProvider>,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Development user / system" }),
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Local Dev / dark" })).toBeTruthy(),
    );
    expect(supabaseMock.saveAccountProfile).not.toHaveBeenCalled();
  });

  it("keeps local development preferences across focus-triggered refresh", async () => {
    render(
      <AuthProvider>
        <AccountProbe />
      </AuthProvider>,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Development user / system" }),
    );

    await screen.findByRole("button", { name: "Local Dev / dark" });
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Local Dev / dark" }),
      ).toBeTruthy(),
    );
    expect(screen.queryByLabelText("Loading workspace")).toBeNull();
  });

  it("refreshes development context from the tab-local workspace without a real session", async () => {
    const selectedWorkspaceId = "7ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
    supabaseMock.getTabWorkspaceId.mockReturnValue(selectedWorkspaceId);

    render(
      <AuthProvider>
        <RefreshProbe />
      </AuthProvider>,
    );

    expect(await screen.findByRole("button", { name: selectedWorkspaceId })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: selectedWorkspaceId }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: selectedWorkspaceId })).toBeTruthy(),
    );
  });

  it("keeps a real signed-in account without falling back to development identity when no workspace resolves", async () => {
    window.localStorage.clear();
    supabaseMock.getSession.mockResolvedValue({
      data: {
        session: {
          user: {
            id: "new-user",
            email: "new-user@example.test",
            user_metadata: {},
          },
        },
      },
      error: null,
    } as never);
    supabaseMock.resolveWorkspaceContext.mockRejectedValue(
      new Error("Invalid session or membership"),
    );

    render(
      <AuthProvider>
        <AuthStateProbe />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getAllByText("authenticated")).toHaveLength(2),
    );
    expect(screen.getByText("no-context")).toBeTruthy();
    expect(screen.getByText("no-error")).toBeTruthy();
    expect(supabaseMock.loadAccountProfile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ email: "new-user@example.test" }),
    );
    expect(supabaseMock.signOut).not.toHaveBeenCalled();
  });

  it("does not treat a session the server ended as an account without a workspace", async () => {
    window.localStorage.clear();
    supabaseMock.getSession.mockResolvedValue({
      data: {
        session: {
          user: {
            id: "new-user",
            email: "new-user@example.test",
            user_metadata: {},
          },
        },
      },
      error: null,
    } as never);
    supabaseMock.resolveWorkspaceContext.mockRejectedValue(
      new Error("Invalid session or membership"),
    );
    // ensureSessionAlive signs out locally and reports the ended session.
    supabaseMock.ensureSessionAlive.mockResolvedValue(false);

    render(
      <AuthProvider>
        <AuthStateProbe />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(supabaseMock.ensureSessionAlive).toHaveBeenCalledTimes(1),
    );
    await waitFor(() => expect(screen.getAllByText("ready")).toHaveLength(2));
    expect(supabaseMock.loadAccountProfile).toHaveBeenCalledTimes(1);
    expect(screen.getByText("no-error")).toBeTruthy();
  });

  it("clears tenant scoped cache when a real session loses workspace context", async () => {
    window.localStorage.clear();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(["workspace-dashboard", "org-a"], {
      name: "Meyhouse",
    });
    queryClient.setQueryData(["employees", "org-a"], [{ id: "employee-a" }]);
    queryClient.setQueryData(["account-profile"], {
      email: "new-user@example.test",
    });
    supabaseMock.getSession.mockResolvedValue({
      data: {
        session: {
          user: {
            id: "new-user",
            email: "new-user@example.test",
            user_metadata: {},
          },
        },
      },
      error: null,
    } as never);
    supabaseMock.resolveWorkspaceContext
      .mockResolvedValueOnce({
        userId: "new-user",
        workspace: {
          id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
          name: "Meyhouse",
          logo_url: null,
          logo_file_name: null,
          logo_updated_at: null,
          schedule_logo_placement: { scale: 1, offset_x: 0, offset_y: 0 },
        },
        membership: {
          id: "bd6b757b-c9ad-4e47-a47e-0a90a43bc0e4",
          userId: "new-user",
          workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
          role: "owner",
          status: "active",
          allLocations: true,
        },
        permissions: ["workspace.read"],
        onboarding: { status: "complete", currentStep: 2, revision: 1 },
        locationScope: { allLocations: true, locationIds: [] },
      })
      .mockRejectedValueOnce(new Error("Workspace not found"));

    render(
      <AuthProvider queryClient={queryClient}>
        <AuthStateProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText("Meyhouse")).toBeTruthy());

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => expect(screen.getByText("no-context")).toBeTruthy());
    expect(
      queryClient.getQueryData(["workspace-dashboard", "org-a"]),
    ).toBeUndefined();
    expect(queryClient.getQueryData(["employees", "org-a"])).toBeUndefined();
    expect(queryClient.getQueryData(["account-profile"])).toEqual({
      email: "new-user@example.test",
    });
  });
  it("preserves a dirty decision form during same-account SIGNED_IN revalidation", async () => {
    window.localStorage.clear();
    const session = { user: { id: "same-user", email: "same@example.test", user_metadata: {} } };
    const context = { userId: "same-user", workspace: { id: "org", name: "Team" }, membership: { role: "manager", status: "active", allLocations: true }, permissions: ["workspace.read"], onboarding: { status: "complete" }, locationScope: { allLocations: true, locationIds: [] } };
    supabaseMock.getSession.mockResolvedValue({ data: { session }, error: null } as never);
    supabaseMock.resolveWorkspaceContext.mockResolvedValue(context);
    let listener: (event: string, session: unknown) => void = () => {};
    supabaseMock.onAuthStateChange.mockImplementation((callback) => { listener = callback; return { data: { subscription: { unsubscribe: supabaseMock.unsubscribe } } }; });
    function Draft() {
      const { ready, authenticated } = useAuth();
      return ready && authenticated ? <input aria-label="Decision note" defaultValue="" /> : <p>Reloading workspace</p>;
    }
    render(<AuthProvider><Draft /></AuthProvider>);
    const input = await screen.findByLabelText("Decision note");
    fireEvent.change(input, { target: { value: "Keep this manager note" } });
    let finish!: (value: unknown) => void;
    supabaseMock.resolveWorkspaceContext.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await act(async () => { listener("SIGNED_IN", session); });
    expect(screen.getByLabelText("Decision note")).toBe(input);
    expect((input as HTMLInputElement).value).toBe("Keep this manager note");
    await act(async () => { finish(context); });
    expect(screen.getByLabelText("Decision note")).toBe(input);
    expect((input as HTMLInputElement).value).toBe("Keep this manager note");
    await act(async () => { listener("SIGNED_OUT", null); });
    expect(screen.queryByLabelText("Decision note")).not.toBe(input);
  });

});
