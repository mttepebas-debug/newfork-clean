import type {
  PersonalDateFormat,
  PersonalTimeFormat,
  ThemePreference,
} from "@newfork/shared";
import { Button } from "@newfork/ui";
import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { AccountPageHeader } from "./components";
import { useAvailabilityNavigationGuard } from "../availability/availability-navigation";
import { applyThemePreference } from "../lib/supabase";

const themes = [
  { value: "light", label: "Light", description: "Always use light", icon: Sun },
  { value: "dark", label: "Dark", description: "Always use dark", icon: Moon },
  { value: "system", label: "System", description: "Match this device", icon: Monitor },
] as const;

export default function PreferencesPage() {
  const { account, updateAccount } = useAuth();
  const [theme, setTheme] = useState<ThemePreference>(account?.theme ?? "system");
  const [timeFormat, setTimeFormat] = useState<PersonalTimeFormat>(account?.timeFormat ?? "system");
  const [dateFormat, setDateFormat] = useState<PersonalDateFormat>(account?.dateFormat ?? "system");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const savedTheme = useRef(account?.theme ?? "system");
  useEffect(() => { savedTheme.current = account?.theme ?? "system"; }, [account?.theme]);
  useEffect(() => { applyThemePreference(theme); }, [theme]);
  useEffect(() => () => applyThemePreference(savedTheme.current), []);
  const navigationDialog = useAvailabilityNavigationGuard({
    dirty, busy: saving, onDiscard: () => { applyThemePreference(savedTheme.current); discard(); },
    labels: { saving: "Saving preferences", discard: "Discard preference changes?", saved: "Preferences saved",
      unsaved: "Your unsaved preferences will be lost and your saved appearance restored." },
  });

  useEffect(() => {
    if (!account || dirty) return;
    setTheme(account.theme);
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
      await updateAccount(account.displayName, theme, account.phone, { timeFormat, dateFormat });
      savedTheme.current = theme;
      setDirty(false);
      setSaved(true);
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Preferences could not be saved");
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    applyThemePreference(account.theme);
    setTheme(account.theme);
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
        description="Choose how Newfork looks and formats information for this account."
      />
      <form onSubmit={submit}>
        <section className="account-section-block">
          <div className="account-section-copy">
            <h2>Appearance</h2>
            <p>Preview your preferred theme before saving.</p>
          </div>
          <fieldset className="account-section-body account-theme-choices">
            <legend className="visually-hidden">Appearance</legend>
            {themes.map((option) => {
              const Icon = option.icon;
              return (
                <label key={option.value} className={`account-theme-choice${theme === option.value ? " selected" : ""}`}>
                  <input
                    type="radio"
                    name="theme"
                    value={option.value}
                    checked={theme === option.value}
                    onChange={() => {
                      setTheme(option.value);
                      setDirty(true);
                      setSaved(false);
                    }}
                  />
                  <span className={`account-theme-preview ${option.value}`} aria-hidden><Icon size={17} /></span>
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </label>
              );
            })}
          </fieldset>
        </section>

        <section className="account-section-block">
          <div className="account-section-copy">
            <h2>Regional format</h2>
            <p>Date and time presentation follows you across workspaces.</p>
          </div>
          <div className="account-section-body account-field-grid">
            <label className="account-field">
              <span>Date format</span>
              <select value={dateFormat} onChange={(event) => { setDateFormat(event.target.value as PersonalDateFormat); setDirty(true); setSaved(false); }}>
                <option value="system">System</option>
                <option value="MM-DD-YYYY">09-14-2026</option>
                <option value="DD-MM-YYYY">14-09-2026</option>
                <option value="YYYY-MM-DD">2026-09-14</option>
              </select>
              <small>Display only; stored dates are unchanged.</small>
            </label>
            <label className="account-field">
              <span>Time format</span>
              <select value={timeFormat} onChange={(event) => { setTimeFormat(event.target.value as PersonalTimeFormat); setDirty(true); setSaved(false); }}>
                <option value="system">System</option>
                <option value="12h">9:30 AM</option>
                <option value="24h">09:30</option>
              </select>
              <small>Workspace timezone is unchanged.</small>
            </label>
          </div>
        </section>

        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {saved ? <p className="form-success" role="status">Preferences saved</p> : null}
        <div className="account-form-actions">
          <Button className="secondary-button" type="button" disabled={!dirty || saving} onClick={discard}>Discard</Button>
          <Button type="submit" disabled={!dirty || saving}>{saving ? "Saving" : "Save preferences"}</Button>
        </div>
      </form>
    </section>
  );
}
