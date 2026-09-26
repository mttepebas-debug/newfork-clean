import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { requestPasswordReset } from "../lib/supabase";
import { PreBizFrame } from "../shell/prebiz/PreBiz";

// BL-137. One answer for every email, so the screen never says whether an
// account exists. Visual polish is nf-arayuz's; this reuses the sign-in parts.
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (caught: unknown) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The reset link could not be sent. Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PreBizFrame
      narrow
      titleId="forgot-password-title"
      title="Reset your password"
      description={
        sent
          ? undefined
          : "Enter the email you sign in with. The link works once and expires in 1 hour."
      }
    >
      {sent ? (
        <p className="form-success" role="status">
          If an account exists for this email, we sent a reset link.
        </p>
      ) : (
        <form className="sign-in-form" onSubmit={submit}>
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
              {submitting ? "Please wait" : "Send reset link"}
            </button>
          </div>
        </form>
      )}
      <Link className="pb-link" to="/sign-in">
        Back to sign in
      </Link>
    </PreBizFrame>
  );
}
