import { Button } from "@newfork/ui";
import { Building2, ImagePlus, Save } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  ScheduleLogoUploadDialog,
  type ScheduleLogoSaveDraft,
} from "../schedule/components/ScheduleLogoUploadDialog";
import { ScheduleLogoFrame } from "../schedule/components/ScheduleLogoFrame";
import { saveScheduleLogo, updateOrganizationName } from "./organization-data";

export default function GeneralSettingsPage() {
  const { context, refresh } = useAuth();
  const [name, setName] = useState(context?.workspace.name ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [logoOpen, setLogoOpen] = useState(false);
  const [savingLogo, setSavingLogo] = useState(false);

  useEffect(
    () => setName(context?.workspace.name ?? ""),
    [context?.workspace.name],
  );
  if (!context) return null;

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateOrganizationName(context.workspace.id, name);
      await refresh();
      setSaved(true);
    } catch (saveError) {
      setError(errorText(saveError));
    } finally {
      setSaving(false);
    }
  };
  const submitLogo = async (draft: ScheduleLogoSaveDraft): Promise<void> => {
    setSavingLogo(true);
    setLogoError(null);
    setSaved(false);
    try {
      await saveScheduleLogo(context.workspace.id, draft);
      await refresh();
      setLogoOpen(false);
      setSaved(true);
    } catch (saveError) {
      setLogoError(errorText(saveError));
    } finally {
      setSavingLogo(false);
    }
  };

  return (
    <section className="settings-page" aria-labelledby="general-settings-title">
      <SettingsHeader
        icon={<Building2 size={21} aria-hidden />}
        title="General"
        description="Organization identity used across navigation, invitations, and shared workspaces."
      />
      <form className="organization-form" onSubmit={submit}>
        <div className="organization-form-row organization-logo-row">
          <div>
            <label>Schedule logo</label>
            <p>
              Logo shown in the sticky top-left corner of the schedule grid and
              schedule exports.
            </p>
          </div>
          <div className="organization-logo-control">
            <ScheduleLogoFrame
              logoUrl={context.workspace.logo_url}
              organizationName={context.workspace.name}
              placement={context.workspace.schedule_logo_placement}
              className="settings-logo-frame"
            />
            <Button type="button" onClick={() => setLogoOpen(true)}>
              <ImagePlus size={16} aria-hidden />
              Manage logo
            </Button>
          </div>
        </div>
        <div className="organization-form-row">
          <div>
            <label htmlFor="organization-name">Organization name</label>
            <p>
              Changing the display name does not change the organization ID or
              access.
            </p>
          </div>
          <input
            id="organization-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            required
          />
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {logoError ? (
          <p className="form-error" role="alert">
            {logoError}
          </p>
        ) : null}
        {saved ? (
          <p className="form-success" role="status">
            Organization settings saved.
          </p>
        ) : null}
        <div className="organization-form-actions">
          <Button
            type="submit"
            disabled={
              saving ||
              name.trim().length === 0 ||
              name.trim() === context.workspace.name
            }
          >
            <Save size={16} aria-hidden />
            {saving ? "Saving" : "Save changes"}
          </Button>
        </div>
      </form>
      <ScheduleLogoUploadDialog
        open={logoOpen}
        organizationName={context.workspace.name}
        logoUrl={context.workspace.logo_url}
        logoPlacement={context.workspace.schedule_logo_placement}
        logoFileName={context.workspace.logo_file_name}
        logoUpdatedAt={context.workspace.logo_updated_at}
        error={logoError}
        saving={savingLogo}
        onOpenChange={setLogoOpen}
        onSave={(draft) => void submitLogo(draft)}
      />
    </section>
  );
}

export function SettingsHeader({
  icon,
  title,
  description,
  action,
}: {
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly description: string;
  readonly action?: React.ReactNode;
}) {
  return (
    <header className="settings-page-header">
      <div className="settings-heading-icon">{icon}</div>
      <div>
        <h1 id={`${title.toLowerCase().replaceAll(" ", "-")}-settings-title`}>
          {title}
        </h1>
        <p>{description}</p>
      </div>
      {action ? <div className="settings-header-action">{action}</div> : null}
    </header>
  );
}

export function errorText(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The change could not be saved";
}
