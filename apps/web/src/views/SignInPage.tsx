import type { WorkspaceRole } from "@newfork/shared";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { hubPath } from "../auth/resolveLanding";
import { sessionExpiredStorageKey } from "../lib/supabase";
import { PreBizFrame } from "../shell/prebiz/PreBiz";

export function SignInPage() {
  const {
    authenticated,
    context,
    developmentIdentityAllowed,
    error,
    signIn,
    signUp,
    signInForDevelopment,
    supabaseConfigured,
  } = useAuth();
  const [role, setRole] = useState<WorkspaceRole>("manager");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const requestedDestination =
    (location.state as { from?: string } | null)?.from ?? "/app";
  const destination = safeSignInDestination(requestedDestination);
  const inviteFlow = isInviteAcceptDestination(destination);
  const [creatingAccount, setCreatingAccount] = useState(inviteFlow);
  // Set when the server ended the session; the next sign-in clears it.
  const [sessionExpired] = useState(
    () => window.sessionStorage.getItem(sessionExpiredStorageKey) === "1",
  );

  if (context) return <Navigate to={destination} replace />;
  if (authenticated && !error)
    return (
      <Navigate to={inviteFlow ? destination : hubPath} replace />
    );

  const handleSupabaseSignIn = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    const ownerDisplayName =
      creatingAccount && !inviteFlow ? fullName.trim() : undefined;
    if (creatingAccount && !inviteFlow && !ownerDisplayName) return;
    setSubmitting(true);
    const signedIn = creatingAccount
      ? await signUp(email, password, ownerDisplayName)
      : await signIn(email, password);
    setSubmitting(false);
    if (signedIn) navigate(destination, { replace: true });
  };

  const handleSignIn = (): void => {
    signInForDevelopment(role);
    navigate(destination, { replace: true });
  };

  return (
    <PreBizFrame
      narrow
      titleId="sign-in-title"
      title={
        creatingAccount
          ? inviteFlow
            ? "Create your employee account"
            : "Create your workspace account"
          : "Sign in"
      }
      description={
        !supabaseConfigured
          ? "Sign-in is unavailable in this browser session."
          : sessionExpired
            ? "Your session ended. Sign in again to pick up where you left off."
            : creatingAccount
              ? inviteFlow
                ? "Your email and a password of at least eight characters."
                : "You will name the workspace itself in the next step."
              : undefined
      }
    >
      {supabaseConfigured ? (
        <form className="sign-in-form" onSubmit={handleSupabaseSignIn}>
          {creatingAccount && !inviteFlow ? (
            <div className="onboarding-field">
              <label htmlFor="full-name">Full name</label>
              <input
                id="full-name"
                autoComplete="name"
                value={fullName}
                maxLength={100}
                onChange={(event) => setFullName(event.target.value)}
                required
              />
            </div>
          ) : null}
          <div className="onboarding-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div className="onboarding-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              minLength={8}
              autoComplete={creatingAccount ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="pb-stack">
            <button
              type="submit"
              className="pb-btn pb-btn-primary pb-btn-block"
              disabled={
                submitting ||
                (creatingAccount && !inviteFlow && fullName.trim().length === 0)
              }
            >
              {submitting
                ? "Please wait"
                : creatingAccount
                  ? "Create account"
                  : "Sign in"}
            </button>
            {/* The second way off this screen, so it is never the green one. */}
            <button
              className="pb-btn pb-btn-secondary pb-btn-block"
              type="button"
              onClick={() => setCreatingAccount((value) => !value)}
            >
              {creatingAccount
                ? "I already have an account"
                : inviteFlow
                  ? "Create a new account"
                  : "Create a workspace account"}
            </button>
          </div>
        </form>
      ) : null}
      {developmentIdentityAllowed ? (
        <div className="development-access">
          <p>Development fallback</p>
          <div className="onboarding-field">
            <label htmlFor="development-role">Workspace role</label>
            <select
              id="development-role"
              value={role}
              onChange={(event) => setRole(event.target.value as WorkspaceRole)}
            >
              <option value="owner">Owner</option>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="employee">Employee</option>
            </select>
          </div>
          <button
            type="button"
            className="pb-btn pb-btn-secondary"
            onClick={handleSignIn}
          >
            Use development identity
          </button>
        </div>
      ) : null}
      <nav className="sign-in-trust-links" aria-label="Trust and legal">
        <Link to="/privacy">Privacy</Link>
        <Link to="/terms">Terms</Link>
        <Link to="/accessibility">Accessibility</Link>
        <Link to="/contact">Contact</Link>
      </nav>
    </PreBizFrame>
  );
}

function safeSignInDestination(destination: string): string {
  if (!destination.startsWith("/") || destination.startsWith("//"))
    return "/app";
  try {
    const parsed = new URL(destination, "http://newfork.local");
    if (parsed.origin !== "http://newfork.local") return "/app";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/app";
  }
}

function isInviteAcceptDestination(destination: string): boolean {
  try {
    return (
      new URL(destination, "http://newfork.local").pathname === "/invite/accept"
    );
  } catch {
    return false;
  }
}
