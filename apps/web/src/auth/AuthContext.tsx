import {
  accountProfileSchema,
  activeWorkspaceContextSchema,
  permissionsForRole,
  type AccountProfile,
  type ActiveWorkspaceContext,
  type ThemePreference,
  type WorkspaceRole,
} from "@newfork/shared";
import type { QueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  applyThemePreference,
  clearTabWorkspaceId,
  developmentBearerToken,
  developmentIdentityRoleStorageKey,
  developmentIdentityAllowed,
  getTabWorkspaceId,
  loadAccountProfile,
  resolveWorkspaceContext,
  saveAccountProfile,
  supabaseClient,
} from "../lib/supabase";
import { clearTenantQueriesForOrganizationSwitch } from "./tenant-query-cache";

const developmentIds = {
  userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
  workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
  membershipId: "bd6b757b-c9ad-4e47-a47e-0a90a43bc0e4",
} as const;
const developmentAccountStorageKey = "newfork.development.account";

function storedDevelopmentRole(): WorkspaceRole | null {
  if (!developmentIdentityAllowed || typeof window === "undefined") return null;
  const role = window.localStorage.getItem(developmentIdentityRoleStorageKey);
  return role === "owner" ||
    role === "admin" ||
    role === "manager" ||
    role === "employee"
    ? role
    : null;
}

function persistDevelopmentRole(role: WorkspaceRole): void {
  if (!developmentIdentityAllowed || typeof window === "undefined") return;
  window.localStorage.setItem(developmentIdentityRoleStorageKey, role);
}

function defaultDevelopmentAccount(): AccountProfile {
  return accountProfileSchema.parse({
    userId: developmentIds.userId,
    email: "developer@newfork.test",
    displayName: "Development user",
    phone: null,
    theme: "system",
  });
}

function loadDevelopmentAccount(): AccountProfile {
  if (!developmentIdentityAllowed || typeof window === "undefined") {
    return defaultDevelopmentAccount();
  }
  const raw = window.localStorage.getItem(developmentAccountStorageKey);
  if (!raw) return defaultDevelopmentAccount();
  try {
    const stored = JSON.parse(raw) as Partial<AccountProfile>;
    return accountProfileSchema.parse({
      ...defaultDevelopmentAccount(),
      displayName: stored.displayName,
      phone: stored.phone,
      theme: stored.theme,
    });
  } catch {
    window.localStorage.removeItem(developmentAccountStorageKey);
    return defaultDevelopmentAccount();
  }
}

function persistDevelopmentAccount(account: AccountProfile): void {
  if (!developmentIdentityAllowed || typeof window === "undefined") return;
  window.localStorage.setItem(
    developmentAccountStorageKey,
    JSON.stringify({
      displayName: account.displayName,
      phone: account.phone,
      theme: account.theme,
    }),
  );
}

interface AuthContextValue {
  readonly account: AccountProfile | null;
  readonly authenticated: boolean;
  readonly context: ActiveWorkspaceContext | null;
  readonly error: string | null;
  readonly ready: boolean;
  readonly supabaseConfigured: boolean;
  readonly signIn: (email: string, password: string) => Promise<boolean>;
  readonly signUp: (
    email: string,
    password: string,
    displayName?: string,
  ) => Promise<boolean>;
  readonly signInForDevelopment: (role: WorkspaceRole) => void;
  readonly developmentIdentityAllowed: boolean;
  readonly refresh: () => Promise<ActiveWorkspaceContext | null>;
  readonly signOut: () => Promise<void>;
  readonly updateAccount: (
    displayName: string,
    theme: ThemePreference,
    phone?: string | null,
  ) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function contextFingerprint(context: ActiveWorkspaceContext | null): string {
  if (!context) return "none";
  return JSON.stringify({
    workspaceId: context.workspace.id,
    membershipId: context.membership.id,
    role: context.membership.role,
    status: context.membership.status,
    allLocations: context.membership.allLocations,
    locationIds: [...context.locationScope.locationIds].sort(),
    permissions: [...context.permissions].sort(),
  });
}

function isNoWorkspaceContextError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return (
    message === "Invalid session or membership" ||
    message === "Workspace not found"
  );
}

export function AuthProvider({
  children,
  queryClient,
}: {
  readonly children: ReactNode;
  readonly queryClient?: QueryClient;
}) {
  const [account, setAccount] = useState<AccountProfile | null>(null);
  const [context, setContext] = useState<ActiveWorkspaceContext | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(supabaseClient === null);
  const [error, setError] = useState<string | null>(null);
  const contextFingerprintRef = useRef("none");
  const resolvedUserIdRef = useRef<string | null>(null);

  const applyDevelopmentIdentity = useCallback(
    (role: WorkspaceRole): ActiveWorkspaceContext => {
      const workspaceId = getTabWorkspaceId() ?? developmentIds.workspaceId;
      const isDefaultWorkspace = workspaceId === developmentIds.workspaceId;
      const developmentContext = activeWorkspaceContextSchema.parse({
        userId: developmentIds.userId,
        workspace: {
          id: workspaceId,
          name: isDefaultWorkspace ? "Meyhouse" : "Development workspace",
          logo_url: null,
          logo_file_name: null,
          logo_updated_at: null,
          schedule_logo_placement: { scale: 1, offset_x: 0, offset_y: 0 },
        },
        membership: {
          id: developmentIds.membershipId,
          userId: developmentIds.userId,
          workspaceId,
          role,
          status: "active",
          allLocations: true,
        },
        permissions: permissionsForRole(role),
        onboarding: { status: "complete", currentStep: 2 },
        locationScope: { allLocations: true, locationIds: [] },
      });
      setContext(developmentContext);
      contextFingerprintRef.current = contextFingerprint(developmentContext);
      setAccount(loadDevelopmentAccount());
      setError(null);
      setReady(true);
      return developmentContext;
    },
    [],
  );

  const resolveAuthenticatedSession = useCallback(
    async (
      activeSession: Session,
      options: { readonly silent?: boolean } = {},
    ): Promise<ActiveWorkspaceContext | null> => {
      if (!supabaseClient) return null;
      const developmentRole = storedDevelopmentRole();
      if (developmentRole) return applyDevelopmentIdentity(developmentRole);
      if (!options.silent) setReady(false);
      try {
        const [resolvedContext, resolvedAccount] = await Promise.all([
          resolveWorkspaceContext(supabaseClient),
          loadAccountProfile(supabaseClient, activeSession.user),
        ]);
        const nextContextFingerprint = contextFingerprint(resolvedContext);
        if (
          queryClient &&
          contextFingerprintRef.current !== nextContextFingerprint
        ) {
          await clearTenantQueriesForOrganizationSwitch(queryClient);
        }
        contextFingerprintRef.current = nextContextFingerprint;
        resolvedUserIdRef.current = activeSession.user.id;
        setContext(resolvedContext);
        setAccount(resolvedAccount);
        setError(null);
        return resolvedContext;
      } catch (resolutionError: unknown) {
        if (isNoWorkspaceContextError(resolutionError)) {
          try {
            const resolvedAccount = await loadAccountProfile(
              supabaseClient,
              activeSession.user,
            );
            if (
              queryClient &&
              contextFingerprintRef.current !== "none"
            ) {
              await clearTenantQueriesForOrganizationSwitch(queryClient);
            }
            resolvedUserIdRef.current = activeSession.user.id;
            setAccount(resolvedAccount);
            setContext(null);
            contextFingerprintRef.current = "none";
            setError(null);
            return null;
          } catch {
            // Fall through to the ordinary error path if the session itself is invalid.
          }
        }
        const role = storedDevelopmentRole();
        if (developmentIdentityAllowed && role) {
          persistDevelopmentRole(role);
          void supabaseClient.auth.signOut({ scope: "local" });
          setSession(null);
          return applyDevelopmentIdentity(role);
        }
        resolvedUserIdRef.current = null;
        setError(
          resolutionError instanceof Error
            ? resolutionError.message
            : "Account unavailable",
        );
        setContext(null);
        contextFingerprintRef.current = "none";
        return null;
      } finally {
        setReady(true);
      }
    },
    [applyDevelopmentIdentity, queryClient],
  );

  useEffect(() => {
    if (!supabaseClient) return;

    let active = true;
    void supabaseClient.auth
      .getSession()
      .then(({ data, error: sessionError }) => {
        if (!active) return;
        if (sessionError) setError(sessionError.message);
        setSession(data.session);
        if (data.session) {
          void resolveAuthenticatedSession(data.session);
        } else {
          const role = storedDevelopmentRole();
          if (role) {
            applyDevelopmentIdentity(role);
          } else {
            setReady(true);
          }
        }
      });

    const { data: subscription } = supabaseClient.auth.onAuthStateChange(
      (_event, nextSession) => {
        // Supabase can emit SIGNED_IN again on tab focus and token refresh.
        // Revalidate the same account without unmounting in-progress forms.
        const silent = Boolean(nextSession && resolvedUserIdRef.current === nextSession.user.id);
        if (!silent) setReady(false);
        setSession(nextSession);
        if (nextSession) {
          void resolveAuthenticatedSession(nextSession, { silent });
        } else {
          resolvedUserIdRef.current = null;
          const role = storedDevelopmentRole();
          if (role) {
            applyDevelopmentIdentity(role);
          } else {
            setAccount(null);
            setContext(null);
            contextFingerprintRef.current = "none";
            setReady(true);
          }
        }
      },
    );

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [applyDevelopmentIdentity, resolveAuthenticatedSession]);

  const refresh =
    useCallback(async (): Promise<ActiveWorkspaceContext | null> => {
      if (!supabaseClient) return null;
      const developmentRole = storedDevelopmentRole();
      if (developmentRole) return applyDevelopmentIdentity(developmentRole);
      const activeSession =
        session ?? (await supabaseClient.auth.getSession()).data.session;
      if (!activeSession) {
        setReady(true);
        return null;
      }
      return resolveAuthenticatedSession(activeSession, { silent: true });
    }, [applyDevelopmentIdentity, resolveAuthenticatedSession, session]);

  useEffect(() => {
    if (!supabaseClient) return;
    const revalidateVisibleSession = () => {
      if (document.visibilityState === "hidden") return;
      void refresh();
    };
    window.addEventListener("focus", revalidateVisibleSession);
    document.addEventListener("visibilitychange", revalidateVisibleSession);
    return () => {
      window.removeEventListener("focus", revalidateVisibleSession);
      document.removeEventListener(
        "visibilitychange",
        revalidateVisibleSession,
      );
    };
  }, [refresh]);

  useEffect(() => {
    if (account) applyThemePreference(account.theme);
  }, [account]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      if (!supabaseClient) return false;
      setError(null);
      clearTabWorkspaceId();
      if (developmentIdentityAllowed)
        window.localStorage.removeItem(developmentIdentityRoleStorageKey);
      const { data, error: signInError } =
        await supabaseClient.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(signInError.message);
        return false;
      }
      if (data.session) {
        setSession(data.session);
        await resolveAuthenticatedSession(data.session);
        return true;
      }
      return true;
    },
    [resolveAuthenticatedSession],
  );

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      displayName?: string,
    ): Promise<boolean> => {
      if (!supabaseClient) return false;
      setError(null);
      clearTabWorkspaceId();
      if (developmentIdentityAllowed)
        window.localStorage.removeItem(developmentIdentityRoleStorageKey);
      const trimmedDisplayName = displayName?.trim();
      const { data, error: signUpError } = await supabaseClient.auth.signUp({
        email,
        password,
        options: trimmedDisplayName
          ? { data: { display_name: trimmedDisplayName } }
          : undefined,
      });
      if (signUpError) {
        setError(signUpError.message);
        return false;
      }
      if (data.session) {
        if (trimmedDisplayName) {
          await saveAccountProfile(
            supabaseClient,
            accountProfileSchema.parse({
              userId: data.session.user.id,
              email: data.session.user.email ?? email,
              displayName: trimmedDisplayName,
              phone: null,
              theme: "system",
            }),
          );
        }
        setSession(data.session);
        await resolveAuthenticatedSession(data.session);
      }
      return true;
    },
    [resolveAuthenticatedSession],
  );

  const signInForDevelopment = useCallback((role: WorkspaceRole): void => {
    if (!developmentIdentityAllowed) return;
    clearTabWorkspaceId();
    persistDevelopmentRole(role);
    applyDevelopmentIdentity(role);
  }, [applyDevelopmentIdentity]);

  const signOut = useCallback(async (): Promise<void> => {
    if (supabaseClient && session) await supabaseClient.auth.signOut();
    clearTabWorkspaceId();
    window.localStorage.removeItem(developmentIdentityRoleStorageKey);
    window.localStorage.removeItem(developmentAccountStorageKey);
    resolvedUserIdRef.current = null;
    setSession(null);
    setContext(null);
    contextFingerprintRef.current = "none";
    setAccount(null);
    setError(null);
    setReady(true);
  }, [session]);

  const updateAccount = useCallback(
    async (
      displayName: string,
      theme: ThemePreference,
      phone: string | null = account?.phone ?? null,
    ): Promise<void> => {
      if (!account) throw new Error("Account is not available");
      const updated = accountProfileSchema.parse({
        ...account,
        displayName,
        phone: phone && phone.trim() ? phone : null,
        theme,
      });
      if (supabaseClient && !developmentBearerToken()) {
        await saveAccountProfile(supabaseClient, updated);
      } else if (!developmentIdentityAllowed) {
        throw new Error("Account storage is not configured");
      } else {
        persistDevelopmentAccount(updated);
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
