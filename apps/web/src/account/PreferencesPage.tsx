import type {
  PersonalDateFormat,
  PersonalTimeFormat,
} from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { AccountPageHeader } from "./components";
import { useAvailabilityNavigationGuard } from "../availability/availability-navigation";
import { FieldNote } from "../shell/FieldNote";

export default function PreferencesPage() {
  const { account, updateAccount } = useAuth();
  const [timeFormat, setTimeFormat] = useState<PersonalTimeFormat>(account?.timeFormat ?? "system");
  const [dateFormat, setDateFormat] = useState<PersonalDateFormat>(account?.dateFormat ?? "system");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const navigationDialog = useAvailabilityNavigationGuard({
    dirty, busy: saving, onDiscard: () => discard(),
    labels: { saving: "Saving preferences", discard: "Discard preference changes?", saved: "Preferences saved",
      unsaved: "Your unsaved preferences will be lost." },
  });

  useEffect(() => {
    if (!account || dirty) return;
    setTimeFormat(account.timeFormat);
    setDateFormat(account.dateFormat);
  }, [account, dirty]);

  if (!account) return null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      // The app is light-only; keep the stored theme value unchanged.
      await updateAccount(account.displayName, account.theme, account.phone, { timeFormat, dateFormat });
      setDirty(false);
      setSaved(true);
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Preferences could not be saved");
    } finally {
      setSaving(false);
    }
  };

  // Picking the stored value again is no change, so Save closes again.
  const choose = (nextDate: PersonalDateFormat, nextTime: PersonalTimeFormat) => {
    setDateFormat(nextDate);
    setTimeFormat(nextTime);
    setDirty(nextDate !== account.dateFormat || nextTime !== account.timeFormat);
    setSaved(false);
  };

  const discard = () => {
    setTimeFormat(account.timeFormat);
    setDateFormat(account.dateFormat);
    setDirty(false);
    setSaved(false);
    setError(null);
  };

  return (
    <section className="account-page" aria-labelledby="preferences-title">
      {navigationDialog}
      <AccountPageHeader
        title="Preferences"
        titleId="preferences-title"
        description="Choose how Newfork formats information for this account."
      />
      <form className="account-section-block" aria-labelledby="regional-format-title" onSubmit={submit}>
        <div className="account-section-copy">
          <h2 id="regional-format-title">Regional format</h2>
          <p>Date and time presentation follows you across workspaces.</p>
        </div>
        <div className="account-field-grid account-field-grid-3">
          <label className="account-field">
            <span>Date format</span>
            <select value={dateFormat} onChange={(event) => choose(event.target.value as PersonalDateFormat, timeFormat)}>
              <option value="system">System</option>
              <option value="MM-DD-YYYY">09-14-2026</option>
              <option value="DD-MM-YYYY">14-09-2026</option>
              <option value="YYYY-MM-DD">2026-09-14</option>
            </select>
            <small>Display only; stored dates are unchanged.</small>
          </label>
          <label className="account-field">
            <span>Time format</span>
            <select value={timeFormat} onChange={(event) => choose(dateFormat, event.target.value as PersonalTimeFormat)}>
              <option value="system">System</option>
              <option value="12h">9:30 AM</option>
              <option value="24h">09:30</option>
            </select>
            <small>Workspace timezone is unchanged.</small>
          </label>
        </div>

        <FieldNote id="preferences-form" error={error} />
        {saved ? <p className="form-success" role="status">Preferences saved</p> : null}
        <div className="account-form-actions">
          {dirty ? <Button className="secondary-button" type="button" disabled={saving} onClick={discard}>Discard</Button> : null}
          <Button type="submit" disabled={!dirty || saving}>{saving ? "Saving" : "Save"}</Button>
        </div>
      </form>
    </section>
  );
}
