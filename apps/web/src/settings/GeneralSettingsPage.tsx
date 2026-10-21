import { Button, useToast } from "@newfork/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ImagePlus, Save } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
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
import { can } from "../auth/can";
import { Switch } from "../notification-settings/parts";
import "../notification-settings/notification-settings.css";
import {
  loadOnboardingApproval,
  onboardingApprovalKey,
  saveOnboardingApproval,
} from "./onboarding-approval-data";

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

  // New people wait for approval (KATILIM-ONAY, S-231): anybody here reads it; the owner and admins
  // change it (settings.organization.write). The API decides; can() only reflects it.
  const toast = useToast();
  const canChangeApproval = can(context, "settings.organization.write");
  const approvalQuery = useQuery({
    queryKey: onboardingApprovalKey(workspaceId),
    queryFn: () => loadOnboardingApproval(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const approvalMutation = useMutation({
    mutationFn: (required: boolean) => saveOnboardingApproval(workspaceId, required),
    onSuccess: (settings) => {
      queryClient.setQueryData(onboardingApprovalKey(workspaceId), settings);
      toast.success(
        settings.final_approval_required
          ? "New people now wait for approval."
          : "New people now start when they finish onboarding.",
      );
      // Turning it off lets people in: the lists that show them move on.
      void queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
  });
  const approvalRequired = approvalQuery.data?.final_approval_required;

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
        {/* The form's own error above Save, said whole (UI-FIELDMSG-2). */}
        {/* Both when both hold: the form's and the logo's (UI-FIELDMSG-2). */}
        <FieldNote id="organization-form" error={error} />
        <FieldNote id="organization-logo" error={logoError} />
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
        className="organization-form onboarding-approval-settings"
        aria-labelledby="onboarding-approval-title"
      >
        <div className="organization-form-row">
          <div>
            <label id="onboarding-approval-title" htmlFor="onboarding-approval-switch">
              New people wait for approval
            </label>
            {approvalRequired !== undefined ? (
              <p id="onboarding-approval-help">
                {approvalRequired
                  ? "New people finish their required details and documents first. A manager then approves them, and their schedule opens."
                  : "New people start as soon as they finish their required details and documents."}
              </p>
            ) : null}
          </div>
          <div className="onboarding-approval-control">
            {approvalQuery.isLoading ? (
              <LoadingOutline label="Loading approval setting">
                <Skeleton width={28} height={12} />
              </LoadingOutline>
            ) : approvalRequired !== undefined ? (
              <span aria-hidden>{approvalRequired ? "On" : "Off"}</span>
            ) : null}
            <Switch
              id="onboarding-approval-switch"
              label="New people wait for approval"
              checked={approvalRequired ?? false}
              describedBy={approvalRequired !== undefined ? "onboarding-approval-help" : undefined}
              disabled={
                !canChangeApproval ||
                approvalRequired === undefined ||
                approvalMutation.isPending
              }
              onChange={(next) => approvalMutation.mutate(next)}
            />
          </div>
        </div>
        {approvalQuery.error && !isNoAccess(approvalQuery.error) ? (
          <RefreshError
            message={
              approvalQuery.data !== undefined
                ? "This setting didn't refresh. This is the last value that loaded."
                : "This setting didn't load. Nothing was changed."
            }
            retrying={approvalQuery.isFetching}
            onRetry={() => void approvalQuery.refetch()}
          />
        ) : null}
        <FieldNote
          id="onboarding-approval"
          error={
            isNoAccess(approvalQuery.error)
              ? "You don't have access to this setting."
              : approvalMutation.error
                ? "The approval setting could not be saved."
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
