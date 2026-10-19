import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";
import { invitationPromptAnswered, markInvitationPromptAnswered } from "./invitation-prompt";

const supabaseMock = vi.hoisted(() => ({
  clearTabWorkspaceId: vi.fn(),
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
  signUp: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock("../lib/supabase", () => ({
  accountProfileSchema: undefined,
  activeWorkspaceContextSchema: undefined,
  clearTabWorkspaceId: supabaseMock.clearTabWorkspaceId,
  ensureSessionAlive: supabaseMock.ensureSessionAlive,
  invitationsCheckedStorageKey: "newfork.invitationsChecked",
  sessionExpiredStorageKey: "newfork.sessionExpired",
  getTabWorkspaceId: supabaseMock.getTabWorkspaceId,
  loadAccountProfile: supabaseMock.loadAccountProfile,
  resolveWorkspaceContext: supabaseMock.resolveWorkspaceContext,
  saveAccountProfile: supabaseMock.saveAccountProfile,
  supabaseClient: {
    auth: {
      getSession: supabaseMock.getSession,
      onAuthStateChange: supabaseMock.onAuthStateChange,
      signOut: supabaseMock.signOut,
      signUp: supabaseMock.signUp,
    },
  },
}));

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

describe("AuthProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
    supabaseMock.clearTabWorkspaceId.mockClear();
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

  it("keeps a signed-in account without a workspace when no workspace resolves", async () => {
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

  // BL-503: a number from outside the US is refused when typed; BL-969: the
  // saved one, a US number in E.164, stays when another part changes.
  describe("an account phone", () => {
    async function signedInWith(phone: string) {
      supabaseMock.getSession.mockResolvedValue({
        data: { session: { user: { id: "new-user", email: "new-user@example.test", user_metadata: {} } } },
        error: null,
      } as never);
      supabaseMock.resolveWorkspaceContext.mockRejectedValue(new Error("Invalid session or membership"));
      supabaseMock.loadAccountProfile.mockResolvedValue({
        userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
        email: "new-user@example.test",
        displayName: "New User",
        phone,
        theme: "system",
      });
      supabaseMock.saveAccountProfile.mockResolvedValue(undefined);
      const auth: { update: ReturnType<typeof useAuth>["updateAccount"] | null } = { update: null };
      function Probe() {
        const { account, updateAccount } = useAuth();
        auth.update = account ? updateAccount : null;
        return null;
      }
      render(<AuthProvider><Probe /></AuthProvider>);
      await waitFor(() => expect(auth.update).not.toBeNull());
      return auth.update!;
    }

    it("is refused when typed as a new number", async () => {
      const update = await signedInWith("+13105550100");
      await expect(update("New User", "system", "+44 20 7946 0958")).rejects.toThrow();
      await expect(update("New User", "system", "(+44) 20 7946 0958")).rejects.toThrow();
      expect(supabaseMock.saveAccountProfile).not.toHaveBeenCalled();
    });

    it("stays when another part of the account changes", async () => {
      const update = await signedInWith("+13105550100");
      await act(async () => {
        await update("New User", "dark");
      });
      expect(supabaseMock.saveAccountProfile).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ theme: "dark", phone: "+13105550100" }),
      );
    });
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
          access: { employee: false, management: "owner" },
          status: "active",
        },
        permissions: ["workspace.read"],
        onboarding: { status: "complete", currentStep: 2, revision: 1 },
        documentAccess: { restricted: false },
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
    const context = { userId: "same-user", workspace: { id: "org", name: "Team" }, membership: { access: { employee: false, management: "manager" }, status: "active",}, permissions: ["workspace.read"], onboarding: { status: "complete", currentStep: 2, revision: 1 }, documentAccess: { restricted: false }, locationScope: { allLocations: true, locationIds: [] } };
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

  // BL-271: a shared tablet must not show the previous person's cached answers.
  describe("drops the previous person's cached answers", () => {
    const contextFor = (userId: string) => ({ userId, workspace: { id: "org", name: "Team" }, membership: { access: { employee: true, management: null }, status: "active",}, permissions: ["workspace.read"], onboarding: { status: "complete", currentStep: 2, revision: 1 }, documentAccess: { restricted: false }, locationScope: { allLocations: true, locationIds: [] } });
    const sessionFor = (userId: string) => ({ user: { id: userId, email: `${userId}@example.test`, user_metadata: {} } });

    function seedCache(): QueryClient {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      queryClient.setQueryData(["account-employment-records"], [{ phone: "+1 555 0100" }]);
      queryClient.setQueryData(["account-workspace-identities"], [{ legalName: "Ayşe Demir" }]);
      return queryClient;
    }

    async function renderSignedIn(queryClient: QueryClient) {
      supabaseMock.getSession.mockResolvedValue({ data: { session: sessionFor("ayse") }, error: null } as never);
      supabaseMock.resolveWorkspaceContext.mockImplementation(async () => contextFor("ayse"));
      let listener: (event: string, session: unknown) => void = () => {};
      supabaseMock.onAuthStateChange.mockImplementation((callback) => { listener = callback; return { data: { subscription: { unsubscribe: supabaseMock.unsubscribe } } }; });
      let auth: ReturnType<typeof useAuth> | null = null;
      function Probe() { auth = useAuth(); return null; }
      render(<AuthProvider queryClient={queryClient}><Probe /></AuthProvider>);
      await waitFor(() => expect(auth?.context?.userId).toBe("ayse"));
      return { emit: (event: string, session: unknown) => listener(event, session), signOut: () => auth!.signOut() };
    }

    it("on sign out", async () => {
      const queryClient = seedCache();
      const { signOut } = await renderSignedIn(queryClient);
      await act(async () => { await signOut(); });
      expect(queryClient.getQueryData(["account-employment-records"])).toBeUndefined();
      expect(queryClient.getQueryData(["account-workspace-identities"])).toBeUndefined();
    });

    it("when another tab signs out", async () => {
      const queryClient = seedCache();
      const { emit } = await renderSignedIn(queryClient);
      await act(async () => { emit("SIGNED_OUT", null); });
      expect(queryClient.getQueryData(["account-employment-records"])).toBeUndefined();
    });

    it("when a different person signs in", async () => {
      const queryClient = seedCache();
      const { emit } = await renderSignedIn(queryClient);
      supabaseMock.resolveWorkspaceContext.mockImplementation(async () => contextFor("mehmet"));
      await act(async () => { emit("SIGNED_IN", sessionFor("mehmet")); });
      expect(queryClient.getQueryData(["account-employment-records"])).toBeUndefined();
      expect(queryClient.getQueryData(["account-workspace-identities"])).toBeUndefined();
    });

    // BL-624: "Not now" on the invitation screen holds for one person's open;
    // whoever signs in next on this tab is asked again.
    it("and forgets the invitation answer on sign out", async () => {
      const queryClient = seedCache();
      const { signOut } = await renderSignedIn(queryClient);
      markInvitationPromptAnswered("ayse");
      await act(async () => { await signOut(); });
      expect(invitationPromptAnswered("ayse")).toBe(false);
    });

    it("and forgets the invitation answer when a different person signs in", async () => {
      const queryClient = seedCache();
      const { emit } = await renderSignedIn(queryClient);
      markInvitationPromptAnswered("ayse");
      supabaseMock.resolveWorkspaceContext.mockImplementation(async () => contextFor("mehmet"));
      await act(async () => { emit("SIGNED_IN", sessionFor("mehmet")); });
      expect(invitationPromptAnswered("ayse")).toBe(false);
    });

    it("but keeps them when the same person's session refreshes", async () => {
      const queryClient = seedCache();
      const { emit } = await renderSignedIn(queryClient);
      await act(async () => { emit("TOKEN_REFRESHED", sessionFor("ayse")); });
      expect(queryClient.getQueryData(["account-employment-records"])).toEqual([{ phone: "+1 555 0100" }]);
    });
  });
});

describe("AuthProvider sign-up (SEC-003 #9)", () => {
  async function signUpThrough(): Promise<ReturnType<typeof useAuth>["signUp"]> {
    let captured: ReturnType<typeof useAuth> | null = null;
    function Probe() {
      captured = useAuth();
      return null;
    }
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(captured?.ready).toBe(true));
    return captured!.signUp;
  }

  beforeEach(() => {
    supabaseMock.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    supabaseMock.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: supabaseMock.unsubscribe } },
    });
    supabaseMock.resolveWorkspaceContext.mockResolvedValue(null);
    supabaseMock.signUp.mockReset();
    supabaseMock.saveAccountProfile.mockClear();
  });

  it("says the email must be confirmed when sign-up returns no session", async () => {
    supabaseMock.signUp.mockResolvedValue({
      data: { user: { id: "new-user" }, session: null },
      error: null,
    });
    const signUp = await signUpThrough();

    await expect(signUp("new@example.test", "long-password")).resolves.toBe(
      "email_confirmation_required",
    );
    // Nothing is written for an account that cannot sign in yet.
    expect(supabaseMock.signUp).toHaveBeenCalledWith({
      email: "new@example.test",
      password: "long-password",
    });
    expect(supabaseMock.saveAccountProfile).not.toHaveBeenCalled();
  });

  it("says signed_in when sign-up returns a session", async () => {
    supabaseMock.signUp.mockResolvedValue({
      data: {
        user: { id: "new-user" },
        session: { user: { id: "new-user", email: "new@example.test", user_metadata: {} } },
      },
      error: null,
    });
    const signUp = await signUpThrough();

    await expect(signUp("new@example.test", "long-password")).resolves.toBe(
      "signed_in",
    );
  });

  it("answers false when sign-up is refused", async () => {
    supabaseMock.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "User already registered" },
    });
    const signUp = await signUpThrough();

    await expect(signUp("new@example.test", "long-password")).resolves.toBe(
      false,
    );
  });
});
