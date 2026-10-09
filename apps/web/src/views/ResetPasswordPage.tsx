import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import {
  abandonPasswordResetSession,
  openPasswordResetSession,
  saveNewPassword,
} from "../lib/supabase";
import { PreBizFrame } from "../shell/prebiz/PreBiz";

// BL-137. The token is in the fragment (#token_hash=), which never reaches a
// server log. It is spent on Save, not on page load, so a mail scanner that
// opens the link does not use it up. Once spent, the session stays for a
// second try if the password itself is refused; leaving without saving signs
// it out (a closed tab is handled on the next load, in lib/supabase).
export default function ResetPasswordPage() {
  const { hash, pathname } = useLocation();
  const navigate = useNavigate();
  // Kept from the first render: the address is cleaned below, and a later
  // render would find the fragment empty.
  const [tokenHash] = useState(
    () => new URLSearchParams(hash.slice(1)).get("token_hash") ?? "",
  );
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [linkInvalid, setLinkInvalid] = useState(tokenHash === "");
  const [error, setError] = useState<string | null>(null);
  const unsavedSession = useRef(false);

  useEffect(() => {
    // The token leaves the address bar and the history entry.
    if (hash) window.history.replaceState(null, "", pathname);
    return () => {
      if (unsavedSession.current) void abandonPasswordResetSession();
    };
    // Mount only: this runs once for the link the page was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      if (!unsavedSession.current) {
        if (!(await openPasswordResetSession(tokenHash))) {
          setLinkInvalid(true);
          return;
        }
        unsavedSession.current = true;
      }
      await saveNewPassword(password);
      unsavedSession.current = false;
      navigate("/app", { replace: true });
    } catch (caught: unknown) {
      setError(
        caught instanceof Error ? caught.message : "Your password could not be saved.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (linkInvalid)
    return (
      <PreBizFrame
        narrow
        titleId="reset-password-title"
        title="Reset link not valid"
        description="This reset link has expired or was already used."
      >
        {/* The one way forward from here, so it is the green one. */}
        <div className="pb-stack">
          <Link className="pb-btn pb-btn-primary pb-btn-block" to="/forgot-password">
            Request a new link
          </Link>
        </div>
      </PreBizFrame>
    );

  return (
    <PreBizFrame
      narrow
      titleId="reset-password-title"
      title="Choose a new password"
      description="At least eight characters."
    >
      <form className="sign-in-form" onSubmit={submit}>
        <div className="onboarding-field">
          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
            type="password"
            minLength={8}
            maxLength={256}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        <div className="onboarding-field">
          <label htmlFor="confirm-password">Confirm password</label>
          <input
            id="confirm-password"
            type="password"
            minLength={8}
            maxLength={256}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
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
            disabled={submitting}
          >
            {submitting ? "Please wait" : "Save password"}
          </button>
        </div>
      </form>
    </PreBizFrame>
  );
}
