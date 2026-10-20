import type {
  EmployeeAccessImpact,
  EmployeeDetail,
  EmployeeInput,
  WorkspaceRole,
} from "@newfork/shared";
import { ConfirmButton, useConfirmClick } from "@newfork/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageOff } from "lucide-react";
import { useId, useState } from "react";
import {
  getEmployeeAvatar,
  loadEmployeeInvitationLink,
  removeEmployeeAvatar,
  type EmployeeOption,
  type InviteRoleOption,
} from "./employee-data";

/**
 * DAVET-ERISIM (Tur 4 B, Mert 2026-10-20): what the Access tab holds. Two
 * accesses, each its own tick: the employee app, and the management app with
 * a role and, for a manager, the locations they manage.
 */
export interface AccessDraft {
  readonly employee: boolean;
  readonly management: boolean;
  readonly managementRoleId: string;
  readonly managedLocationIds: readonly string[];
}

export const noAccessChosen: AccessDraft = {
  employee: false,
  management: false,
  managementRoleId: "",
  managedLocationIds: [],
};

/**
 * What the record holds: a joined person's two slots, or what an invitation
 * still out carries. Nothing for anybody else; Invite asks.
 */
export function accessFromDetail(detail: EmployeeDetail): AccessDraft {
  if (detail.user_id)
    return {
      employee: detail.access.employee,
      management: detail.access.management !== null,
      managementRoleId: detail.management_role_id ?? "",
      managedLocationIds: detail.managed_location_ids,
    };
  const invitation = detail.invitation;
  if (!invitation || invitation.status !== "pending") return noAccessChosen;
  return {
    employee: invitation.employee_role_id !== null,
    management: invitation.management_role_id !== null,
    managementRoleId: invitation.management_role_id ?? "",
    managedLocationIds: invitation.managed_location_ids,
  };
}

export function accessKey(access: AccessDraft): string {
  return JSON.stringify([
    access.employee,
    access.management,
    access.management ? access.managementRoleId : "",
    access.management ? [...access.managedLocationIds].sort() : [],
  ]);
}

/** Mert's order: Admin, Manager, then the workspace's own roles. */
export function managementRoleOptions(
  roles: readonly InviteRoleOption[],
): InviteRoleOption[] {
  const rank = (role: InviteRoleOption) =>
    role.accessClass === "admin" ? 0 : role.systemKey === "manager" ? 1 : 2;
  return roles
    .filter((role) => role.accessClass === "admin" || role.accessClass === "manager")
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** Only a manager's role names its locations; an admin manages every one. */
export function managesEveryLocation(accessClass: WorkspaceRole | undefined): boolean {
  return accessClass === "admin" || accessClass === "owner";
}

/** One line for the Employment step's invite card. */
export function accessSummary(
  access: AccessDraft,
  roles: readonly InviteRoleOption[],
  locations: readonly EmployeeOption[],
): string {
  const parts: string[] = [];
  if (access.employee) parts.push("Employee app");
  if (access.management) {
    const role = roles.find((item) => item.id === access.managementRoleId);
    const name = role?.name ?? "Role not chosen";
    const where = managesEveryLocation(role?.accessClass)
      ? "every location"
      : access.managedLocationIds
          .map((id) => locations.find((location) => location.id === id)?.name)
          .filter(Boolean)
          .join(", ") || "no location yet";
    parts.push(`${name} (${where})`);
  }
  return parts.join(" · ");
}

type InvitationState =
  | "no_email"
  | "ready"
  | "invited"
  | "failed"
  | "expired"
  | "revoked"
  | "declined"
  | "access_removed"
  | "archived"
  | "onboarding"
  | "linked";

export function invitationState(
  detail: EmployeeDetail | undefined,
  email: string,
): InvitationState {
  const invitation = detail?.invitation ?? null;
  const expired =
    invitation?.status === "pending" && Date.parse(invitation.expires_at) <= Date.now();
  if (detail?.user_id)
    return detail.archived_at
      ? "archived"
      : detail.display_status === "active"
        ? "linked"
        : "onboarding";
  if (!email) return "no_email";
  if (expired || invitation?.status === "expired") return "expired";
  if (invitation?.status === "pending")
    return invitation.delivery_status === "failed" ? "failed" : "invited";
  if (invitation?.status === "revoked") return "revoked";
  if (invitation?.status === "declined") return "declined";
  if (invitation?.status === "accepted") return "access_removed";
  return "ready";
}

const pillTitle: Record<InvitationState, string> = {
  no_email: "No email",
  ready: "Not invited",
  invited: "Pending",
  failed: "Not delivered",
  expired: "Expired",
  revoked: "Revoked",
  declined: "Declined",
  access_removed: "Access removed",
  archived: "Archived",
  onboarding: "Accepted",
  linked: "Accepted",
};
const pillClass: Record<InvitationState, string> = {
  no_email: "",
  ready: "",
  invited: "state-invited",
  failed: "state-needs_attention",
  expired: "state-needs_attention",
  revoked: "",
  declined: "",
  access_removed: "",
  archived: "",
  onboarding: "state-active",
  linked: "state-active",
};

function day(value: string) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function impactSentence(name: string, impact: EmployeeAccessImpact | undefined) {
  if (!impact) return `When you save, ${name} can no longer open the employee app.`;
  const requests = impact.requests_closed + impact.applications_closed + impact.time_off_withdrawn;
  const parts = [
    impact.shifts_opened
      ? `${impact.shifts_opened} upcoming shift${impact.shifts_opened === 1 ? "" : "s"} become${impact.shifts_opened === 1 ? "s" : ""} open`
      : null,
    requests ? `${requests} pending request${requests === 1 ? "" : "s"} close${requests === 1 ? "s" : ""}` : null,
  ].filter(Boolean);
  return parts.length
    ? `When you save, ${parts.join(" and ")}.`
    : `When you save, ${name} can no longer open the employee app.`;
}

export interface AccessTabProps {
  readonly detail: EmployeeDetail | undefined;
  readonly draft: EmployeeInput;
  readonly now: AccessDraft;
  readonly saved: AccessDraft;
  readonly onChange: (next: AccessDraft) => void;
  /** Invite or Save asked with something missing: the choice shakes. */
  readonly attempt: number;
  readonly problem: string | undefined;
  /** The management roles this reader may give, in Mert's order. */
  readonly roles: readonly InviteRoleOption[];
  readonly locations: readonly EmployeeOption[];
  readonly jobs: readonly EmployeeOption[];
  readonly editable: boolean;
  /** The invitation links: who may invite, never on an archived record. */
  readonly invitationReadOnly: boolean;
  readonly canRemoveAccess: boolean;
  readonly impact: EmployeeAccessImpact | undefined;
  readonly managesPicker: React.ReactNode;
  readonly onAddEmail: () => void;
  readonly onResend: () => void;
  readonly resending: boolean;
  readonly onRevoke: () => void;
  readonly revoking: boolean;
  readonly onRemoveAccess: () => void;
  readonly removingAccess: boolean;
}

export function AccessTab(props: AccessTabProps) {
  const { detail, draft, now, saved, onChange, roles, locations, jobs, editable } = props;
  const errorId = useId();
  const roleGroupId = useId();
  const linked = Boolean(detail?.user_id);
  const isOwner = detail?.is_workspace_owner ?? false;
  const first = draft.first_name.trim() || "This person";
  const email = draft.invitation_email.trim();
  const invitation = detail?.invitation ?? null;
  const state = invitationState(detail, email);
  const outstanding = !linked && invitation?.status === "pending";
  const expired = state === "expired";
  const shownEmail = linked ? (detail?.account_email ?? email) : (invitation?.email ?? email);
  const canGiveManagement = roles.length > 0;
  const role = roles.find((item) => item.id === now.managementRoleId);
  const roleClass = isOwner ? "owner" : (role?.accessClass ?? detail?.access.management ?? undefined);
  const only = linked && Number(now.employee) + Number(now.management) === 1;
  const invalid = props.attempt > 0 && props.problem !== undefined;
  const pulse = invalid ? ` access-invalid access-invalid-${props.attempt % 2}` : "";
  const onlyReason = `This is ${first}'s only access. Remove all access takes it away.`;
  const employeeLocked = !editable || (only && now.employee);
  const managementLocked = !editable || (only && now.management) || (!canGiveManagement && !now.management);
  const names = (ids: readonly string[], options: readonly EmployeeOption[]) =>
    ids
      .map((id) => options.find((option) => option.id === id)?.name)
      .filter(Boolean)
      .join(", ");
  const managed = names(saved.managedLocationIds, locations);
  // The role they hold now, when the reader may not give it (a senior's, the owner's).
  const rows = [
    ...(isOwner
      ? [{ id: now.managementRoleId, name: "Owner", every: true }]
      : now.managementRoleId && !role
        ? [{ id: now.managementRoleId, name: detail?.role_name ?? "Current role", every: managesEveryLocation(roleClass) }]
        : []),
    ...(isOwner
      ? []
      : roles.map((item) => ({ id: item.id, name: item.name, every: managesEveryLocation(item.accessClass) }))),
  ].filter((row) => editable || row.id === now.managementRoleId);
  const meta: Partial<Record<InvitationState, string | null>> = {
    ready: "Not sent yet. Choose access below, then select Invite.",
    invited: invitation
      ? `Sent ${day(invitation.sent_at)}${
          invitation.invited_by_name ? ` by ${invitation.invited_by_name}` : ""
        } · expires ${day(invitation.expires_at)}`
      : null,
    failed: `${invitation?.delivery_error ?? "The email didn't arrive."} Resend sends a new link.`,
    expired: invitation ? `Expired ${day(invitation.expires_at)}. Resend sends a new link.` : null,
    revoked: "The old link no longer works. To use another address, change the email in Profile.",
    declined: `${first} declined. Select Invite to send a new one.`,
    access_removed: "The record and work history are kept. Select Invite to give access again.",
    archived: "Access is paused while the employee is archived.",
    onboarding: `${first} accepted and is finishing setup.`,
    linked: `${first} signs in with this email.`,
  };
  const links =
    !props.invitationReadOnly && (state === "no_email" || outstanding) ? (
      <div className="access-links">
        {state === "no_email" ? (
          <button type="button" className="access-link" onClick={props.onAddEmail}>
            Add email
          </button>
        ) : null}
        {outstanding ? (
          <button
            type="button"
            className="access-link"
            disabled={props.resending}
            title="Sends a new link. The old link stops working."
            onClick={props.onResend}
          >
            {props.resending ? "Sending…" : "Resend"}
          </button>
        ) : null}
        {outstanding && !expired && detail ? (
          <CopyLink workspaceId={detail.workspace_id} employeeId={detail.id} />
        ) : null}
        {outstanding && !expired ? (
          <ConfirmButton
            unstyled
            className="access-link danger"
            type="button"
            disabled={props.revoking}
            confirmLabel="Confirm revoke"
            onConfirm={props.onRevoke}
          >
            Revoke
          </ConfirmButton>
        ) : null}
      </div>
    ) : null;

  return (
    <div className="employee-profile-sections access-tab">
      <section className="employee-profile-group">
        <header>
          <h3>{linked ? "Account" : "Invitation"}</h3>
        </header>
        <div className="access-invite-line">
          <span className="access-email">{shownEmail || "No email"}</span>
          <span className={`employee-state ${pillClass[state]}`}>{pillTitle[state]}</span>
          {links}
        </div>
        {meta[state] ? <p className="access-note">{meta[state]}</p> : null}
      </section>
      <section className="employee-profile-group">
        <header>
          <h3>Access</h3>
        </header>
        <fieldset
          className={`employee-toggle-grid access-choices${pulse}`}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
        >
          <legend className="sr-only">Access</legend>
          <label
            className="employee-work-mode access"
            data-selected={now.employee ? "true" : "false"}
            data-locked={employeeLocked || undefined}
            title={only && now.employee && editable ? onlyReason : undefined}
          >
            <input
              type="checkbox"
              checked={now.employee}
              disabled={employeeLocked}
              onChange={(event) => onChange({ ...now, employee: event.target.checked })}
            />
            <span>Employee app</span>
          </label>
          <label
            className="employee-work-mode access"
            data-selected={now.management ? "true" : "false"}
            data-locked={managementLocked || undefined}
            title={
              only && now.management && editable
                ? onlyReason
                : !canGiveManagement && !now.management
                  ? "Only owners and admins can give management access."
                  : undefined
            }
          >
            <input
              type="checkbox"
              checked={now.management}
              disabled={managementLocked}
              onChange={(event) =>
                onChange({
                  ...now,
                  management: event.target.checked,
                  managementRoleId: event.target.checked ? now.managementRoleId : "",
                  managedLocationIds: event.target.checked ? now.managedLocationIds : [],
                })
              }
            />
            <span>Management app</span>
          </label>
        </fieldset>
        {now.employee ? (
          <p className="access-note">
            Works at {names(draft.location_ids, locations) || "no location yet"} ·{" "}
            {names(draft.job_ids, jobs) || "no job yet"}
          </p>
        ) : null}
        {linked && saved.employee && !now.employee ? (
          <p className="access-note warning">
            {impactSentence(first, props.impact)}{" "}
            <button type="button" className="access-link" onClick={() => onChange({ ...now, employee: true })}>
              Undo
            </button>
          </p>
        ) : null}
        {linked && saved.management && !now.management ? (
          <p className="access-note warning">
            When you save, {first} can no longer open the management app
            {managed ? ` or manage ${managed}` : ""}.{" "}
            <button
              type="button"
              className="access-link"
              onClick={() =>
                onChange({
                  ...now,
                  management: true,
                  managementRoleId: saved.managementRoleId,
                  managedLocationIds: saved.managedLocationIds,
                })
              }
            >
              Undo
            </button>
          </p>
        ) : null}
        {now.management ? (
          <fieldset
            className={`employee-assignment-picker${invalid && !now.managementRoleId ? " access-missing" : ""}`}
            disabled={!editable}
          >
            <legend>
              Role
              {editable ? <span className="employee-field-requirement">Required</span> : null}
            </legend>
            {rows.map((row) => (
              <div key={row.id}>
                <label>
                  <input
                    type="radio"
                    name={`${roleGroupId}-role`}
                    checked={now.managementRoleId === row.id}
                    onChange={() => {
                      const next = roles.find((item) => item.id === row.id);
                      onChange({
                        ...now,
                        managementRoleId: row.id,
                        managedLocationIds: managesEveryLocation(next?.accessClass) ? [] : now.managedLocationIds,
                      });
                    }}
                  />
                  <span>{row.name}</span>
                </label>
                {row.every ? <small className="access-scope">Every location</small> : null}
              </div>
            ))}
          </fieldset>
        ) : null}
        {now.management && roleClass === "manager" ? props.managesPicker : null}
        {invalid ? (
          <p id={errorId} className="access-error" role="alert">
            {props.problem}
          </p>
        ) : null}
        {linked && props.canRemoveAccess && !isOwner ? (
          <ConfirmButton
            unstyled
            className="access-link danger"
            type="button"
            disabled={props.removingAccess}
            confirmLabel="Confirm remove all access"
            title="The employee record and work history are kept."
            onConfirm={props.onRemoveAccess}
          >
            {props.removingAccess ? "Removing…" : "Remove all access"}
          </ConfirmButton>
        ) : null}
      </section>
    </div>
  );
}

/** The invitation's own link as a quiet text action (the server records the copy). */
function CopyLink({ workspaceId, employeeId }: { readonly workspaceId: string; readonly employeeId: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = useMutation({
    mutationFn: () => loadEmployeeInvitationLink(workspaceId, employeeId),
    onSuccess: async (link) => {
      try {
        await navigator.clipboard.writeText(link.url);
        setState("copied");
      } catch {
        setState("failed");
      }
    },
    // The server's own wording is not for the screen.
    onError: () => setState("failed"),
  });
  return (
    <button
      type="button"
      className="access-link"
      disabled={copy.isPending}
      onClick={() => {
        setState("idle");
        copy.mutate();
      }}
    >
      {copy.isPending
        ? "Copying…"
        : state === "copied"
          ? "Link copied"
          : state === "failed"
            ? "Copy failed"
            : "Copy link"}
    </button>
  );
}

/**
 * The drawer's avatar (Mert, 20 Oct): a photo the person uploaded is removed
 * right there, no button and no box. Hover shows a quiet mark; the first click
 * turns it red and says "click again"; the second removes. It disarms on its
 * own, on Escape and on blur (the app's two-click confirm). A drawn avatar is
 * not the manager's to remove.
 */
export function DrawerAvatar({
  workspaceId,
  employeeId,
  initial,
  name,
  canRemove,
  compact = false,
}: {
  readonly workspaceId: string;
  readonly employeeId: string;
  readonly initial: string;
  readonly name: string;
  readonly canRemove: boolean;
  readonly compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const avatar = useQuery({
    queryKey: ["employee-avatar", workspaceId, employeeId],
    queryFn: () => getEmployeeAvatar(workspaceId, employeeId),
    enabled: Boolean(workspaceId && employeeId),
  });
  const remove = useMutation({
    mutationFn: () => removeEmployeeAvatar(workspaceId, employeeId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["employee-avatar", workspaceId, employeeId] }),
        queryClient.invalidateQueries({ queryKey: ["employee-detail", workspaceId, employeeId] }),
      ]);
    },
  });
  const { armed, confirmProps } = useConfirmClick(() => remove.mutate());
  const url = avatar.data?.present ? avatar.data.url : null;
  const face = url ? <img src={url} alt="" /> : <span>{initial}</span>;
  const shape = `employee-avatar drawer-avatar${compact ? " compact" : ""}`;
  if (!canRemove || !url)
    return (
      <span className={shape} aria-hidden>
        {face}
      </span>
    );
  return (
    <>
      <button
        type="button"
        className={`${shape} drawer-avatar-button`}
        data-armed={armed}
        disabled={remove.isPending}
        aria-label={armed ? `Remove ${name}'s photo` : `${name}'s photo. Select twice to remove it.`}
        title={armed ? "Click again to remove" : "Remove photo"}
        {...confirmProps}
      >
        {face}
        <span className="drawer-avatar-mark" aria-hidden>
          <ImageOff size={compact ? 14 : 20} />
        </span>
      </button>
      <p className="drawer-avatar-hint" role="status">
        {remove.isPending
          ? "Removing the photo…"
          : armed
            ? compact
              ? "Tap again to remove the photo."
              : "Click again to remove the photo."
            : remove.error
              ? "The photo couldn't be removed. Try again."
              : ""}
      </p>
    </>
  );
}
