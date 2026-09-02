import type { WorkspaceRole } from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";

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
  const [email, setEmail] = useState("owner@newfork.test");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const requestedDestination =
    (location.state as { from?: string } | null)?.from ?? "/app/workspace";
  const destination =
    requestedDestination === "/account/workspaces"
      ? "/app/workspace"
      : requestedDestination;
  const inviteFlow = destination.startsWith("/invite/accept");
  const [creatingAccount, setCreatingAccount] = useState(inviteFlow);

  if (context) return <Navigate to={destination} replace />;
  if (authenticated)
    return (
      <Navigate to={inviteFlow ? destination : "/app/workspace"} replace />
    );

  const handleSupabaseSignIn = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setSubmitting(true);
    const signedIn = creatingAccount
      ? await signUp(email, password)
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
            ? "Create your employee account"
            : "Sign in to your workspace"}
        </h1>
        <p className="muted">
          {supabaseConfigured
            ? "Authenticate with the local Supabase workspace."
            : "Supabase is not configured for this browser session."}
        </p>
        {supabaseConfigured ? (
          <form onSubmit={handleSupabaseSignIn}>
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
            <Button type="submit" disabled={submitting}>
              {submitting
                ? "Please wait"
                : creatingAccount
                  ? "Create account"
                  : "Sign in"}
            </Button>
            {inviteFlow ? (
              <button
                className="auth-mode-button"
                type="button"
                onClick={() => setCreatingAccount((value) => !value)}
              >
                {creatingAccount
                  ? "I already have an account"
                  : "Create a new account"}
              </button>
            ) : null}
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
