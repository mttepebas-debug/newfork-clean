import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { hubPath } from "../auth/resolveLanding";
import { sessionExpiredStorageKey } from "../lib/supabase";
import { PreBizFrame } from "../shell/prebiz/PreBiz";
import { FieldNote } from "../shell/FieldNote";

export function SignInPage() {
  const {
    authenticated,
    context,
    error,
    signIn,
    signUp,
    supabaseConfigured,
  } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const requestedDestination =
    (location.state as { from?: string } | null)?.from ?? "/app";
  const destination = safeSignInDestination(requestedDestination);
  const inviteFlow = isInviteAcceptDestination(destination);
  const [creatingAccount, setCreatingAccount] = useState(inviteFlow);
  // The address a new account must confirm before it can sign in.
  const [confirmationSentTo, setConfirmationSentTo] = useState<string | null>(
    null,
  );
  // The form gives way to the answer (and back), so focus would fall to the
  // page; it goes to the heading, which names where the person now is.
  const shownOnce = useRef(false);
  useEffect(() => {
    if (shownOnce.current) document.getElementById("sign-in-title")?.focus();
    shownOnce.current = true;
  }, [confirmationSentTo]);
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
    setSubmitting(true);
    const signedIn = creatingAccount
      ? await signUp(email, password)
      : await signIn(email, password);
    setSubmitting(false);
    if (signedIn === "email_confirmation_required") {
      setConfirmationSentTo(email.trim());
      setPassword("");
      return;
    }
    if (signedIn) navigate(destination, { replace: true });
  };

  return (
    <PreBizFrame
      narrow
      titleId="sign-in-title"
      title={
        confirmationSentTo
          ? "Check your email"
          : creatingAccount
            ? inviteFlow
              ? "Create your employee account"
              : "Create your workspace account"
            : "Sign in"
      }
      description={
        !supabaseConfigured
          ? "Sign-in is unavailable in this browser session."
          : confirmationSentTo
            ? // The account exists but has no session until its email is
              // confirmed (SEC-003); same shape as Forgot password's answer.
              "Open the link we emailed you to confirm your address, then sign in. Nothing after a few minutes? Check your spam folder and the address below."
            : sessionExpired
              ? "Your session ended. Sign in again to pick up where you left off."
              : creatingAccount
                ? inviteFlow
                  ? "Your email and a password of at least eight characters."
                  : "You will name the workspace itself in the next step."
                : undefined
      }
    >
      {confirmationSentTo ? (
        <>
          <p
            className="form-success"
            role="status"
            data-testid="signup-check-email"
          >
            Confirmation link sent to {confirmationSentTo}.
          </p>
          <button
            className="pb-link"
            type="button"
            onClick={() => {
              setConfirmationSentTo(null);
              setCreatingAccount(false);
            }}
          >
            Back to sign in
          </button>
        </>
      ) : supabaseConfigured ? (
        <form className="sign-in-form" onSubmit={handleSupabaseSignIn}>
          {/*
            Creating an account is an email and a password. A name is asked
            where an employment record needs one — the setup wizard for an
            owner, onboarding for someone who was invited — which is also the
            only place it means anything.
          */}
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
            {creatingAccount ? null : (
              // The typed address rides in the page's state, never the URL (QA 64).
              <Link className="pb-link" to="/forgot-password" state={{ email: email.trim() }}>
                Forgot password?
              </Link>
            )}
          </div>
          {/* The form's own error, said whole (UI-FIELDMSG-2). */}
          <FieldNote id="sign-in-form" error={error} />
          <div className="pb-stack">
            <button
              type="submit"
              className="pb-btn pb-btn-primary pb-btn-block"
              disabled={submitting}
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
      {confirmationSentTo ? null : (
        <nav className="sign-in-trust-links" aria-label="Trust and legal">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/accessibility">Accessibility</Link>
          <Link to="/contact">Contact</Link>
        </nav>
      )}
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
