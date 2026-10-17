import { Button } from "@newfork/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  ImagePlus,
  ListChecks,
  Save,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  getOwnerSetupChecklistProgress,
  setOwnerSetupChecklistClosed,
} from "../communications/communications-data";
import {
  ScheduleLogoUploadDialog,
  type ScheduleLogoSaveDraft,
} from "../schedule/components/ScheduleLogoUploadDialog";
import { ScheduleLogoFrame } from "../schedule/components/ScheduleLogoFrame";
import { saveScheduleLogo, updateOrganizationName } from "./organization-data";
import { breaksLetterRule, LetterRuleNote, letterRuleProps } from "../shell/us-text";
import { FieldNote } from "../shell/FieldNote";
import { isNoAccess } from "../lib/no-access";
import { LoadingOutline, RefreshError, Skeleton } from "../shell/LoadState";

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
        description="Workspace identity used across navigation and invitations."
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
            <label htmlFor="organization-name">Workspace name</label>
            <p>
              Changing the name does not change anyone's access.
            </p>
          </div>
          <div>
            <input
              id="organization-name"
              disabled={!canEdit}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              required
              {...letterRuleProps(name, "organization-name")}
            />
            <LetterRuleNote value={name} id="organization-name" />
          </div>
        </div>
        {/* The form's own error keeps its line, so it moves nothing (UI-FIELDMSG). */}
        <FieldNote id="organization-form" error={error ?? logoError} lines={2} />
        {saved ? (
          <p className="form-success" role="status">
            Workspace settings saved.
          </p>
        ) : null}
        <div className="organization-form-actions">
          <Button
            type="submit"
            disabled={
              !canEdit ||
              saving ||
              name.trim().length === 0 ||
              breaksLetterRule(name) ||
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
            {checklistQuery.isLoading ? (
              <LoadingOutline label="Loading setup checklist setting">
                <Skeleton width={150} height={12} />
              </LoadingOutline>
            ) : checklistQuery.data !== undefined ? (
              <span>
                {checklistClosed
                  ? "Hidden from Workspace"
                  : "Visible on Workspace"}
              </span>
            ) : null}
            <Button
              type="button"
              disabled={
                !canEdit ||
                checklistQuery.data === undefined ||
                isNoAccess(checklistQuery.error) ||
                checklistMutation.isPending
              }
              onClick={() => checklistMutation.mutate(!checklistClosed)}
            >
              <ListChecks size={16} aria-hidden />
              {checklistClosed ? "Show checklist" : "Hide checklist"}
            </Button>
          </div>
        </div>
        {/* A failed read is not a failed save (Mert 2026-10-14, "B"). */}
        {checklistQuery.error && !isNoAccess(checklistQuery.error) ? (
          <RefreshError
            message={
              checklistQuery.data !== undefined
                ? "This setting didn't refresh. This is the last value that loaded."
                : "This setting didn't load. Nothing was changed."
            }
            retrying={checklistQuery.isFetching}
            onRetry={() => void checklistQuery.refetch()}
          />
        ) : null}
        <FieldNote
          id="setup-checklist"
          error={
            isNoAccess(checklistQuery.error)
              ? "You don't have access to this setting."
              : checklistMutation.error
                ? "Setup checklist visibility could not be saved."
                : null
          }
        />
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
