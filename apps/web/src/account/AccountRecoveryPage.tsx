import { Button } from "@newfork/ui";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { restoreAccountDeletionWithToken } from "../lib/supabase";

export default function AccountRecoveryPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";
  const [busy, setBusy] = useState(false);
  const [restored, setRestored] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const restore = async () => {
    setBusy(true);
    setError(null);
    try {
      await restoreAccountDeletionWithToken(token);
      setRestored(true);
    } catch (restoreError: unknown) {
      setError(restoreError instanceof Error ? restoreError.message : "Account could not be restored");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="account-recovery-page">
      <section className="account-recovery-card" aria-labelledby="account-recovery-title">
        <span className="account-eyebrow">Account recovery</span>
        <h1 id="account-recovery-title">{restored ? "Account restored" : "Restore your Newfork account"}</h1>
        <p>{restored ? "Your account is active again. Sign in to continue; this page did not create a session." : "Use this one-time link before the 14-day recovery window closes."}</p>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {restored ? (
          <Button type="button" onClick={() => navigate("/sign-in", { replace: true })}>Go to sign in</Button>
        ) : (
          <Button type="button" disabled={busy || token.length < 32} onClick={() => void restore()}>{busy ? "Restoring" : "Restore account"}</Button>
        )}
      </section>
    </main>
  );
}
