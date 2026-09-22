import { Button } from "@newfork/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  ImagePlus,
  ListChecks,
  Save,
  UserRoundCheck,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  getOwnerSetupChecklistProgress,
  setOwnerSetupChecklistClosed,
} from "../communications/communications-data";
import {
  loadPreferredNameApproval,
  savePreferredNameApproval,
} from "../employees/employee-data";
import type { PreferredNameApproval } from "@newfork/shared";
import {
  ScheduleLogoUploadDialog,
  type ScheduleLogoSaveDraft,
} from "../schedule/components/ScheduleLogoUploadDialog";
import { ScheduleLogoFrame } from "../schedule/components/ScheduleLogoFrame";
import { saveScheduleLogo, updateOrganizationName } from "./organization-data";

export default function GeneralSettingsPage() {
  const { context, refresh } = useAuth();
  const queryClient = useQueryClient();
  const canEdit =
    context?.permissions.includes("settings.general.manage") ?? false;
  const [name, setName] = useState(context?.workspace.name ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [logoOpen, setLogoOpen] = useState(false);
  const [savingLogo, setSavingLogo] = useState(false);
  const workspaceId = context?.workspace.id ?? "";

  useEffect(
    () => setName(context?.workspace.name ?? ""),
    [context?.workspace.name],
  );
  const checklistQueryKey = ["owner-setup-checklist", workspaceId];
  const checklistQuery = useQuery({
    queryKey: checklistQueryKey,
    queryFn: () => getOwnerSetupChecklistProgress(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const checklistMutation = useMutation({
    mutationFn: (closed: boolean) =>
      setOwnerSetupChecklistClosed(workspaceId, closed),
    onSuccess: async (progress) => {
      queryClient.setQueryData(checklistQueryKey, progress);
      await queryClient.invalidateQueries({ queryKey: checklistQueryKey });
    },
  });
  const checklistClosed = Boolean(checklistQuery.data?.closed_at);
  // Whether a preferred name is answered here or let through. Separate from the
  // onboarding approval setting on purpose, and separate in the database too.
  const preferredQueryKey = ["preferred-name-approval", workspaceId];
  const preferredQuery = useQuery({
    queryKey: preferredQueryKey,
    queryFn: () => loadPreferredNameApproval(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const preferredMutation = useMutation({
    mutationFn: (approval: PreferredNameApproval) =>
      savePreferredNameApproval(workspaceId, approval),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: preferredQueryKey });
    },
  });
  const preferredApproval = preferredQuery.data ?? "auto";

  if (!context) return null;

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!canEdit) return;
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
    if (!canEdit) return;
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
            <Button
              type="button"
              disabled={!canEdit}
              onClick={() => setLogoOpen(true)}
            >
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
            disabled={!canEdit}
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
              !canEdit ||
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
      <section
        className="organization-form setup-checklist-settings"
        aria-labelledby="setup-checklist-settings-title"
      >
        <div className="organization-form-row">
          <div>
            <label id="setup-checklist-settings-title">Setup checklist</label>
            <p>
              Controls whether the guided setup checklist appears on the
              Workspace dashboard for this workspace.
            </p>
          </div>
          <div className="setup-checklist-settings-control">
            <span>
              {checklistClosed
                ? "Hidden from Workspace"
                : "Visible on Workspace"}
            </span>
            <Button
              type="button"
              disabled={
                !canEdit ||
                checklistQuery.isLoading ||
                checklistMutation.isPending
              }
              onClick={() => checklistMutation.mutate(!checklistClosed)}
            >
              <ListChecks size={16} aria-hidden />
              {checklistClosed ? "Show checklist" : "Hide checklist"}
            </Button>
          </div>
        </div>
        {checklistQuery.error || checklistMutation.error ? (
          <p className="form-error" role="alert">
            Setup checklist visibility could not be saved.
          </p>
        ) : null}
      </section>
      <section
        className="organization-form setup-checklist-settings"
        aria-labelledby="preferred-name-settings-title"
      >
        <div className="organization-form-row">
          <div>
            <label id="preferred-name-settings-title">Preferred names</label>
            <p>
              A preferred name is what people here call somebody. Documents and
              signatures always use the name on file. This is not the onboarding
              approval setting.
            </p>
          </div>
          <div className="setup-checklist-settings-control">
            <span>
              {preferredApproval === "manager"
                ? "Answered here before it is used"
                : "Used as soon as it is entered"}
            </span>
            <Button
              type="button"
              disabled={
                !canEdit ||
                preferredQuery.isLoading ||
                preferredMutation.isPending
              }
              onClick={() =>
                preferredMutation.mutate(
                  preferredApproval === "manager" ? "auto" : "manager",
                )
              }
            >
              <UserRoundCheck size={16} aria-hidden />
              {preferredApproval === "manager"
                ? "Let them through"
                : "Answer them here"}
            </Button>
          </div>
        </div>
        {preferredQuery.error || preferredMutation.error ? (
          <p className="form-error" role="alert">
            That setting could not be saved.
          </p>
        ) : null}
      </section>
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
  titleId,
}: {
  readonly icon?: React.ReactNode;
  readonly title: string;
  readonly description: string;
  readonly action?: React.ReactNode;
  readonly titleId?: string;
}) {
  return (
    <header className={`settings-page-header${icon ? "" : " no-icon"}`}>
      {icon ? <div className="settings-heading-icon">{icon}</div> : null}
      <div>
        <h1
          id={
            titleId ??
            `${title.toLowerCase().replaceAll(" ", "-")}-settings-title`
          }
        >
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
