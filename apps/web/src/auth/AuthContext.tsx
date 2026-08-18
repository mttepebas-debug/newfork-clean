import {
  accountProfileSchema,
  activeWorkspaceContextSchema,
  permissionsForRole,
  type AccountProfile,
  type ActiveWorkspaceContext,
  type ThemePreference,
  type WorkspaceRole,
} from "@newfork/shared";
import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  applyThemePreference,
  developmentIdentityAllowed,
  loadAccountProfile,
  resolveWorkspaceContext,
  saveAccountProfile,
  supabaseClient,
} from "../lib/supabase";

const developmentIds = {
  userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
  workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
  membershipId: "bd6b757b-c9ad-4e47-a47e-0a90a43bc0e4",
} as const;

interface AuthContextValue {
  readonly account: AccountProfile | null;
  readonly authenticated: boolean;
  readonly context: ActiveWorkspaceContext | null;
  readonly error: string | null;
  readonly ready: boolean;
  readonly supabaseConfigured: boolean;
  readonly signIn: (email: string, password: string) => Promise<boolean>;
  readonly signUp: (email: string, password: string) => Promise<boolean>;
  readonly signInForDevelopment: (role: WorkspaceRole) => void;
  readonly developmentIdentityAllowed: boolean;
  readonly refresh: () => Promise<void>;
  readonly signOut: () => Promise<void>;
  readonly updateAccount: (
    displayName: string,
    theme: ThemePreference,
  ) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [account, setAccount] = useState<AccountProfile | null>(null);
  const [context, setContext] = useState<ActiveWorkspaceContext | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(supabaseClient === null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabaseClient) return;

    let active = true;
    void supabaseClient.auth
      .getSession()
      .then(({ data, error: sessionError }) => {
        if (!active) return;
        if (sessionError) setError(sessionError.message);
        setSession(data.session);
        if (!data.session) setReady(true);
      });

    const { data: subscription } = supabaseClient.auth.onAuthStateChange(
      (_event, nextSession) => {
        setReady(false);
        setSession(nextSession);
        if (!nextSession) {
          setAccount(null);
          setContext(null);
          setReady(true);
        }
      },
    );

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    if (!supabaseClient || !session) return;
    try {
      const [resolvedContext, resolvedAccount] = await Promise.all([
        resolveWorkspaceContext(supabaseClient),
        loadAccountProfile(supabaseClient, session.user),
      ]);
      setContext(resolvedContext);
      setAccount(resolvedAccount);
      setError(null);
    } catch (resolutionError: unknown) {
      setError(
        resolutionError instanceof Error
          ? resolutionError.message
          : "Account unavailable",
      );
    } finally {
      setReady(true);
    }
  }, [session]);

  useEffect(() => {
    if (session) void refresh();
  }, [refresh, session]);

  useEffect(() => {
    if (account) applyThemePreference(account.theme);
  }, [account]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      if (!supabaseClient) return false;
      setError(null);
      const { error: signInError } =
        await supabaseClient.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(signInError.message);
        return false;
      }
      return true;
    },
    [],
  );

  const signUp = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      if (!supabaseClient) return false;
      setError(null);
      const { error: signUpError } = await supabaseClient.auth.signUp({
        email,
        password,
      });
      if (signUpError) {
        setError(signUpError.message);
        return false;
      }
      return true;
    },
    [],
  );

  const signInForDevelopment = useCallback((role: WorkspaceRole): void => {
    if (!developmentIdentityAllowed) return;
    setContext(
      activeWorkspaceContextSchema.parse({
        userId: developmentIds.userId,
        workspace: { id: developmentIds.workspaceId, name: "Meyhouse" },
        membership: {
          id: developmentIds.membershipId,
          userId: developmentIds.userId,
          workspaceId: developmentIds.workspaceId,
          role,
          status: "active",
          allLocations: true,
        },
        permissions: permissionsForRole(role),
        onboarding: { status: "complete", currentStep: 2 },
        locationScope: { allLocations: true, locationIds: [] },
      }),
    );
    setAccount(
      accountProfileSchema.parse({
        userId: developmentIds.userId,
        email: "developer@newfork.test",
        displayName: "Development user",
        theme: "system",
      }),
    );
    setError(null);
    setReady(true);
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    if (supabaseClient && session) await supabaseClient.auth.signOut();
    setSession(null);
    setContext(null);
    setAccount(null);
    setError(null);
    setReady(true);
  }, [session]);

  const updateAccount = useCallback(
    async (displayName: string, theme: ThemePreference): Promise<void> => {
      if (!account) throw new Error("Account is not available");
      const updated = accountProfileSchema.parse({
        ...account,
        displayName,
        theme,
      });
      if (supabaseClient) {
        await saveAccountProfile(supabaseClient, updated);
      } else if (!developmentIdentityAllowed) {
        throw new Error("Account storage is not configured");
      }
      setAccount(updated);
    },
    [account],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      account,
      authenticated:
        session !== null || (developmentIdentityAllowed && account !== null),
      context,
      developmentIdentityAllowed,
      error,
      ready,
      refresh,
      signIn,
      signUp,
      signInForDevelopment,
      signOut,
      supabaseConfigured: supabaseClient !== null,
      updateAccount,
    }),
    [
      account,
      context,
      error,
      ready,
      refresh,
      session,
      signIn,
      signUp,
      signInForDevelopment,
      signOut,
      updateAccount,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
