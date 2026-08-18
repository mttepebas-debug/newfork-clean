import { Button } from "@newfork/ui";
import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";

export default function ProfilePage() {
  const { account, updateAccount } = useAuth();
  const [displayName, setDisplayName] = useState(account?.displayName ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!account) return null;

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await updateAccount(displayName, account.theme);
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

  return (
    <section className="account-page" aria-labelledby="profile-title">
      <header>
        <p className="eyebrow">Account Center</p>
        <h1 id="profile-title">Profile</h1>
      </header>
      <form className="settings-form" onSubmit={submit}>
        <div className="field-row">
          <label htmlFor="display-name">Display name</label>
          <div>
            <input
              id="display-name"
              value={displayName}
              maxLength={100}
              onChange={(event) => setDisplayName(event.target.value)}
              required
            />
            <span className="field-help">
              Used across your linked workspaces.
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
    </section>
  );
}
