import type { WorkspaceRole } from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { sessionExpiredStorageKey } from "../lib/supabase";

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
      <Navigate to={inviteFlow ? destination : "/invitations/pending"} replace />
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
    <main className="sign-in-page">
      <section className="sign-in-panel" aria-labelledby="sign-in-title">
        <p className="product-mark">NEWFORK</p>
        <h1 id="sign-in-title">
          {creatingAccount
            ? inviteFlow
              ? "Create your employee account"
              : "Create your business account"
            : "Sign in to your workspace"}
        </h1>
        <p className="muted">
          {!supabaseConfigured
            ? "Supabase is not configured for this browser session."
            : sessionExpired
              ? "Your session ended. Sign in again to continue."
              : "Sign in with your email and password."}
        </p>
        {supabaseConfigured ? (
          <form onSubmit={handleSupabaseSignIn}>
            {creatingAccount && !inviteFlow ? (
              <>
                <label htmlFor="full-name">Full name</label>
                <input
                  id="full-name"
                  autoComplete="name"
                  value={fullName}
                  maxLength={100}
                  onChange={(event) => setFullName(event.target.value)}
                  required
                />
              </>
            ) : null}
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              minLength={8}
              autoComplete={
                creatingAccount ? "new-password" : "current-password"
              }
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            <Button
              type="submit"
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
            </Button>
            <button
              className="auth-mode-button"
              type="button"
              onClick={() => setCreatingAccount((value) => !value)}
            >
              {creatingAccount
                ? "I already have an account"
                : inviteFlow
                  ? "Create a new account"
                  : "Create a business account"}
            </button>
          </form>
        ) : null}
        {developmentIdentityAllowed ? (
          <div className="development-access">
            <p>Development fallback</p>
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
            <Button className="secondary-button" onClick={handleSignIn}>
              Use development identity
            </Button>
          </div>
        ) : null}
        <nav className="sign-in-trust-links" aria-label="Trust and legal">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/accessibility">Accessibility</Link>
          <Link to="/contact">Contact</Link>
        </nav>
      </section>
    </main>
  );
}

function safeSignInDestination(destination: string): string {
  if (!destination.startsWith("/") || destination.startsWith("//")) return "/app";
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
    return new URL(destination, "http://newfork.local").pathname === "/invite/accept";
  } catch {
    return false;
  }
}
