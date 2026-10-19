import {
  accountProfileSchema,
  normalizeAccountPhone,
  type AccountProfile,
  type ActiveWorkspaceContext,
  type ThemePreference,
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
  clearTabWorkspaceId,
  ensureSessionAlive,
  loadAccountProfile,
  sessionExpiredStorageKey,
  resolveWorkspaceContext,
  saveAccountProfile,
  supabaseClient,
} from "../lib/supabase";
import { forgetInvitationPrompt } from "./invitation-prompt";
import { clearTenantQueriesForOrganizationSwitch } from "./tenant-query-cache";
import { pushServer } from "../phone-alerts/channels-data";
import { dropPhoneAlertsHere, turnOffPhoneAlerts } from "../phone-alerts/push-client";

interface AuthContextValue {
  readonly account: AccountProfile | null;
  readonly authenticated: boolean;
  readonly context: ActiveWorkspaceContext | null;
  readonly error: string | null;
  readonly ready: boolean;
  readonly supabaseConfigured: boolean;
  readonly signIn: (email: string, password: string) => Promise<boolean>;
  /**
   * `false` when sign-up was refused (the reason is in `error`);
   * `"email_confirmation_required"` when the account exists but has no session
   * until its email is confirmed; `"signed_in"` otherwise.
   */
  readonly signUp: (email: string, password: string) => Promise<SignUpResult>;
  readonly refresh: () => Promise<ActiveWorkspaceContext | null>;
  readonly signOut: () => Promise<void>;
  readonly updateAccount: (
    displayName: string,
    theme: ThemePreference,
    phone?: string | null,
    changes?: Partial<
      Pick<
        AccountProfile,
        "avatarUrl" | "timeFormat" | "dateFormat"
      >
    >,
  ) => Promise<void>;
}

export type SignUpResult = false | "signed_in" | "email_confirmation_required";

const AuthContext = createContext<AuthContextValue | null>(null);

function contextFingerprint(context: ActiveWorkspaceContext | null): string {
  if (!context) return "none";
  return JSON.stringify({
    workspaceId: context.workspace.id,
    membershipId: context.membership.id,
    access: context.membership.access,
    status: context.membership.status,
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
  // Whose answers the query cache holds; survives failed resolutions.
  const cacheOwnerRef = useRef<string | null>(null);

  // Every cached answer belongs to one person. On a shared tablet the next
  // login must not see the previous person's phone, invitations or schedule.
  const clearAccountCache = useCallback((): void => {
    queryClient?.clear();
    // Whoever comes next is asked about their own invitations (BL-624).
    forgetInvitationPrompt();
    cacheOwnerRef.current = null;
  }, [queryClient]);

  const resetAccountScope = useCallback((): void => {
    window.sessionStorage.removeItem(sessionExpiredStorageKey);
    clearAccountCache();
  }, [clearAccountCache]);

  const resolveAuthenticatedSession = useCallback(
    async (
      activeSession: Session,
      options: { readonly silent?: boolean } = {},
    ): Promise<ActiveWorkspaceContext | null> => {
      if (!supabaseClient) return null;
      if (!options.silent) setReady(false);
      if (cacheOwnerRef.current !== activeSession.user.id) {
        if (cacheOwnerRef.current !== null) clearAccountCache();
        cacheOwnerRef.current = activeSession.user.id;
      }
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
          // The API answers a revoked session the same way as "no workspace".
          if (!(await ensureSessionAlive(supabaseClient))) return null;
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
    [clearAccountCache, queryClient],
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
          setReady(true);
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
          // The session ended without a sign-out here (it expired, or was signed out elsewhere): this browser
          // stops taking the last person's phone alerts (BILDIRIM-15).
          void dropPhoneAlertsHere();
          clearAccountCache();
          resolvedUserIdRef.current = null;
          setAccount(null);
          setContext(null);
          contextFingerprintRef.current = "none";
          setReady(true);
        }
      },
    );

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [clearAccountCache, resolveAuthenticatedSession]);

  const refresh =
    useCallback(async (): Promise<ActiveWorkspaceContext | null> => {
      if (!supabaseClient) return null;
      const activeSession =
        session ?? (await supabaseClient.auth.getSession()).data.session;
      if (!activeSession) {
        setReady(true);
        return null;
      }
      return resolveAuthenticatedSession(activeSession, { silent: true });
    }, [resolveAuthenticatedSession, session]);

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

  const signIn = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      if (!supabaseClient) return false;
      setError(null);
      clearTabWorkspaceId();
      resetAccountScope();
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
    [resetAccountScope, resolveAuthenticatedSession],
  );

  const signUp = useCallback(
    async (email: string, password: string): Promise<SignUpResult> => {
      if (!supabaseClient) return false;
      setError(null);
      clearTabWorkspaceId();
      resetAccountScope();
      const { data, error: signUpError } = await supabaseClient.auth.signUp({
        email,
        password,
      });
      if (signUpError) {
        setError(signUpError.message);
        return false;
      }
      if (!data.session) return "email_confirmation_required";
      setSession(data.session);
      await resolveAuthenticatedSession(data.session);
      return "signed_in";
    },
    [resetAccountScope, resolveAuthenticatedSession],
  );

  const signOut = useCallback(async (): Promise<void> => {
    // This device stops taking this person's phone alerts first, while the session can still say so
    // (BILDIRIM-15): whoever signs in here next never sees them.
    if (supabaseClient && session) await turnOffPhoneAlerts(pushServer).catch(() => undefined);
    if (supabaseClient && session)
      await supabaseClient.auth.signOut({ scope: "local" });
    clearTabWorkspaceId();
    resetAccountScope();
    resolvedUserIdRef.current = null;
    setSession(null);
    setContext(null);
    contextFingerprintRef.current = "none";
    setAccount(null);
    setError(null);
    setReady(true);
  }, [resetAccountScope, session]);

  const updateAccount = useCallback(
    async (
      displayName: string,
      theme: ThemePreference,
      phone: string | null = account?.phone ?? null,
      changes: Partial<
        Pick<
          AccountProfile,
          "avatarUrl" | "timeFormat" | "dateFormat"
        >
      > = {},
    ): Promise<void> => {
      if (!account) throw new Error("Account is not available");
      const updated = accountProfileSchema.parse({
        ...account,
        displayName,
        phone: normalizeAccountPhone(phone),
        theme,
        ...changes,
      });
      if (!supabaseClient) throw new Error("Account storage is not configured");
      await saveAccountProfile(supabaseClient, updated);
      setAccount(updated);
    },
    [account],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      account,
      authenticated: session !== null,
      context,
      error,
      ready,
      refresh,
      signIn,
      signUp,
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
