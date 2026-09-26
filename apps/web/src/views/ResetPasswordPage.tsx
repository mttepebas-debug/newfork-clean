import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { openPasswordResetSession, saveNewPassword } from "../lib/supabase";
import { PreBizFrame } from "../shell/prebiz/PreBiz";

// BL-137. The link's token is spent on Save, not on page load, so a mail
// scanner that opens the link does not use it up. Once spent, the session
// stays for a second try if the password itself is refused.
export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tokenHash = searchParams.get("token_hash") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [linkInvalid, setLinkInvalid] = useState(tokenHash === "");
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      if (!sessionOpen) {
        if (!(await openPasswordResetSession(tokenHash))) {
          setLinkInvalid(true);
          return;
        }
        setSessionOpen(true);
      }
      await saveNewPassword(password);
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
      <PreBizFrame narrow titleId="reset-password-title" title="Reset link not valid">
        <p>This reset link has expired or was already used.</p>
        <Link to="/forgot-password">Request a new link</Link>
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
