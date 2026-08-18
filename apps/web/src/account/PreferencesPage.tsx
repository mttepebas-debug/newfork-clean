import type { ThemePreference } from "@newfork/shared";
import { Button } from "@newfork/ui";
import { Monitor, Moon, Sun } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";

const themes = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

export default function PreferencesPage() {
  const { account, updateAccount } = useAuth();
  const [theme, setTheme] = useState<ThemePreference>(
    account?.theme ?? "system",
  );
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
      await updateAccount(account.displayName, theme);
      setSaved(true);
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Preferences could not be saved",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="account-page" aria-labelledby="preferences-title">
      <header>
        <p className="eyebrow">Account Center</p>
        <h1 id="preferences-title">Preferences</h1>
      </header>
      <form className="settings-form" onSubmit={submit}>
        <fieldset className="theme-fieldset">
          <legend>Appearance</legend>
          <div className="segmented-control">
            {themes.map((option) => {
              const Icon = option.icon;
              return (
                <label
                  key={option.value}
                  className={theme === option.value ? "selected" : ""}
                >
                  <input
                    type="radio"
                    name="theme"
                    value={option.value}
                    checked={theme === option.value}
                    onChange={() => setTheme(option.value)}
                  />
                  <Icon size={17} aria-hidden /> {option.label}
                </label>
              );
            })}
          </div>
        </fieldset>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p className="form-success" role="status">
            Preferences saved
          </p>
        ) : null}
        <div className="settings-actions">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving" : "Save preferences"}
          </Button>
        </div>
      </form>
    </section>
  );
}
