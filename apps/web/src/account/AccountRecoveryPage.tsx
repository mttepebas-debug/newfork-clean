import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { restoreAccountDeletionWithToken } from "../lib/supabase";
import { PreBizFrame } from "../shell/prebiz/PreBiz";
import { FieldNote } from "../shell/FieldNote";

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
      setError(
        restoreError instanceof Error
          ? restoreError.message
          : "Your account could not be restored",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <PreBizFrame
      titleId="account-recovery-title"
      title={restored ? "Your account is back" : "Bring your account back"}
      description={
        restored
          ? "Sign in to pick up where you left off."
          : "This link works once, and only while the 14-day window is open."
      }
    >
      {/* The form's own error above the buttons, said whole (UI-FIELDMSG-2). */}
      <FieldNote id="account-recovery" error={error} />
      <div className="pb-footer">
        {restored ? (
          <button
            type="button"
            className="pb-btn pb-btn-primary"
            onClick={() => navigate("/sign-in", { replace: true })}
          >
            Go to sign in
          </button>
        ) : (
          <button
            type="button"
            className="pb-btn pb-btn-primary"
            disabled={busy || token.length < 32}
            onClick={() => void restore()}
          >
            {busy ? "Restoring" : "Restore my account"}
          </button>
        )}
      </div>
    </PreBizFrame>
  );
}
