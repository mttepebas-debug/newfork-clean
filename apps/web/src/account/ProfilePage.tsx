import { Button } from "@newfork/ui";
import { Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { requestAccountDeletion, supabaseClient } from "../lib/supabase";
import { AccountPageHeader } from "./components";

export default function ProfilePage() {
  const { account, signOut, updateAccount } = useAuth();
  const [displayName, setDisplayName] = useState(account?.displayName ?? "");
  const [phone, setPhone] = useState(account?.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deletionEmail, setDeletionEmail] = useState("");
  const [deletionAcknowledged, setDeletionAcknowledged] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileDirty, setProfileDirty] = useState(false);

  useEffect(() => {
    if (!account || profileDirty) return;
    setDisplayName(account.displayName);
    setPhone(account.phone ?? "");
  }, [account, profileDirty]);

  if (!account) return null;

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await updateAccount(displayName, account.theme, phone);
      setProfileDirty(false);
      setSaved(true);
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Profile could not be saved",
      );
    } finally {
      setSaving(false);
    }
  };

  const submitDeletion = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!supabaseClient) return;
    setDeleting(true);
    setError(null);
    try {
      await requestAccountDeletion(supabaseClient, {
        typedEmail: deletionEmail,
        acknowledged: deletionAcknowledged,
      });
      await signOut();
    } catch (deleteError: unknown) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Account deletion could not be requested",
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="account-page" aria-labelledby="profile-title">
      <AccountPageHeader
        title="Profile"
        titleId="profile-title"
        description="Personal details used across every workspace linked to this login."
      />
      <form className="settings-form" onSubmit={submit}>
        <div className="field-row">
          <label htmlFor="display-name">Display name</label>
          <div>
            <input
              id="display-name"
              value={displayName}
              maxLength={100}
              onChange={(event) => {
                setDisplayName(event.target.value);
                setProfileDirty(true);
                setSaved(false);
              }}
              required
            />
            <span className="field-help">
              Used for this account shell. Workspaces keep employee legal names separately.
            </span>
          </div>
        </div>
        <div className="field-row">
          <label htmlFor="account-email">Email</label>
          <div>
            <input id="account-email" value={account.email} readOnly />
            <span className="field-help">
              Email changes require a verified authentication flow.
            </span>
          </div>
        </div>
        <div className="field-row">
          <label htmlFor="account-phone">Phone</label>
          <div>
            <input
              id="account-phone"
              type="tel"
              value={phone}
              maxLength={30}
              onChange={(event) => {
                setPhone(event.target.value);
                setProfileDirty(true);
                setSaved(false);
              }}
            />
            <span className="field-help">
              Optional for now. Employee onboarding can reuse it for that workspace.
            </span>
          </div>
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p className="form-success" role="status">
            Profile saved
          </p>
        ) : null}
        <div className="settings-actions">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving" : "Save profile"}
          </Button>
        </div>
      </form>
      <form
        className="account-danger-panel"
        role="region"
        aria-labelledby="account-deletion-title"
        aria-describedby="account-deletion-description"
        onSubmit={(event) => void submitDeletion(event)}
      >
        <div>
          <strong id="account-deletion-title">Delete account</strong>
          <p id="account-deletion-description">
            You can delete this global login only when it has no active
            organization access. Deletion starts a 14-day restore window and
            signs you out.
          </p>
        </div>
        <label>
          Type account email
          <input
            type="email"
            value={deletionEmail}
            onChange={(event) => setDeletionEmail(event.target.value)}
            placeholder={account.email}
          />
        </label>
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={deletionAcknowledged}
            onChange={(event) =>
              setDeletionAcknowledged(event.target.checked)
            }
          />
          <span>I understand account deletion can remove this login.</span>
        </label>
        <div className="settings-actions">
          <Button
            className="danger-button"
            type="submit"
            disabled={
              deleting ||
              !deletionAcknowledged ||
              deletionEmail.trim().toLowerCase() !== account.email.toLowerCase()
            }
          >
            <Trash2 size={16} aria-hidden />{" "}
            {deleting ? "Requesting deletion" : "Delete account"}
          </Button>
        </div>
      </form>
    </section>
  );
}
