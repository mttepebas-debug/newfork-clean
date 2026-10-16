import { Button } from "@newfork/ui";
import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  cancelAccountEmailChange,
  changeAccountPassword,
  loadAccountDeletionBlockers,
  loadAccountSecurityState,
  requestAccountEmailChange,
  requestSecureAccountDeletion,
  resendAccountEmailChange,
  signOutOtherAccountSessions,
  supabaseClient,
  type AccountDeletionBlocker,
  type AccountSecurityState,
} from "../lib/supabase";
import { RequestError } from "../lib/request-error";
import { RefreshError } from "../shell/LoadState";
import { AccountPageHeader } from "./components";

export default function SecurityPage() {
  const { account, context, signOut } = useAuth();
  const [security, setSecurity] = useState<AccountSecurityState | null>(null);
  const [blockers, setBlockers] = useState<AccountDeletionBlocker[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [sessionPassword, setSessionPassword] = useState("");
  const [deletionPassword, setDeletionPassword] = useState("");
  const [confirmDeletion, setConfirmDeletion] = useState(false);
  const deletionDialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  // Which action failed, so its sentence shows beside that action's button.
  const [failure, setFailure] = useState<{ readonly key: string; readonly message: string } | null>(null);
  const errorIn = (key: string) => (failure?.key === key ? failure.message : null);
  // Reading the verification state and what blocks deletion; Try again bumps it.
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  useEffect(() => {
    if (confirmDeletion) deletionDialog.current?.showModal();
    else deletionDialog.current?.close();
  }, [confirmDeletion]);

  useEffect(() => {
    if (!account) return;
    if (!supabaseClient) {
      setSecurity({ email: account.email, pendingEmail: null, emailChangeSentAt: null, emailVerified: false });
      setBlockers(
        context
          ? [{
              kind: "active_membership",
              workspace_id: context.workspace.id,
              workspace_name: context.workspace.name,
              role_name: context.membership.role,
              is_owner: context.membership.role === "owner",
            }]
          : [],
      );
      return;
    }
    let active = true;
    setLoading(true);
    void Promise.all([
      loadAccountSecurityState(supabaseClient),
      loadAccountDeletionBlockers(supabaseClient),
    ])
      .then(([state, deletionBlockers]) => {
        if (!active) return;
        setSecurity(state);
        setBlockers(deletionBlockers);
        setLoadFailed(false);
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [account, context, loadAttempt]);

  if (!account) return null;

  const run = async (key: string, action: () => Promise<void>, success: string) => {
    setBusy(key);
    setFailure(null);
    setStatus(null);
    try {
      await action();
      setStatus(success);
    } catch (actionError: unknown) {
      setFailure({ key, message: errorMessage(actionError, "Security change could not be saved") });
    } finally {
      setBusy(null);
    }
  };

  const submitEmail = async (event: FormEvent) => {
    event.preventDefault();
    await run("email", async () => {
      const next = await requestAccountEmailChange(supabaseClient!, newEmail);
      setSecurity(next);
      setNewEmail("");
    }, "Verification links sent to both email addresses");
  };

  const submitPassword = async (event: FormEvent) => {
    event.preventDefault();
    await run("password", async () => {
      await changeAccountPassword(supabaseClient!, { currentPassword, newPassword, confirmPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }, "Password changed; other sessions were signed out");
  };

  return (
    <section className="account-page" aria-labelledby="security-title">
      <AccountPageHeader title="Security" titleId="security-title" description="Keep sign-in methods and recovery details current." />
      {loadFailed ? (
        <RefreshError
          message="Your security details didn't load. Email verification and account deletion wait until they do."
          retrying={loading}
          onRetry={() => setLoadAttempt((attempt) => attempt + 1)}
        />
      ) : null}

      <section className="account-section-block">
        <div className="account-section-copy"><h2>Email address</h2><p>The address you use to sign in and receive recovery messages.</p></div>
        <div className="account-section-body">
          <p className="account-current-value">
            <strong>{security?.email ?? account.email}</strong>
            {security || !loadFailed ? <span>{security ? security.emailVerified ? "Verified" : "Not verified" : "Checking verification"}</span> : null}
          </p>
          {security?.pendingEmail ? (
            <div className="account-notice">
              <strong>Verify {security.pendingEmail}</strong>
              <p>Both your current and new email must confirm. Your current email stays active until then.</p>
              <div className="account-button-row">
                <Button type="button" disabled={busy !== null} onClick={() => void run("resend-email", async () => {
                  await resendAccountEmailChange(supabaseClient!);
                }, "Verification links sent again")}>Resend</Button>
                <Button className="danger-button" type="button" disabled={busy !== null} onClick={() => void run("cancel-email", async () => {
                  await cancelAccountEmailChange(supabaseClient!);
                  setSecurity((current) => current ? { ...current, pendingEmail: null, emailChangeSentAt: null } : current);
                }, "Email change cancelled")}>Cancel change</Button>
              </div>
            </div>
          ) : (
            <form className="account-inline-form" onSubmit={submitEmail}>
              <label className="account-field"><span>New email</span><input type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} required /></label>
              <Button type="submit" disabled={busy !== null || !newEmail.trim()}>Change email</Button>
            </form>
          )}
        </div>
      </section>

      <section className="account-section-block">
        <div className="account-section-copy"><h2>Password</h2><p>Use at least 8 characters and avoid reused passwords.</p></div>
        <form className="account-section-body" onSubmit={submitPassword}>
          <div className="account-field-grid account-field-grid-3">
            <label className="account-field"><span>Current password</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label>
            <label className="account-field"><span>New password</span><input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label>
            <label className="account-field"><span>Confirm password</span><input type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>
          </div>
          <FormAlert className="form-error" message={errorIn("password")} />
          <div className="account-form-actions">
            <Button type="submit" disabled={busy !== null || !currentPassword || newPassword.length < 8 || newPassword !== confirmPassword}>Change password</Button>
          </div>
        </form>
      </section>

      <section className="account-section-block">
        <div className="account-section-copy"><h2>Active sessions</h2><p>Keep this browser signed in and revoke every other session.</p></div>
        <div className="account-section-body">
          <form className="account-inline-form" onSubmit={(event) => { event.preventDefault(); void run("sessions", async () => {
            await signOutOtherAccountSessions(supabaseClient!, sessionPassword);
            setSessionPassword("");
          }, "Other sessions signed out"); }}>
            <label className="account-field"><span>Current password</span><input type="password" autoComplete="current-password" value={sessionPassword} onChange={(event) => setSessionPassword(event.target.value)} required /></label>
            <Button type="submit" disabled={busy !== null || !sessionPassword}>Sign out other sessions</Button>
          </form>
          <FormAlert className="form-error" message={errorIn("sessions")} />
        </div>
      </section>

      <section className="account-section-block" aria-labelledby="delete-account-title">
        <div className="account-section-copy"><h2 id="delete-account-title">Delete account</h2><p>A 14-day recovery window starts after your current password is verified.</p></div>
        <div className="account-section-body">
          {blockers.length > 0 ? (
            <div className="account-blocked-notice"><strong>Your account is still in use</strong><p>{deletionBlockerSummary(blockers)}</p></div>
          ) : (
            <p className="field-help">Pending invitations will be cancelled.</p>
          )}
          <div className="account-form-actions">
            <Button className="danger-button" type="button" disabled={busy !== null || !security || blockers.length > 0} onClick={() => setConfirmDeletion(true)}><Trash2 size={15} aria-hidden /> Delete account</Button>
          </div>
          <dialog ref={deletionDialog} className="account-confirmation-dialog" aria-labelledby="deletion-confirmation-title" onCancel={(event) => {
            if (busy === "delete") event.preventDefault();
            else { setConfirmDeletion(false); setDeletionPassword(""); }
          }}>
            <h2 id="deletion-confirmation-title">Delete your account?</h2>
            <p>You will be signed out of every session. Pending invitations will be cancelled.</p>
            <p>Your profile and personal preferences are kept for 14 days. Use the recovery email link during that time to restore your account. After 14 days, your personal account data is permanently removed.</p>
          <form className="account-section-body" onSubmit={(event) => { event.preventDefault(); void run("delete", async () => {
            await requestSecureAccountDeletion(supabaseClient!, deletionPassword);
            await signOut();
          }, "Account deletion requested"); }}>
            <label className="account-field"><span>Current password</span><input type="password" autoComplete="current-password" value={deletionPassword} onChange={(event) => setDeletionPassword(event.target.value)} required /></label>
            <FormAlert className="form-error" message={errorIn("delete")} />
            <div className="account-form-actions">
              <Button type="button" className="secondary-button" disabled={busy === "delete"} onClick={() => { setConfirmDeletion(false); setDeletionPassword(""); setFailure(null); }}>Cancel</Button>
              <Button className="danger-button" type="submit" disabled={busy !== null || blockers.length > 0 || !deletionPassword}>Confirm account deletion</Button>
            </div>
          </form>
          </dialog>
        </div>
      </section>

      {/* The three password forms answer beside their own button; the rest here. */}
      {failure && !["password", "sessions", "delete"].includes(failure.key) ? <p className="form-error" role="alert">{failure.message}</p> : null}
      {status ? <p className="form-success" role="status">{status}</p> : null}
    </section>
  );
}

// Same sentences as the workspace close and hand-over prompts on Workspaces.
const passwordRefusals: Readonly<Record<string, string>> = {
  "session.password_incorrect": "That password did not match. Type it again.",
  "session.password_required": "Type your account password to continue.",
};

/** A form's own refusal, under its button; scrolled into view so a button at the fold still shows it. */
function FormAlert({ className, message }: { readonly className: string; readonly message: string | null }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [message]);
  return message ? <p ref={ref} role="alert" className={className}>{message}</p> : null;
}

function errorMessage(error: unknown, fallback: string): string {
  const refusal =
    error instanceof RequestError && error.reason
      ? passwordRefusals[error.reason]
      : undefined;
  if (refusal) return refusal;
  return error instanceof Error ? error.message : fallback;
}

function plural(count: number, noun: string): string {
  return count + " " + noun + (count === 1 ? "" : "s");
}

/**
 * One message covering all of it. This used to be a line per workspace and per
 * transfer, each repeating the same instruction, so an account with ten
 * workspaces met a list of ten sentences before it could be deleted.
 */
export function deletionBlockerSummary(
  blockers: readonly AccountDeletionBlocker[],
): string {
  const memberships = blockers.filter(
    (blocker) => blocker.kind === "active_membership",
  );
  const owned = memberships.filter((blocker) => blocker.is_owner);
  const joined = memberships.length - owned.length;
  const transfers = blockers.filter(
    (blocker) => blocker.kind === "pending_ownership_transfer",
  );
  const parts: string[] = [];
  if (owned.length > 0)
    parts.push(
      "you own " +
        plural(owned.length, "workspace") +
        ", so hand " +
        (owned.length === 1 ? "it" : "them") +
        " to somebody else in Account \u203a Workspaces",
    );
  if (joined > 0)
    parts.push(
      "you still have access to " +
        plural(joined, "workspace") +
        " you do not own, which an owner or an admin there has to remove",
    );
  if (transfers.length > 0)
    parts.push(
      plural(transfers.length, "ownership transfer") +
        (transfers.length === 1 ? " is" : " are") +
        " still waiting for an answer",
    );
  const last = parts.pop() ?? "";
  // Two reasons read as a pair; three or more need the semicolons to stay apart.
  const lead =
    parts.length === 0
      ? ""
      : parts.length === 1
        ? parts[0] + ", and "
        : parts.join("; ") + "; and ";
  return "Before you can delete your account: " + lead + last + ".";
}
