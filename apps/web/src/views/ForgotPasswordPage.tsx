import { useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router";
import { requestPasswordReset } from "../lib/supabase";
import { PreBizFrame } from "../shell/prebiz/PreBiz";
import { FieldNote } from "../shell/FieldNote";

// BL-137. One answer for every email, so the screen never says whether an
// account exists. Visual polish is nf-arayuz's; this reuses the sign-in parts.
export default function ForgotPasswordPage() {
  // The address typed on Sign in comes along in the page's state (QA 64).
  const carried = (useLocation().state as { email?: unknown } | null)?.email;
  const [email, setEmail] = useState(typeof carried === "string" ? carried : "");
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
          {/* The form's own error, said whole (UI-FIELDMSG-2). */}
          <FieldNote id="forgot-password-form" error={error} />
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
